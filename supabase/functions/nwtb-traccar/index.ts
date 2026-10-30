import { createClient } from 'npm:@supabase/supabase-js@2.95.0'

const url = Deno.env.get('SUPABASE_URL')!
const secretKeys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') || '{}')
const secret = secretKeys['default'] || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const db = createClient(url, secret, { auth: { persistSession: false } })

const encoder = new TextEncoder()
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

function response(body: string, status = 200, type = 'text/plain; charset=utf-8') {
  return new Response(body, { status, headers: { ...cors, 'Content-Type': type, 'Cache-Control': 'no-store' } })
}

async function sha256Hex(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function readParams(req: Request) {
  const u = new URL(req.url)
  const out = new Map<string, string>()
  u.searchParams.forEach((v, k) => out.set(k.toLowerCase(), v))
  if (req.method === 'POST') {
    const type = (req.headers.get('content-type') || '').toLowerCase()
    try {
      if (type.includes('application/json')) {
        const j = await req.json()
        if (j && typeof j === 'object') for (const [k, v] of Object.entries(j)) if (v != null) out.set(k.toLowerCase(), String(v))
      } else if (type.includes('multipart/form-data')) {
        const f = await req.formData()
        for (const [k, v] of f.entries()) if (typeof v === 'string') out.set(k.toLowerCase(), v)
      } else {
        const raw = await req.text()
        if (raw) {
          const p = new URLSearchParams(raw)
          p.forEach((v, k) => out.set(k.toLowerCase(), v))
        }
      }
    } catch (_) {}
  }
  return out
}

function numberValue(v: string | undefined) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function parseCaptured(raw?: string) {
  if (!raw) return new Date().toISOString()
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const n = Number(raw)
    const ms = n > 1e12 ? n : n * 1000
    const d = new Date(ms)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return response('ok')
  if (!['GET', 'POST'].includes(req.method)) return response('method not allowed', 405)

  try {
    const p = await readParams(req)
    const deviceId = (p.get('id') || p.get('deviceid') || '').trim()
    if (deviceId.length < 24 || deviceId.length > 160) return response('invalid device', 403)

    const hash = await sha256Hex(deviceId)
    const { data: device, error: deviceError } = await db
      .from('delivery_tracking_devices')
      .select('id,driver_employee_number,active')
      .eq('device_hash', hash)
      .eq('active', true)
      .maybeSingle()
    if (deviceError) return response('server error', 500)
    if (!device) return response('unknown device', 403)

    const { data: employee } = await db
      .from('employees')
      .select('employee_number,active')
      .eq('employee_number', device.driver_employee_number)
      .maybeSingle()
    if (!employee?.active || employee.employee_number === '9998') return response('driver inactive', 403)

    let lat = numberValue(p.get('lat'))
    let lon = numberValue(p.get('lon'))
    if ((lat == null || lon == null) && p.get('location')) {
      const [a, b] = String(p.get('location')).split(',')
      lat = numberValue(a)
      lon = numberValue(b)
    }
    if (lat == null || lon == null || lat < -90 || lat > 90 || lon < -180 || lon > 180 || (Math.abs(lat) < 0.00001 && Math.abs(lon) < 0.00001)) {
      return response('invalid location', 400)
    }

    const accuracy = numberValue(p.get('accuracy') || p.get('hdop'))
    const heading = numberValue(p.get('bearing') || p.get('course'))
    const speed = numberValue(p.get('speed'))
    const capturedAt = parseCaptured(p.get('timestamp'))

    const { data: routes } = await db
      .from('delivery_routes')
      .select('id,status,created_at')
      .eq('driver_employee_number', device.driver_employee_number)
      .in('status', ['ACTIVE', 'PLANNED'])
      .order('created_at', { ascending: false })
      .limit(20)
    const route = (routes || []).find((r: any) => r.status === 'ACTIVE') || (routes || []).find((r: any) => r.status === 'PLANNED') || null

    const { error: insertError } = await db.from('delivery_driver_locations').insert({
      driver_employee_number: device.driver_employee_number,
      route_id: route?.id || null,
      lat,
      lon,
      accuracy_m: accuracy != null && accuracy >= 0 ? accuracy : null,
      heading_deg: heading != null ? heading : null,
      speed_mps: speed != null && speed >= 0 ? speed : null,
      captured_at: capturedAt,
      location_source: 'GPS_ROUTING_APP',
    })
    if (insertError) return response('server error', 500)

    await db.from('delivery_tracking_devices').update({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', device.id)
    return response('OK')
  } catch (e) {
    console.error('nwtb-traccar error', e)
    return response('server error', 500)
  }
})