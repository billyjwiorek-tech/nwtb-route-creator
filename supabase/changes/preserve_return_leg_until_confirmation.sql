-- Keep the return leg in the existing ACTIVE lifecycle until the assigned driver confirms arrival.
-- No historic route, stop, POD, employee or session rows are changed by this migration.
ALTER TABLE public.delivery_routes
 ADD COLUMN IF NOT EXISTS returning_started_at timestamptz,
 ADD COLUMN IF NOT EXISTS returned_at timestamptz;
COMMENT ON COLUMN public.delivery_routes.returning_started_at IS 'All stops finished; assigned return leg remains ACTIVE until driver confirms arrival.';
COMMENT ON COLUMN public.delivery_routes.returned_at IS 'Assigned driver explicitly confirmed arrival at the saved return location.';

CREATE OR REPLACE FUNCTION public.nwtb_route_needs_return(p_route jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SECURITY INVOKER
SET search_path TO pg_catalog AS $fn$
 SELECT coalesce(nullif(p_route->>'end_mode',''),'RETURN_DEPOT') <> 'LAST_STOP'
$fn$;
REVOKE ALL ON FUNCTION public.nwtb_route_needs_return(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nwtb_route_needs_return(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.nwtb_finish_route_stops(p_route_id uuid,p_driver_employee_number text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO public,pg_catalog AS $fn$
DECLARE r public.delivery_routes; n bigint; all_done boolean; started timestamptz; t timestamptz:=now();
BEGIN
 IF EXISTS(SELECT 1 FROM public.nwtb_system_control WHERE id=1 AND state='KILLED') THEN RAISE EXCEPTION 'NWTB_SYSTEM_KILLED'; END IF;
 SELECT * INTO r FROM public.delivery_routes WHERE id=p_route_id FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Route not found.'; END IF;
 IF r.driver_employee_number IS DISTINCT FROM p_driver_employee_number THEN RAISE EXCEPTION 'Route is assigned to another driver.'; END IF;
 IF r.status <> 'ACTIVE' OR r.released_to_driver IS DISTINCT FROM true THEN RAISE EXCEPTION 'Only a released ACTIVE route can finish stops.'; END IF;
 IF r.paused_at IS NOT NULL AND (r.resumed_at IS NULL OR r.paused_at>r.resumed_at) THEN RAISE EXCEPTION 'Resume the route before finishing stops.'; END IF;
 SELECT count(*),coalesce(bool_and(coalesce(status IN ('DELIVERED','NOT_DELIVERED','SKIPPED'),false)),false)
 INTO n,all_done FROM public.delivery_route_stops WHERE route_id=r.id;
 IF n=0 OR NOT all_done THEN
  RETURN jsonb_build_object('route_id',r.id,'route_status','ACTIVE','route_completed',false,'return_pending',false);
 END IF;
 IF public.nwtb_route_needs_return(to_jsonb(r)) THEN
  started:=coalesce(r.returning_started_at,t);
  IF r.returning_started_at IS NULL THEN
   UPDATE public.delivery_routes SET returning_started_at=started,returned_at=NULL,updated_at=t WHERE id=r.id;
   INSERT INTO public.delivery_events(route_id,employee_number,event_type,note)
   VALUES(r.id,p_driver_employee_number,'ROUTE_RETURNING','All stops finished. Assigned return leg is in progress; driver arrival is not yet confirmed.');
  END IF;
  RETURN jsonb_build_object('route_id',r.id,'route_status','ACTIVE','route_completed',false,'return_pending',true,'returning_started_at',started);
 END IF;
 UPDATE public.delivery_routes SET status='COMPLETED',updated_at=t WHERE id=r.id;
 INSERT INTO public.delivery_events(route_id,employee_number,event_type,note)
 VALUES(r.id,p_driver_employee_number,'ROUTE_COMPLETED','All stops finished. This route ends at its last stop.');
 RETURN jsonb_build_object('route_id',r.id,'route_status','COMPLETED','route_completed',true,'return_pending',false);
END $fn$;
REVOKE ALL ON FUNCTION public.nwtb_finish_route_stops(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nwtb_finish_route_stops(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.nwtb_confirm_route_return(p_route_id uuid,p_driver_employee_number text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO public,pg_catalog AS $fn$
DECLARE r public.delivery_routes; n bigint; all_done boolean; t timestamptz:=now();
BEGIN
 IF EXISTS(SELECT 1 FROM public.nwtb_system_control WHERE id=1 AND state='KILLED') THEN RAISE EXCEPTION 'NWTB_SYSTEM_KILLED'; END IF;
 SELECT * INTO r FROM public.delivery_routes WHERE id=p_route_id FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Route not found.'; END IF;
 IF r.driver_employee_number IS DISTINCT FROM p_driver_employee_number THEN RAISE EXCEPTION 'Route is assigned to another driver.'; END IF;
 IF r.status='COMPLETED' AND r.returned_at IS NOT NULL THEN
  RETURN jsonb_build_object('route_id',r.id,'route_status','COMPLETED','returned_at',r.returned_at,'already_confirmed',true);
 END IF;
 IF r.status<>'ACTIVE' OR r.released_to_driver IS DISTINCT FROM true THEN RAISE EXCEPTION 'Only a released ACTIVE route can confirm its return.'; END IF;
 IF NOT public.nwtb_route_needs_return(to_jsonb(r)) THEN RAISE EXCEPTION 'This route ends at its last stop.'; END IF;
 IF r.paused_at IS NOT NULL AND (r.resumed_at IS NULL OR r.paused_at>r.resumed_at) THEN RAISE EXCEPTION 'Resume the route before confirming arrival.'; END IF;
 SELECT count(*),coalesce(bool_and(coalesce(status IN ('DELIVERED','NOT_DELIVERED','SKIPPED'),false)),false)
 INTO n,all_done FROM public.delivery_route_stops WHERE route_id=r.id;
 IF n=0 OR NOT all_done THEN RAISE EXCEPTION 'Finish all assigned stops before confirming the return.'; END IF;
 IF r.returning_started_at IS NULL THEN PERFORM public.nwtb_finish_route_stops(r.id,p_driver_employee_number); END IF;
 UPDATE public.delivery_routes SET status='COMPLETED',returned_at=t,updated_at=t WHERE id=r.id;
 INSERT INTO public.delivery_events(route_id,employee_number,event_type,note)
 VALUES(r.id,p_driver_employee_number,'ROUTE_RETURNED','Driver explicitly confirmed arrival at the assigned return location.'),
       (r.id,p_driver_employee_number,'ROUTE_COMPLETED','Route completed after driver confirmed the return leg.');
 RETURN jsonb_build_object('route_id',r.id,'route_status','COMPLETED','returned_at',t,'already_confirmed',false);
END $fn$;
REVOKE ALL ON FUNCTION public.nwtb_confirm_route_return(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nwtb_confirm_route_return(uuid,text) TO service_role;

-- A legacy final-stop handler cannot close a route whose return leg is unfinished.
CREATE OR REPLACE FUNCTION public.nwtb_keep_return_leg_active()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO public,pg_catalog AS $fn$
DECLARE n bigint; all_done boolean;
BEGIN
 IF OLD.status='ACTIVE' AND NEW.status='COMPLETED' AND NEW.returned_at IS NULL
    AND public.nwtb_route_needs_return(to_jsonb(NEW)) THEN
  SELECT count(*),coalesce(bool_and(coalesce(status IN ('DELIVERED','NOT_DELIVERED','SKIPPED'),false)),false)
   INTO n,all_done FROM public.delivery_route_stops WHERE route_id=NEW.id;
  IF n=0 OR NOT all_done THEN RAISE EXCEPTION 'Cannot complete a route with unfinished stops.'; END IF;
  NEW.status:='ACTIVE';NEW.returning_started_at:=coalesce(NEW.returning_started_at,now());
  IF OLD.returning_started_at IS NULL THEN
   INSERT INTO public.delivery_events(route_id,employee_number,event_type,note)
   VALUES(NEW.id,NEW.driver_employee_number,'ROUTE_RETURNING','All stops finished. Return leg remains ACTIVE until driver confirms arrival.');
  END IF;
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.nwtb_keep_return_leg_active() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nwtb_keep_return_leg_active() TO service_role;
DROP TRIGGER IF EXISTS nwtb_keep_return_leg_active ON public.delivery_routes;
CREATE TRIGGER nwtb_keep_return_leg_active BEFORE UPDATE OF status ON public.delivery_routes
 FOR EACH ROW EXECUTE FUNCTION public.nwtb_keep_return_leg_active();

-- Adding a stop during a return reopens stop work and serializes against arrival confirmation.
CREATE OR REPLACE FUNCTION public.nwtb_pending_stop_reopens_return()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path TO public,pg_catalog AS $fn$
DECLARE r public.delivery_routes;
BEGIN
 IF NEW.status='PENDING' THEN
  SELECT * INTO r FROM public.delivery_routes WHERE id=NEW.route_id FOR UPDATE;
  IF r.id IS NULL OR r.status NOT IN ('PLANNED','ACTIVE') THEN RAISE EXCEPTION 'Only a planned or active route can receive a pending stop.'; END IF;
  IF r.returning_started_at IS NOT NULL OR r.returned_at IS NOT NULL THEN
   UPDATE public.delivery_routes SET returning_started_at=NULL,returned_at=NULL,updated_at=now() WHERE id=r.id;
  END IF;
 END IF;
 RETURN NEW;
END $fn$;
REVOKE ALL ON FUNCTION public.nwtb_pending_stop_reopens_return() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nwtb_pending_stop_reopens_return() TO service_role;
DROP TRIGGER IF EXISTS nwtb_pending_stop_reopens_return ON public.delivery_route_stops;
CREATE TRIGGER nwtb_pending_stop_reopens_return BEFORE INSERT OR UPDATE OF status,route_id ON public.delivery_route_stops
 FOR EACH ROW EXECUTE FUNCTION public.nwtb_pending_stop_reopens_return();

CREATE OR REPLACE FUNCTION public.nwtb_finalize_pod(p_pod_id uuid, p_stop_id uuid, p_driver_employee_number text, p_driver_display_name text, p_recipient_name text, p_notes text, p_lat double precision, p_lon double precision, p_accuracy_m double precision, p_captured_at timestamp with time zone, p_signature_path text, p_signature_sha256 text, p_photo_path text, p_photo_sha256 text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
declare
  v_route_id uuid;
  v_order_id uuid;
  v_stop_status text;
  v_route_driver text;
  v_driver_role text;
  v_driver_role_active boolean;
  v_customer_name text;
  v_pod_number bigint;
  v_remaining bigint;
  v_route_completed boolean := false;
  v_route_status text;
  v_released boolean;
  v_paused_at timestamptz;
  v_resumed_at timestamptz;
  v_finish jsonb;
  v_state text;
begin
  select state into v_state from public.nwtb_system_control where id=1;
  if v_state='KILLED' then raise exception 'NWTB_SYSTEM_KILLED'; end if;

  select role,active into v_driver_role,v_driver_role_active
  from public.nwtb_delivery_roles
  where employee_number=p_driver_employee_number;
  if v_driver_role is distinct from 'DRIVER' or v_driver_role_active is distinct from true then
    raise exception 'Driver is not an active NWTB Delivery DRIVER';
  end if;

  -- Serialize stop completion and return confirmation on the route row first.
  select route_id into v_route_id from public.delivery_route_stops where id=p_stop_id;
  perform 1 from public.delivery_routes where id=v_route_id for update;
  select s.route_id,s.order_id,s.status,r.driver_employee_number,o.customer_name,r.status,r.released_to_driver,r.paused_at,r.resumed_at
    into v_route_id,v_order_id,v_stop_status,v_route_driver,v_customer_name,v_route_status,v_released,v_paused_at,v_resumed_at
  from public.delivery_route_stops s
  join public.delivery_routes r on r.id=s.route_id
  join public.delivery_orders o on o.id=s.order_id
  where s.id=p_stop_id
  for update of s;

  if v_route_id is null then raise exception 'Stop not found'; end if;
  if v_route_driver is distinct from p_driver_employee_number then raise exception 'Stop is assigned to another driver'; end if;
  if v_route_status is distinct from 'ACTIVE' or v_released is distinct from true then raise exception 'Start a released route before completing a stop'; end if;
  if v_paused_at is not null and (v_resumed_at is null or v_paused_at>v_resumed_at) then raise exception 'Resume the route before completing a stop'; end if;
  if v_stop_status is distinct from 'PENDING' then raise exception 'Stop is no longer pending'; end if;
  if nullif(trim(p_recipient_name),'') is null then raise exception 'Recipient name is required'; end if;
  if p_signature_path is null and p_photo_path is null then raise exception 'Signature or photo is required'; end if;

  insert into public.delivery_pods(
    id,route_id,stop_id,order_id,driver_employee_number,driver_display_name,
    recipient_name,delivery_result,notes,lat,lon,accuracy_m,captured_at,
    signature_path,signature_sha256,photo_path,photo_sha256
  ) values (
    p_pod_id,v_route_id,p_stop_id,v_order_id,p_driver_employee_number,left(p_driver_display_name,180),
    left(trim(p_recipient_name),180),'DELIVERED',left(nullif(trim(p_notes),''),1500),
    p_lat,p_lon,p_accuracy_m,coalesce(p_captured_at,now()),
    p_signature_path,p_signature_sha256,p_photo_path,p_photo_sha256
  ) returning pod_number into v_pod_number;

  update public.delivery_route_stops
     set status='DELIVERED',completed_at=coalesce(p_captured_at,now()),driver_note=left(nullif(trim(p_notes),''),1000),updated_at=now()
   where id=p_stop_id;

  update public.delivery_orders
     set status='DELIVERED',last_status_at=coalesce(p_captured_at,now()),updated_at=now()
   where id=v_order_id;

  insert into public.delivery_events(route_id,stop_id,order_id,employee_number,event_type,note)
  values(v_route_id,p_stop_id,v_order_id,p_driver_employee_number,'POD_CAPTURED',
         'POD #'||v_pod_number||' captured for '||coalesce(v_customer_name,'delivery')||'; received by '||left(trim(p_recipient_name),180));

  insert into public.delivery_events(route_id,stop_id,order_id,employee_number,event_type,note)
  values(v_route_id,p_stop_id,v_order_id,p_driver_employee_number,'STOP_DELIVERED','Delivered with POD #'||v_pod_number);

  select count(*) into v_remaining
  from public.delivery_route_stops
  where route_id=v_route_id and status='PENDING';

  if v_remaining=0 then
    v_finish:=public.nwtb_finish_route_stops(v_route_id,p_driver_employee_number);
    v_route_completed:=coalesce((v_finish->>'route_completed')::boolean,false);
  end if;

  return jsonb_build_object(
    'pod_id',p_pod_id,
    'pod_number',v_pod_number,
    'route_id',v_route_id,
    'stop_id',p_stop_id,
    'order_id',v_order_id,
    'route_completed',v_route_completed,
    'return_pending',coalesce((v_finish->>'return_pending')::boolean,false)
  );
end;
$function$

CREATE OR REPLACE FUNCTION public.nwtb_submit_delivery_exception(p_stop_id uuid, p_driver_employee_number text, p_reason_code text, p_reason_label text, p_notes text DEFAULT NULL::text, p_lat double precision DEFAULT NULL::double precision, p_lon double precision DEFAULT NULL::double precision, p_accuracy_m double precision DEFAULT NULL::double precision, p_occurred_at timestamp with time zone DEFAULT now())
 RETURNS delivery_exceptions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_stop record;
  v_order record;
  v_driver_name text;
  v_exception public.delivery_exceptions;
  v_t timestamptz := coalesce(p_occurred_at, now());
  v_remaining integer;
begin
  -- Use the same route-first lock order as POD and return confirmation.
  perform 1 from public.delivery_routes where id=(select route_id from public.delivery_route_stops where id=p_stop_id) for update;
  select s.id,s.route_id,s.order_id,s.status,r.driver_employee_number,r.status as route_status,r.paused_at,r.resumed_at
    into v_stop
  from public.delivery_route_stops s
  join public.delivery_routes r on r.id=s.route_id
  where s.id=p_stop_id
  for update of s;

  if v_stop.id is null then raise exception 'Stop not found.'; end if;
  if v_stop.driver_employee_number <> p_driver_employee_number then raise exception 'Stop is assigned to another driver.'; end if;
  if v_stop.status <> 'PENDING' then raise exception 'Only a pending stop can be marked as an exception.'; end if;
  if v_stop.route_status <> 'ACTIVE' then raise exception 'Start the route before reporting a delivery exception.'; end if;
  if v_stop.paused_at is not null and (v_stop.resumed_at is null or v_stop.paused_at > v_stop.resumed_at) then raise exception 'Resume the route before reporting a delivery exception.'; end if;

  select id,customer_name,address,sales_order_no,customer_number,status
    into v_order
  from public.delivery_orders
  where id=v_stop.order_id
  for update;
  if v_order.id is null then raise exception 'Delivery order not found.'; end if;

  select display_name into v_driver_name from public.employees where employee_number=p_driver_employee_number;

  insert into public.delivery_exceptions(
    route_id,stop_id,order_id,driver_employee_number,driver_display_name,customer_name,address,sales_order_no,customer_number,
    reason_code,reason_label,notes,lat,lon,accuracy_m,occurred_at
  ) values (
    v_stop.route_id,v_stop.id,v_stop.order_id,p_driver_employee_number,v_driver_name,v_order.customer_name,v_order.address,v_order.sales_order_no,v_order.customer_number,
    p_reason_code,p_reason_label,nullif(trim(coalesce(p_notes,'')),''),p_lat,p_lon,p_accuracy_m,v_t
  ) returning * into v_exception;

  update public.delivery_route_stops
    set status='NOT_DELIVERED',completed_at=v_t,driver_note=concat(p_reason_label,case when nullif(trim(coalesce(p_notes,'')),'') is not null then ': '||trim(p_notes) else '' end),updated_at=now()
    where id=v_stop.id;
  update public.delivery_orders
    set status='NOT_DELIVERED',last_status_at=v_t,updated_at=now()
    where id=v_stop.order_id;

  insert into public.delivery_events(route_id,stop_id,order_id,employee_number,event_type,note)
    values(v_stop.route_id,v_stop.id,v_stop.order_id,p_driver_employee_number,'DELIVERY_EXCEPTION_REPORTED',concat('#',v_exception.exception_number,' ',p_reason_label,case when nullif(trim(coalesce(p_notes,'')),'') is not null then ' — '||trim(p_notes) else '' end));

  select count(*) into v_remaining from public.delivery_route_stops where route_id=v_stop.route_id and status='PENDING';
  if v_remaining=0 then
    perform public.nwtb_finish_route_stops(v_stop.route_id,p_driver_employee_number);
  end if;
  return v_exception;
end;
$function$


REVOKE ALL ON FUNCTION public.nwtb_finalize_pod(uuid,uuid,text,text,text,text,double precision,double precision,double precision,timestamptz,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nwtb_finalize_pod(uuid,uuid,text,text,text,text,double precision,double precision,double precision,timestamptz,text,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.nwtb_submit_delivery_exception(uuid,text,text,text,text,double precision,double precision,double precision,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nwtb_submit_delivery_exception(uuid,text,text,text,text,double precision,double precision,double precision,timestamptz) TO service_role;
