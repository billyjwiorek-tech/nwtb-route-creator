-- Disposable CI database only. Never run this fixture against Supabase.
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA extensions TO service_role;
CREATE TABLE public.chat_sessions(token uuid PRIMARY KEY,employee_number text REFERENCES public.employees(employee_number),created_at timestamptz DEFAULT now(),expires_at timestamptz);
CREATE TABLE public.nwtb_admin_security(key text PRIMARY KEY,value_hash text);
CREATE FUNCTION public.nwtb_delivery_has_permission(p_employee_number text,p_permission text) RETURNS boolean LANGUAGE sql SECURITY INVOKER SET search_path=public,pg_catalog AS $$SELECT EXISTS(SELECT 1 FROM public.nwtb_delivery_roles WHERE employee_number=p_employee_number AND active AND role='ADMIN')$$;
ALTER TABLE public.delivery_routes ADD COLUMN estimated_miles numeric,ADD COLUMN estimated_minutes integer,ADD COLUMN drive_minutes integer,ADD COLUMN service_minutes integer,ADD COLUMN return_miles numeric,ADD COLUMN return_minutes integer,ADD COLUMN route_note text;
ALTER TABLE public.delivery_orders ADD COLUMN lat double precision,ADD COLUMN lon double precision,ADD COLUMN priority text NOT NULL DEFAULT 'NORMAL';
ALTER TABLE public.delivery_route_stops ADD COLUMN stop_sequence integer NOT NULL DEFAULT 1,ADD CONSTRAINT fixture_stop_sequence_unique UNIQUE(route_id,stop_sequence),ADD CONSTRAINT fixture_stop_order_unique UNIQUE(route_id,order_id),ADD CHECK(stop_sequence>0);
ALTER TABLE public.delivery_route_stops ALTER COLUMN updated_at SET DEFAULT now();
ALTER TABLE public.delivery_orders ALTER COLUMN updated_at SET DEFAULT now();
GRANT SELECT,INSERT,UPDATE,DELETE ON public.chat_sessions,public.nwtb_admin_security TO service_role;
