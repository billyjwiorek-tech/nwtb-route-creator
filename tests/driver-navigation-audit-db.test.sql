-- Disposable CI database only. Never run these fixture rows against production.
BEGIN;
DO $$
BEGIN
 IF has_table_privilege('anon','public.nwtb_navigation_audit','SELECT') OR has_table_privilege('authenticated','public.nwtb_navigation_audit','SELECT') OR has_table_privilege('anon','public.nwtb_navigation_audit','INSERT') THEN RAISE EXCEPTION 'Public navigation-audit access'; END IF;
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.nwtb_navigation_audit'::regclass) THEN RAISE EXCEPTION 'Navigation audit RLS missing'; END IF;
 IF NOT has_table_privilege('service_role','public.nwtb_navigation_audit','INSERT') OR NOT has_table_privilege('service_role','public.nwtb_navigation_audit','SELECT') THEN RAISE EXCEPTION 'Service audit permissions missing'; END IF;
END $$;
SET LOCAL ROLE service_role;
INSERT INTO public.nwtb_navigation_audit(target_kind,source,traffic_aware,decision,vehicle_profile,heading_used,saving_seconds,alternatives)
 VALUES('RETURN','TOMTOM',true,'ROUTE_RETAINED','car',true,1,'[{"index":0,"seconds":600,"meters":5000,"selected":true,"closed":false,"roads":["Synthetic highway"]},{"index":1,"seconds":599,"meters":5100,"selected":false,"closed":false,"roads":["Synthetic local road"]}]');
DO $$ BEGIN
 IF (SELECT count(*) FROM public.nwtb_navigation_audit)<>1 THEN RAISE EXCEPTION 'Audit did not save'; END IF;
 BEGIN
  INSERT INTO public.nwtb_navigation_audit(target_kind,source,traffic_aware,decision,vehicle_profile,alternatives) VALUES('STOP','OSRM',true,'NO_LIVE_TRAFFIC','car','[{}]');
  RAISE EXCEPTION 'Static fallback mislabeled as traffic';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  INSERT INTO public.nwtb_navigation_audit(target_kind,source,traffic_aware,decision,vehicle_profile,alternatives) VALUES('STOP','TOMTOM',true,'INITIAL_ROUTE','car','{}');
  RAISE EXCEPTION 'Malformed alternatives accepted';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
