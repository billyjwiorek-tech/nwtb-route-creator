import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
import { createOfficeMapHandler } from './handler.mjs';

const config = {
  environment: 'PRODUCTION',
  projectRef: 'ufnjyidhxuytrmbjzgtu',
  backendUrl: Deno.env.get('SUPABASE_URL') || '',
  siteOrigin: 'https://billyjwiorek-tech.github.io'
};
const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}');
const secret = keys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
if (!secret) {
  Deno.serve(() => Response.json({ error: 'Office map service unavailable.' }, { status: 503 }));
} else {
  const db = createClient(config.backendUrl, secret, { auth: { persistSession: false } });
  Deno.serve(createOfficeMapHandler({ db, config, providerKey: Deno.env.get('TOMTOM_API_KEY') || '' }));
}
