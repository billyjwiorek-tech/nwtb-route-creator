-- Real PostgreSQL assertions, synthetic records and a fixture-only PIN. ROLLBACK always.
BEGIN;
INSERT INTO public.employees VALUES('9998','Fixture Office',true),('1234','Fixture Driver',true),('5678','Other Fixture Driver',true);
INSERT INTO public.nwtb_delivery_roles VALUES('1234','DRIVER',true),('5678','DRIVER',true);
INSERT INTO public.nwtb_admin_security VALUES('management_pin_sha256',encode(extensions.digest('fixture-management-value','sha256'),'hex'));
INSERT INTO public.chat_sessions(token,employee_number,expires_at) VALUES('40000000-0000-4000-8000-000000000001','1234',now()+interval '1 day');

DO $$
DECLARE r uuid; planned uuid; no_return uuid; first_stop uuid; second_stop uuid; first_order uuid; second_order uuid; extra_order uuid; t timestamptz; st timestamptz; j jsonb; request uuid; snapshot_before jsonb; c bigint;
BEGIN
 INSERT INTO public.delivery_routes(driver_employee_number,status,released_to_driver,end_mode) VALUES('1234','ACTIVE',true,'RETURN_DEPOT') RETURNING id INTO r;
 INSERT INTO public.delivery_orders(customer_name,status,lat,lon) VALUES('First fixture stop','OUT_FOR_DELIVERY',41.7,-88.1) RETURNING id INTO first_order;
 INSERT INTO public.delivery_orders(customer_name,status,lat,lon) VALUES('Second fixture stop','OUT_FOR_DELIVERY',41.8,-88.1) RETURNING id INTO second_order;
 INSERT INTO public.delivery_orders(customer_name,status,lat,lon) VALUES('Available fixture stop','UNASSIGNED',41.9,-88.1) RETURNING id INTO extra_order;
 INSERT INTO public.delivery_route_stops(route_id,order_id,stop_sequence) VALUES(r,first_order,1) RETURNING id INTO first_stop;
 INSERT INTO public.delivery_route_stops(route_id,order_id,stop_sequence) VALUES(r,second_order,2) RETURNING id INTO second_stop;
 SELECT updated_at,to_jsonb(delivery_routes) INTO t,snapshot_before FROM public.delivery_routes WHERE id=r;
 SELECT updated_at INTO st FROM public.delivery_route_stops WHERE id=first_stop;
 request:=gen_random_uuid();
 j:=public.nwtb_office_override('1234','fixture-management-value',jsonb_build_object('operation','complete_stop','route_id',r,'request_id',request,'stop_id',first_stop,'expected_updated_at',t,'expected_stop_updated_at',st,'reason','Fixture correction'));
 IF j->>'code'<>'OFFICE_REQUIRED' THEN RAISE EXCEPTION 'Driver unexpectedly authorized'; END IF;
 FOR c IN 1..5 LOOP
  j:=public.nwtb_office_override('9998','incorrect-fixture-value',jsonb_build_object('operation','complete_stop','route_id',r,'request_id',request,'stop_id',first_stop,'expected_updated_at',t,'expected_stop_updated_at',st,'reason','Fixture correction'));
  IF (j->>'ok')::boolean THEN RAISE EXCEPTION 'Wrong PIN unexpectedly authorized'; END IF;
 END LOOP;
 j:=public.nwtb_check_office_override_pin('9998','fixture-management-value');
 IF j->>'code'<>'PIN_LOCKED' THEN RAISE EXCEPTION 'Missing durable PIN rate limit'; END IF;
 IF EXISTS(SELECT 1 FROM public.nwtb_office_override_audit) OR (SELECT status FROM public.delivery_route_stops WHERE id=first_stop)<>'PENDING' OR (SELECT to_jsonb(delivery_routes) FROM public.delivery_routes WHERE id=r)<>snapshot_before THEN RAISE EXCEPTION 'Unauthorized attempt changed a route'; END IF;
 UPDATE public.nwtb_office_override_limits SET locked_until=now()-interval '1 minute',window_started_at=now()-interval '6 minutes';

 -- Optimistic locking rejects an Office screen opened before the route/stop changed.
 j:=public.nwtb_office_override('9998','fixture-management-value',jsonb_build_object('operation','complete_stop','route_id',r,'request_id',request,'stop_id',first_stop,'expected_updated_at',t-interval '1 hour','expected_stop_updated_at',st,'reason','Fixture stale screen'));
 IF j->>'code'<>'ROUTE_CHANGED' THEN RAISE EXCEPTION 'Stale route accepted'; END IF;
 j:=public.nwtb_office_override('9998','fixture-management-value',jsonb_build_object('operation','complete_stop','route_id',r,'request_id',request,'stop_id',first_stop,'expected_updated_at',t,'expected_stop_updated_at',st-interval '1 hour','reason','Fixture stale stop'));
 IF j->>'code'<>'STOP_CHANGED' THEN RAISE EXCEPTION 'Stale stop accepted'; END IF;

 -- Completion writes the order, stop, event and audit, but never creates proof.
 j:=public.nwtb_office_override('9998','fixture-management-value',jsonb_build_object('operation','complete_stop','route_id',r,'request_id',request,'stop_id',first_stop,'expected_updated_at',t,'expected_stop_updated_at',st,'reason','Fixture Office correction'));
 IF NOT (j->>'ok')::boolean OR (SELECT status FROM public.delivery_orders WHERE id=first_order)<>'DELIVERED' OR (SELECT status FROM public.delivery_route_stops WHERE id=first_stop)<>'DELIVERED' THEN RAISE EXCEPTION 'Office completion not atomic'; END IF;
 IF EXISTS(SELECT 1 FROM public.delivery_pods WHERE stop_id=first_stop) THEN RAISE EXCEPTION 'Override fabricated POD'; END IF;
 j:=public.nwtb_office_override('9998','fixture-management-value',jsonb_build_object('operation','complete_stop','route_id',r,'request_id',request,'stop_id',first_stop,'expected_updated_at',t,'expected_stop_updated_at',st,'reason','Fixture retry'));
 IF NOT (j->>'replayed')::boolean OR (SELECT count(*) FROM public.nwtb_office_override_audit WHERE request_id=request)<>1 THEN RAISE EXCEPTION 'Override retry is not idempotent'; END IF;

 -- Insert after a completed stop without renumbering collisions.
 SELECT updated_at INTO t FROM public.delivery_routes WHERE id=r;
 j:=public.nwtb_office_override('9998','fixture-management-value',jsonb_build_object('operation','add_stop','route_id',r,'request_id',gen_random_uuid(),'order_id',extra_order,'after_stop_id',first_stop,'expected_updated_at',t,'reason','Fixture additional pickup'));
 IF NOT (j->>'ok')::boolean OR (SELECT stop_sequence FROM public.delivery_route_stops WHERE order_id=extra_order)<>2 OR (SELECT stop_sequence FROM public.delivery_route_stops WHERE id=second_stop)<>3 THEN RAISE EXCEPTION 'Insertion failed'; END IF;
 IF (SELECT released_to_driver FROM public.delivery_routes WHERE id=r) IS DISTINCT FROM true THEN RAISE EXCEPTION 'Edit changed release'; END IF;

 SELECT updated_at INTO t FROM public.delivery_routes WHERE id=r;SELECT updated_at INTO st FROM public.delivery_route_stops WHERE id=second_stop;
 j:=public.nwtb_office_override('9998','fixture-management-value',jsonb_build_object('operation','priority','route_id',r,'request_id',gen_random_uuid(),'stop_id',second_stop,'expected_updated_at',t,'expected_stop_updated_at',st,'priority','HOT_SHOT','make_next',true,'reason','Fixture urgent pickup'));
 IF NOT (j->>'ok')::boolean OR (SELECT stop_sequence FROM public.delivery_route_stops WHERE id=second_stop)<>2 OR (SELECT stop_sequence FROM public.delivery_route_stops WHERE id=first_stop)<>1 THEN RAISE EXCEPTION 'Priority move changed completed stop'; END IF;

 -- Remove each pending stop: orders return to AVAILABLE, return leg remains ACTIVE.
 FOR first_stop IN SELECT id FROM public.delivery_route_stops WHERE route_id=r AND status='PENDING' ORDER BY stop_sequence LOOP
  SELECT updated_at INTO t FROM public.delivery_routes WHERE id=r;SELECT updated_at INTO st FROM public.delivery_route_stops WHERE id=first_stop;
  j:=public.nwtb_office_override('9998','fixture-management-value',jsonb_build_object('operation','remove_stop','route_id',r,'request_id',gen_random_uuid(),'stop_id',first_stop,'expected_updated_at',t,'expected_stop_updated_at',st,'reason','Fixture return to queue'));
  IF NOT (j->>'ok')::boolean THEN RAISE EXCEPTION 'Pending removal failed: %',j; END IF;
 END LOOP;
 IF (SELECT status FROM public.delivery_routes WHERE id=r)<>'ACTIVE' OR (SELECT returning_started_at FROM public.delivery_routes WHERE id=r) IS NULL OR (SELECT returned_at FROM public.delivery_routes WHERE id=r) IS NOT NULL THEN RAISE EXCEPTION 'Removing last stop completed return route early'; END IF;
 IF (SELECT status FROM public.delivery_orders WHERE id=extra_order)<>'UNASSIGNED' THEN RAISE EXCEPTION 'Removed order not available'; END IF;

 -- A new stop during return reopens the pending portion through the existing trigger.
 SELECT updated_at INTO t FROM public.delivery_routes WHERE id=r;
 j:=public.nwtb_office_override('9998','fixture-management-value',jsonb_build_object('operation','add_stop','route_id',r,'request_id',gen_random_uuid(),'order_id',extra_order,'expected_updated_at',t,'reason','Fixture another pickup'));
 IF NOT (j->>'ok')::boolean OR (SELECT returning_started_at FROM public.delivery_routes WHERE id=r) IS NOT NULL THEN RAISE EXCEPTION 'Return phase not reopened'; END IF;

 INSERT INTO public.delivery_routes(driver_employee_number,status,released_to_driver) VALUES('5678','PLANNED',false) RETURNING id INTO planned;
 SELECT updated_at INTO t FROM public.delivery_routes WHERE id=planned;
 j:=public.nwtb_office_override('9998','fixture-management-value',jsonb_build_object('operation','add_stop','route_id',planned,'request_id',gen_random_uuid(),'order_id',second_order,'expected_updated_at',t,'reason','Fixture office staging'));
 IF NOT (j->>'ok')::boolean OR (SELECT released_to_driver FROM public.delivery_routes WHERE id=planned) IS DISTINCT FROM false OR (SELECT status FROM public.delivery_routes WHERE id=planned)<>'PLANNED' THEN RAISE EXCEPTION 'Office edit bypassed release gate'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.delivery_events WHERE route_id=r AND employee_number='9998' AND event_type='OFFICE_STOP_COMPLETED') THEN RAISE EXCEPTION 'Missing Office actor event'; END IF;
 IF EXISTS(SELECT 1 FROM public.nwtb_office_override_audit WHERE before_state::text LIKE '%fixture-management-value%' OR after_state::text LIKE '%fixture-management-value%') THEN RAISE EXCEPTION 'PIN leaked into audit'; END IF;
END $$;

DO $$
DECLARE accepted boolean; s public.nwtb_driver_screen_state; captured timestamptz:=clock_timestamp();
BEGIN
 accepted:=public.nwtb_store_driver_screen('1234','40000000-0000-4000-8000-000000000001',now(),'30000000-0000-4000-8000-000000000001',2,captured,NULL,'{"version":1,"eta":"6 min"}','key1','[[-88,41.7],[-88,41.8]]');
 IF NOT accepted THEN RAISE EXCEPTION 'Initial snapshot rejected'; END IF;
 accepted:=public.nwtb_store_driver_screen('1234','40000000-0000-4000-8000-000000000001',now(),'30000000-0000-4000-8000-000000000001',1,captured,NULL,'{"version":1,"eta":"old"}','key1',NULL);
 IF accepted THEN RAISE EXCEPTION 'Late sequence overwrote current screen'; END IF;
 accepted:=public.nwtb_store_driver_screen('1234','40000000-0000-4000-8000-000000000001',now(),'30000000-0000-4000-8000-000000000001',3,captured+interval '1 second',NULL,'{"version":1,"eta":"5 min"}','key1',NULL);
 SELECT * INTO s FROM public.nwtb_driver_screen_state WHERE driver_employee_number='1234';
 IF NOT accepted OR s.geometry IS NULL OR s.snapshot->>'eta'<>'5 min' THEN RAISE EXCEPTION 'Geometry reuse or current values failed'; END IF;
 accepted:=public.nwtb_store_driver_screen('1234','40000000-0000-4000-8000-000000000001',now(),'30000000-0000-4000-8000-000000000001',4,captured+interval '2 seconds',NULL,'{"version":1}','key2',NULL);
 IF (SELECT geometry FROM public.nwtb_driver_screen_state WHERE driver_employee_number='1234') IS NOT NULL THEN RAISE EXCEPTION 'Old geometry leaked into new path'; END IF;
END $$;

SET LOCAL ROLE anon;
DO $$ BEGIN
 BEGIN PERFORM public.nwtb_check_office_override_pin('9998','fixture-management-value');RAISE EXCEPTION 'Anonymous PIN verification allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM * FROM public.nwtb_driver_screen_state;RAISE EXCEPTION 'Anonymous Driver screen access allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN PERFORM * FROM public.nwtb_office_override_audit;RAISE EXCEPTION 'Anonymous audit access allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
END $$;
RESET ROLE;
ROLLBACK;
