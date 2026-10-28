-- Disposable CI PostgreSQL only. Never execute against production.
\set ON_ERROR_STOP on
BEGIN;
INSERT INTO public.employees(employee_number,display_name,active) VALUES('9998','Fixture Office',true),('8101','Fixture driver',true),('8102','Fixture second driver',true);
INSERT INTO public.nwtb_delivery_roles(employee_number,role,active) VALUES('9998','ADMIN',true),('8101','DRIVER',true),('8102','DRIVER',true);
INSERT INTO public.nwtb_admin_security(key,value_hash) VALUES('management_pin_sha256',encode(extensions.digest('fixture-end-pin','sha256'),'hex'));
CREATE FUNCTION public.fixture_end_input(rid uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('operation','end_route','route_id',r.id,'request_id',gen_random_uuid(),'reason','Fixture Office route cancellation',
  'expected_updated_at',r.updated_at,'expected_stops',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'status',s.status,'updated_at',s.updated_at) ORDER BY s.stop_sequence) FROM public.delivery_route_stops s WHERE s.route_id=r.id),'[]'::jsonb))
 FROM public.delivery_routes r WHERE r.id=rid
$$;
SET LOCAL ROLE service_role;
DO $$
DECLARE r uuid;r2 uuid;o uuid;o2 uuid;s uuid;s2 uuid;j jsonb;payload jsonb;before_route jsonb;before_pod jsonb;t timestamptz;count_before bigint;
BEGIN
 -- The exact reported case: an empty ACTIVE route can be ended, including retry.
 INSERT INTO public.delivery_routes(driver_employee_number,status,released_to_driver,estimated_miles,drive_minutes,service_minutes,return_miles,return_minutes)
 VALUES('8101','ACTIVE',true,49.4,91,35,13.5,21) RETURNING id INTO r;
 payload:=public.fixture_end_input(r);
 j:=public.nwtb_office_override('8101','fixture-end-pin',payload);
 IF j->>'code' IS DISTINCT FROM 'OFFICE_REQUIRED' THEN RAISE EXCEPTION 'Driver authorized to end route'; END IF;
 j:=public.nwtb_office_override('9998','incorrect-fixture-pin',payload);
 IF j->>'code' IS DISTINCT FROM 'ADMIN_PIN_REQUIRED' THEN RAISE EXCEPTION 'Wrong PIN accepted'; END IF;
 IF (SELECT status FROM public.delivery_routes WHERE id=r)<>'ACTIVE' OR EXISTS(SELECT 1 FROM public.nwtb_office_override_audit) THEN RAISE EXCEPTION 'Rejected end changed the route'; END IF;
 j:=public.nwtb_office_override('9998','fixture-end-pin',payload);
 IF NOT (j->>'ok')::boolean OR (j->>'returned_to_queue')::integer<>0 OR (SELECT status FROM public.delivery_routes WHERE id=r)<>'CANCELED' THEN RAISE EXCEPTION 'Empty route did not end: %',j; END IF;
 IF (SELECT returned_at IS NOT NULL OR estimated_miles<>49.4 OR drive_minutes<>91 OR return_minutes<>21 FROM public.delivery_routes WHERE id=r) THEN RAISE EXCEPTION 'End fabricated a return or changed stored estimates'; END IF;
 j:=public.nwtb_office_override('9998','fixture-end-pin',payload);
 IF NOT (j->>'replayed')::boolean OR (SELECT count(*) FROM public.nwtb_office_override_audit WHERE route_id=r)<>1 THEN RAISE EXCEPTION 'End retry duplicated mutation or audit'; END IF;
 payload:=public.fixture_end_input(r);j:=public.nwtb_office_override('9998','fixture-end-pin',payload);
 IF (j->>'status')::integer<>409 THEN RAISE EXCEPTION 'Ended route accepted a new end operation'; END IF;
 -- The unique ACTIVE slot is freed; a separate route can be started in fixtures.
 INSERT INTO public.delivery_routes(driver_employee_number,status,released_to_driver,paused_at,returning_started_at)
 VALUES('8101','ACTIVE',true,now(),now()) RETURNING id INTO r;
 j:=public.nwtb_office_override('9998','fixture-end-pin',public.fixture_end_input(r));
 IF NOT (j->>'ok')::boolean OR (SELECT status FROM public.delivery_routes WHERE id=r)<>'CANCELED' OR (SELECT returned_at FROM public.delivery_routes WHERE id=r) IS NOT NULL THEN RAISE EXCEPTION 'Paused/returning route could not end without false arrival'; END IF;

 -- Delivered history and real POD survive; only unfinished work returns to queue.
 INSERT INTO public.delivery_routes(driver_employee_number,status,released_to_driver) VALUES('8101','ACTIVE',true) RETURNING id INTO r;
 INSERT INTO public.delivery_orders(status,lat,lon) VALUES('DELIVERED',41.7,-88.1) RETURNING id INTO o;
 INSERT INTO public.delivery_orders(status,lat,lon) VALUES('OUT_FOR_DELIVERY',41.8,-88.1) RETURNING id INTO o2;
 INSERT INTO public.delivery_route_stops(route_id,order_id,stop_sequence,status,completed_at) VALUES(r,o,1,'DELIVERED',now()) RETURNING id INTO s;
 INSERT INTO public.delivery_route_stops(route_id,order_id,stop_sequence,status) VALUES(r,o2,2,'PENDING') RETURNING id INTO s2;
 INSERT INTO public.delivery_pods(id,route_id,stop_id,order_id,driver_employee_number,recipient_name,signature_path) VALUES(gen_random_uuid(),r,s,o,'8101','Fixture recipient','fixture/saved-signature');
 SELECT to_jsonb(p) INTO before_pod FROM public.delivery_pods p WHERE stop_id=s;
 payload:=public.fixture_end_input(r);
 -- A stop changes after Office review without changing the route timestamp.
 UPDATE public.delivery_route_stops SET updated_at=clock_timestamp()+interval '1 second' WHERE id=s2;
 j:=public.nwtb_office_override('9998','fixture-end-pin',payload);
 IF j->>'code' IS DISTINCT FROM 'STOP_CHANGED' OR (SELECT status FROM public.delivery_routes WHERE id=r)<>'ACTIVE' OR (SELECT status FROM public.delivery_orders WHERE id=o2)<>'OUT_FOR_DELIVERY' THEN RAISE EXCEPTION 'Stale stop review ended or requeued work'; END IF;
 payload:=public.fixture_end_input(r);payload:=jsonb_set(payload,'{expected_updated_at}',to_jsonb('2000-01-01T00:00:00Z'::text));
 j:=public.nwtb_office_override('9998','fixture-end-pin',payload);IF j->>'code' IS DISTINCT FROM 'ROUTE_CHANGED' THEN RAISE EXCEPTION 'Stale route timestamp accepted'; END IF;
 payload:=public.fixture_end_input(r);j:=public.nwtb_office_override('9998','fixture-end-pin',payload);
 IF NOT (j->>'ok')::boolean OR (j->>'returned_to_queue')::integer<>1 THEN RAISE EXCEPTION 'Mixed route end failed'; END IF;
 IF (SELECT status FROM public.delivery_orders WHERE id=o2)<>'UNASSIGNED' OR (SELECT status FROM public.delivery_route_stops WHERE id=s2)<>'SKIPPED' OR (SELECT completed_at FROM public.delivery_route_stops WHERE id=s2) IS NOT NULL THEN RAISE EXCEPTION 'Unfinished stop was deleted or fabricated as delivered'; END IF;
 IF (SELECT status FROM public.delivery_route_stops WHERE id=s)<>'DELIVERED' OR (SELECT status FROM public.delivery_orders WHERE id=o)<>'DELIVERED' OR (SELECT to_jsonb(p) FROM public.delivery_pods p WHERE stop_id=s)<>before_pod THEN RAISE EXCEPTION 'Completed delivery or saved POD changed'; END IF;
 BEGIN
  PERFORM public.nwtb_finalize_pod(gen_random_uuid(),s2,'8101','Fixture driver','Fixture late recipient',NULL,NULL,NULL,NULL,now(),'fixture/late-signature',NULL,NULL,NULL);
  RAISE EXCEPTION 'Late POD was accepted on an ended route';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE '%Start a released route%' THEN RAISE; END IF;
 END;
 IF EXISTS(SELECT 1 FROM public.delivery_pods WHERE stop_id=s2) THEN RAISE EXCEPTION 'Late proof was saved after route end'; END IF;
 IF EXISTS(SELECT 1 FROM public.delivery_events WHERE route_id=r AND event_type IN ('ROUTE_RETURNED','ROUTE_COMPLETED','ROUTE_RETURNING')) THEN RAISE EXCEPTION 'End created a fake delivery/return event'; END IF;

 -- PLANNED Office-only routes can end without ever becoming visible or ACTIVE.
 INSERT INTO public.delivery_routes(driver_employee_number,status,released_to_driver) VALUES('8102','PLANNED',false) RETURNING id INTO r;
 INSERT INTO public.delivery_orders(status,lat,lon) VALUES('ROUTED',41.7,-88.1) RETURNING id INTO o;
 INSERT INTO public.delivery_route_stops(route_id,order_id,stop_sequence) VALUES(r,o,1) RETURNING id INTO s;
 j:=public.nwtb_office_override('9998','fixture-end-pin',public.fixture_end_input(r));
 IF NOT (j->>'ok')::boolean OR (SELECT status FROM public.delivery_routes WHERE id=r)<>'CANCELED' OR (SELECT released_to_driver FROM public.delivery_routes WHERE id=r) THEN RAISE EXCEPTION 'Office-only end bypassed release gate'; END IF;
 IF (SELECT status FROM public.delivery_orders WHERE id=o)<>'UNASSIGNED' THEN RAISE EXCEPTION 'Planned work not returned to queue'; END IF;

 -- Inconsistent saved proof or another live assignment blocks requeueing.
 INSERT INTO public.delivery_routes(driver_employee_number,status,released_to_driver) VALUES('8102','ACTIVE',true) RETURNING id INTO r;
 INSERT INTO public.delivery_orders(status,lat,lon) VALUES('OUT_FOR_DELIVERY',41.7,-88.1) RETURNING id INTO o;
 INSERT INTO public.delivery_route_stops(route_id,order_id,stop_sequence) VALUES(r,o,1) RETURNING id INTO s;
 INSERT INTO public.delivery_pods(id,route_id,stop_id,order_id) VALUES(gen_random_uuid(),r,s,o);
 j:=public.nwtb_office_override('9998','fixture-end-pin',public.fixture_end_input(r));
 IF j->>'code' IS DISTINCT FROM 'STOP_CHANGED' OR (SELECT status FROM public.delivery_routes WHERE id=r)<>'ACTIVE' THEN RAISE EXCEPTION 'Pending stop with existing proof was requeued'; END IF;
 DELETE FROM public.delivery_pods WHERE stop_id=s;
 INSERT INTO public.delivery_routes(driver_employee_number,status,released_to_driver) VALUES('8101','PLANNED',true) RETURNING id INTO r2;
 INSERT INTO public.delivery_route_stops(route_id,order_id,stop_sequence) VALUES(r2,o,1);
 j:=public.nwtb_office_override('9998','fixture-end-pin',public.fixture_end_input(r));
 IF j->>'code' IS DISTINCT FROM 'STOP_CHANGED' OR (SELECT status FROM public.delivery_orders WHERE id=o)<>'OUT_FOR_DELIVERY' THEN RAISE EXCEPTION 'Other live assignment was stolen'; END IF;
 UPDATE public.nwtb_system_control SET state='KILLED' WHERE id=1;
 j:=public.nwtb_office_override('9998','fixture-end-pin',public.fixture_end_input(r));
 IF (j->>'status')::integer<>423 THEN RAISE EXCEPTION 'System lock was ignored'; END IF;
 UPDATE public.nwtb_system_control SET state='RUNNING' WHERE id=1;
 IF EXISTS(SELECT 1 FROM public.nwtb_office_override_audit WHERE before_state::text LIKE '%fixture-end-pin%' OR after_state::text LIKE '%fixture-end-pin%') THEN RAISE EXCEPTION 'PIN leaked to audit'; END IF;
 IF EXISTS(SELECT 1 FROM public.delivery_routes WHERE returned_at IS NOT NULL) THEN RAISE EXCEPTION 'Office end fabricated driver arrival'; END IF;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.nwtb_office_override('9998','fixture-end-pin','{}');RAISE EXCEPTION 'Anonymous route-end RPC allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
ROLLBACK;
