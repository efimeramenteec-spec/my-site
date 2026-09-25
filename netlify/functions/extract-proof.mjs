// netlify/functions/extract-proof.mjs
//
// OWNER-ONLY payment-proof OCR for the Comprobantes reading layer. Thin HTTP
// wrapper around the shared OCR core (netlify/lib/proofOcr.mjs) — it just gates on
// the owner, loads the row, and delegates. The same core powers the server-side
// auto-processor (process-proofs.mjs), so the manual and automatic paths read
// proofs identically. Read-only w.r.t. sessions/pagado.
//
// GET/POST /.netlify/functions/extract-proof?id=<whatsapp_messages.id>
//   Authorization: Bearer <Supabase access token>
//   &force=1  → re-run even if a prior attempt exists (retry a 'failed' read)
// Env: APIMART_API_KEY, WA_DUALHOOK_API_KEY, SUPABASE_SERVICE_KEY.

import { getSupabaseAdmin } from '../lib/whatsapp.mjs'
import { ocrProofRow } from '../lib/proofOcr.mjs'

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
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  }
}

export default async (req) => {
  const cors = corsHeaders(req.headers.get('origin') || '')
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors } })

  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabase = getSupabaseAdmin()
  if (!supabase) return json({ error: 'server_misconfigured' }, 500)

  // ── Owner-only gate (mirrors whatsapp_messages RLS) ──────────────────────────
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'unauthorized' }, 401)
  const { data: userData, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !userData?.user) return json({ error: 'unauthorized' }, 401)
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', userData.user.id).single()
  if (profile?.role !== 'owner') return json({ error: 'forbidden' }, 403)

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const force = url.searchParams.get('force') === '1'
  if (!id) return json({ error: 'bad_request' }, 400)

  const { data: row, error: rowErr } = await supabase
    .from('whatsapp_messages')
    .select('id, direccion, raw_payload, extracted, extraction_status')
    .eq('id', id)
    .single()
  if (rowErr || !row || row.direccion !== 'inbound') return json({ error: 'not_found' }, 404)

  const r = await ocrProofRow(supabase, row, { force })
  return json(r)
}
