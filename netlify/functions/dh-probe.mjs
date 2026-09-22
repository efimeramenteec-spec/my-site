// netlify/functions/dh-probe.mjs
//
// ⚠️ TEMPORARY probe — DELETE after the Dualhook send-scope investigation.
// Modern Netlify Function (HTTP). Tests whether WA_DUALHOOK_API_KEY (which
// resolves only inside the function env — Netlify marks it write-only/secret)
// is authorized to SEND on the Cloud API proxy, not just read media.
//
// This endpoint CAN send WhatsApp messages, so it is guarded by a random token:
// any request without ?probe=<TOKEN> returns 404. Two modes:
//   ?probe=TOKEN&mode=scope → POST to:"0" (reaches no one). 400 = key CAN send
//                             (rejects invalid recipient); 401/403 = read-only key.
//   ?probe=TOKEN&mode=send  → POST to Nicolás's own number, short plain text.
//                             On send, 470/131047 = closed 24h window, NOT a key issue.
//
// The key is NEVER logged, returned, or printed — only upstream status + body.

const PROBE_TOKEN = '84c130400d10e709441067e935266551'
const PHONE_ID = '915558374975708'
const DUALHOOK_URL = `https://api.dualhook.com/v25.0/${PHONE_ID}/messages`
const TEST_TO = '593968029896'

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } })

export default async (req) => {
  const url = new URL(req.url)
  if (url.searchParams.get('probe') !== PROBE_TOKEN) {
    return new Response('Not Found', { status: 404 })
  }

  const key = process.env.WA_DUALHOOK_API_KEY
  if (!key) return json({ error: 'WA_DUALHOOK_API_KEY not set in this env' }, 500)

  const mode = url.searchParams.get('mode') || 'scope'
  let body
  if (mode === 'scope') {
    body = { messaging_product: 'whatsapp', to: '0', type: 'text', text: { body: 'scope probe' } }
  } else if (mode === 'send') {
    body = {
      messaging_product: 'whatsapp',
      to: TEST_TO,
      type: 'text',
      text: { body: 'Prueba de envío Dualhook desde el panel Efímeramente ✅ (mensaje de test, ignóralo).' },
    }
  } else {
    return json({ error: `unknown mode "${mode}" — use scope or send` }, 400)
  }

  let upstreamStatus = null
  let upstreamBody = null
  try {
    const res = await fetch(DUALHOOK_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    upstreamStatus = res.status
    upstreamBody = await res.text()
  } catch (e) {
    return json({ mode, error: 'fetch failed', detail: e.message }, 502)
  }

  let parsed
  try { parsed = JSON.parse(upstreamBody) } catch { parsed = upstreamBody }
  return json({ mode, phone_id: PHONE_ID, upstreamStatus, upstreamBody: parsed })
}
