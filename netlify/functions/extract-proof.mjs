// netlify/functions/extract-proof.mjs
//
// OWNER-ONLY payment-proof OCR for the Comprobantes reading layer. Instead of
// storing/showing the raw bank screenshot, we read it once into structured
// fields with a vision model (Claude Opus 4.8 via APIMart — the owner's
// existing key) and cache the result on the whatsapp_messages row. The page
// then shows data, not a heavy image; the original is still fetchable on demand
// via `wa-proof-media` for disputes.
//
// Flow: verify the caller is the owner → load the proof row → if already
// extracted, return the cache → else download the media (Dualhook, via the
// shared lib), send it to APIMart, parse the JSON, store `extracted` +
// `extraction_status`, return it. Read-only w.r.t. sessions/pagado — this never
// marks anything paid; that stays a human tap on the page.
//
// GET/POST /.netlify/functions/extract-proof?id=<whatsapp_messages.id>
//   Authorization: Bearer <Supabase access token>
//   &force=1  → re-run even if a prior attempt exists (retry a 'failed' read)
// Env:
//   APIMART_API_KEY       (required) — APIMart key (OpenAI-compatible chat API).
//   WA_DUALHOOK_API_KEY   (required) — media download (see waMedia.mjs).
//   SUPABASE_SERVICE_KEY  (required) — service-role read/write (we gate on owner).

import { getSupabaseAdmin } from '../lib/whatsapp.mjs'
import { fetchDualhookMedia, mediaIdOf } from '../lib/waMedia.mjs'

const APIMART_URL = 'https://api.apimart.ai/v1/chat/completions'
// Swap here if credit burn ever matters — claude-sonnet-4-6 / chatgpt-4o-latest
// are cheaper and also strong at receipt OCR. Opus 4.8 for best accuracy on
// amounts (a misread number is the costly failure mode).
const OCR_MODEL = 'claude-opus-4-8'

const ALLOWED_ORIGINS = [
  'https://efimeramente-panel.netlify.app',
  'https://genuine-praline-0f8e70.netlify.app',
  'http://localhost:5173',
]
function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  }
}

// What the model must return. Kept as a plain instruction (not a provider-
// specific schema param) so it works across APIMart's OpenAI-compatible surface.
const PROMPT = `Eres un lector de comprobantes de transferencia bancaria de Ecuador. Analiza la imagen del comprobante y devuelve ÚNICAMENTE un objeto JSON válido (sin texto adicional, sin markdown) con exactamente estas claves:

{
  "is_payment_proof": boolean,   // true si es un comprobante/recibo de transferencia o pago; false si es otra cosa (foto cualquiera, captura no relacionada)
  "transfer_date": string|null,  // fecha de LA TRANSFERENCIA en formato "YYYY-MM-DD"; null si no aparece
  "transfer_time": string|null,  // hora de la transferencia en formato 24h "HH:MM"; null si el banco solo muestra fecha
  "amount": number|null,         // monto pagado como número, sin símbolos ni separadores de miles (ej 39.00); null si no aparece
  "origin_bank": string|null,    // banco de origen (desde dónde se pagó); null si no aparece
  "sender_name": string|null,    // nombre del titular que ENVÍA el dinero; null si no aparece
  "destination": string|null,    // normaliza el destino a UNO de: "pichincha","guayaquil","produbanco","payphone","paypal","otro"; null si no aparece
  "recipient_name": string|null, // nombre del titular que RECIBE (debería ser Mariana Villegas); null si no aparece
  "transfer_id": string|null,    // número de comprobante / documento / transacción (identificador único de la transferencia); null si no aparece
  "status": string|null,         // estado si aparece (ej "Exitoso","Aprobado","Procesado"); null si no aparece
  "bank_description": string|null, // concepto/motivo/detalle escrito DENTRO de la transferencia; null si no aparece
  "confidence": string           // "high" | "medium" | "low" según qué tan legible/completo esté el comprobante
}

Reglas: usa null cuando un dato no sea visible (especialmente la hora, que muchos bancos no muestran). No inventes datos. Si la imagen NO es un comprobante de pago, pon is_payment_proof=false y el resto en null. Devuelve solo el JSON.`

// Best-effort JSON extraction from the model's text (handles ```json fences or
// leading prose). Returns null if nothing parseable.
function parseModelJson(text) {
  if (!text) return null
  const cleaned = String(text).replace(/```json/gi, '').replace(/```/g, '').trim()
  try { return JSON.parse(cleaned) } catch {}
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)) } catch {}
  }
  return null
}

// Coerce the raw model output into a clean, predictable record.
function normalizeExtraction(raw) {
  const amount = raw?.amount
  const num = typeof amount === 'number' ? amount
    : (amount != null && !Number.isNaN(Number(String(amount).replace(/[^0-9.]/g, ''))))
      ? Number(String(amount).replace(/[^0-9.]/g, '')) : null
  const conf = ['high', 'medium', 'low'].includes(raw?.confidence) ? raw.confidence : 'low'
  const str = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  return {
    is_payment_proof: raw?.is_payment_proof !== false, // default true unless model says otherwise
    transfer_date: str(raw?.transfer_date),
    transfer_time: str(raw?.transfer_time),
    amount: num,
    origin_bank: str(raw?.origin_bank),
    sender_name: str(raw?.sender_name),
    destination: str(raw?.destination)?.toLowerCase() || null,
    recipient_name: str(raw?.recipient_name),
    transfer_id: str(raw?.transfer_id),
    status: str(raw?.status),
    bank_description: str(raw?.bank_description),
    confidence: conf,
    model: OCR_MODEL,
    read_at: new Date().toISOString(),
  }
}

export default async (req) => {
  const cors = corsHeaders(req.headers.get('origin') || '')
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors } })

  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const supabase = getSupabaseAdmin()
  if (!supabase) return json({ error: 'server_misconfigured' }, 500)

  // ── Owner-only gate (mirrors whatsapp_messages RLS) ──────────────────────────
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'unauthorized' }, 401)
  const { data: userData, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !userData?.user) return json({ error: 'unauthorized' }, 401)
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', userData.user.id).single()
  if (profile?.role !== 'owner') return json({ error: 'forbidden' }, 403)

  const url = new URL(req.url)
  const id = url.searchParams.get('id')
  const force = url.searchParams.get('force') === '1'
  if (!id) return json({ error: 'bad_request' }, 400)

  const { data: row, error: rowErr } = await supabase
    .from('whatsapp_messages')
    .select('id, direccion, raw_payload, extracted, extraction_status')
    .eq('id', id)
    .single()
  if (rowErr || !row || row.direccion !== 'inbound') return json({ error: 'not_found' }, 404)

  // Cached already? Don't re-OCR (don't re-burn credits) unless forced or the
  // previous attempt failed.
  if (!force && (row.extraction_status === 'ok' || row.extraction_status === 'needs_review')) {
    return json({ ok: true, status: row.extraction_status, extracted: row.extracted })
  }

  const msg = row.raw_payload?.message
  const mediaId = mediaIdOf(msg)
  if (!mediaId) return json({ error: 'no_media' }, 404)

  // Documents (PDFs) aren't sent through the image OCR path — flag for a manual
  // look via "ver original" rather than guessing.
  if (msg?.type === 'document') {
    await supabase.from('whatsapp_messages')
      .update({ extraction_status: 'needs_review', extracted: { is_payment_proof: null, note: 'documento — revisar manualmente' } })
      .eq('id', id)
    return json({ ok: true, status: 'needs_review', extracted: { note: 'documento' } })
  }

  const apiKey = process.env.APIMART_API_KEY
  if (!apiKey) return json({ error: 'server_misconfigured', detail: 'APIMART_API_KEY' }, 500)

  try {
    const { buffer, contentType } = await fetchDualhookMedia(mediaId)
    const b64 = Buffer.from(buffer).toString('base64')
    const mime = contentType.startsWith('image/') ? contentType : 'image/jpeg'

    const aiRes = await fetch(APIMART_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OCR_MODEL,
        stream: false, // APIMart defaults to SSE streaming; we want one JSON body
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: PROMPT },
            { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } },
          ],
        }],
      }),
    })

    if (!aiRes.ok) {
      const body = await aiRes.text().catch(() => '')
      console.error(`[extract-proof] APIMart ${aiRes.status}: ${body.slice(0, 300)}`)
      await supabase.from('whatsapp_messages').update({ extraction_status: 'failed' }).eq('id', id)
      // 402/insufficient balance surfaces here — tell the client so the page can
      // show the "couldn't read (check APIMart balance)" banner.
      return json({ ok: false, status: 'failed', reason: aiRes.status === 402 ? 'balance' : 'ocr_error' }, 200)
    }

    const data = await aiRes.json()
    const text = data?.choices?.[0]?.message?.content
    const parsed = parseModelJson(typeof text === 'string' ? text : Array.isArray(text) ? text.map((p) => p?.text || '').join('') : '')
    if (!parsed) {
      console.error('[extract-proof] unparseable model output')
      await supabase.from('whatsapp_messages').update({ extraction_status: 'failed' }).eq('id', id)
      return json({ ok: false, status: 'failed', reason: 'parse_error' }, 200)
    }

    const extracted = normalizeExtraction(parsed)
    // Not actually a payment proof → needs a human glance, not the pay flow.
    const status = extracted.is_payment_proof === false ? 'needs_review' : 'ok'
    const { error: upErr } = await supabase
      .from('whatsapp_messages')
      .update({ extracted, extraction_status: status })
      .eq('id', id)
    if (upErr) console.error('[extract-proof] store failed:', upErr.message)

    return json({ ok: true, status, extracted })
  } catch (err) {
    console.error('[extract-proof] failed:', err?.message)
    await supabase.from('whatsapp_messages').update({ extraction_status: 'failed' }).eq('id', id)
    return json({ ok: false, status: 'failed', reason: 'media_or_network' }, 200)
  }
}
