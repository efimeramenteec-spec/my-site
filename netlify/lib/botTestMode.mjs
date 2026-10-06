// netlify/lib/botTestMode.mjs
//
// #56 — Bot test mode from the owner phone. Since #45 the owner phone never
// enters the lead bot; Nicolás only has that phone to test the lead flow, so
// three exact commands (case/accent-insensitive) to the central number:
//   "modo prueba" → activo, expira_at = now + 2h
//   "reiniciar"   → delete the test lead (es_prueba) + cancel its test llamadas;
//                   the next message is a first contact again. Mode stays on.
//   "fin prueba"  → off
// While active and not expired, every OTHER owner message (text, taps, audio)
// goes to the lead flow as a lead with es_prueba=true, and renews expira_at.
// Owner commands that keep working regardless: "facturas", Aprobar/Ahora no,
// the outbox "Ver" tap and flushOwnerOutbox (the webhook handles those first).
// Expired → exactly the pre-#56 owner path, no warning.
//
// Replies go to the owner (not a lead): sendStaffText, no sanitizer, no greeting.
// External effects go through `deps` so the harness can stub them.

import { ownerWhatsApp } from './whatsapp.mjs'
import { sendStaffText } from './waSend.mjs'

const TABLE = 'bot_test_mode'
const TTL_MS = 2 * 3600 * 1000
const last9 = (p) => String(p || '').replace(/\D/g, '').slice(-9)
const plain = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')

export const TEST_REPLIES = {
  on: 'Modo prueba activado. Escribe como si fueras un lead. Comandos: reiniciar / fin prueba.',
  reset: 'Listo, tu número cuenta como lead nuevo.',
  off: 'Modo prueba desactivado.',
}
const COMMANDS = { 'modo prueba': 'on', reiniciar: 'reset', 'fin prueba': 'off' }

async function cancelCalendar(calendarId, eventId) {
  const fn = `${process.env.URL || 'https://efimeramente-panel.netlify.app'}/.netlify/functions/calendar`
  const res = await fetch(fn, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'cancel', calendarId, eventId }),
  })
  const j = await res.json().catch(() => ({}))
  if (!j.success) throw new Error(j.error || `calendar ${res.status}`)
}

const defaultDeps = { sendStaffText, cancelCalendar, now: () => new Date() }

// "modo prueba" / "reiniciar" / "fin prueba" (exact message, typed) → 'on'|'reset'|'off', else null.
export function testCommand(msg) {
  if (msg?.type !== 'text') return null
  return COMMANDS[plain(msg.text?.body)] || null
}

const ownerKey = () => ownerWhatsApp()

// True when test mode is on and not expired.
export async function testModeActive(supabase, deps = defaultDeps) {
  const owner = ownerKey()
  if (!owner) return false
  const { data } = await supabase.from(TABLE).select('activo, expira_at').eq('owner_phone', owner).maybeSingle()
  return !!(data?.activo && data.expira_at && new Date(data.expira_at).getTime() > deps.now().getTime())
}

async function setMode(supabase, activo, deps) {
  const now = deps.now()
  const row = {
    owner_phone: ownerKey(), activo,
    expira_at: activo ? new Date(now.getTime() + TTL_MS).toISOString() : null,
    updated_at: now.toISOString(),
  }
  const { error } = await supabase.from(TABLE).upsert(row, { onConflict: 'owner_phone' })
  if (error) throw new Error(`bot_test_mode: ${error.message}`)
}

export const renewTestMode = (supabase, deps = defaultDeps) => setMode(supabase, true, deps)

// "reiniciar": delete the owner's TEST lead (es_prueba only, last-9 = owner).
// Its lead_ai_decisions stay as audit — flagged es_prueba and detached (FK).
// Test llamadas booked from the link ([PRUEBA]) → cancelada + calendar cancel
// (best-effort). Nothing else is deleted. Returns { leads, llamadas }.
export async function resetTestLead(supabase, deps = defaultDeps) {
  const o9 = last9(ownerKey())
  const out = { leads: 0, llamadas: 0 }
  if (o9.length < 9) return out

  const { data: leads } = await supabase.from('leads').select('id, phone').eq('es_prueba', true)
  const mine = (leads || []).filter((l) => last9(l.phone) === o9)
  for (const l of mine) {
    await supabase.from('lead_ai_decisions').update({ es_prueba: true, lead_id: null }).eq('lead_id', l.id)
    const { error } = await supabase.from('leads').delete().eq('id', l.id).eq('es_prueba', true)
    if (error) console.error('[prueba] lead delete failed:', error.message)
    else out.leads++
  }
  // Decisions logged by phone (e.g. before the row existed) — flag them too.
  const { data: decs } = await supabase.from('lead_ai_decisions').select('id, phone').eq('es_prueba', false)
  const decIds = (decs || []).filter((d) => last9(d.phone) === o9).map((d) => d.id)
  if (decIds.length) await supabase.from('lead_ai_decisions').update({ es_prueba: true }).in('id', decIds)

  // Test llamadas: the owner phone's patient(s), tipo llamada, notas [PRUEBA], not yet cancelled.
  const { data: pats } = await supabase.from('patients').select('id, telefono')
  const pIds = (pats || []).filter((p) => last9(p.telefono) === o9).map((p) => p.id)
  if (pIds.length) {
    const { data: ses } = await supabase.from('sessions')
      .select('id, notas, estado, google_event_id, terapeuta_id')
      .in('patient_id', pIds).eq('tipo', 'llamada').neq('estado', 'cancelada')
    for (const s of (ses || []).filter((x) => String(x.notas || '').startsWith('[PRUEBA]'))) {
      await supabase.from('sessions').update({ estado: 'cancelada', pagado: false, paid_at: null }).eq('id', s.id)
      out.llamadas++
      if (s.google_event_id && s.terapeuta_id) {
        try {
          const { data: t } = await supabase.from('therapists').select('calendar_email').eq('id', s.terapeuta_id).maybeSingle()
          if (t?.calendar_email) await deps.cancelCalendar(t.calendar_email, s.google_event_id)
        } catch (e) { console.warn('[prueba] calendar cancel failed (non-blocking):', e.message) }
      }
    }
  }
  console.log(`[prueba] reset ${JSON.stringify(out)}`)
  return out
}

// Owner-phone routing (call only for messages FROM the owner, after the
// facturas / Aprobar / Ver handling). Returns:
//   'command' — a test command, handled + replied
//   'lead'    — test mode active: route to the lead flow as es_prueba (expiry renewed)
//   'owner'   — the normal owner path (pre-#56 behaviour)
export async function routeOwnerMessage(supabase, msg, deps = defaultDeps) {
  const cmd = testCommand(msg)
  if (cmd) {
    if (cmd === 'on') await setMode(supabase, true, deps)
    else if (cmd === 'off') await setMode(supabase, false, deps)
    else {
      await resetTestLead(supabase, deps)
      if (await testModeActive(supabase, deps)) await setMode(supabase, true, deps) // stays active (renewed)
    }
    try { await deps.sendStaffText(msg.from, TEST_REPLIES[cmd], { previewUrl: false }) }
    catch (e) { console.warn('[prueba] reply failed:', e.message) }
    return 'command'
  }
  if (!(await testModeActive(supabase, deps))) return 'owner'
  await setMode(supabase, true, deps)
  return 'lead'
}
