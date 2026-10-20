-- Disposable fixture database only; no production connection.
ALTER TABLE public.nwtb_delivery_roles ADD COLUMN updated_at timestamptz DEFAULT now(),ADD COLUMN updated_by text;
CREATE TABLE public.chat_sessions(token uuid PRIMARY KEY DEFAULT gen_random_uuid(),employee_number text REFERENCES public.employees(employee_number),expires_at timestamptz DEFAULT now()+interval '30 days',last_seen_at timestamptz DEFAULT now());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.chat_sessions TO service_role;
