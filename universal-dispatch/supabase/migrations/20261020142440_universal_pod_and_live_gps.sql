-- Universal only. Existing records and company configuration are preserved.
alter table public.proof_of_delivery add column photo_data text,
 add column pod_number bigint generated always as identity,
 add column accuracy_m double precision;
create unique index proof_of_delivery_number_idx on public.proof_of_delivery(pod_number);
alter table public.driver_locations add column received_at timestamptz not null default clock_timestamp();

create function public.udp_valid_pod_image(p_data text,p_max_bytes integer) returns boolean
language plpgsql immutable set search_path=public,pg_temp as $$
declare mime text;b bytea;
begin
 if p_data is null then return true;end if;
 if length(p_data)>p_max_bytes*4/3+80 or p_data!~'^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$' then return false;end if;
 mime:=split_part(split_part(p_data,';',1),':',2);
 begin b:=decode(split_part(p_data,',',2),'base64');exception when others then return false;end;
 if octet_length(b)>p_max_bytes then return false;end if;
 return case mime when 'image/png' then substring(b from 1 for 8)=decode('89504e470d0a1a0a','hex') when 'image/jpeg' then substring(b from 1 for 3)=decode('ffd8ff','hex') when 'image/webp' then substring(b from 1 for 4)=decode('52494646','hex') and substring(b from 9 for 4)=decode('57454250','hex') else false end;
end $$;
revoke all on function public.udp_valid_pod_image(text,integer) from public,anon,authenticated;
grant execute on function public.udp_valid_pod_image(text,integer) to service_role;

-- Proof, stop outcome, order, route completion and audit event commit together.
create function public.udp_record_stop_outcome(p_stop_id uuid,p_actor_user_id uuid,p_action text,p_note text default null,p_pod jsonb default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.delivery_routes%rowtype;s public.delivery_route_stops%rowtype;rid uuid;outcome text;receipt public.proof_of_delivery%rowtype;t timestamptz:=clock_timestamp();done boolean;receiver text;sig text;photo text;lat_v float8;lon_v float8;accuracy_v float8;
begin
 if not exists(select 1 from public.app_users where id=p_actor_user_id and role='DRIVER' and active and not pending_activation) then raise exception 'Active driver required.';end if;
 if p_action not in ('stop_arrive','stop_complete','stop_not_delivered') then raise exception 'Unknown stop action.';end if;
 select route_id into rid from public.delivery_route_stops where id=p_stop_id;
 select * into r from public.delivery_routes where id=rid for update;
 if r.id is null or r.driver_user_id<>p_actor_user_id then raise exception 'Stop is not assigned to this driver.';end if;
 select * into s from public.delivery_route_stops where id=p_stop_id for update;
 if s.route_id is distinct from r.id then raise exception 'Stop changed. Refresh the route.';end if;
 outcome:=case p_action when 'stop_arrive' then 'ARRIVED' when 'stop_complete' then 'DELIVERED' else 'NOT_DELIVERED' end;
 -- A retry after a lost response must not duplicate or replace the signed receipt.
 if s.status=outcome then
  if outcome='DELIVERED' then select * into receipt from public.proof_of_delivery where route_stop_id=s.id;if receipt.id is null then raise exception 'This legacy delivery has no receipt. Contact Office.';end if;end if;
  return jsonb_build_object('ok',true,'route_complete',r.status='COMPLETED','route',to_jsonb(r),'pod_number',receipt.pod_number,'already_saved',true);
 end if;
 if r.status<>'ACTIVE' then raise exception 'Start or resume the route before updating a stop.';end if;
 if s.status not in ('PENDING','ARRIVED') then raise exception 'This stop already has a final outcome.';end if;
 if outcome='DELIVERED' then
  receiver:=nullif(left(trim(p_pod->>'receiver_name'),180),'');sig:=nullif(p_pod->>'signature_data','');photo:=nullif(p_pod->>'photo_data','');
  if receiver is null or length(receiver)<2 then raise exception 'Enter who received the delivery.';end if;
  if sig is null and photo is null then raise exception 'A signature or delivery photo is required.';end if;
  if not public.udp_valid_pod_image(sig,200000) or not public.udp_valid_pod_image(photo,1000000) then raise exception 'Invalid or oversized proof image.';end if;
  lat_v:=nullif(p_pod->>'lat','')::float8;lon_v:=nullif(p_pod->>'lon','')::float8;accuracy_v:=nullif(p_pod->>'accuracy_m','')::float8;
  if lat_v is null or lon_v is null then lat_v:=null;lon_v:=null;
  elsif not(lat_v between -90 and 90 and lon_v between -180 and 180) then raise exception 'Invalid proof location.';end if;
  if accuracy_v is not null and not(accuracy_v between 0 and 100000) then raise exception 'Invalid proof accuracy.';end if;
  insert into public.proof_of_delivery(route_stop_id,receiver_name,signature_data,photo_data,note,lat,lon,accuracy_m,captured_by,captured_at)
  values(s.id,receiver,sig,photo,left(coalesce(p_pod->>'note',p_note),2000),lat_v,lon_v,accuracy_v,p_actor_user_id,t) returning * into receipt;
 end if;
 if outcome='ARRIVED' then
  update public.delivery_route_stops set status=outcome,arrived_at=t,updated_at=t where id=s.id;
 else
  update public.delivery_route_stops set status=outcome,completed_at=t,driver_note=left(p_note,1500),updated_at=t where id=s.id;
  update public.delivery_orders set status=outcome,last_status_at=t,updated_at=t where id=s.order_id;
 end if;
 insert into public.delivery_events(route_id,order_id,user_id,event_type,note) values(r.id,s.order_id,p_actor_user_id,case outcome when 'ARRIVED' then 'STOP_ARRIVED' when 'DELIVERED' then 'STOP_DELIVERED' else 'STOP_NOT_DELIVERED' end,left(p_note,1500));
 select not exists(select 1 from public.delivery_route_stops where route_id=r.id and status in ('PENDING','ARRIVED')) into done;
 if done then update public.delivery_routes set status='COMPLETED',completed_at=t,updated_at=t where id=r.id;else update public.delivery_routes set updated_at=t where id=r.id;end if;
 select * into r from public.delivery_routes where id=r.id;
 return jsonb_build_object('ok',true,'route_complete',done,'route',to_jsonb(r),'pod_number',receipt.pod_number,'already_saved',false);
end $$;
revoke all on function public.udp_record_stop_outcome(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.udp_record_stop_outcome(uuid,uuid,text,text,jsonb) to service_role;
