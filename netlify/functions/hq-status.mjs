// netlify/functions/hq-status.mjs
//
// Efimeramente HQ (#96): the live data behind the panel's /hq page. Owner-only.
// hq_orders is locked to service_role (RLS on, REVOKE ALL from anon/authenticated), so the
// page reads it here: verify the caller's Supabase token, require role 'owner', then return
// each employee (from the bundled agent files) with their status pill and last 3 orders.
//
//   GET /.netlify/functions/hq-status   Authorization: Bearer <Supabase access token>
// Env: SUPABASE_SERVICE_KEY.

import { getSupabaseAdmin } from '../lib/whatsapp.mjs'
import AGENTS from '../lib/hqAgents.json' with { type: 'json' }

const ALLOWED_ORIGINS = [
  'https://efimeramente-panel.netlify.app',
  'https://genuine-praline-0f8e70.netlify.app',
  'http://localhost:5173',
]
const cors = (origin) => ({
  'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
})

export default async (req) => {
  const headers = cors(req.headers.get('origin') || '')
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } })
  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405)

  const supabase = getSupabaseAdmin()
  if (!supabase) return json({ error: 'server_misconfigured' }, 500)
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'unauthorized' }, 401)
  const { data: userData, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !userData?.user) return json({ error: 'unauthorized' }, 401)
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', userData.user.id).single()
  if (profile?.role !== 'owner') return json({ error: 'forbidden' }, 403)

  const { data: orders, error } = await supabase.from('hq_orders')
    .select('id, created_at, agent, texto, estado, respuesta, cost_usd')
    .order('created_at', { ascending: false }).limit(200)
  if (error) return json({ error: 'read_failed' }, 500)

  const empleados = Object.values(AGENTS).map((a) => {
    const mine = (orders || []).filter((o) => o.agent === a.name)
    const enCola = mine.filter((o) => o.estado === 'en_cola' || o.estado === 'nuevo').length
    return {
      key: a.name, role: a.role, description: a.description,
      status: enCola ? `${enCola} en cola` : a.status, ocupado: enCola > 0,
      ordenes: mine.slice(0, 3),
    }
  })
  const costoMes = (orders || []).filter((o) => o.created_at >= new Date(Date.now() - 30 * 864e5).toISOString())
    .reduce((s, o) => s + Number(o.cost_usd || 0), 0)
  return json({ empleados, costo_30d: Math.round(costoMes * 100) / 100 })
}
