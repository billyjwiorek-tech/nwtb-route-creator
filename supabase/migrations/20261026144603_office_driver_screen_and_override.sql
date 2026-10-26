-- Passive phone screen telemetry and explicit, audited Office overrides.
-- No existing route, stop, session or release flag is changed by this migration.
CREATE TABLE public.nwtb_driver_screen_state (
 driver_employee_number text PRIMARY KEY REFERENCES public.employees(employee_number),
 session_token uuid NOT NULL REFERENCES public.chat_sessions(token) ON DELETE CASCADE,
 session_created_at timestamptz NOT NULL,
 page_id uuid NOT NULL,
 sequence bigint NOT NULL CHECK(sequence > 0),
 captured_at timestamptz NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 route_id uuid REFERENCES public.delivery_routes(id) ON DELETE SET NULL,
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=24000),
 geometry_key text,
 geometry jsonb CHECK(geometry IS NULL OR (jsonb_typeof(geometry)='array' AND jsonb_array_length(geometry)<=20000))
);
CREATE INDEX nwtb_driver_screen_state_session ON public.nwtb_driver_screen_state(session_token);
CREATE INDEX nwtb_driver_screen_state_route ON public.nwtb_driver_screen_state(route_id);
ALTER TABLE public.nwtb_driver_screen_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nwtb_driver_screen_state FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.nwtb_driver_screen_state TO service_role;

CREATE TABLE public.nwtb_office_override_limits (
 employee_number text PRIMARY KEY REFERENCES public.employees(employee_number),
 failed_count integer NOT NULL DEFAULT 0,
 window_started_at timestamptz NOT NULL DEFAULT now(),
 locked_until timestamptz
);
ALTER TABLE public.nwtb_office_override_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nwtb_office_override_limits FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.nwtb_office_override_limits TO service_role;

CREATE TABLE public.nwtb_office_override_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 request_id uuid NOT NULL UNIQUE,
 route_id uuid REFERENCES public.delivery_routes(id) ON DELETE SET NULL,
 stop_id uuid,
 order_id uuid,
 employee_number text NOT NULL REFERENCES public.employees(employee_number),
 operation text NOT NULL CHECK(operation IN ('complete_stop','priority','add_stop','remove_stop')),
 reason text NOT NULL,
 before_state jsonb NOT NULL,
 after_state jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX nwtb_office_override_audit_route ON public.nwtb_office_override_audit(route_id,created_at DESC);
CREATE INDEX nwtb_office_override_audit_employee ON public.nwtb_office_override_audit(employee_number);
ALTER TABLE public.nwtb_office_override_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nwtb_office_override_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.nwtb_office_override_audit TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.nwtb_office_override_audit_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.nwtb_check_office_override_pin(p_employee_number text,p_pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_catalog AS $$
DECLARE lim public.nwtb_office_override_limits; expected text; t timestamptz:=clock_timestamp();
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.employees WHERE employee_number=p_employee_number AND active)
 OR NOT (p_employee_number='9998' OR public.nwtb_delivery_has_permission(p_employee_number,'MANAGE_ROUTES'))
 THEN RETURN jsonb_build_object('ok',false,'code','OFFICE_REQUIRED','error','Office route-management session required.','status',403); END IF;
 INSERT INTO public.nwtb_office_override_limits(employee_number) VALUES(p_employee_number) ON CONFLICT DO NOTHING;
 SELECT * INTO lim FROM public.nwtb_office_override_limits WHERE employee_number=p_employee_number FOR UPDATE;
 IF lim.locked_until>t THEN RETURN jsonb_build_object('ok',false,'code','PIN_LOCKED','error','Too many incorrect PIN attempts. Try again in five minutes.','status',429); END IF;
 SELECT value_hash INTO expected FROM public.nwtb_admin_security WHERE key='management_pin_sha256';
 IF p_pin IS NULL OR length(p_pin)>20 OR expected IS NULL OR encode(extensions.digest(p_pin,'sha256'),'hex')<>expected THEN
  IF lim.window_started_at<t-interval '5 minutes' THEN lim.failed_count:=0;lim.window_started_at:=t; END IF;
  lim.failed_count:=lim.failed_count+1;
  UPDATE public.nwtb_office_override_limits SET failed_count=lim.failed_count,window_started_at=lim.window_started_at,
   locked_until=CASE WHEN lim.failed_count>=5 THEN t+interval '5 minutes' ELSE NULL END WHERE employee_number=p_employee_number;
  RETURN jsonb_build_object('ok',false,'code','ADMIN_PIN_REQUIRED','error','Incorrect management PIN.','status',403);
 END IF;
 UPDATE public.nwtb_office_override_limits SET failed_count=0,window_started_at=t,locked_until=NULL WHERE employee_number=p_employee_number;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.nwtb_check_office_override_pin(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nwtb_check_office_override_pin(text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.nwtb_store_driver_screen(
 p_driver text,p_session uuid,p_session_created_at timestamptz,p_page uuid,p_sequence bigint,
 p_captured_at timestamptz,p_route uuid,p_snapshot jsonb,p_geometry_key text,p_geometry jsonb
) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_catalog AS $$
DECLARE stored integer;
BEGIN
 INSERT INTO public.nwtb_driver_screen_state AS previous(driver_employee_number,session_token,session_created_at,page_id,sequence,captured_at,received_at,route_id,snapshot,geometry_key,geometry)
 VALUES(p_driver,p_session,p_session_created_at,p_page,p_sequence,p_captured_at,clock_timestamp(),p_route,p_snapshot,p_geometry_key,p_geometry)
 ON CONFLICT(driver_employee_number) DO UPDATE SET session_token=excluded.session_token,session_created_at=excluded.session_created_at,
 page_id=excluded.page_id,sequence=excluded.sequence,captured_at=excluded.captured_at,received_at=excluded.received_at,route_id=excluded.route_id,
 snapshot=excluded.snapshot,geometry_key=excluded.geometry_key,
 geometry=CASE WHEN p_geometry IS NOT NULL THEN p_geometry
 WHEN previous.geometry_key IS NOT DISTINCT FROM excluded.geometry_key AND previous.route_id IS NOT DISTINCT FROM excluded.route_id THEN previous.geometry ELSE NULL END
 WHERE excluded.session_created_at>=previous.session_created_at AND excluded.captured_at>=previous.captured_at
 AND (excluded.page_id<>previous.page_id OR excluded.sequence>previous.sequence);
 GET DIAGNOSTICS stored=ROW_COUNT;
 RETURN stored=1;
END $$;
REVOKE ALL ON FUNCTION public.nwtb_store_driver_screen(text,uuid,timestamptz,uuid,bigint,timestamptz,uuid,jsonb,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nwtb_store_driver_screen(text,uuid,timestamptz,uuid,bigint,timestamptz,uuid,jsonb,text,jsonb) TO service_role;

-- Route, stop and order writes, lifecycle change and audit share one transaction.
CREATE OR REPLACE FUNCTION public.nwtb_office_override(p_employee_number text,p_pin text,p_input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_catalog AS $$
DECLARE auth_result jsonb; r public.delivery_routes; s public.delivery_route_stops; o public.delivery_orders;
 op text:=p_input->>'operation'; reason text:=btrim(p_input->>'reason'); rid uuid:=(p_input->>'route_id')::uuid;
 sid uuid:=nullif(p_input->>'stop_id','')::uuid; oid uuid:=nullif(p_input->>'order_id','')::uuid;
 request uuid:=(p_input->>'request_id')::uuid; t timestamptz:=clock_timestamp(); previous jsonb; result jsonb;
 seq integer; after_seq integer; max_seq integer; row_stop record; event_name text; pending bigint;
BEGIN
 auth_result:=public.nwtb_check_office_override_pin(p_employee_number,p_pin);
 IF NOT coalesce((auth_result->>'ok')::boolean,false) THEN RETURN auth_result; END IF;
 IF EXISTS(SELECT 1 FROM public.nwtb_system_control WHERE id=1 AND state='KILLED') THEN RETURN jsonb_build_object('ok',false,'error','NWTB Delivery System is locked.','code','NWTB_SYSTEM_KILLED','status',423); END IF;
 IF request IS NULL OR rid IS NULL OR op IS NULL OR op NOT IN ('complete_stop','priority','add_stop','remove_stop') OR reason IS NULL OR length(reason)<3 OR length(reason)>500 THEN
  RETURN jsonb_build_object('ok',false,'error','Choose an override action and enter a reason.','status',400); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(request::text,0));
 SELECT after_state INTO result FROM public.nwtb_office_override_audit WHERE request_id=request AND employee_number=p_employee_number AND route_id=rid;
 IF result IS NOT NULL THEN RETURN result||jsonb_build_object('replayed',true); END IF;
 SELECT * INTO r FROM public.delivery_routes WHERE id=rid FOR UPDATE;
 IF r.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Route not found.','status',404); END IF;
 IF r.status NOT IN ('PLANNED','ACTIVE') THEN RETURN jsonb_build_object('ok',false,'error','Only planned or active routes can be edited.','status',409); END IF;
 IF nullif(p_input->>'expected_updated_at','') IS NULL OR r.updated_at IS DISTINCT FROM (p_input->>'expected_updated_at')::timestamptz THEN
  RETURN jsonb_build_object('ok',false,'error','The route changed. Refresh and review it before applying this override.','code','ROUTE_CHANGED','status',409); END IF;
 IF r.status='ACTIVE' AND r.paused_at IS NOT NULL AND (r.resumed_at IS NULL OR r.paused_at>r.resumed_at) THEN
  RETURN jsonb_build_object('ok',false,'error','Resume the paused route before changing its stops.','status',409); END IF;
 IF op='complete_stop' AND (r.status<>'ACTIVE' OR NOT r.released_to_driver) THEN
  RETURN jsonb_build_object('ok',false,'error','Only a released active route can have a stop completed.','status',409); END IF;
 IF op='add_stop' THEN
  SELECT * INTO o FROM public.delivery_orders WHERE id=oid FOR UPDATE;
  IF o.id IS NULL OR o.status<>'UNASSIGNED' OR o.lat IS NULL OR o.lon IS NULL OR abs(o.lat)>90 OR abs(o.lon)>180 OR (o.lat=0 AND o.lon=0)
   OR EXISTS(SELECT 1 FROM public.delivery_route_stops ds JOIN public.delivery_routes dr ON dr.id=ds.route_id WHERE ds.order_id=oid AND dr.status IN ('ACTIVE','PLANNED')) THEN
   RETURN jsonb_build_object('ok',false,'error','Choose an available stop with saved coordinates.','status',409); END IF;
  previous:=jsonb_build_object('order',to_jsonb(o));
 ELSE
  SELECT * INTO s FROM public.delivery_route_stops WHERE id=sid AND route_id=rid FOR UPDATE;
  IF s.id IS NULL OR s.status<>'PENDING' OR nullif(p_input->>'expected_stop_updated_at','') IS NULL OR s.updated_at IS DISTINCT FROM (p_input->>'expected_stop_updated_at')::timestamptz THEN
   RETURN jsonb_build_object('ok',false,'error','This stop changed or is no longer pending. Refresh and review it.','code','STOP_CHANGED','status',409); END IF;
  SELECT * INTO o FROM public.delivery_orders WHERE id=s.order_id FOR UPDATE;
  oid:=s.order_id;previous:=jsonb_build_object('stop',to_jsonb(s),'order',to_jsonb(o));
 END IF;
 IF op='priority' AND coalesce(p_input->>'priority','') NOT IN ('NORMAL','PRIORITY','HOT_SHOT') THEN
  RETURN jsonb_build_object('ok',false,'error','Choose Normal, Priority or Hot Shot.','status',400); END IF;
 IF op='add_stop' AND nullif(p_input->>'after_stop_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.delivery_route_stops WHERE id=(p_input->>'after_stop_id')::uuid AND route_id=rid) THEN
  RETURN jsonb_build_object('ok',false,'error','The insertion point changed. Refresh the route.','status',409); END IF;

 IF op='complete_stop' THEN
  UPDATE public.delivery_route_stops SET status='DELIVERED',completed_at=t,updated_at=t,
   driver_note=concat_ws(E'\n',nullif(driver_note,''),'OFFICE OVERRIDE by '||p_employee_number||': '||reason||' (POD not captured by this override)') WHERE id=sid;
  UPDATE public.delivery_orders SET status='DELIVERED',last_status_at=t,updated_at=t WHERE id=oid;
  PERFORM public.nwtb_finish_route_stops(rid,r.driver_employee_number);
  event_name:='OFFICE_STOP_COMPLETED';
 ELSIF op='priority' THEN
  UPDATE public.delivery_orders SET priority=p_input->>'priority',updated_at=t WHERE id=oid;
  IF coalesce((p_input->>'make_next')::boolean,false) THEN
   SELECT coalesce(max(stop_sequence),0) INTO max_seq FROM public.delivery_route_stops WHERE route_id=rid;
   -- Move the target out of the way, then shift only earlier PENDING stops.
   UPDATE public.delivery_route_stops SET stop_sequence=max_seq+1,updated_at=t WHERE id=sid;
   seq:=s.stop_sequence;
   FOR row_stop IN SELECT id,stop_sequence FROM public.delivery_route_stops WHERE route_id=rid AND status='PENDING' AND id<>sid AND stop_sequence<s.stop_sequence ORDER BY stop_sequence DESC LOOP
    UPDATE public.delivery_route_stops SET stop_sequence=seq,updated_at=t WHERE id=row_stop.id;seq:=row_stop.stop_sequence;
   END LOOP;
   UPDATE public.delivery_route_stops SET stop_sequence=seq,updated_at=t WHERE id=sid;
  ELSE UPDATE public.delivery_route_stops SET updated_at=t WHERE id=sid; END IF;
  event_name:='OFFICE_STOP_PRIORITY_CHANGED';
 ELSIF op='add_stop' THEN
  SELECT coalesce(max(stop_sequence),0) INTO max_seq FROM public.delivery_route_stops WHERE route_id=rid;
  seq:=max_seq+1;
  IF nullif(p_input->>'after_stop_id','') IS NOT NULL THEN SELECT stop_sequence+1 INTO seq FROM public.delivery_route_stops WHERE id=(p_input->>'after_stop_id')::uuid AND route_id=rid; END IF;
  FOR row_stop IN SELECT id,stop_sequence FROM public.delivery_route_stops WHERE route_id=rid AND stop_sequence>=seq ORDER BY stop_sequence DESC LOOP
   UPDATE public.delivery_route_stops SET stop_sequence=stop_sequence+1,updated_at=t WHERE id=row_stop.id;
  END LOOP;
  INSERT INTO public.delivery_route_stops(route_id,order_id,stop_sequence,status) VALUES(rid,oid,seq,'PENDING') RETURNING id INTO sid;
  UPDATE public.delivery_orders SET status=CASE WHEN r.status='ACTIVE' THEN 'OUT_FOR_DELIVERY' ELSE 'ROUTED' END,last_status_at=t,updated_at=t WHERE id=oid;
  event_name:='OFFICE_STOP_ADDED';
 ELSIF op='remove_stop' THEN
  IF EXISTS(SELECT 1 FROM public.delivery_pods WHERE stop_id=sid) THEN RETURN jsonb_build_object('ok',false,'error','A stop with saved POD cannot be removed.','status',409); END IF;
  DELETE FROM public.delivery_route_stops WHERE id=sid;
  UPDATE public.delivery_orders SET status='UNASSIGNED',last_status_at=t,updated_at=t WHERE id=oid;
  FOR row_stop IN SELECT id,stop_sequence FROM public.delivery_route_stops WHERE route_id=rid AND stop_sequence>s.stop_sequence ORDER BY stop_sequence LOOP
   UPDATE public.delivery_route_stops SET stop_sequence=stop_sequence-1,updated_at=t WHERE id=row_stop.id;
  END LOOP;
  SELECT count(*) INTO pending FROM public.delivery_route_stops WHERE route_id=rid AND status='PENDING';
  IF r.status='PLANNED' AND NOT EXISTS(SELECT 1 FROM public.delivery_route_stops WHERE route_id=rid) THEN
   UPDATE public.delivery_routes SET status='CANCELED' WHERE id=rid;
  END IF;
  IF r.status='ACTIVE' AND pending=0 THEN
   IF public.nwtb_route_needs_return(to_jsonb(r)) THEN
    UPDATE public.delivery_routes SET returning_started_at=coalesce(returning_started_at,t),returned_at=NULL WHERE id=rid;
    IF r.returning_started_at IS NULL THEN INSERT INTO public.delivery_events(route_id,employee_number,event_type,note) VALUES(rid,p_employee_number,'ROUTE_RETURNING','Office removed the last pending stop. Return leg remains active until driver confirms arrival.'); END IF;
   ELSE UPDATE public.delivery_routes SET status='COMPLETED' WHERE id=rid; END IF;
  END IF;
  event_name:='OFFICE_STOP_REMOVED';
 END IF;
 UPDATE public.delivery_routes SET updated_at=t,
  estimated_miles=CASE WHEN op='complete_stop' THEN estimated_miles ELSE NULL END,
  estimated_minutes=CASE WHEN op='complete_stop' THEN estimated_minutes ELSE NULL END,
  drive_minutes=CASE WHEN op='complete_stop' THEN drive_minutes ELSE NULL END,
  service_minutes=CASE WHEN op='complete_stop' THEN service_minutes ELSE NULL END,
  return_miles=CASE WHEN op='complete_stop' THEN return_miles ELSE NULL END,
  return_minutes=CASE WHEN op='complete_stop' THEN return_minutes ELSE NULL END WHERE id=rid;
 INSERT INTO public.delivery_events(route_id,stop_id,order_id,employee_number,event_type,note)
 VALUES(rid,CASE WHEN op='remove_stop' THEN NULL ELSE sid END,oid,p_employee_number,event_name,
  'OFFICE OVERRIDE: '||op||' — '||o.customer_name||' — '||reason);
 result:=jsonb_build_object('ok',true,'route_id',rid,'stop_id',sid,'order_id',oid,'operation',op,'request_id',request);
 INSERT INTO public.nwtb_office_override_audit(request_id,route_id,stop_id,order_id,employee_number,operation,reason,before_state,after_state)
 VALUES(request,rid,sid,oid,p_employee_number,op,reason,previous,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.nwtb_office_override(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nwtb_office_override(text,text,jsonb) TO service_role;
