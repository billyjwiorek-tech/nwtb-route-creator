-- Isolated copies of live tables/functions; every write is temporary and rolled back.
begin;
create temporary table app_users (like public.app_users including all);
create temporary table company_locations (like public.company_locations including all);
create temporary table delivery_orders (like public.delivery_orders including all);
create temporary table delivery_routes (like public.delivery_routes including all);
create temporary table delivery_route_stops (like public.delivery_route_stops including all);
create temporary table delivery_events (like public.delivery_events including all);
do $$ declare f text;sig text;begin
 foreach sig in array array['udp_route_release_guard()','udp_transition_route(uuid,uuid,text,text)','udp_commit_multi_routes(uuid,date,text,jsonb)','udp_guard_stop_progress()','udp_invalidate_route_metrics()','udp_reorder_pending_stops(uuid,uuid,timestamptz,uuid[])'] loop
  f:=pg_get_functiondef(('public.'||sig)::regprocedure);f:=replace(f,'public.','pg_temp.');execute f;
 end loop;
end $$;
create trigger test_stage before insert or update of driver_user_id,status on delivery_routes for each row execute function pg_temp.udp_route_release_guard();
create trigger test_progress before update of status on delivery_route_stops for each row execute function pg_temp.udp_guard_stop_progress();
create trigger test_metrics after insert or delete or update of stop_sequence,order_id on delivery_route_stops for each row execute function pg_temp.udp_invalidate_route_metrics();
do $$
declare admin_id uuid:=gen_random_uuid();driver_id uuid:=gen_random_uuid();other_id uuid:=gen_random_uuid();loc_id uuid:=gen_random_uuid();o1 uuid:=gen_random_uuid();o2 uuid:=gen_random_uuid();rid uuid;r2 uuid;s1 uuid;res jsonb;blocked boolean;
begin
 insert into pg_temp.app_users(id,role,full_name,driver_number) values(admin_id,'ADMIN','Fixture Office',null),(driver_id,'DRIVER','Fixture Driver A','1001'),(other_id,'DRIVER','Fixture Driver B','1002');
 insert into pg_temp.company_locations(id,name,address,lat,lon) values(loc_id,'Fixture depot','Synthetic address',40,-90);
 insert into pg_temp.delivery_orders(id,customer_name,address,lat,lon) values(o1,'Fixture stop 1','Synthetic address 1',40.1,-90.1),(o2,'Fixture stop 2','Synthetic address 2',40.2,-90.2);
 res:=pg_temp.udp_commit_multi_routes(admin_id,current_date,'TEST',jsonb_build_array(jsonb_build_object('driver_id',driver_id,'location_id',loc_id,'drive_minutes',60,'service_minutes',10,'estimated_minutes',70,'stops',jsonb_build_array(jsonb_build_object('order_id',o1,'stop_sequence',1)))));
 rid:=(res->'routes'->0->>'route_id')::uuid;
 if (select status<>'PLANNED' or released_to_driver from pg_temp.delivery_routes where id=rid) then raise exception 'Staging failed';end if;
 blocked:=false;begin perform pg_temp.udp_transition_route(rid,driver_id,'route_start');exception when others then blocked:=true;end;if not blocked then raise exception 'Unreleased start accepted';end if;
 blocked:=false;begin perform pg_temp.udp_transition_route(rid,driver_id,'release_to_driver');exception when others then blocked:=true;end;if not blocked then raise exception 'Driver release accepted';end if;
 perform pg_temp.udp_transition_route(rid,admin_id,'release_to_driver');
 if (select status<>'PLANNED' or not released_to_driver from pg_temp.delivery_routes where id=rid) then raise exception 'Release activated route';end if;
 perform pg_temp.udp_transition_route(rid,admin_id,'hold_from_driver');
 if (select released_to_driver from pg_temp.delivery_routes where id=rid) then raise exception 'Hold failed';end if;
 perform pg_temp.udp_transition_route(rid,admin_id,'release_to_driver');
 blocked:=false;begin perform pg_temp.udp_transition_route(rid,admin_id,'route_start');exception when others then blocked:=true;end;if not blocked then raise exception 'Office started route';end if;
 blocked:=false;begin perform pg_temp.udp_transition_route(rid,other_id,'route_start');exception when others then blocked:=true;end;if not blocked then raise exception 'Wrong driver started route';end if;
 update pg_temp.delivery_routes set driver_user_id=other_id where id=rid;
 if (select released_to_driver from pg_temp.delivery_routes where id=rid) then raise exception 'Reassignment did not hold';end if;
 update pg_temp.delivery_routes set driver_user_id=driver_id where id=rid;
 select id into s1 from pg_temp.delivery_route_stops where route_id=rid;
 blocked:=false;begin update pg_temp.delivery_route_stops set status='DELIVERED' where id=s1;exception when others then blocked:=true;end;if not blocked then raise exception 'Planned stop completion accepted';end if;
 perform pg_temp.udp_transition_route(rid,admin_id,'release_to_driver');perform pg_temp.udp_transition_route(rid,driver_id,'route_start');
 res:=pg_temp.udp_commit_multi_routes(admin_id,current_date+1,'TEST',jsonb_build_array(jsonb_build_object('driver_id',driver_id,'location_id',loc_id,'stops',jsonb_build_array(jsonb_build_object('order_id',o2,'stop_sequence',1)))));r2:=(res->'routes'->0->>'route_id')::uuid;
 perform pg_temp.udp_transition_route(r2,admin_id,'release_to_driver');
 blocked:=false;begin perform pg_temp.udp_transition_route(r2,driver_id,'route_start');exception when others then blocked:=true;end;if not blocked then raise exception 'Multiple active routes accepted';end if;
 perform pg_temp.udp_transition_route(rid,driver_id,'route_pause','Fixture pause');
 blocked:=false;begin perform pg_temp.udp_transition_route(r2,driver_id,'route_start');exception when others then blocked:=true;end;if not blocked then raise exception 'Paused route did not reserve driver';end if;
 blocked:=false;begin perform pg_temp.udp_transition_route(rid,admin_id,'hold_from_driver');exception when others then blocked:=true;end;if not blocked then raise exception 'Ongoing route held';end if;
 blocked:=false;begin update pg_temp.delivery_route_stops set status='DELIVERED' where id=s1;exception when others then blocked:=true;end;if not blocked then raise exception 'Paused stop completion accepted';end if;
 perform pg_temp.udp_transition_route(rid,driver_id,'route_resume');
 update pg_temp.delivery_route_stops set status='DELIVERED' where id=s1;
 if not exists(select 1 from pg_temp.delivery_orders where id=o1 and status='OUT_FOR_DELIVERY') then raise exception 'Start did not update order';end if;
end $$;
do $$
declare a uuid:=gen_random_uuid();d uuid:=gen_random_uuid();l uuid:=gen_random_uuid();o1 uuid:=gen_random_uuid();o2 uuid:=gen_random_uuid();o3 uuid:=gen_random_uuid();rid uuid;s1 uuid;s2 uuid;s3 uuid;t timestamptz;j jsonb;blocked boolean;
begin
 insert into pg_temp.app_users(id,role,full_name,driver_number) values(a,'ADMIN','Reorder fixture admin',null),(d,'DRIVER','Reorder fixture driver','1003');
 insert into pg_temp.company_locations(id,name,address,lat,lon) values(l,'Reorder fixture depot','Synthetic address',40,-90);
 insert into pg_temp.delivery_orders(id,customer_name,address,lat,lon) values(o1,'Reorder fixture A','Synthetic A',40.1,-90.1),(o2,'Reorder fixture B','Synthetic B',40.2,-90.2),(o3,'Reorder fixture C','Synthetic C',40.3,-90.3);
 j:=pg_temp.udp_commit_multi_routes(a,current_date,'TEST',jsonb_build_array(jsonb_build_object('driver_id',d,'location_id',l,'drive_minutes',60,'service_minutes',30,'estimated_minutes',90,'stops',jsonb_build_array(jsonb_build_object('order_id',o1,'stop_sequence',1),jsonb_build_object('order_id',o2,'stop_sequence',2),jsonb_build_object('order_id',o3,'stop_sequence',3)))));
 rid:=(j->'routes'->0->>'route_id')::uuid;
 select id into s1 from pg_temp.delivery_route_stops where route_id=rid and order_id=o1;
 select id into s2 from pg_temp.delivery_route_stops where route_id=rid and order_id=o2;
 select id into s3 from pg_temp.delivery_route_stops where route_id=rid and order_id=o3;
 select updated_at into t from pg_temp.delivery_routes where id=rid;
 if (select estimated_minutes from pg_temp.delivery_routes where id=rid)<>90 then raise exception 'Staging lost metrics';end if;
 blocked:=false;begin perform pg_temp.udp_reorder_pending_stops(rid,d,t,array[s3,s2,s1]);exception when others then blocked:=true;end;if not blocked then raise exception 'Driver reordered office route';end if;
 blocked:=false;begin perform pg_temp.udp_reorder_pending_stops(rid,a,t,array[s3,s2]);exception when others then blocked:=true;end;if not blocked then raise exception 'Partial pending set accepted';end if;
 perform pg_temp.udp_reorder_pending_stops(rid,a,t,array[s3,s2,s1]);
 if (select stop_sequence from pg_temp.delivery_route_stops where id=s3)<>1 then raise exception 'Reorder failed';end if;
 if (select estimated_minutes is not null from pg_temp.delivery_routes where id=rid) then raise exception 'Stale metrics remained';end if;
 blocked:=false;begin perform pg_temp.udp_reorder_pending_stops(rid,a,t,array[s1,s2,s3]);exception when others then blocked:=true;end;if not blocked then raise exception 'Stale reorder accepted';end if;
 perform pg_temp.udp_transition_route(rid,a,'release_to_driver');perform pg_temp.udp_transition_route(rid,d,'route_start');
 update pg_temp.delivery_route_stops set status='ARRIVED' where id=s3;
 select updated_at into t from pg_temp.delivery_routes where id=rid;
 perform pg_temp.udp_reorder_pending_stops(rid,a,t,array[s1,s2]);
 if (select stop_sequence from pg_temp.delivery_route_stops where id=s3)<>1 or (select stop_sequence from pg_temp.delivery_route_stops where id=s1)<>2 then raise exception 'Arrived stop moved';end if;
end $$;
select 'PASS: staging, release/hold, Office/Driver authorization, reassignment, multiple planned routes, one ongoing route, pause/resume, progress gate, atomic pending order, metrics invalidation; temporary data only' as result;
rollback;
