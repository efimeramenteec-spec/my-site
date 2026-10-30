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
import { corsFor, ownerGateStatus } from '../lib/ownerGate.mjs'

export default async (req) => {
  const headers = corsFor(req)
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } })
  if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405)

  const supabase = getSupabaseAdmin()
  if (!supabase) return json({ error: 'server_misconfigured' }, 500)
  const denied = await ownerGateStatus(supabase, req)
  if (denied) return json({ error: denied === 401 ? 'unauthorized' : 'forbidden' }, denied)

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
  // #97: the office whiteboard (the primary metric's inputs).
  const today = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10)
  const [{ count: sesionesHoy }, { count: leads24h }] = await Promise.all([
    supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('fecha', today).neq('estado', 'cancelada').neq('tipo', 'llamada'),
    supabase.from('leads').select('id', { count: 'exact', head: true }).gte('created_at', new Date(Date.now() - 864e5).toISOString()).eq('es_prueba', false),
  ])
  return json({ empleados, costo_30d: Math.round(costoMes * 100) / 100, pizarra: { sesiones_hoy: sesionesHoy ?? null, leads_24h: leads24h ?? null } })
}
