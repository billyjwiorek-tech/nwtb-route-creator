import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
import { createNavigationHandler } from './handler.mjs';
import { legacyHandler } from './legacy-sales.ts';
const url=Deno.env.get('SUPABASE_URL')||'';
const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');
const secret=keys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const handler=createNavigationHandler({db:createClient(url,secret,{auth:{persistSession:false}}),providerKey:Deno.env.get('TOMTOM_API_KEY')||'',
 vehicle:{mode:Deno.env.get('NWTB_NAV_TRAVEL_MODE')||'car',height:Deno.env.get('NWTB_NAV_VEHICLE_HEIGHT'),width:Deno.env.get('NWTB_NAV_VEHICLE_WIDTH'),length:Deno.env.get('NWTB_NAV_VEHICLE_LENGTH'),weight:Deno.env.get('NWTB_NAV_VEHICLE_WEIGHT')}});
// The separate Sales app retains its exact existing OSRM/fleet request and response path.
Deno.serve(req=>url!=='https://ufnjyidhxuytrmbjzgtu.supabase.co'?Response.json({error:'NWTB navigation environment required.'},{status:503}):req.headers.get('x-nwtb-sales')==='1'?legacyHandler(req):handler(req));
