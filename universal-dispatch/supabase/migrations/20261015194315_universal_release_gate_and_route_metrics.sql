-- Universal project only. Existing operational rows are preserved.
alter table public.delivery_routes
 add column released_to_driver boolean not null default true,
 add column released_at timestamptz,
 add column released_by_user_id uuid references public.app_users(id),
 add column drive_minutes integer,
 add column service_minutes integer,
 add column return_miles double precision,
 add column return_minutes integer,
 add column traffic_aware boolean not null default false,
 add column matrix_source text,
 add column route_geometry jsonb,
 add column route_leg_geometry jsonb;
alter table public.delivery_routes alter column released_to_driver set default false;
alter table public.delivery_orders add column service_minutes integer not null default 10 check(service_minutes between 0 and 180);
alter table public.company_settings add column default_service_minutes integer not null default 10 check(default_service_minutes between 0 and 180);

create unique index udp_one_running_route_per_driver on public.delivery_routes(driver_user_id) where status in ('ACTIVE','PAUSED');

create function public.udp_route_release_guard() returns trigger language plpgsql set search_path=public as $$
begin
 if tg_op='INSERT' then
  if new.status<>'PLANNED' then raise exception 'New routes must be staged as PLANNED.'; end if;
  new.released_to_driver:=false;new.released_at:=null;new.released_by_user_id:=null;
 else
  if old.driver_user_id is distinct from new.driver_user_id and old.status in ('ACTIVE','PAUSED') then raise exception 'An ongoing route cannot be reassigned.';end if;
  if new.status='PLANNED' and (old.driver_user_id is distinct from new.driver_user_id or old.status is distinct from new.status) then
   new.released_to_driver:=false;new.released_at:=null;new.released_by_user_id:=null;
  end if;
  if new.status='ACTIVE' and old.status='PLANNED' and not old.released_to_driver then raise exception 'Dispatch must release this route before the driver starts.';end if;
 end if;
 return new;
end $$;
create trigger udp_route_release_guard before insert or update of driver_user_id,status on public.delivery_routes for each row execute function public.udp_route_release_guard();

create function public.udp_invalidate_route_metrics() returns trigger language plpgsql set search_path=public as $$
declare rid uuid;
begin
 rid:=case when tg_op='DELETE' then old.route_id else new.route_id end;
 update public.delivery_routes set estimated_miles=null,estimated_minutes=null,drive_minutes=null,service_minutes=null,return_miles=null,return_minutes=null,matrix_source=null,route_geometry=null,route_leg_geometry=null,updated_at=clock_timestamp() where id=rid;
 return null;
end $$;
create trigger udp_route_metrics_after_stop_change after insert or delete or update of stop_sequence,order_id on public.delivery_route_stops for each row execute function public.udp_invalidate_route_metrics();

-- Only Edge Functions may invoke this transactional transition API.
create function public.udp_transition_route(p_route_id uuid,p_actor_user_id uuid,p_action text,p_reason text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare actor public.app_users%rowtype;r public.delivery_routes%rowtype;t timestamptz:=clock_timestamp();event_name text;
begin
 select * into actor from public.app_users where id=p_actor_user_id and active and not pending_activation;
 if actor.id is null then raise exception 'Active user required.';end if;
 select * into r from public.delivery_routes where id=p_route_id for update;
 if r.id is null then raise exception 'Route not found.';end if;
 if p_action in ('release_to_driver','hold_from_driver') then
  if actor.role not in ('ADMIN','DISPATCH') then raise exception 'Office access required.';end if;
  if r.status<>'PLANNED' then raise exception 'Only a PLANNED route can be released or held.';end if;
  if p_action='release_to_driver' then
   update public.delivery_routes set released_to_driver=true,released_at=t,released_by_user_id=actor.id,updated_at=t where id=r.id;
   event_name:='ROUTE_RELEASED_TO_DRIVER';
  else
   update public.delivery_routes set released_to_driver=false,released_at=null,released_by_user_id=null,updated_at=t where id=r.id;
   event_name:='ROUTE_HELD_FROM_DRIVER';
  end if;
 elsif p_action in ('route_start','route_pause','route_resume') then
  if actor.role<>'DRIVER' or r.driver_user_id<>actor.id then raise exception 'Only the assigned driver can start, pause or resume this route.';end if;
  if p_action='route_start' then
   if r.status<>'PLANNED' or not r.released_to_driver then raise exception 'A released PLANNED route is required.';end if;
   if exists(select 1 from public.delivery_routes where driver_user_id=actor.id and id<>r.id and status in ('ACTIVE','PAUSED')) then raise exception 'Finish the ongoing route before starting another.';end if;
   update public.delivery_routes set status='ACTIVE',started_at=t,paused_at=null,pause_reason=null,updated_at=t where id=r.id;
   update public.delivery_orders set status='OUT_FOR_DELIVERY',last_status_at=t,updated_at=t where id in(select order_id from public.delivery_route_stops where route_id=r.id and status in ('PENDING','ARRIVED'));
   event_name:='ROUTE_STARTED';
  elsif p_action='route_pause' then
   if r.status<>'ACTIVE' then raise exception 'Only an ACTIVE route can be paused.';end if;
   update public.delivery_routes set status='PAUSED',paused_at=t,pause_reason=coalesce(nullif(trim(p_reason),''),'Driver pause'),updated_at=t where id=r.id;event_name:='ROUTE_PAUSED';
  else
   if r.status<>'PAUSED' then raise exception 'Only a PAUSED route can be resumed.';end if;
   update public.delivery_routes set status='ACTIVE',paused_at=null,pause_reason=null,updated_at=t where id=r.id;event_name:='ROUTE_RESUMED';
  end if;
 else raise exception 'Unknown route transition.';
 end if;
 insert into public.delivery_events(route_id,user_id,event_type,note) values(r.id,actor.id,event_name,case when p_action='route_pause' then left(p_reason,500) else null end);
 select * into r from public.delivery_routes where id=r.id;
 return jsonb_build_object('ok',true,'route',to_jsonb(r));
end $$;
revoke all on function public.udp_transition_route(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.udp_transition_route(uuid,uuid,text,text) to service_role;
revoke all on function public.udp_commit_multi_routes(uuid,date,text,jsonb) from public,anon,authenticated;
grant execute on function public.udp_commit_multi_routes(uuid,date,text,jsonb) to service_role;

-- New and legacy builders share one atomic persistence path.
create or replace function public.udp_commit_multi_routes(p_created_by uuid,p_route_date date,p_wave text,p_routes jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare x jsonb;s jsonb;u public.app_users%rowtype;l public.company_locations%rowtype;rid uuid;oid uuid;seq integer;seen uuid[]:='{}';result jsonb:='[]';
begin
 if not exists(select 1 from public.app_users where id=p_created_by and active and not pending_activation and role in ('ADMIN','DISPATCH')) then raise exception 'Office access required.';end if;
 if jsonb_typeof(p_routes)<>'array' or jsonb_array_length(p_routes)=0 then raise exception 'At least one route is required.';end if;
 for x in select value from jsonb_array_elements(p_routes) loop
  select * into u from public.app_users where id=(x->>'driver_id')::uuid and role='DRIVER' and active and not pending_activation;
  if u.id is null then raise exception 'Active driver required.';end if;
  l:=null;
  if nullif(x->>'location_id','') is not null then
   select * into l from public.company_locations where id=(x->>'location_id')::uuid and active;
   if l.id is null then raise exception 'Active company location required.';end if;
  end if;
  if jsonb_typeof(x->'stops')<>'array' or jsonb_array_length(x->'stops')=0 then raise exception 'Each route needs stops.';end if;
  insert into public.delivery_routes(driver_user_id,route_date,wave,status,route_mode,start_mode,start_name,start_address,start_lat,start_lon,end_mode,end_name,end_address,end_lat,end_lon,created_by,depot_location_id)
  values(u.id,coalesce(p_route_date,current_date),coalesce(nullif(p_wave,''),'STANDARD'),'PLANNED',coalesce(x->>'route_mode','MULTI_DRIVER_OPTIMIZED'),coalesce(x->>'start_mode','DEPOT'),coalesce(x->>'start_name',l.name),coalesce(x->>'start_address',l.address),coalesce((x->>'start_lat')::float8,l.lat),coalesce((x->>'start_lon')::float8,l.lon),coalesce(x->>'end_mode','RETURN_DEPOT'),coalesce(x->>'end_name',l.name),coalesce(x->>'end_address',l.address),coalesce((x->>'end_lat')::float8,l.lat),coalesce((x->>'end_lon')::float8,l.lon),p_created_by,l.id) returning id into rid;
  seq:=0;
  for s in select value from jsonb_array_elements(x->'stops') order by (value->>'stop_sequence')::int loop
   oid:=(s->>'order_id')::uuid;if oid=any(seen) then raise exception 'Stop assigned more than once.';end if;seen:=array_append(seen,oid);
   update public.delivery_orders set status='ROUTED',last_status_at=now(),updated_at=now() where id=oid and status='UNASSIGNED';
   if not found then raise exception 'A selected stop is no longer AVAILABLE.';end if;
   seq:=seq+1;insert into public.delivery_route_stops(route_id,order_id,stop_sequence,status) values(rid,oid,seq,'PENDING');
  end loop;
  update public.delivery_routes set estimated_miles=(x->>'estimated_miles')::float8,estimated_minutes=(x->>'estimated_minutes')::int,drive_minutes=(x->>'drive_minutes')::int,service_minutes=(x->>'service_minutes')::int,return_miles=(x->>'return_miles')::float8,return_minutes=(x->>'return_minutes')::int,matrix_source=x->>'matrix_source',traffic_aware=false,route_geometry=nullif(x->'route_geometry','null'::jsonb),route_leg_geometry=nullif(x->'route_leg_geometry','null'::jsonb),updated_at=clock_timestamp() where id=rid;
  insert into public.delivery_events(route_id,user_id,event_type,note) values(rid,p_created_by,'ROUTE_CREATED','Office-only pre-route; explicit release required');
  result:=result||jsonb_build_array(jsonb_build_object('route_id',rid,'driver_id',u.id,'location_id',l.id,'stop_count',seq,'released_to_driver',false));
 end loop;
 return jsonb_build_object('ok',true,'routes',result);
end $$;

-- Stop actions cannot be used to complete a held/planned/paused route through old clients.
create function public.udp_guard_stop_progress() returns trigger language plpgsql set search_path=public as $$
declare route_status text;
begin
 if old.status is distinct from new.status and new.status in ('ARRIVED','DELIVERED','NOT_DELIVERED','SKIPPED') then
  select status into route_status from public.delivery_routes where id=new.route_id for update;
  if route_status<>'ACTIVE' then raise exception 'Start or resume the route before updating a stop.';end if;
 end if;return new;
end $$;
create trigger udp_guard_stop_progress before update of status on public.delivery_route_stops for each row execute function public.udp_guard_stop_progress();
revoke execute on function public.udp_route_release_guard(),public.udp_invalidate_route_metrics(),public.udp_guard_stop_progress() from public,anon,authenticated;
