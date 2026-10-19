// netlify/functions/proof-approve.mjs
//
// #77 — Nicolás approves a HELD comprobante's proposed allocation from the panel
// (Comprobantes → "Aprobar propuesta"). POST { id } with
// `Authorization: Bearer <Supabase access token>`; owner role required. The proposal is
// re-derived server-side from fresh data and applied through the SAME applyPlan as the
// automatic match (proofReconcile.mjs#approveProof) — so packages, overpayments and
// saldo a favor keep working, and any lote banked here is stamped aprobado_por/_at.
//
// Env: SUPABASE_SERVICE_KEY.

import { getSupabaseAdmin } from '../lib/whatsapp.mjs'
import { approveProof } from '../lib/proofReconcile.mjs'

const ALLOWED_ORIGINS = [
  'https://efimeramente-panel.netlify.app',
  'https://genuine-praline-0f8e70.netlify.app',
  'http://localhost:5173',
]

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

export default async (req) => {
  const cors = corsHeaders(req.headers.get('origin') || '')
  // 204 is a null-body status — Response(null, …), never Response('', …).
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors } })

  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
  const supabase = getSupabaseAdmin()
  if (!supabase) return json({ error: 'server_misconfigured' }, 500)

  // ── Owner-only gate ──────────────────────────────────────────────────────────
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'unauthorized' }, 401)
  const { data: userData, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !userData?.user) return json({ error: 'unauthorized' }, 401)
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', userData.user.id).single()
  if (profile?.role !== 'owner') return json({ error: 'forbidden' }, 403)

  let body = {}
  try { body = await req.json() } catch { /* empty */ }
  if (!body.id) return json({ error: 'bad_request' }, 400)

  try {
    const r = await approveProof(supabase, body.id, { userId: userData.user.id })
    return json(r, r.ok ? 200 : 409)
  } catch (e) {
    console.error('[proof-approve] failed:', e.message)
    return json({ ok: false, error: 'No se pudo aplicar el pago.' }, 500)
  }
}
