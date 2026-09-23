// netlify/functions/whatsapp-cloud-webhook.mjs
//
// Modern Netlify Function (HTTP). Inbound webhook for the WhatsApp **Cloud API**
// (Coexistence), wired via Dualhook's webhook override so Meta delivers messages
// for the central Business-app number straight to THIS endpoint — nothing routes
// through a third-party inbox. This is the READ side of the payment-proof flow:
// patients send bank-transfer screenshots to the central number; we log them +
// match the sender to a patient, and the reading layer surfaces them for a
// human "mark as paid" confirm (trust-based, not bank-verified).
//
//   • GET  → Meta webhook verification handshake (hub.mode / hub.verify_token /
//            hub.challenge). Answer with the challenge so Meta activates the sub.
//   • POST → incoming message events. Log each inbound message to
//            `whatsapp_messages` (raw_payload keeps the media id for later media
//            download), matching the sender phone to a patient. Always 200 fast.
//
// This does NOT send anything and does NOT touch sessions/pagado — logging only.
// Marking paid stays a deliberate human step elsewhere.
//
// URL to give Dualhook (Webhook URL):
//   https://efimeramente-panel.netlify.app/.netlify/functions/whatsapp-cloud-webhook
// Env:
//   WA_CLOUD_VERIFY_TOKEN  (required) — shared secret; must match the token entered in Dualhook.
//   WA_CLOUD_APP_SECRET    (optional) — Meta app secret; when set, X-Hub-Signature-256 is verified.
//   SUPABASE_SERVICE_KEY   (required) — service-role writes (bypasses RLS).

import crypto from 'crypto'
import { getSupabaseAdmin, normalizePhone, resolveReplyEstado, applyInboundReplyEstado } from '../lib/whatsapp.mjs'
import { notifyTherapist } from '../lib/push.mjs'

const text = (body, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/plain' } })
const last9 = (p) => String(p || '').replace(/\D/g, '').slice(-9)

// Pull the reply string a patient sent, whether they TAPPED a quick-reply button
// (template buttons arrive as type 'button' with button.payload/text; interactive
// replies as interactive.button_reply) or TYPED the word (type 'text'). Fed to
// resolveReplyEstado, so exact casing/accents don't matter.
function replyString(msg) {
  switch (msg?.type) {
    case 'button': return msg.button?.payload || msg.button?.text || ''
    case 'interactive': return msg.interactive?.button_reply?.id || msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || ''
    case 'text': return msg.text?.body || ''
    default: return ''
  }
}

// Pull a human-readable body out of any Cloud API message type. For media we keep
// a short marker + any caption; the real image lives behind msg.image.id, fetched
// later by the reading layer using the Graph API — raw_payload preserves that id.
function messageSummary(msg) {
  switch (msg?.type) {
    case 'text': return msg.text?.body || ''
    case 'image': return msg.image?.caption ? `[imagen] ${msg.image.caption}` : '[imagen]'
    case 'document': return msg.document?.caption ? `[documento] ${msg.document.caption}` : `[documento] ${msg.document?.filename || ''}`.trim()
    case 'audio': return '[audio]'
    case 'video': return msg.video?.caption ? `[video] ${msg.video.caption}` : '[video]'
    case 'sticker': return '[sticker]'
    case 'location': return '[ubicación]'
    case 'button': return msg.button?.text || '[button]'
    case 'interactive': return msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || '[interactive]'
    default: return `[${msg?.type || 'desconocido'}]`
  }
}

export default async (req) => {
  const url = new URL(req.url)

  // ── GET: Meta verification handshake ────────────────────────────────────────
  // Meta calls this once when the webhook is (re)subscribed. Echo hub.challenge
  // only when the mode + token match, else 403.
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    const expected = process.env.WA_CLOUD_VERIFY_TOKEN
    if (mode === 'subscribe' && expected && token === expected) {
      console.log('[wa-cloud] webhook verification OK')
      return text(challenge || '', 200)
    }
    console.warn('[wa-cloud] webhook verification FAILED (mode/token mismatch)')
    return text('forbidden', 403)
  }

  if (req.method !== 'POST') return text('method not allowed', 405)

  // Read the raw body ONCE (needed for signature verification before JSON.parse).
  const bodyText = await req.text()

  // ── Optional signature check (enforced only when WA_CLOUD_APP_SECRET is set) ──
  const appSecret = process.env.WA_CLOUD_APP_SECRET
  if (appSecret) {
    const sig = req.headers.get('x-hub-signature-256') || ''
    const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(bodyText).digest('hex')
    // timingSafeEqual needs equal-length buffers; guard first.
    const ok = sig.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
    if (!ok) { console.warn('[wa-cloud] bad X-Hub-Signature-256 — rejecting'); return text('bad signature', 401) }
  }

  let payload
  try { payload = JSON.parse(bodyText) } catch { console.warn('[wa-cloud] non-JSON POST body'); return text('ok', 200) }

  const supabase = getSupabaseAdmin()
  if (!supabase) { console.error('[wa-cloud] no SUPABASE_SERVICE_KEY'); return text('ok', 200) }

  // Load patients once for phone→patient matching (same last-9 logic as twilio-webhook).
  // Only fetch when there are actual messages to match.
  let patients = null
  const matchPatient = (fromRaw) => {
    if (!patients) return null
    const fromNorm = normalizePhone(fromRaw)
    const from9 = last9(fromRaw)
    return patients.find((p) => {
      const n = normalizePhone(p.telefono)
      return (fromNorm && n === fromNorm) || (from9 && last9(p.telefono) === from9)
    }) || null
  }

  const rows = []
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value
      const messages = value?.messages
      if (!Array.isArray(messages) || messages.length === 0) continue // skip status/delivery events

      if (!patients) {
        const { data, error } = await supabase.from('patients').select('id, telefono, nombre, apellido')
        if (error) { console.error('[wa-cloud] patients fetch:', error.message); patients = [] }
        else patients = data || []
      }

      for (const msg of messages) {
        const patient = matchPatient(msg.from)
        rows.push({
          patient_id: patient?.id || null,
          twilio_sid: msg.id || null,            // reused as the provider message id (dedupe/debug)
          direccion: 'inbound',
          cuerpo: messageSummary(msg),
          raw_payload: { message: msg, contact: value.contacts?.[0] || null, metadata: value.metadata || null },
        })
        const who = patient ? `patient ${patient.id}` : `UNMATCHED ${msg.from}`
        console.log(`[wa-cloud] inbound ${msg.type} from ${who} (${msg.id})`)

        // Confirmo / Cancelar → flip the matching session's estado. This is the
        // inbound HALF of the Dualhook reminder loop (the outbound half is
        // send-reminders → deliverReminder). Reminders sent via Dualhook get their
        // replies HERE, not at twilio-webhook. Works whether the patient tapped the
        // quick-reply button or typed the word. Never blocks the 200 to Meta.
        const estado = resolveReplyEstado(replyString(msg))
        if (estado) {
          try {
            await applyInboundReplyEstado(supabase, msg.from, estado, { notifyTherapist })
          } catch (e) {
            console.warn('[wa-cloud] estado flip failed (non-blocking):', e.message)
          }
        }
      }
    }
  }

  if (rows.length) {
    // Idempotent on the provider message id so Meta's retries don't duplicate rows.
    const { error } = await supabase
      .from('whatsapp_messages')
      .upsert(rows, { onConflict: 'twilio_sid', ignoreDuplicates: true })
    if (error) console.error('[wa-cloud] insert failed:', error.message)
    else console.log(`[wa-cloud] logged ${rows.length} inbound message(s)`)
  }

  // Meta requires a prompt 200 or it retries + eventually disables the webhook.
  return text('ok', 200)
}
