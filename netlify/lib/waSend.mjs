// netlify/lib/waSend.mjs
//
// Cloud API SEND primitives via the Dualhook proxy — the free-form (non-template)
// message types the lead bot needs: text, reply-buttons, interactive list, and
// image-header cards. Template sends live in whatsapp.mjs. Everything here is a
// SESSION message, valid only inside an open customer window; the bot runs inside
// Meta's free 72h Click-to-WhatsApp entry-point window, so these cost $0.
//
// Meta hard limits enforced here so a too-long string can't 400 a whole reply:
//   button title ≤ 20 · list row title ≤ 24 · list row description ≤ 72 ·
//   list action button ≤ 20 · body text ≤ 1024 · max 3 buttons · max 10 rows.
//
// Env: WA_DUALHOOK_API_KEY.

const DUALHOOK_SEND_URL = 'https://api.dualhook.com/v25.0/915558374975708/messages'

const digits = (to) => String(to).replace(/^\+/, '') // Cloud API wants digits, no '+'
const cut = (s, n) => String(s ?? '').slice(0, n)

async function sendCloud(payload) {
  const apiKey = process.env.WA_DUALHOOK_API_KEY
  if (!apiKey) throw new Error('WA_DUALHOOK_API_KEY missing — no send performed')
  const res = await fetch(DUALHOOK_SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
  })
  if (!res.ok) throw new Error(`Dualhook ${res.status}: ${await res.text()}`)
  return res.json()
}

// Plain text. previewUrl:true lets a URL in the body render its rich preview
// (used for the Maps location answer).
export function sendText(to, body, { previewUrl = false } = {}) {
  return sendCloud({ to: digits(to), type: 'text', text: { body: cut(body, 4096), preview_url: previewUrl } })
}

// Reply buttons (≤3). buttons: [{ id, title }].
export function sendButtons(to, body, buttons, { header, footer } = {}) {
  const interactive = {
    type: 'button',
    body: { text: cut(body, 1024) },
    action: {
      buttons: buttons.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: cut(b.id, 256), title: cut(b.title, 20) } })),
    },
  }
  if (header) interactive.header = { type: 'text', text: cut(header, 60) }
  if (footer) interactive.footer = { text: cut(footer, 60) }
  return sendCloud({ to: digits(to), type: 'interactive', interactive })
}

// Single-section list (≤10 rows). rows: [{ id, title, description? }].
export function sendList(to, body, buttonLabel, rows, { header, footer, sectionTitle } = {}) {
  const interactive = {
    type: 'list',
    body: { text: cut(body, 1024) },
    action: {
      button: cut(buttonLabel, 20),
      sections: [{
        title: cut(sectionTitle || 'Opciones', 24),
        rows: rows.slice(0, 10).map((r) => ({
          id: cut(r.id, 200),
          title: cut(r.title, 24),
          ...(r.description ? { description: cut(r.description, 72) } : {}),
        })),
      }],
    },
  }
  if (header) interactive.header = { type: 'text', text: cut(header, 60) }
  if (footer) interactive.footer = { text: cut(footer, 60) }
  return sendCloud({ to: digits(to), type: 'interactive', interactive })
}

// Card: image header (public HTTPS link) + caption body + one reply button.
// Falls back to a text header (name) when imageLink is absent so the flow still
// works before the card images are hosted.
export function sendImageCard(to, { imageLink, body, button, headerText }) {
  const interactive = {
    type: 'button',
    body: { text: cut(body, 1024) },
    action: { buttons: [{ type: 'reply', reply: { id: cut(button.id, 256), title: cut(button.title, 20) } }] },
  }
  if (imageLink) interactive.header = { type: 'image', image: { link: imageLink } }
  else if (headerText) interactive.header = { type: 'text', text: cut(headerText, 60) }
  return sendCloud({ to: digits(to), type: 'interactive', interactive })
}
