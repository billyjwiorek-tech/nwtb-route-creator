-- Keep pending-stop resequencing atomic, including requests from older office clients.
create index delivery_routes_released_by_user_idx on public.delivery_routes(released_by_user_id);
create function public.udp_reorder_pending_stops(p_route_id uuid,p_actor_user_id uuid,p_expected_updated_at timestamptz,p_ordered_stop_ids uuid[]) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.delivery_routes%rowtype;n integer;base integer;offset_seq integer;sid uuid;seq integer;
begin
 if not exists(select 1 from public.app_users where id=p_actor_user_id and role in ('ADMIN','DISPATCH') and active and not pending_activation) then raise exception 'Office access required.';end if;
 select * into r from public.delivery_routes where id=p_route_id for update;
 if r.id is null or r.status not in ('PLANNED','ACTIVE','PAUSED') then raise exception 'Editable route required.';end if;
 if r.updated_at is distinct from p_expected_updated_at then raise exception 'The route changed. Refresh before re-optimizing.';end if;
 select count(*) into n from public.delivery_route_stops where route_id=r.id and status='PENDING';
 if coalesce(cardinality(p_ordered_stop_ids),0)<>n or (select count(distinct x) from unnest(p_ordered_stop_ids) x)<>n or exists(select 1 from unnest(p_ordered_stop_ids) x where not exists(select 1 from public.delivery_route_stops where id=x and route_id=r.id and status='PENDING')) then raise exception 'Pending stops changed. Refresh the route.';end if;
 select coalesce(max(stop_sequence),0)+1 into base from public.delivery_route_stops where route_id=r.id and status<>'PENDING';
 select coalesce(max(stop_sequence),0)+n+1 into offset_seq from public.delivery_route_stops where route_id=r.id;
 seq:=0;
 foreach sid in array p_ordered_stop_ids loop
  update public.delivery_route_stops set stop_sequence=offset_seq+seq,updated_at=clock_timestamp() where id=sid;
  seq:=seq+1;
 end loop;
 seq:=0;
 foreach sid in array p_ordered_stop_ids loop
  update public.delivery_route_stops set stop_sequence=base+seq,updated_at=clock_timestamp() where id=sid;
  seq:=seq+1;
 end loop;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.udp_reorder_pending_stops(uuid,uuid,timestamptz,uuid[]) from public,anon,authenticated;
grant execute on function public.udp_reorder_pending_stops(uuid,uuid,timestamptz,uuid[]) to service_role;
