import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
import { createDriverViewHandler } from './handler.mjs';
const keys=JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}');
const secret=keys.default||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const db=createClient(Deno.env.get('SUPABASE_URL')!,secret,{auth:{persistSession:false}});
Deno.serve(createDriverViewHandler({db}));
