// netlify/functions/notify-estado.mjs
//
// Push-notify on IN-APP estado changes (the Confirmado/Cancelado toggle and
// drawer edits). The Twilio webhook covers patient-initiated changes; this
// covers staff-initiated ones. The browser can't send pushes itself (the
// VAPID private key is server-only), so the app calls this AFTER a successful
// estado write and the payload is rebuilt here from the DB row — the client
// only supplies the session id.
//
// Auth: requires a valid Supabase access token (owner or therapist). The
// session's therapist AND the owner are notified regardless of who acted —
// per Nicolas (2026-07-03): the actor's own devices are NOT excluded, so the
// flow is testable end-to-end from any account.

import { getSupabaseAdmin } from '../lib/whatsapp.mjs'
import { notifyTherapist } from '../lib/push.mjs'

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

  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'unauthorized' }, 401)
  const { data: userData, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !userData?.user) return json({ error: 'unauthorized' }, 401)

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, terapeuta_id')
    .eq('id', userData.user.id)
    .single()
  if (!profile) return json({ error: 'unauthorized' }, 401)

  let body
  try {
    body = await req.json()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (!body?.session_id) return json({ error: 'bad_request' }, 400)

  const { data: s, error: sErr } = await supabase
    .from('sessions')
    .select('id, fecha, hora_inicio, estado, terapeuta_id, patient:patients(nombre, apellido)')
    .eq('id', body.session_id)
    .single()
  if (sErr || !s) return json({ error: 'not_found' }, 404)
  if (s.estado !== 'confirmada' && s.estado !== 'cancelada') return json({ ok: true, skipped: 'estado' })

  const patientName = [s.patient?.nombre, s.patient?.apellido].filter(Boolean).join(' ') || 'Paciente'
  const [, mm, dd] = String(s.fecha).split('-')
  await notifyTherapist(supabase, s.terapeuta_id, {
    title: s.estado === 'confirmada' ? 'Sesión confirmada ✅' : 'Sesión cancelada ❌',
    body: `${patientName} — ${dd}/${mm} ${String(s.hora_inicio || '').slice(0, 5)}`,
    url: '/sesiones',
  })
  return json({ ok: true })
}
