// netlify/lib/waMedia.mjs
//
// Shared WhatsApp media fetch for the payment-proof reading layer. The Dualhook
// connection-scoped API key (dh_live_…) is server-only, so any function that
// needs the actual bytes of an inbound proof goes through here. Two-hop, Graph
// API shaped:
//   1. GET https://api.dualhook.com/v25.0/{media-id}  (Bearer key) → { url, mime_type }
//   2. GET {url}                                       (Bearer key) → bytes
//
// Used by both `wa-proof-media` (streams the image to the owner's browser on
// demand) and `extract-proof` (feeds the image to the OCR model). Requires env
// WA_DUALHOOK_API_KEY.

const DUALHOOK_BASE = 'https://api.dualhook.com/v25.0'

// Pull the Cloud API media id out of a logged inbound message. Only image and
// document carry the bank-transfer proofs we surface.
export function mediaIdOf(msg) {
  if (msg?.type === 'image') return msg.image?.id || null
  if (msg?.type === 'document') return msg.document?.id || null
  return null
}

// media id → { buffer (ArrayBuffer), contentType }. Throws on any failure so the
// caller can map it to the right HTTP status / extraction_status.
export async function fetchDualhookMedia(mediaId) {
  const apiKey = process.env.WA_DUALHOOK_API_KEY
  if (!apiKey) throw new Error('missing WA_DUALHOOK_API_KEY')

  const metaRes = await fetch(`${DUALHOOK_BASE}/${encodeURIComponent(mediaId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!metaRes.ok) throw new Error(`dualhook meta ${metaRes.status}`)
  const meta = await metaRes.json()
  const url = meta?.url
  if (!url) throw new Error('dualhook meta: no url')

  const binRes = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
  if (!binRes.ok) throw new Error(`dualhook binary ${binRes.status}`)
  const contentType = meta.mime_type || binRes.headers.get('content-type') || 'application/octet-stream'
  const buffer = await binRes.arrayBuffer()
  return { buffer, contentType }
}
