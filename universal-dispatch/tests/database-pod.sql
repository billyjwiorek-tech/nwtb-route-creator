-- Temporary copies only. Every operational write is rolled back.
begin;
create temporary table app_users (like public.app_users including all);
create temporary table delivery_orders (like public.delivery_orders including all);
create temporary table delivery_routes (like public.delivery_routes including all);
create temporary table delivery_route_stops (like public.delivery_route_stops including all);
create temporary table proof_of_delivery (like public.proof_of_delivery including all);
create temporary table delivery_events (like public.delivery_events including all);
alter table pg_temp.proof_of_delivery add column if not exists photo_data text,add column if not exists pod_number bigint generated always as identity,add column if not exists accuracy_m float8;
do $$ declare sig text;f text;begin
 foreach sig in array array['udp_route_release_guard()','udp_transition_route(uuid,uuid,text,text)','udp_guard_stop_progress()'] loop
 f:=pg_get_functiondef(('public.'||sig)::regprocedure);execute replace(f,'public.','pg_temp.');end loop;
end $$;
create trigger test_route_guard before insert or update of driver_user_id,status on pg_temp.delivery_routes for each row execute function pg_temp.udp_route_release_guard();
create trigger test_progress_guard before update of status on pg_temp.delivery_route_stops for each row execute function pg_temp.udp_guard_stop_progress();

create function pg_temp.udp_valid_pod_image(p_data text,p_max_bytes integer) returns boolean
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
create function pg_temp.udp_record_stop_outcome(p_stop_id uuid,p_actor_user_id uuid,p_action text,p_note text default null,p_pod jsonb default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r pg_temp.delivery_routes%rowtype;s pg_temp.delivery_route_stops%rowtype;rid uuid;outcome text;receipt pg_temp.proof_of_delivery%rowtype;t timestamptz:=clock_timestamp();done boolean;receiver text;sig text;photo text;lat_v float8;lon_v float8;accuracy_v float8;
begin
 if not exists(select 1 from pg_temp.app_users where id=p_actor_user_id and role='DRIVER' and active and not pending_activation) then raise exception 'Active driver required.';end if;
 if p_action not in ('stop_arrive','stop_complete','stop_not_delivered') then raise exception 'Unknown stop action.';end if;
 select route_id into rid from pg_temp.delivery_route_stops where id=p_stop_id;
 select * into r from pg_temp.delivery_routes where id=rid for update;
 if r.id is null or r.driver_user_id<>p_actor_user_id then raise exception 'Stop is not assigned to this driver.';end if;
 select * into s from pg_temp.delivery_route_stops where id=p_stop_id for update;
 if s.route_id is distinct from r.id then raise exception 'Stop changed. Refresh the route.';end if;
 outcome:=case p_action when 'stop_arrive' then 'ARRIVED' when 'stop_complete' then 'DELIVERED' else 'NOT_DELIVERED' end;
 -- A retry after a lost response must not duplicate or replace the signed receipt.
 if s.status=outcome then
  if outcome='DELIVERED' then select * into receipt from pg_temp.proof_of_delivery where route_stop_id=s.id;if receipt.id is null then raise exception 'This legacy delivery has no receipt. Contact Office.';end if;end if;
  return jsonb_build_object('ok',true,'route_complete',r.status='COMPLETED','route',to_jsonb(r),'pod_number',receipt.pod_number,'already_saved',true);
 end if;
 if r.status<>'ACTIVE' then raise exception 'Start or resume the route before updating a stop.';end if;
 if s.status not in ('PENDING','ARRIVED') then raise exception 'This stop already has a final outcome.';end if;
 if outcome='DELIVERED' then
  receiver:=nullif(left(trim(p_pod->>'receiver_name'),180),'');sig:=nullif(p_pod->>'signature_data','');photo:=nullif(p_pod->>'photo_data','');
  if receiver is null or length(receiver)<2 then raise exception 'Enter who received the delivery.';end if;
  if sig is null and photo is null then raise exception 'A signature or delivery photo is required.';end if;
  if not pg_temp.udp_valid_pod_image(sig,200000) or not pg_temp.udp_valid_pod_image(photo,1000000) then raise exception 'Invalid or oversized proof image.';end if;
  lat_v:=nullif(p_pod->>'lat','')::float8;lon_v:=nullif(p_pod->>'lon','')::float8;accuracy_v:=nullif(p_pod->>'accuracy_m','')::float8;
  if lat_v is null or lon_v is null then lat_v:=null;lon_v:=null;
  elsif not(lat_v between -90 and 90 and lon_v between -180 and 180) then raise exception 'Invalid proof location.';end if;
  if accuracy_v is not null and not(accuracy_v between 0 and 100000) then raise exception 'Invalid proof accuracy.';end if;
  insert into pg_temp.proof_of_delivery(route_stop_id,receiver_name,signature_data,photo_data,note,lat,lon,accuracy_m,captured_by,captured_at)
  values(s.id,receiver,sig,photo,left(coalesce(p_pod->>'note',p_note),2000),lat_v,lon_v,accuracy_v,p_actor_user_id,t) returning * into receipt;
 end if;
 if outcome='ARRIVED' then
  update pg_temp.delivery_route_stops set status=outcome,arrived_at=t,updated_at=t where id=s.id;
 else
  update pg_temp.delivery_route_stops set status=outcome,completed_at=t,driver_note=left(p_note,1500),updated_at=t where id=s.id;
  update pg_temp.delivery_orders set status=outcome,last_status_at=t,updated_at=t where id=s.order_id;
 end if;
 insert into pg_temp.delivery_events(route_id,order_id,user_id,event_type,note) values(r.id,s.order_id,p_actor_user_id,case outcome when 'ARRIVED' then 'STOP_ARRIVED' when 'DELIVERED' then 'STOP_DELIVERED' else 'STOP_NOT_DELIVERED' end,left(p_note,1500));
 select not exists(select 1 from pg_temp.delivery_route_stops where route_id=r.id and status in ('PENDING','ARRIVED')) into done;
 if done then update pg_temp.delivery_routes set status='COMPLETED',completed_at=t,updated_at=t where id=r.id;else update pg_temp.delivery_routes set updated_at=t where id=r.id;end if;
 select * into r from pg_temp.delivery_routes where id=r.id;
 return jsonb_build_object('ok',true,'route_complete',done,'route',to_jsonb(r),'pod_number',receipt.pod_number,'already_saved',false);
end $$;
create function pg_temp.fail_receipt_event() returns trigger language plpgsql as $$ begin if new.event_type='STOP_DELIVERED' and new.note='FORCED_TEST_FAILURE' then raise exception 'Fixture failure after proof insert';end if;return new;end $$;
create trigger test_failure before insert on pg_temp.delivery_events for each row execute function pg_temp.fail_receipt_event();
do $$
declare a uuid:=gen_random_uuid();d uuid:=gen_random_uuid();other_driver uuid:=gen_random_uuid();r uuid:=gen_random_uuid();o1 uuid:=gen_random_uuid();o2 uuid:=gen_random_uuid();s1 uuid:=gen_random_uuid();s2 uuid:=gen_random_uuid();blocked boolean;j jsonb;first_number bigint;png text:='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jPZkAAAAASUVORK5CYII=';pod jsonb;
begin
 insert into pg_temp.app_users(id,role,full_name,driver_number) values(a,'ADMIN','Fixture admin',null),(d,'DRIVER','Fixture driver','1001'),(other_driver,'DRIVER','Other fixture driver','1002');
 insert into pg_temp.delivery_orders(id,customer_name,address,lat,lon) values(o1,'Fixture one','Synthetic address',40,-90),(o2,'Fixture two','Synthetic address',40.1,-90.1);
 insert into pg_temp.delivery_routes(id,driver_user_id,route_date,wave,status,created_by) values(r,d,current_date,'TEST','PLANNED',a);
 insert into pg_temp.delivery_route_stops(id,route_id,order_id,stop_sequence,status) values(s1,r,o1,1,'PENDING'),(s2,r,o2,2,'PENDING');
 pod:=jsonb_build_object('receiver_name','Fixture recipient','signature_data',png,'note','Fixture note');
 blocked:=false;begin perform pg_temp.udp_record_stop_outcome(s1,d,'stop_complete',null,pod);exception when others then blocked:=true;end;if not blocked then raise exception 'Planned completion accepted';end if;
 perform pg_temp.udp_transition_route(r,a,'release_to_driver');perform pg_temp.udp_transition_route(r,d,'route_start');
 blocked:=false;begin perform pg_temp.udp_record_stop_outcome(s1,a,'stop_complete',null,pod);exception when others then blocked:=true;end;if not blocked then raise exception 'Office completion accepted';end if;
 blocked:=false;begin perform pg_temp.udp_record_stop_outcome(s1,other_driver,'stop_complete',null,pod);exception when others then blocked:=true;end;if not blocked then raise exception 'Other driver completion accepted';end if;
 blocked:=false;begin perform pg_temp.udp_record_stop_outcome(s1,d,'stop_complete',null,'{}');exception when others then blocked:=true;end;if not blocked then raise exception 'Missing proof accepted';end if;
 blocked:=false;begin perform pg_temp.udp_record_stop_outcome(s1,d,'stop_complete',null,jsonb_build_object('receiver_name','Fixture','signature_data','data:image/svg+xml,<svg/>'));exception when others then blocked:=true;end;if not blocked then raise exception 'SVG proof accepted';end if;
 blocked:=false;begin perform pg_temp.udp_record_stop_outcome(s1,d,'stop_complete',null,jsonb_build_object('receiver_name','Fixture','signature_data','data:image/png;base64,YmFk'));exception when others then blocked:=true;end;if not blocked then raise exception 'Bad image bytes accepted';end if;
 blocked:=false;begin perform pg_temp.udp_record_stop_outcome(s1,d,'stop_complete','FORCED_TEST_FAILURE',pod);exception when others then blocked:=true;end;if not blocked then raise exception 'Forced failure not raised';end if;
 if exists(select 1 from pg_temp.proof_of_delivery where route_stop_id=s1) or (select status from pg_temp.delivery_route_stops where id=s1)<>'PENDING' or (select status from pg_temp.delivery_orders where id=o1)<>'OUT_FOR_DELIVERY' then raise exception 'Failed transaction left partial proof or outcome';end if;
 j:=pg_temp.udp_record_stop_outcome(s1,d,'stop_complete','Fixture note',pod);first_number:=(j->>'pod_number')::bigint;
 if (j->>'route_complete')::boolean then raise exception 'Route ended before all stops';end if;
 j:=pg_temp.udp_record_stop_outcome(s1,d,'stop_complete','Changed note',jsonb_build_object('receiver_name','Changed recipient','photo_data',png));
 if not (j->>'already_saved')::boolean or (j->>'pod_number')::bigint<>first_number or (select receiver_name from pg_temp.proof_of_delivery where route_stop_id=s1)<>'Fixture recipient' or (select count(*) from pg_temp.delivery_events where event_type='STOP_DELIVERED')<>1 then raise exception 'Retry duplicated or replaced signed receipt';end if;
 perform pg_temp.udp_transition_route(r,d,'route_pause');
 blocked:=false;begin perform pg_temp.udp_record_stop_outcome(s2,d,'stop_complete',null,pod);exception when others then blocked:=true;end;if not blocked then raise exception 'Paused completion accepted';end if;
 perform pg_temp.udp_transition_route(r,d,'route_resume');
 perform pg_temp.udp_record_stop_outcome(s2,d,'stop_arrive');
 j:=pg_temp.udp_record_stop_outcome(s2,d,'stop_complete',null,jsonb_build_object('receiver_name','Second recipient','photo_data',png));
 if not(j->>'route_complete')::boolean or (select status from pg_temp.delivery_routes where id=r)<>'COMPLETED' or (select count(*) from pg_temp.proof_of_delivery)<>2 then raise exception 'Photo-only final stop failed';end if;
 if exists(select 1 from pg_temp.delivery_orders where status<>'DELIVERED') then raise exception 'Order outcome did not commit';end if;
 if not pg_temp.udp_valid_pod_image(null,200000) or pg_temp.udp_valid_pod_image(repeat('a',1400000),1000000) then raise exception 'Image bounds failed';end if;
end $$;
select 'PASS: authorized atomic completion, proof required, safe image validation, failure rollback, idempotent receipt, pause guard, photo-only delivery and final-route completion; temporary data only' as result;
rollback;
