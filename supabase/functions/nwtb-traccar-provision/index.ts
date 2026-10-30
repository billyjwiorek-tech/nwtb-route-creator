import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const url = Deno.env.get('SUPABASE_URL')!
const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
const secret = keys['default'] || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const db = createClient(url, secret, { auth: { persistSession: false } })
const enc = new TextEncoder()

const cors = {
  'Access-Control-Allow-Origin': 'https://billyjwiorek-tech.github.io',
  'Access-Control-Allow-Headers': 'content-type, x-nwtb-session, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
}

function reply(body: any, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors })
}

async function deskSession(req: Request) {
  const token = req.headers.get('x-nwtb-session')
  if (!token) return false
  const { data } = await db
    .from('chat_sessions')
    .select('employee_number,expires_at')
    .eq('token', token)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  return data?.employee_number === '9998'
}

async function hash(v: string) {
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(v)))
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

function makeToken() {
  const a = crypto.getRandomValues(new Uint8Array(32))
  return [...a].map((x) => x.toString(16).padStart(2, '0')).join('')
}

function normalize(v: string) {
  return v.trim().toLowerCase().replace(/\s+/g, ' ')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return reply({ error: 'POST required' }, 405)
  if (!(await deskSession(req))) return reply({ error: 'Delivery Desk session required.' }, 401)

  let p: any
  try {
    p = await req.json()
  } catch {
    return reply({ error: 'Invalid JSON' }, 400)
  }

  const action = String(p?.action || 'provision').trim().toLowerCase()

  if (action === 'search_drivers') {
    const q = normalize(String(p?.query || ''))
    if (q.length < 1) return reply({ drivers: [] })

    const { data, error } = await db
      .from('employees')
      .select('employee_number,display_name,active')
      .eq('active', true)
      .neq('employee_number', '9998')
      .order('display_name', { ascending: true })
      .limit(500)

    if (error) return reply({ error: 'Could not search drivers.' }, 500)

    const numeric = /^\d+$/.test(q)
    const ranked = (data || [])
      .filter((r: any) => {
        const num = String(r.employee_number || '')
        const name = normalize(String(r.display_name || ''))
        return numeric ? num.startsWith(q) : name.includes(q)
      })
      .map((r: any) => {
        const num = String(r.employee_number || '')
        const name = String(r.display_name || '')
        const nameNorm = normalize(name)
        let rank = 3
        if (numeric && num === q) rank = 0
        else if (!numeric && nameNorm === q) rank = 0
        else if (!numeric && nameNorm.startsWith(q)) rank = 1
        else if (numeric && num.startsWith(q)) rank = 1
        else rank = 2
        return { employee_number: num, display_name: name, rank }
      })
      .sort((a: any, b: any) => a.rank - b.rank || a.display_name.localeCompare(b.display_name))
      .slice(0, 8)
      .map(({ employee_number, display_name }: any) => ({ employee_number, display_name }))

    return reply({ drivers: ranked })
  }

  if (action !== 'provision') return reply({ error: 'Unknown action.' }, 400)

  const driver = String(p?.driver_employee_number || '').trim()
  const label = String(p?.label || 'Driver phone').trim().slice(0, 80)
  if (!/^\d{4}$/.test(driver) || driver === '9998') return reply({ error: 'Select a driver or enter a valid 4-digit employee number.' }, 400)

  const { data: employee } = await db
    .from('employees')
    .select('employee_number,display_name,active')
    .eq('employee_number', driver)
    .maybeSingle()

  if (!employee?.active) return reply({ error: 'Driver not found or inactive.' }, 404)

  const token = makeToken()
  const deviceHash = await hash(token)
  const hint = token.slice(-8)
  const { error } = await db.from('delivery_tracking_devices').insert({
    driver_employee_number: driver,
    device_hash: deviceHash,
    device_hint: hint,
    label: label || 'Driver phone',
    active: true,
  })
  if (error) return reply({ error: 'Could not register tracking device.' }, 500)

  const receiver = 'https://ufnjyidhxuytrmbjzgtu.supabase.co/functions/v1/nwtb-traccar'
  const q = new URLSearchParams({
    url: receiver,
    id: token,
    accuracy: 'high',
    distance: '25',
    interval: '30',
    heartbeat: '300',
    buffer: 'true',
    wakelock: 'true',
    stopDetection: 'false',
    preferPlatformProviders: 'true',
  })

  return reply({
    ok: true,
    driver_employee_number: driver,
    driver_name: employee.display_name,
    device_hint: hint,
    deep_link: 'org.traccar.client://config?' + q.toString(),
    ios_store_url: 'https://apps.apple.com/us/app/traccar-client/id843156974',
    android_store_url: 'https://play.google.com/store/apps/details?id=org.traccar.client',
  })
})