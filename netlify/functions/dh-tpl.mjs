// netlify/functions/dh-tpl.mjs
//
// ⚠️ TEMPORARY — DELETE after the two reminder templates are submitted.
// Modern Netlify Function (HTTP). Creates + submits WhatsApp message templates
// on WABA 1857507018469524 through the Dualhook Cloud-API proxy, using the
// write-only WA_DUALHOOK_API_KEY (server-only, can't be copied out of Netlify).
//
// Dualhook template endpoints mirror Meta Graph v25.0 — only host + credential
// change (docs: dualhook.com/docs/runtime-api-reference#message-templates):
//   POST https://api.dualhook.com/v25.0/{WABA_ID}/message_templates
//   GET  https://api.dualhook.com/v25.0/{WABA_ID}/message_templates  (list/status)
//
// Guarded by a random token: any request without ?t=<TOKEN> returns 404.
//   ?t=TOKEN&action=create → submits both templates for Meta approval
//   ?t=TOKEN&action=list   → lists existing templates + their approval status
// The key is NEVER logged, returned, or printed — only upstream status + body.

const TOKEN = '69686d50dc264cba80792521268ef98d'
const WABA_ID = '1857507018469524'
const BASE = `https://api.dualhook.com/v25.0/${WABA_ID}/message_templates`

const TEMPLATES = [
  {
    name: 'recordatorio_cita',
    language: 'es',
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text: 'Hola {{1}}, te recordamos tu sesión en Efimeramente mañana {{2}} a las {{3}}. Responde CONFIRMO para confirmarla o CANCELAR si no puedes asistir.',
        example: { body_text: [['María', '15 de octubre', '10:00']] },
      },
      {
        type: 'BUTTONS',
        buttons: [
          { type: 'QUICK_REPLY', text: 'Confirmo' },
          { type: 'QUICK_REPLY', text: 'Cancelar' },
        ],
      },
    ],
  },
  {
    name: 'recordatorio_pago',
    language: 'es',
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text: 'Hola {{1}}, tienes un saldo pendiente de ${{2}} por {{3}} sesión(es) en Efimeramente. Puedes realizar la transferencia y enviarnos el comprobante por este mismo chat.',
        example: { body_text: [['María', '78', '2']] },
      },
    ],
  },
]

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj, null, 2), { status, headers: { 'Content-Type': 'application/json' } })

export default async (req) => {
  const url = new URL(req.url)
  if (url.searchParams.get('t') !== TOKEN) return new Response('Not Found', { status: 404 })

  const key = process.env.WA_DUALHOOK_API_KEY
  if (!key) return json({ error: 'WA_DUALHOOK_API_KEY not set in this env' }, 500)

  const action = url.searchParams.get('action') || 'create'
  const auth = { Authorization: `Bearer ${key}` }

  if (action === 'list') {
    const res = await fetch(`${BASE}?fields=id,name,language,status,category&limit=50`, { headers: auth })
    let body
    try { body = JSON.parse(await res.text()) } catch { body = 'unparseable' }
    return json({ action, status: res.status, body })
  }

  if (action === 'create') {
    const results = []
    for (const tpl of TEMPLATES) {
      try {
        const res = await fetch(BASE, {
          method: 'POST',
          headers: { ...auth, 'Content-Type': 'application/json' },
          body: JSON.stringify(tpl),
        })
        let body
        try { body = JSON.parse(await res.text()) } catch { body = 'unparseable' }
        results.push({ name: tpl.name, status: res.status, body })
      } catch (e) {
        results.push({ name: tpl.name, error: e.message })
      }
    }
    return json({ action, results })
  }

  return json({ error: `unknown action "${action}" — use create or list` }, 400)
}
