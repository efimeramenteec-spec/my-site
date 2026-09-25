// netlify/lib/proofOcr.mjs
//
// Payment-proof OCR core, shared by the owner-gated HTTP endpoint (extract-proof.mjs)
// and the server-side auto-processor (process-proofs.mjs / proofs-run.mjs). Reads a
// bank-transfer screenshot into structured fields with a vision model (Claude Opus 4.8
// via APIMart) and caches the result on the whatsapp_messages row. NEVER touches
// sessions/pagado — reading only.
//
// Env: APIMART_API_KEY (OCR), WA_DUALHOOK_API_KEY (media download, see waMedia.mjs).

import { fetchDualhookMedia, mediaIdOf } from './waMedia.mjs'

const APIMART_URL = 'https://api.apimart.ai/v1/chat/completions'
// Swap here if credit burn matters — sonnet-4-6 / 4o are cheaper and strong at
// receipt OCR. Opus 4.8 for best accuracy on amounts (a misread number is costly).
const OCR_MODEL = 'claude-opus-4-8'

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

// Best-effort JSON extraction from the model's text (handles ```json fences / prose).
export function parseModelJson(text) {
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

// Coerce raw model output into a clean, predictable record.
export function normalizeExtraction(raw) {
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

// OCR one inbound proof row and store `extracted` + `extraction_status`. Returns
// { ok, status, extracted, reason }. Returns the cache unless `force`. Idempotent:
// safe to call from the lazy owner path AND the server processor. Service-role
// supabase; callers do their own auth gating. Row needs: id, raw_payload,
// extraction_status, extracted.
export async function ocrProofRow(supabase, row, { force = false } = {}) {
  if (!force && (row.extraction_status === 'ok' || row.extraction_status === 'needs_review')) {
    return { ok: true, status: row.extraction_status, extracted: row.extracted }
  }

  const msg = row.raw_payload?.message
  const mediaId = mediaIdOf(msg)
  if (!mediaId) return { ok: false, status: 'failed', reason: 'no_media' }

  // PDFs / documents aren't run through image OCR — flag for a manual look.
  if (msg?.type === 'document') {
    const extracted = { is_payment_proof: null, note: 'documento — revisar manualmente' }
    await supabase.from('whatsapp_messages')
      .update({ extraction_status: 'needs_review', extracted }).eq('id', row.id)
    return { ok: true, status: 'needs_review', extracted }
  }

  const apiKey = process.env.APIMART_API_KEY
  if (!apiKey) return { ok: false, status: 'failed', reason: 'no_api_key' }

  try {
    const { buffer, contentType } = await fetchDualhookMedia(mediaId)
    const b64 = Buffer.from(buffer).toString('base64')
    const mime = contentType.startsWith('image/') ? contentType : 'image/jpeg'

    const aiRes = await fetch(APIMART_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OCR_MODEL,
        stream: false, // APIMart defaults to SSE; we want one JSON body
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
      console.error(`[proof-ocr] APIMart ${aiRes.status}: ${body.slice(0, 300)}`)
      await supabase.from('whatsapp_messages').update({ extraction_status: 'failed' }).eq('id', row.id)
      return { ok: false, status: 'failed', reason: aiRes.status === 402 ? 'balance' : 'ocr_error' }
    }

    const data = await aiRes.json()
    const text = data?.choices?.[0]?.message?.content
    const parsed = parseModelJson(
      typeof text === 'string' ? text : Array.isArray(text) ? text.map((p) => p?.text || '').join('') : '')
    if (!parsed) {
      console.error('[proof-ocr] unparseable model output')
      await supabase.from('whatsapp_messages').update({ extraction_status: 'failed' }).eq('id', row.id)
      return { ok: false, status: 'failed', reason: 'parse_error' }
    }

    const extracted = normalizeExtraction(parsed)
    const status = extracted.is_payment_proof === false ? 'needs_review' : 'ok'
    const { error: upErr } = await supabase
      .from('whatsapp_messages').update({ extracted, extraction_status: status }).eq('id', row.id)
    if (upErr) console.error('[proof-ocr] store failed:', upErr.message)
    return { ok: true, status, extracted }
  } catch (err) {
    console.error('[proof-ocr] failed:', err?.message)
    await supabase.from('whatsapp_messages').update({ extraction_status: 'failed' }).eq('id', row.id)
    return { ok: false, status: 'failed', reason: 'media_or_network' }
  }
}
