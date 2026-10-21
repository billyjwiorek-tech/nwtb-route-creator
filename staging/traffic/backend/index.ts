import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
import { createTrafficHandler } from './handler.mjs';
import { stagingConfigProblem } from '../policy.mjs';

const config = {
  environment: Deno.env.get('NWTB_ENVIRONMENT'),
  projectRef: Deno.env.get('NWTB_STAGING_PROJECT_REF'),
  backendUrl: Deno.env.get('SUPABASE_URL') || '',
  siteOrigin: Deno.env.get('NWTB_STAGING_ORIGIN')
};
if (stagingConfigProblem(config)) {
  Deno.serve(() => new Response(JSON.stringify({ error: 'Separate staging project configuration required.', code: 'STAGING_ONLY' }), { status: 503, headers: { 'Content-Type': 'application/json' } }));
} else {
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
  const secret = keys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  if (!secret) {
    Deno.serve(() => new Response(JSON.stringify({ error: 'Test backend credentials are not configured.' }), { status: 503, headers: { 'Content-Type': 'application/json' } }));
  } else {
    const db = createClient(config.backendUrl, secret, { auth: { persistSession: false } });
    Deno.serve(createTrafficHandler({ db, config, providerKey: Deno.env.get('TOMTOM_API_KEY') || '' }));
  }
}
