// netlify/lib/capi.mjs
//
// #22 — Meta Conversions API for Business Messaging. Reports each ad-sourced
// lead's funnel progress back to Meta so a Click-to-WhatsApp campaign can optimize
// for real outcomes (Schedule / Purchase) instead of "conversation started".
//
// Three events, keyed on the lead's ctwa_clid (the per-click id Meta stamps on the
// ad-referral message):
//   • Lead     = category picked          (leads.categoria set)
//   • Schedule = intro call booked        (leads.agendo_at / session_id)
//   • Purchase = first PAID real session  (value + currency USD)
// Each fires at most once per lead (the leads.capi_*_sent_at columns) and carries a
// deterministic event_id ("<lead_id>:<event>") so Meta also dedupes on its side.
//
// Transport — two paths, auto-selected by which credential is present:
//   • DEFAULT: the Dualhook Graph proxy (same host that already sends WhatsApp),
//     Bearer WA_DUALHOOK_API_KEY. No extra Meta token needed.
//   • PLAN B:  a Meta system-user token in META_CAPI_TOKEN → hit graph.facebook.com
//     directly. Set this only if the proxy refuses /dataset or /events.
//
// Env:
//   CAPI_LIVE            — 'true' to send real events for real leads. Default off.
//   CAPI_TEST_CODE       — Events Manager "Test events" code; when set, every event
//                          carries it (lands in Test Events, NOT production) and the
//                          test phone is allowed. Clear it for the live cutover.
//   CAPI_ALLOW_TEST_PHONE— 'true' lets the test phone fire in LIVE mode too (for the
//                          "click a real ad from my phone" end-to-end check).
//   META_DATASET_ID      — the WABA's dataset id (skips discovery when set).
//   META_WABA_ID         — WhatsApp Business Account id (default below).
//   META_CAPI_TOKEN      — optional Meta system-user token (plan B, direct Graph).
//   WA_DUALHOOK_API_KEY  — the proxy key (already used by waSend.mjs).

const GRAPH_VERSION = 'v25.0'
const DEFAULT_WABA_ID = '1857507018469524'
const TEST_PHONE_LAST9 = '968029896' // Nicolás's test number (593968029896)

const last9 = (p) => String(p || '').replace(/\D/g, '').slice(-9)
const wabaId = () => process.env.META_WABA_ID || DEFAULT_WABA_ID

// { base, token, direct } — direct=true means a real Meta token → graph.facebook.com;
// else the Dualhook proxy. Throws if neither credential is present.
function transport() {
  const metaToken = process.env.META_CAPI_TOKEN
  if (metaToken) return { base: `https://graph.facebook.com/${GRAPH_VERSION}`, token: metaToken, direct: true }
  const key = process.env.WA_DUALHOOK_API_KEY
  if (key) return { base: `https://api.dualhook.com/${GRAPH_VERSION}`, token: key, direct: false }
  throw new Error('no CAPI credential — set META_CAPI_TOKEN or WA_DUALHOOK_API_KEY')
}

// Thin Graph call through the selected transport. 10s AbortController so a hung
// proxy can never wedge the caller (the cron / webhook). Returns { ok, status, body }.
async function graph(path, { method = 'GET', body } = {}) {
  const { base, token } = transport()
  const url = `${base}/${path}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: ctrl.signal,
    })
    let parsed = null
    const txt = await res.text()
    try { parsed = txt ? JSON.parse(txt) : null } catch { parsed = { raw: txt } }
    return { ok: res.ok, status: res.status, body: parsed }
  } finally { clearTimeout(timer) }
}

// Raw Graph passthrough — diagnostic only (capi-admin ?action=raw). Lets us probe
// whether the transport forwards arbitrary Graph paths (the /dataset stop condition).
export async function rawGraph(path, method = 'GET', body = undefined) {
  const { base, direct } = transport()
  const res = await graph(path, { method, body })
  return { transport: direct ? 'graph.facebook.com' : 'dualhook', base, ...res }
}

// ── Dataset discovery ─────────────────────────────────────────────────────────
// GET /{WABA}/dataset → the WABA's messaging-event dataset id. Meta auto-creates
// one per WABA; a POST creates it if none exists. Cached in module memory for the
// life of the warm function. META_DATASET_ID short-circuits it entirely.
let _datasetCache = null

function extractDatasetId(body) {
  if (!body) return null
  if (body.id) return String(body.id)
  if (Array.isArray(body.data) && body.data[0]?.id) return String(body.data[0].id)
  return null
}

export async function discoverDataset({ create = false } = {}) {
  if (process.env.META_DATASET_ID) return { ok: true, id: process.env.META_DATASET_ID, source: 'env' }
  if (_datasetCache) return { ok: true, id: _datasetCache, source: 'cache' }
  const path = `${wabaId()}/dataset`
  let res = await graph(path, { method: 'GET' })
  let id = res.ok ? extractDatasetId(res.body) : null
  if (!id && create) {
    const created = await graph(path, { method: 'POST' })
    if (created.ok) { res = created; id = extractDatasetId(created.body) }
    else return { ok: false, error: 'create_failed', status: created.status, body: created.body }
  }
  if (!id) return { ok: false, error: res.ok ? 'no_dataset' : 'graph_error', status: res.status, body: res.body }
  _datasetCache = id
  return { ok: true, id, source: 'graph' }
}

// ── Event send ────────────────────────────────────────────────────────────────
// One event to POST /{dataset}/events. Business-messaging attribution: action_source
// 'business_messaging' + messaging_channel 'whatsapp', identity = ctwa_clid + WABA.
export async function sendCapiEvent({ datasetId, eventName, ctwaClid, eventId, eventTime, value, currency = 'USD', testCode }) {
  const evt = {
    action_source: 'business_messaging',
    messaging_channel: 'whatsapp',
    event_name: eventName,
    event_time: eventTime || Math.floor(Date.now() / 1000),
    event_id: eventId,
    user_data: { ctwa_clid: ctwaClid, whatsapp_business_account_id: wabaId() },
  }
  if (value != null) evt.custom_data = { currency, value: Number(value) }
  const payload = { data: [evt] }
  if (testCode) payload.test_event_code = testCode
  const res = await graph(`${datasetId}/events`, { method: 'POST', body: payload })
  return res
}

// ── Firing gate ─────────────────────────────────────────────────────────────
// enabled at all when live OR a test code is present. The test phone only fires in
// test mode (or when explicitly allowed for the live end-to-end check).
export function capiEnabled() {
  return process.env.CAPI_LIVE === 'true' || !!process.env.CAPI_TEST_CODE
}
function capiAllowedForPhone(phone) {
  const testMode = !!process.env.CAPI_TEST_CODE
  const isTestPhone = last9(phone) === TEST_PHONE_LAST9
  if (isTestPhone) return testMode || process.env.CAPI_ALLOW_TEST_PHONE === 'true'
  return process.env.CAPI_LIVE === 'true'
}

// ── The sweep ─────────────────────────────────────────────────────────────────
// Idempotent reconciliation over leads that carry a ctwa_clid and still have an
// unsent event. Called from the lead-followups cron (every 15 min) and from
// capi-admin (?action=sweep). Never throws — logs and returns a summary.
export async function sweepCapiEvents(supabase) {
  const summary = { enabled: capiEnabled(), lead: 0, schedule: 0, purchase: 0, errors: 0, skipped: 0 }
  if (!supabase || !summary.enabled) return summary

  let dataset
  try { dataset = await discoverDataset() }
  catch (e) { console.error('[capi] transport:', e.message); summary.error = e.message; return summary }
  if (!dataset.ok) { console.error('[capi] dataset unavailable:', JSON.stringify(dataset)); summary.error = dataset.error; return summary }
  const datasetId = dataset.id
  const testCode = process.env.CAPI_TEST_CODE || null

  const { data: leads, error } = await supabase.from('leads')
    .select('id, phone, ctwa_clid, categoria, agendo_at, session_id, patient_id, capi_lead_sent_at, capi_schedule_sent_at, capi_purchase_sent_at')
    .not('ctwa_clid', 'is', null)
    .or('capi_lead_sent_at.is.null,capi_schedule_sent_at.is.null,capi_purchase_sent_at.is.null')
  if (error) { console.error('[capi] leads query:', error.message); summary.error = error.message; return summary }

  for (const lead of leads || []) {
    if (!capiAllowedForPhone(lead.phone)) { summary.skipped++; continue }

    // Lead — a reason/category was picked (or detected from the conversation).
    if (!lead.capi_lead_sent_at && lead.categoria) {
      if (await fire(supabase, { lead, datasetId, testCode, eventName: 'Lead', column: 'capi_lead_sent_at' })) summary.lead++
      else summary.errors++
    }

    // Schedule — an intro call was booked.
    if (!lead.capi_schedule_sent_at && (lead.agendo_at || lead.session_id)) {
      if (await fire(supabase, { lead, datasetId, testCode, eventName: 'Schedule', column: 'capi_schedule_sent_at' })) summary.schedule++
      else summary.errors++
    }

    // Purchase — the lead's patient has a first PAID real (non-llamada) session.
    if (!lead.capi_purchase_sent_at && lead.patient_id) {
      const { data: paid } = await supabase.from('sessions')
        .select('monto, fecha, paid_at')
        .eq('patient_id', lead.patient_id).eq('pagado', true).neq('tipo', 'llamada')
        .order('fecha', { ascending: true }).limit(1)
      const s = paid?.[0]
      if (s) {
        const eventTime = s.paid_at ? Math.floor(new Date(s.paid_at).getTime() / 1000) : undefined
        if (await fire(supabase, { lead, datasetId, testCode, eventName: 'Purchase', column: 'capi_purchase_sent_at', value: s.monto, eventTime })) summary.purchase++
        else summary.errors++
      }
    }
  }
  console.log(`[capi] sweep ${JSON.stringify(summary)}`)
  return summary
}

// Send one event and, on success, stamp its sent-timestamp so it never repeats.
async function fire(supabase, { lead, datasetId, testCode, eventName, column, value, eventTime }) {
  try {
    const res = await sendCapiEvent({
      datasetId, eventName, ctwaClid: lead.ctwa_clid,
      eventId: `${lead.id}:${eventName}`, testCode, value, eventTime,
    })
    if (!res.ok) { console.error(`[capi] ${eventName} lead=${lead.id} status=${res.status} body=${JSON.stringify(res.body)}`); return false }
    await supabase.from('leads').update({ [column]: new Date().toISOString() }).eq('id', lead.id)
    console.log(`[capi] ${eventName} sent lead=${lead.id}${value != null ? ` value=${value}` : ''}`)
    return true
  } catch (e) { console.error(`[capi] ${eventName} lead=${lead.id} threw:`, e.message); return false }
}
