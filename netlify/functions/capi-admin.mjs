// netlify/functions/capi-admin.mjs
//
// #22 — ops/diagnostic endpoint for the Meta Conversions API wiring. HTTP, guarded
// by the shared WA_CLOUD_VERIFY_TOKEN (?token=… or x-lead-verify header). Not part
// of the automatic flow — a manual tool to probe the stop conditions, run the sweep
// on demand, and fire test events into Events Manager.
//
//   ?action=status     — env presence (booleans, never values) + lead counts.
//   ?action=discover    — GET  /{WABA}/dataset  (the STOP-CONDITION probe).
//   ?action=discover&create=1 — POST it if none exists.
//   ?action=sweep       — run sweepCapiEvents now (respects CAPI_LIVE / CAPI_TEST_CODE).
//   ?action=test-event&event=Lead&clid=<ctwa_clid>[&value=39][&code=<test-code>]
//                        — send ONE event by hand (defaults code to CAPI_TEST_CODE).
//
// Everything here reads secrets from Netlify env only; nothing is echoed back.

import { getSupabaseAdmin } from '../lib/whatsapp.mjs'
import { discoverDataset, sendCapiEvent, sweepCapiEvents, capiEnabled, rawGraph } from '../lib/capi.mjs'

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj, null, 2), { status, headers: { 'Content-Type': 'application/json' } })

export default async (req) => {
  const url = new URL(req.url)
  const token = url.searchParams.get('token') || req.headers.get('x-lead-verify') || ''
  const expected = process.env.WA_CLOUD_VERIFY_TOKEN
  if (!expected || token !== expected) return json({ error: 'forbidden' }, 403)

  const action = url.searchParams.get('action') || 'status'

  if (action === 'status') {
    const supabase = getSupabaseAdmin()
    let counts = null
    if (supabase) {
      const { count: total } = await supabase.from('leads').select('id', { count: 'exact', head: true })
      const { count: withClid } = await supabase.from('leads').select('id', { count: 'exact', head: true }).not('ctwa_clid', 'is', null)
      counts = { total_leads: total ?? null, with_ctwa_clid: withClid ?? null }
    }
    return json({
      env: {
        WA_DUALHOOK_API_KEY: !!process.env.WA_DUALHOOK_API_KEY,
        META_CAPI_TOKEN: !!process.env.META_CAPI_TOKEN,
        META_DATASET_ID: !!process.env.META_DATASET_ID,
        META_WABA_ID: !!process.env.META_WABA_ID,
        CAPI_LIVE: process.env.CAPI_LIVE === 'true',
        CAPI_TEST_CODE: !!process.env.CAPI_TEST_CODE,
        CAPI_ALLOW_TEST_PHONE: process.env.CAPI_ALLOW_TEST_PHONE === 'true',
      },
      capiEnabled: capiEnabled(),
      counts,
    })
  }

  if (action === 'discover') {
    const create = url.searchParams.get('create') === '1'
    try { return json(await discoverDataset({ create })) }
    catch (e) { return json({ ok: false, error: e.message }, 500) }
  }

  if (action === 'raw') {
    const path = url.searchParams.get('path')
    if (!path) return json({ error: 'path required, e.g. path=1857507018469524' }, 400)
    const method = (url.searchParams.get('method') || 'GET').toUpperCase()
    try { return json(await rawGraph(path, method)) }
    catch (e) { return json({ ok: false, error: e.message }, 500) }
  }

  if (action === 'sweep') {
    const supabase = getSupabaseAdmin()
    if (!supabase) return json({ error: 'no supabase key' }, 500)
    return json(await sweepCapiEvents(supabase))
  }

  if (action === 'test-event') {
    const event = url.searchParams.get('event') || 'Lead'
    const clid = url.searchParams.get('clid')
    if (!clid) return json({ error: 'clid required (a real ctwa_clid)' }, 400)
    const code = url.searchParams.get('code') || process.env.CAPI_TEST_CODE || null
    const value = url.searchParams.get('value')
    const ds = await discoverDataset()
    if (!ds.ok) return json({ error: 'dataset unavailable', detail: ds }, 502)
    const res = await sendCapiEvent({
      datasetId: ds.id, eventName: event, ctwaClid: clid,
      eventId: `manual:${event}:${Date.now()}`, testCode: code,
      value: value != null ? Number(value) : undefined,
    })
    return json({ datasetId: ds.id, testCode: !!code, sent: res.ok, status: res.status, body: res.body }, res.ok ? 200 : 502)
  }

  return json({ error: 'unknown action', actions: ['status', 'discover', 'sweep', 'test-event'] }, 400)
}
