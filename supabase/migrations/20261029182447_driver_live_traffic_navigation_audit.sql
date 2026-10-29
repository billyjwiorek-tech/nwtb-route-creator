-- Minimal route-choice history; no coordinates, keys, session tokens or POD drafts.
CREATE TABLE public.nwtb_navigation_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 route_id uuid REFERENCES public.delivery_routes(id) ON DELETE SET NULL,
 driver_employee_number text REFERENCES public.employees(employee_number) ON DELETE SET NULL,
 stop_id uuid REFERENCES public.delivery_route_stops(id) ON DELETE SET NULL,
 target_kind text NOT NULL CHECK(target_kind IN ('STOP','RETURN')),
 source text NOT NULL CHECK(source IN ('TOMTOM','OSRM')),
 traffic_aware boolean NOT NULL,
 calculated_at timestamptz NOT NULL DEFAULT now(),
 decision text NOT NULL CHECK(decision IN ('INITIAL_ROUTE','ROUTE_RETAINED','TRAFFIC_REROUTE','ROAD_CLOSURE_REROUTE','OFF_ROUTE_REROUTE','NO_LIVE_TRAFFIC')),
 vehicle_profile text NOT NULL CHECK(vehicle_profile IN ('car','truck')),
 heading_used boolean NOT NULL DEFAULT false,
 saving_seconds integer NOT NULL DEFAULT 0 CHECK(saving_seconds>=0),
 alternatives jsonb NOT NULL CHECK(CASE WHEN jsonb_typeof(alternatives)='array' THEN jsonb_array_length(alternatives) BETWEEN 1 AND 6 ELSE false END),
 CHECK(NOT traffic_aware OR source='TOMTOM')
);
CREATE INDEX nwtb_navigation_audit_route_time ON public.nwtb_navigation_audit(route_id,calculated_at DESC);
CREATE INDEX nwtb_navigation_audit_driver_time ON public.nwtb_navigation_audit(driver_employee_number,calculated_at DESC);
CREATE INDEX nwtb_navigation_audit_stop ON public.nwtb_navigation_audit(stop_id);
CREATE INDEX nwtb_navigation_audit_retention ON public.nwtb_navigation_audit(calculated_at);
ALTER TABLE public.nwtb_navigation_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_manage_navigation_audit ON public.nwtb_navigation_audit FOR ALL TO service_role USING(true) WITH CHECK(true);
REVOKE ALL ON public.nwtb_navigation_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,DELETE ON public.nwtb_navigation_audit TO service_role;
GRANT USAGE,SELECT ON SEQUENCE public.nwtb_navigation_audit_id_seq TO service_role;
