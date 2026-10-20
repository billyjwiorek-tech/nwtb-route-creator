
-- Disposable GitHub Actions PostgreSQL database only. Never execute this fixture schema in Supabase.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE TABLE public.employees(employee_number text PRIMARY KEY,display_name text,active boolean NOT NULL DEFAULT true);
CREATE TABLE public.nwtb_delivery_roles(employee_number text PRIMARY KEY,role text,active boolean);
CREATE TABLE public.nwtb_system_control(id integer PRIMARY KEY,state text);
INSERT INTO public.nwtb_system_control VALUES(1,'RUNNING');
CREATE TABLE public.delivery_routes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),driver_employee_number text REFERENCES employees(employee_number),status text NOT NULL CHECK(status IN ('PLANNED','ACTIVE','COMPLETED','CANCELED')),released_to_driver boolean DEFAULT true,route_date date DEFAULT current_date,depot text DEFAULT 'BOLINGBROOK',wave text DEFAULT 'MORNING',end_mode text DEFAULT 'RETURN_DEPOT',end_name text,paused_at timestamptz,resumed_at timestamptz,updated_at timestamptz DEFAULT now());
CREATE UNIQUE INDEX delivery_one_active_driver ON public.delivery_routes(driver_employee_number) WHERE status='ACTIVE';
CREATE TABLE public.delivery_orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),customer_name text DEFAULT 'Fixture business',address text DEFAULT 'Fixture address',sales_order_no text,customer_number text,status text DEFAULT 'OUT_FOR_DELIVERY',last_status_at timestamptz,updated_at timestamptz);
CREATE TABLE public.delivery_route_stops(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),route_id uuid REFERENCES public.delivery_routes(id),order_id uuid REFERENCES public.delivery_orders(id),status text NOT NULL DEFAULT 'PENDING',completed_at timestamptz,driver_note text,updated_at timestamptz);
CREATE TABLE public.delivery_events(id bigserial PRIMARY KEY,created_at timestamptz DEFAULT now(),route_id uuid REFERENCES public.delivery_routes(id),stop_id uuid,order_id uuid,employee_number text,event_type text,note text);
CREATE TABLE public.delivery_pods(id uuid PRIMARY KEY,pod_number bigserial,route_id uuid,stop_id uuid UNIQUE,order_id uuid,driver_employee_number text,driver_display_name text,recipient_name text,delivery_result text,notes text,lat double precision,lon double precision,accuracy_m double precision,captured_at timestamptz,signature_path text,signature_sha256 text,photo_path text,photo_sha256 text);
CREATE TABLE public.delivery_exceptions(id uuid DEFAULT gen_random_uuid(),exception_number bigserial,route_id uuid,stop_id uuid,order_id uuid,driver_employee_number text,driver_display_name text,customer_name text,address text,sales_order_no text,customer_number text,reason_code text,reason_label text,notes text,lat double precision,lon double precision,accuracy_m double precision,occurred_at timestamptz);
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
