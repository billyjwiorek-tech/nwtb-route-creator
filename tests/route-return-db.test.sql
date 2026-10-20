
\set ON_ERROR_STOP on
CREATE TABLE fixture_assertions(label text PRIMARY KEY);
CREATE FUNCTION fixture_assert(v boolean,label text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN IF v IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label;END IF;INSERT INTO fixture_assertions VALUES(label);END $f$;
CREATE FUNCTION fixture_error(command text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $f$
DECLARE caught boolean:=false;
BEGIN
 BEGIN EXECUTE command;EXCEPTION WHEN OTHERS THEN IF position(expected IN SQLERRM)=0 THEN RAISE;END IF;caught:=true;END;
 PERFORM fixture_assert(caught,label);
END $f$;
CREATE FUNCTION fixture_route(driver text,mode text DEFAULT 'RETURN_DEPOT',state text DEFAULT 'ACTIVE',released boolean DEFAULT true) RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE rid uuid;
BEGIN
 INSERT INTO public.employees VALUES(driver,'Fixture driver '||driver,true) ON CONFLICT DO NOTHING;
 INSERT INTO public.nwtb_delivery_roles VALUES(driver,'DRIVER',true) ON CONFLICT DO NOTHING;
 INSERT INTO public.delivery_routes(driver_employee_number,status,end_mode,released_to_driver) VALUES(driver,state,mode,released) RETURNING id INTO rid;RETURN rid;
END $f$;
CREATE FUNCTION fixture_stop(rid uuid,state text DEFAULT 'PENDING') RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE oid uuid;sid uuid;
BEGIN INSERT INTO public.delivery_orders DEFAULT VALUES RETURNING id INTO oid;
 INSERT INTO public.delivery_route_stops(route_id,order_id,status) VALUES(rid,oid,state) RETURNING id INTO sid;RETURN sid;
END $f$;
DO $f$
DECLARE r uuid;s uuid;s2 uuid;j jsonb;n bigint;e public.delivery_exceptions;
BEGIN
 r:=fixture_route('1001');s:=fixture_stop(r,'DELIVERED');s2:=fixture_stop(r);
 j:=public.nwtb_finish_route_stops(r,'1001');
 PERFORM fixture_assert(j->>'return_pending'='false' AND (SELECT status='ACTIVE' AND returning_started_at IS NULL FROM public.delivery_routes WHERE id=r),'unfinished stops keep normal ACTIVE state');
 UPDATE public.delivery_route_stops SET status='DELIVERED' WHERE id=s2;
 PERFORM fixture_assert((SELECT status='ACTIVE' AND returning_started_at IS NOT NULL FROM public.delivery_routes WHERE id=r),'stop transaction enters return even without a follow-up Edge RPC');
 j:=public.nwtb_finish_route_stops(r,'1001');
 PERFORM fixture_assert(j->>'return_pending'='true' AND j->>'route_completed'='false','last stop begins return without route completion');
 PERFORM fixture_assert((SELECT status='ACTIVE' AND returning_started_at IS NOT NULL AND returned_at IS NULL FROM public.delivery_routes WHERE id=r),'return leg stays ACTIVE with arrival unconfirmed');
 PERFORM fixture_assert((SELECT count(*)=1 FROM public.delivery_events WHERE route_id=r AND event_type='ROUTE_RETURNING'),'one return-start event');
 PERFORM fixture_assert(NOT EXISTS(SELECT 1 FROM public.delivery_events WHERE route_id=r AND event_type='ROUTE_COMPLETED'),'no premature completion event');
 PERFORM public.nwtb_finish_route_stops(r,'1001');
 PERFORM fixture_assert((SELECT count(*)=1 FROM public.delivery_events WHERE route_id=r AND event_type='ROUTE_RETURNING'),'return-start retry is idempotent');
 PERFORM fixture_error($q$SELECT fixture_route('1001')$q$,'duplicate key','one ACTIVE route rule still covers returning route');
 PERFORM fixture_error(format('SELECT public.nwtb_confirm_route_return(%L,''9999'')',r),'another driver','another driver cannot confirm arrival');
 UPDATE public.delivery_routes SET paused_at=now(),resumed_at=NULL WHERE id=r;
 PERFORM fixture_error(format('SELECT public.nwtb_confirm_route_return(%L,''1001'')',r),'Resume','paused return cannot be finished');
 UPDATE public.delivery_routes SET paused_at=NULL WHERE id=r;
 s2:=fixture_stop(r);
 PERFORM fixture_assert((SELECT returning_started_at IS NULL FROM public.delivery_routes WHERE id=r),'new stop clears return phase');
 PERFORM fixture_error(format('SELECT public.nwtb_confirm_route_return(%L,''1001'')',r),'Finish all','pending new stop prevents arrival completion');
 UPDATE public.delivery_route_stops SET status='SKIPPED' WHERE id=s2;
 PERFORM public.nwtb_finish_route_stops(r,'1001');
 PERFORM fixture_assert((SELECT count(*)=2 FROM public.delivery_events WHERE route_id=r AND event_type='ROUTE_RETURNING'),'finishing added stop begins a new return');
 j:=public.nwtb_confirm_route_return(r,'1001');
 PERFORM fixture_assert(j->>'route_status'='COMPLETED' AND j->>'already_confirmed'='false','assigned driver confirms return');
 PERFORM fixture_assert((SELECT status='COMPLETED' AND returned_at IS NOT NULL AND returning_started_at IS NOT NULL FROM public.delivery_routes WHERE id=r),'route closes only with recorded return confirmation');
 PERFORM fixture_assert((SELECT count(*)=1 FROM public.delivery_events WHERE route_id=r AND event_type='ROUTE_RETURNED'),'arrival recorded once');
 PERFORM fixture_assert((SELECT count(*)=1 FROM public.delivery_events WHERE route_id=r AND event_type='ROUTE_COMPLETED'),'completion recorded after arrival');
 j:=public.nwtb_confirm_route_return(r,'1001');
 PERFORM fixture_assert(j->>'already_confirmed'='true' AND (SELECT count(*)=1 FROM public.delivery_events WHERE route_id=r AND event_type='ROUTE_COMPLETED'),'arrival retry cannot duplicate events');
 PERFORM fixture_error(format('SELECT fixture_stop(%L)',r),'Only a planned or active','closed route cannot receive an orphan pending stop');

 r:=fixture_route('1002','LAST_STOP');s:=fixture_stop(r,'DELIVERED');j:=public.nwtb_finish_route_stops(r,'1002');
 PERFORM fixture_assert(j->>'route_completed'='true' AND (SELECT status='COMPLETED' AND returning_started_at IS NULL FROM public.delivery_routes WHERE id=r),'last-stop ending keeps automatic completion');

 r:=fixture_route('1003');s:=fixture_stop(r,'DELIVERED');UPDATE public.delivery_routes SET status='COMPLETED' WHERE id=r;
 PERFORM fixture_assert((SELECT status='ACTIVE' AND returning_started_at IS NOT NULL FROM public.delivery_routes WHERE id=r),'database gate catches legacy premature completion');
 UPDATE public.delivery_routes SET status='COMPLETED' WHERE id=r;
 PERFORM fixture_assert((SELECT count(*)=1 FROM public.delivery_events WHERE route_id=r AND event_type='ROUTE_RETURNING'),'legacy retry does not repeat return alert');

 r:=fixture_route('1004');s:=fixture_stop(r);
 PERFORM fixture_error(format('UPDATE public.delivery_routes SET status=''COMPLETED'' WHERE id=%L',r),'unfinished stops','legacy endpoint cannot close unfinished stops');

 r:=fixture_route('1005');s:=fixture_stop(r);
 j:=public.nwtb_finalize_pod(gen_random_uuid(),s,'1005','Fixture driver','Fixture recipient',NULL,NULL,NULL,NULL,now(),'fixture/signature.png',NULL,NULL,NULL);
 PERFORM fixture_assert(j->>'route_completed'='false' AND j->>'return_pending'='true','POD result distinguishes completed delivery from unfinished return');
 PERFORM fixture_assert((SELECT status='ACTIVE' AND returning_started_at IS NOT NULL FROM public.delivery_routes WHERE id=r),'POD final stop keeps route ACTIVE');
 PERFORM fixture_assert((SELECT status='DELIVERED' FROM public.delivery_route_stops WHERE id=s),'POD delivery completion retained');
 PERFORM fixture_assert((SELECT o.status='DELIVERED' FROM public.delivery_orders o JOIN public.delivery_route_stops ds ON ds.order_id=o.id WHERE ds.id=s),'POD order completion retained');
 PERFORM fixture_assert((SELECT count(*)=1 FROM public.delivery_pods WHERE route_id=r),'POD proof retained');
 PERFORM fixture_assert(NOT EXISTS(SELECT 1 FROM public.delivery_events WHERE route_id=r AND event_type='ROUTE_COMPLETED'),'POD cannot emit premature completion');

 r:=fixture_route('1006','RETURN_DEPOT','PLANNED',false);s:=fixture_stop(r);
 PERFORM fixture_error(format('SELECT public.nwtb_finalize_pod(gen_random_uuid(),%L,''1006'',''Fixture'',''Recipient'',NULL,NULL,NULL,NULL,now(),''fixture/sig.png'',NULL,NULL,NULL)',s),'Start a released route','POD cannot bypass unreleased Office route');
 PERFORM fixture_assert(NOT EXISTS(SELECT 1 FROM public.delivery_pods WHERE route_id=r) AND (SELECT status='PENDING' FROM public.delivery_route_stops WHERE id=s),'rejected Office-only POD leaves stop and proof unchanged');

 r:=fixture_route('1007','RETURN_DEPOT','ACTIVE',false);s:=fixture_stop(r);
 PERFORM fixture_error(format('SELECT public.nwtb_finalize_pod(gen_random_uuid(),%L,''1007'',''Fixture'',''Recipient'',NULL,NULL,NULL,NULL,now(),''fixture/sig.png'',NULL,NULL,NULL)',s),'Start a released route','POD requires explicit release even with corrupt ACTIVE flag');

 r:=fixture_route('1008');s:=fixture_stop(r);UPDATE public.delivery_routes SET paused_at=now() WHERE id=r;
 PERFORM fixture_error(format('SELECT public.nwtb_finalize_pod(gen_random_uuid(),%L,''1008'',''Fixture'',''Recipient'',NULL,NULL,NULL,NULL,now(),''fixture/sig.png'',NULL,NULL,NULL)',s),'Resume','POD cannot complete paused route');

 r:=fixture_route('1010');s:=fixture_stop(r);
 e:=public.nwtb_submit_delivery_exception(s,'1010','FIXTURE','Fixture exception');
 PERFORM fixture_assert(e.stop_id=s AND (SELECT status='NOT_DELIVERED' FROM public.delivery_route_stops WHERE id=s),'exception result and stop retained');
 PERFORM fixture_assert((SELECT status='ACTIVE' AND returning_started_at IS NOT NULL FROM public.delivery_routes WHERE id=r),'final exception also keeps return ACTIVE');
 PERFORM fixture_assert(NOT EXISTS(SELECT 1 FROM public.delivery_events WHERE route_id=r AND event_type='ROUTE_COMPLETED'),'exception cannot emit premature completion');

 r:=fixture_route('1011','RETURN_DEPOT','PLANNED',false);s:=fixture_stop(r);
 PERFORM fixture_error(format('SELECT public.nwtb_submit_delivery_exception(%L,''1011'',''FIXTURE'',''Fixture exception'')',s),'Start the route','exception cannot bypass Office staging');

 UPDATE public.nwtb_system_control SET state='KILLED' WHERE id=1;
 PERFORM fixture_error(format('SELECT public.nwtb_confirm_route_return(%L,''1010'')',e.route_id),'NWTB_SYSTEM_KILLED','system lock also protects return confirmation');
 UPDATE public.nwtb_system_control SET state='RUNNING' WHERE id=1;
 PERFORM fixture_assert(NOT has_function_privilege('anon','public.nwtb_confirm_route_return(uuid,text)','EXECUTE'),'anon cannot confirm another route');
 PERFORM fixture_assert(NOT has_function_privilege('authenticated','public.nwtb_confirm_route_return(uuid,text)','EXECUTE'),'authenticated Data API role cannot bypass Edge ownership');
 PERFORM fixture_assert(has_function_privilege('service_role','public.nwtb_confirm_route_return(uuid,text)','EXECUTE'),'service backend can confirm authorized return');
 PERFORM fixture_assert(NOT has_function_privilege('anon','public.nwtb_finalize_pod(uuid,uuid,text,text,text,text,double precision,double precision,double precision,timestamptz,text,text,text,text)','EXECUTE'),'POD SQL remains private');
END $f$;
SELECT count(*) AS passed_return_lifecycle_database_checks FROM fixture_assertions;
