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
import { isTherapistOrPayer, recordLead, handleEchoes, runBot, handleTherapistResult, isTap, botAllowedForPhone } from '../lib/leadBot.mjs'
import { sendReadReceipt } from '../lib/waSend.mjs'
import { isOwnerPhone, isFacturasCommand, facturaTap, handleFacturasCommand, handleDescartar } from '../lib/facturarAprobacion.mjs'
import { flushOwnerOutbox, supersedeOwnerOutbox } from '../lib/ownerOutbox.mjs'
import { handleEstadoTap } from '../lib/sesionesPendientes.mjs'
import { routeOwnerMessage } from '../lib/botTestMode.mjs'

// Fire the delayed-reply background function (~20s + typing, burst-coalesced) for
// a lead's free text. Returns fast (Netlify 202s a background invocation). The
// shared verify token gates it so the endpoint can't be abused to make the bot send.
async function invokeLeadReplyBackground(payload) {
  const base = process.env.URL || 'https://efimeramente-panel.netlify.app'
  try {
    await fetch(`${base}/.netlify/functions/lead-reply-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-lead-verify': process.env.WA_CLOUD_VERIFY_TOKEN || '' },
      body: JSON.stringify(payload),
    })
  } catch (e) { console.warn('[wa-cloud] background invoke failed (non-blocking):', e.message) }
}

// Fire the factura-approval background function (#16) for an owner's [Aprobar]
// tap. The emit loop can outlast a webhook request, so it runs there and replies
// to the owner when done. Same shared-secret gate as lead-reply-background.
async function invokeFacturarAprobar(snapshotId) {
  const base = process.env.URL || 'https://efimeramente-panel.netlify.app'
  await fetch(`${base}/.netlify/functions/facturar-aprobar-background`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-lead-verify': process.env.WA_CLOUD_VERIFY_TOKEN || '' },
    body: JSON.stringify({ snapshot_id: snapshotId }),
  })
}

// Owner invoicing commands (#16), consumed BEFORE estado/lead handling: "facturas"
// → list + buttons; fac_ok → background emit; fac_no → descartada. A fac_* tap
// from any other number is swallowed (never reaches the bot). Returns true when
// the message was consumed.
async function handleOwnerFacturar(supabase, msg) {
  const tap = facturaTap(msg)
  const owner = isOwnerPhone(msg.from)
  if (tap && !owner) { console.warn(`[wa-cloud] fac_* tap from non-owner ${msg.from} — ignored`); return true }
  if (!owner) return false
  try {
    if (isFacturasCommand(msg)) { await handleFacturasCommand(supabase, msg.from); return true }
    if (tap?.action === 'ok') { await invokeFacturarAprobar(tap.snapshotId); return true }
    if (tap?.action === 'no') { await handleDescartar(supabase, msg.from, tap.snapshotId); return true }
  } catch (e) {
    console.error('[wa-cloud] owner facturar command failed:', e.message)
    try { await notifyTherapist(supabase, null, { title: 'Facturación: error', body: `El comando falló: ${e.message}`, url: '/' }) } catch {}
    return true
  }
  return false
}

// The ping_nico quick-reply "Ver" tap (template buttons arrive as type 'button').
const isOwnerPing = (msg) => msg?.type === 'button' && String(msg.button?.payload || msg.button?.text || '').trim().toLowerCase() === 'ver'

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
  const statusRows = []
  for (const entry of payload?.entry || []) {
    for (const change of entry?.changes || []) {
      const value = change?.value

      // ── smb_message_echoes (Coexistence) ─────────────────────────────────────
      // Echoes of messages sent MANUALLY from the business WhatsApp app (Nicolás
      // typing, not an API send). For a lead this is the hard pause signal — the
      // bot goes silent for that lead forever. Also the litmus test that Dualhook
      // forwards echoes at all (each one logs a distinctive marker). These arrive
      // WITHOUT a `messages` array, so handle + continue.
      if (Array.isArray(value?.message_echoes) && value.message_echoes.length) {
        try { await handleEchoes(supabase, value) }
        catch (e) { console.warn('[wa-cloud] echo handling failed (non-blocking):', e.message) }
        continue
      }

      // ── Delivery-status events (sent/delivered/read/failed) ──────────────────
      // Meta pushes these for every message WE send (e.g. the reminder template).
      // A Dualhook 200 only means "accepted" — the real proof a patient got the
      // reminder is a `delivered`/`read` here, and a `failed` carries the reason
      // code (e.g. 131047 re-engagement / out-of-window). These arrive WITHOUT a
      // `messages` array, so they used to be dropped. Record them to
      // whatsapp_delivery_status for per-reminder ground truth.
      if (Array.isArray(value?.statuses) && value.statuses.length) {
        if (!patients) {
          const { data, error } = await supabase.from('patients').select('id, telefono, nombre, apellido, es_lead')
          if (error) { console.error('[wa-cloud] patients fetch:', error.message); patients = [] }
          else patients = data || []
        }
        for (const st of value.statuses) {
          const err = Array.isArray(st.errors) ? st.errors[0] : null
          statusRows.push({
            wamid: st.id || null,
            status: st.status || 'unknown',
            recipient: st.recipient_id || null,
            patient_id: matchPatient(st.recipient_id)?.id || null,
            error_code: err?.code ?? null,
            error_title: err?.title || null,
            error_message: err?.message || err?.error_data?.details || null,
            event_at: st.timestamp ? new Date(Number(st.timestamp) * 1000).toISOString() : null,
            raw: st,
          })
          console.log(`[wa-cloud] status ${st.status} wamid=${st.id} to=${st.recipient_id}${err ? ` ERROR ${err.code} ${err.title}` : ''}`)
        }
        continue
      }

      const messages = value?.messages
      if (!Array.isArray(messages) || messages.length === 0) continue // no messages + no statuses

      if (!patients) {
        const { data, error } = await supabase.from('patients').select('id, telefono, nombre, apellido, es_lead')
        if (error) { console.error('[wa-cloud] patients fetch:', error.message); patients = [] }
        else patients = data || []
      }

      for (const msg of messages) {
        // Meta retry dedupe: if the bot/estado response is slow, Meta redelivers
        // the SAME message id. If it's already logged, it was processed on the
        // first delivery — skip all side-effects (estado flip, bot sends) so a
        // retry can't double-send. Logging stays idempotent regardless.
        if (msg.id) {
          const { data: seen } = await supabase
            .from('whatsapp_messages').select('id').eq('twilio_sid', msg.id).limit(1)
          if (seen && seen.length) { console.log(`[wa-cloud] dup ${msg.id} — skip`); continue }
        }
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

        // ── Owner phone (#45, #16) — before estado + lead bot. ANY inbound from
        // Nicolás opens his 24h window → flush the owner outbox first (oldest
        // first), then his command. A "facturas" command supersedes a queued list
        // (a fresh one follows). The ping's "Ver" tap does nothing else.
        const fromOwner = isOwnerPhone(msg.from)
        if (fromOwner) {
          try {
            if (isFacturasCommand(msg)) await supersedeOwnerOutbox(supabase, 'facturas')
            const flushed = await flushOwnerOutbox(supabase)
            if (flushed.length) console.log(`[wa-cloud] owner outbox flushed: ${JSON.stringify(flushed)}`)
          } catch (e) { console.error('[wa-cloud] owner outbox flush failed:', e.message) }
          if (isOwnerPing(msg)) continue
        }
        if (await handleOwnerFacturar(supabase, msg)) continue

        // ── Bot test mode (#56) — "modo prueba" / "reiniciar" / "fin prueba".
        // While active (2h, renewed per message) the owner's other messages go
        // to the lead flow as an es_prueba lead; expired → the owner path above.
        let testLead = false
        if (fromOwner) {
          try {
            const route = await routeOwnerMessage(supabase, msg)
            if (route === 'command') continue
            testLead = route === 'lead'
          } catch (e) { console.error('[wa-cloud] test mode failed:', e.message) }
        }

        // ── Therapist tapped Ocurrió / No ocurrió on a Pendiente reminder (#52) ──
        // est_ok:/est_no:<session_id>. Consumed here — never reaches the patient
        // estado flip or the lead bot. Only the session's own therapist counts.
        try {
          if (await handleEstadoTap(supabase, msg)) continue
        } catch (e) {
          console.warn('[wa-cloud] estado tap failed (non-blocking):', e.message)
          continue
        }

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

        // ── Therapist tapped Se hizo / No contestó on a resultado_llamada ────
        // These come from a therapist's phone (a known contact, so the lead block
        // below would skip them). Handle first; if it consumed the message, done.
        let handledResult = false
        try {
          handledResult = await handleTherapistResult(supabase, msg)
        } catch (e) {
          console.warn('[wa-cloud] therapist result failed (non-blocking):', e.message)
        }

        // ── Lead funnel (#4 + #20) ──────────────────────────────────────────
        // Route to the bot when the sender is NOT a real (non-lead) patient, a
        // therapist or a payer. A booked lead has an es_lead=true patient row, so
        // matching a patient does NOT exclude them — only es_lead=false does.
        // Measurement (recordLead) always runs; runBot self-gates on LEAD_BOT_LIVE.
        //
        // IMAGES / PDFs never enter the funnel (second not-a-lead bug): they're
        // payment receipts and belong to the comprobante flow (#2), which already
        // OCRs every inbound image+document and alerts Nicolás for unknown senders.
        // Routing a receipt to the bot made it greet with "¿motivo de consulta?".
        const isReceiptMedia = msg.type === 'image' || msg.type === 'document'
        // The owner phone never enters the lead funnel (#45) — except in test mode (#56).
        if (!handledResult && !isReceiptMedia && (testLead || (!fromOwner && (!patient || patient.es_lead)))) {
          try {
            if (testLead || !(await isTherapistOrPayer(supabase, msg.from))) {
              const contact = value.contacts?.[0] || null
              const rec = await recordLead(supabase, { msg, contact, esPrueba: testLead })
              if (rec) {
                const lead = rec.lead
                if (isTap(msg)) {
                  // Button taps → immediate reply, inline (no delay).
                  await runBot(supabase, { lead, isNew: rec.isNew, msg })
                } else if (!lead.bot_paused && botAllowedForPhone(lead.phone, lead)) {
                  // Free text / media → background reply, no artificial delay (#54);
                  // each message answered on its own. Show "escribiendo…" now
                  // (text only); the background function classifies + replies,
                  // so we can 200 Meta fast.
                  if (msg.type === 'text' && msg.id) {
                    try { await sendReadReceipt(msg.id, { typing: true }) }
                    catch (e) { console.warn('[wa-cloud] typing indicator failed (non-blocking):', e.message) }
                  }
                  await invokeLeadReplyBackground({ phone: lead.phone, msg, isNew: rec.isNew })
                }
                // else: dark lead (measurement recorded) — nothing to send.
              }
            }
          } catch (e) {
            console.warn('[wa-cloud] lead handling failed (non-blocking):', e.message)
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

  if (statusRows.length) {
    // Idempotent per (wamid, status) so Meta's retries don't duplicate a stage.
    const { error } = await supabase
      .from('whatsapp_delivery_status')
      .upsert(statusRows, { onConflict: 'wamid,status', ignoreDuplicates: true })
    if (error) console.error('[wa-cloud] status insert failed:', error.message)
    else console.log(`[wa-cloud] logged ${statusRows.length} delivery status(es)`)
  }

  // Meta requires a prompt 200 or it retries + eventually disables the webhook.
  return text('ok', 200)
}
