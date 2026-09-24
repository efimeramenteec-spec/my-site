// netlify/functions/dh-tpl.mjs
//
// ⚠️ TEMPORARY — DELETE after the payment templates are approved AND the render
// test to Nicolás has been sent. (Two-phase: submit now → come back to test once
// Meta approves #1.) Same precedent as the earlier, already-deleted dh-tpl that
// submitted recordatorio_cita / recordatorio_pago.
//
// Modern Netlify Function (HTTP). Creates + submits WhatsApp message templates on
// WABA 1857507018469524 through the Dualhook Cloud-API proxy, using the write-only
// WA_DUALHOOK_API_KEY (server-only — can't be copied out of Netlify, hence a
// deployed function rather than a local script).
//
// Dualhook template endpoints mirror Meta Graph v25.0 — only host + credential
// change (docs: dualhook.com/docs/runtime-api-reference#message-templates):
//   POST   https://api.dualhook.com/v25.0/{WABA_ID}/message_templates
//   GET    https://api.dualhook.com/v25.0/{WABA_ID}/message_templates  (list/status)
//
// Guarded by a random token: any request without ?t=<TOKEN> returns 404.
//   ?t=TOKEN&action=list        → list existing templates + approval status
//   ?t=TOKEN&action=create      → submit the 3 payment templates for Meta approval
//   ?t=TOKEN&action=test-payment&to=<E164>  → send ONE real recordatorio_pago
//                                 (dummy name/$1/fake session text) to render-check
// The key is NEVER logged, returned, or printed — only upstream status + body.

import { sendDualhookPaymentReminder } from '../lib/whatsapp.mjs'

const TOKEN = '169012197402645185c0ad2fd45e3e33'
const WABA_ID = '1857507018469524'
const BASE = `https://api.dualhook.com/v25.0/${WABA_ID}/message_templates`

const TEMPLATES = [
  // #1 — patient payment reminder. New name `recordatorio_pago_v2` because the
  // original `recordatorio_pago` (id 1871176587622662) is APPROVED — we supersede
  // it without a destructive delete. {{3}} is a free-text, code-generated
  // "sesiones" phrase. One dynamic URL button.
  {
    name: 'recordatorio_pago_v2',
    language: 'es',
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text:
          'Hola {{1}}, te escribimos de Efimeramente 🌿\n' +
          'Tienes un saldo pendiente de ${{2}} por {{3}}.\n\n' +
          'Puedes transferir a:\n\n' +
          'Banco Pichincha\n' +
          'Cuenta de ahorros\n' +
          'Número: 2215196618\n' +
          'Nombre: Mariana Villegas\n' +
          'Cédula: 1760388700\n' +
          'Correo: efimeramenteec@gmail.com\n\n' +
          'Para pago con tarjeta de crédito o débito, usa el botón de abajo.\n\n' +
          '✅ Cuando realices el pago, envíanos el comprobante por este chat. ¡Gracias!',
        example: { body_text: [['María', '78', 'tu sesión del 22 de septiembre']] },
      },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Pagar con tarjeta',
            url: 'https://ppls.me/{{1}}',
            example: ['https://ppls.me/r1NzJTGHRqrDZi1UJRm9w'],
          },
        ],
      },
    ],
  },
  // #2 — "En mora" daily summary to Nicolás.
  {
    name: 'resumen_en_mora',
    language: 'es',
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        // Trailing "Revísalos en la app." is required: Meta forbids a variable at
        // the very end of the body (error 2388299), and the spec copy ended in {{3}}.
        text: 'Hola Nicolás 🌿 En mora hoy: {{1}} pacientes, ${{2}} en total.\n{{3}}\nRevísalos en la app.',
        example: {
          body_text: [['3', '156', '• María López — $52\n• Juan Pérez — $39\n• Ana Ruiz — $65']],
        },
      },
    ],
  },
  // #3 — unidentified comprobante alert to Nicolás (feeds the #2 build).
  {
    name: 'comprobante_sin_identificar',
    language: 'es',
    category: 'UTILITY',
    components: [
      {
        type: 'BODY',
        text:
          'Hola Nicolás 🌿 Comprobante sin identificar de {{1}} por ${{2}}.\n' +
          'Motivo: {{3}}. Revísalo en la app.',
        example: { body_text: [['+593 99 123 4567', '40', 'remitente desconocido']] },
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

  const action = url.searchParams.get('action') || 'list'
  const auth = { Authorization: `Bearer ${key}` }

  if (action === 'list') {
    const res = await fetch(`${BASE}?fields=id,name,language,status,category,rejected_reason&limit=100`, { headers: auth })
    let body
    try { body = JSON.parse(await res.text()) } catch { body = 'unparseable' }
    return json({ action, version: 'only-backoff', status: res.status, body })
  }

  if (action === 'create') {
    // ?only=<name> submits a single template — lets us space submissions out from
    // the caller to dodge Dualhook's rate-limit circuit (bare 429 on rapid create).
    const only = url.searchParams.get('only')
    const batch = only ? TEMPLATES.filter((t) => t.name === only) : TEMPLATES
    if (only && batch.length === 0) return json({ error: `no template named "${only}"` }, 400)
    const results = []
    for (const tpl of batch) {
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

  if (action === 'test-payment') {
    // Render check: send ONE real recordatorio_pago with dummy values. Requires
    // an approved template. `to` is an E.164 number (?to=+593...). Exercises the
    // real sendDualhookPaymentReminder helper, so it also validates the wiring.
    const to = url.searchParams.get('to')
    if (!to) return json({ error: 'test-payment needs ?to=<E164>' }, 400)
    try {
      const out = await sendDualhookPaymentReminder({
        toE164: to,
        name: 'Nicolás',
        monto: '1',
        sesionesText: 'tu sesión de prueba del 24 de septiembre',
      })
      return json({ action, to, sent: true, out })
    } catch (e) {
      return json({ action, to, sent: false, error: e.message }, 502)
    }
  }

  return json({ error: `unknown action "${action}" — use list | create | test-payment` }, 400)
}
