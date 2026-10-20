-- Driver registration and phone push use existing custom Driver/Office sessions.
CREATE OR REPLACE FUNCTION public.nwtb_add_delivery_driver(p_employee_number text,p_display_name text,p_created_by text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE v_name text:=btrim(coalesce(p_display_name,''));v_driver text:=btrim(coalesce(p_employee_number,''));v_existing public.employees%ROWTYPE;
BEGIN
 IF v_driver !~ '^[0-9]{4}$' OR v_driver='9998' OR length(v_name)<2 OR length(v_name)>120 THEN RAISE EXCEPTION 'A name and a valid 4-digit employee number are required.' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.employees WHERE employee_number=p_created_by AND active) THEN RAISE EXCEPTION 'Office employee is not active.' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.nwtb_system_control WHERE id=1 AND state<>'KILLED' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'NWTB Delivery System is locked.' USING ERRCODE='P0001'; END IF;
 SELECT * INTO v_existing FROM public.employees WHERE employee_number=v_driver FOR UPDATE;
 IF FOUND THEN
  IF v_existing.active AND v_existing.display_name=v_name AND EXISTS(SELECT 1 FROM public.nwtb_delivery_roles WHERE employee_number=v_driver AND role='DRIVER' AND active) THEN
   RETURN jsonb_build_object('employee_number',v_driver,'display_name',v_name,'role','DRIVER','active',true,'already_exists',true);
  END IF;
  RAISE EXCEPTION 'Employee number already exists. Use USER ROLES to manage the existing employee.' USING ERRCODE='23505';
 END IF;
 INSERT INTO public.employees(employee_number,display_name,active) VALUES(v_driver,v_name,true);
 INSERT INTO public.nwtb_delivery_roles(employee_number,role,active,updated_at,updated_by) VALUES(v_driver,'DRIVER',true,now(),p_created_by)
 ON CONFLICT(employee_number) DO UPDATE SET role='DRIVER',active=true,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
 INSERT INTO public.delivery_events(employee_number,event_type,note) VALUES(p_created_by,'DELIVERY_DRIVER_ADDED',format('Driver added: %s (%s)',v_name,v_driver));
 RETURN jsonb_build_object('employee_number',v_driver,'display_name',v_name,'role','DRIVER','active',true,'already_exists',false);
END;$$;
REVOKE ALL ON FUNCTION public.nwtb_add_delivery_driver(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.nwtb_add_delivery_driver(text,text,text) TO service_role;

CREATE TABLE IF NOT EXISTS public.nwtb_driver_push_keys(
 id integer PRIMARY KEY CHECK(id=1),
 public_key text NOT NULL CHECK(length(public_key)=87),
 private_key text NOT NULL CHECK(length(private_key)=43),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nwtb_driver_push_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nwtb_driver_push_keys FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.nwtb_driver_push_keys TO service_role;
COMMENT ON TABLE public.nwtb_driver_push_keys IS 'Server-only VAPID keypair. The private key is never returned to any browser.';

CREATE TABLE IF NOT EXISTS public.nwtb_driver_push_subscriptions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 driver_employee_number text NOT NULL REFERENCES public.employees(employee_number) ON DELETE CASCADE,
 session_token uuid NOT NULL REFERENCES public.chat_sessions(token) ON DELETE CASCADE,
 endpoint text NOT NULL UNIQUE CHECK(length(endpoint)<=2048),
 p256dh text NOT NULL CHECK(length(p256dh)=87),
 auth text NOT NULL CHECK(length(auth)=22),
 page_path text NOT NULL CHECK(page_path IN ('/nwtb-route-creator/driver-live.html','/nwtb-route-creator/driver-standard.html')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 last_success_at timestamptz,
 last_error text
);
CREATE INDEX IF NOT EXISTS nwtb_driver_push_driver_idx ON public.nwtb_driver_push_subscriptions(driver_employee_number);
CREATE INDEX IF NOT EXISTS nwtb_driver_push_session_idx ON public.nwtb_driver_push_subscriptions(session_token);
ALTER TABLE public.nwtb_driver_push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nwtb_driver_push_subscriptions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.nwtb_driver_push_subscriptions TO service_role;
COMMENT ON TABLE public.nwtb_driver_push_subscriptions IS 'Server-only subscriptions bound to the signed-in Driver session; removed when that session is deleted.';
