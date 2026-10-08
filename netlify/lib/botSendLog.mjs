// netlify/lib/botSendLog.mjs
//
// #66 — measurement only. Every LEAD-facing bot send is recorded in
// lead_bot_sends with its text and wamid, so it can be joined to the receipts
// in whatsapp_delivery_status (sent/delivered/read/failed carry no text).
//
// Best-effort by construction: the insert is fired WITHOUT awaiting it, so it
// can never delay the next send, and every error is swallowed (console.warn).
// The caller flushes the pending inserts once its sends are done
// (flushBotSendLogs, capped by a timeout so a slow DB never holds a turn).
// Staff / owner / broadcast sends are NOT logged here.

const pending = new Set()

const wamidOf = (res) => (typeof res === 'string' ? res : res?.messages?.[0]?.id) || null

export function logBotSend(supabase, { lead, phone, kind, body = null, templateName = null, wamid = null, error = null }) {
  let p
  try {
    p = Promise.resolve(supabase.from('lead_bot_sends').insert({
      lead_id: lead?.id || null,
      phone: String(phone ?? lead?.phone ?? ''),
      wamid,
      kind,
      body: body == null ? null : String(body),
      template_name: templateName,
      error: error == null ? null : String(error).slice(0, 1000),
      es_prueba: !!lead?.es_prueba,
    })).then(({ error: e } = {}) => { if (e) console.warn('[sendlog] insert failed:', e.message) })
      .catch((e) => console.warn('[sendlog] insert failed:', e?.message))
  } catch (e) {
    console.warn('[sendlog] insert failed:', e?.message)
    return
  }
  pending.add(p)
  p.finally(() => pending.delete(p))
}

// Run one send and log it. A thrown send is logged with its error and wamid
// null, then re-thrown unchanged — the caller's behaviour is exactly as before.
export async function loggedSend(supabase, { lead, phone, kind, body, templateName }, send) {
  let res
  try {
    res = await send()
  } catch (e) {
    logBotSend(supabase, { lead, phone, kind, body, templateName, error: e?.message || String(e) })
    throw e
  }
  logBotSend(supabase, { lead, phone, kind, body, templateName, wamid: wamidOf(res) })
  return res
}

// Await the in-flight inserts (after the sends), at most timeoutMs. Never throws.
export async function flushBotSendLogs(timeoutMs = 3000) {
  if (!pending.size) return
  let t
  await Promise.race([
    Promise.allSettled([...pending]),
    new Promise((r) => { t = setTimeout(r, timeoutMs) }),
  ])
  clearTimeout(t)
}
