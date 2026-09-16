import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Card } from '../components/Card/Card.jsx'
import { Button } from '../components/Button/Button.jsx'
import { Badge } from '../components/Badge/Badge.jsx'
import { supabase } from '../lib/supabase.js'
import {
  getPaymentProofsData, confirmProofPayment, dismissProof, extractProof,
} from '../lib/queries.js'
import { METODO_PAGO, METODO_PAGO_ORDER } from '../lib/constants.js'
import { patientLabel, formatCurrency, formatDateShort } from '../lib/format.js'

// Comprobantes — WhatsApp payment-proof reading layer (owner-only).
// Patients send bank-transfer screenshots to the central number; the Cloud API
// webhook logs them to whatsapp_messages, matched to a patient by phone. Each
// proof is READ by a vision model into structured fields (amount, date, bank,
// transfer id…) so the page shows DATA, not a heavy image — the original is
// still one tap away ("ver original") for disputes. The owner sees the parsed
// payment next to the patient's unpaid sessions and confirms with one tap.
// Trust-based, NOT bank-verified — nothing is ever auto-marked; each comprobante
// is stamped reconciled on confirm so the same payment can't register twice.

const MEDIA_FN = '/.netlify/functions/wa-proof-media'

// Detected destination account → método de pago. Bank transfers (any bank) map
// to "transferencia"; PayPhone/PayPal map to themselves.
function metodoFromDestination(dest) {
  if (!dest) return null
  const d = dest.toLowerCase()
  if (d.includes('payphone')) return 'payphone'
  if (d.includes('paypal')) return 'paypal'
  if (['pichincha', 'guayaquil', 'produbanco', 'otro', 'banco', 'transfer'].some((k) => d.includes(k))) {
    return 'transferencia'
  }
  return 'transferencia'
}

// ── "Ver original": fetches the real screenshot on demand (owner-gated proxy),
// only when the owner asks — the whole point is that we DON'T load every image.
function OriginalImage({ proof }) {
  const [state, setState] = useState({ status: 'loading', url: null })
  const urlRef = useRef(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        const token = data?.session?.access_token
        if (!token) throw new Error('sin sesión')
        const res = await fetch(`${MEDIA_FN}?id=${encodeURIComponent(proof.id)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const blob = await res.blob()
        const objUrl = URL.createObjectURL(blob)
        urlRef.current = objUrl
        if (alive) setState({ status: 'ready', url: objUrl })
        else URL.revokeObjectURL(objUrl)
      } catch {
        if (alive) setState({ status: 'error', url: null })
      }
    })()
    return () => { alive = false; if (urlRef.current) URL.revokeObjectURL(urlRef.current) }
  }, [proof.id])

  if (state.status === 'loading') return <div className="h-40 w-full animate-pulse rounded-card bg-surface-warm" />
  if (state.status === 'error') {
    return <p className="font-caption text-xs text-content-muted">No se pudo cargar la imagen original.</p>
  }
  if (proof.mediaType === 'document') {
    return (
      <a href={state.url} target="_blank" rel="noreferrer"
        className="inline-block font-caption text-xs font-bold text-brand-lavender hover:underline">
        Abrir documento →
      </a>
    )
  }
  return (
    <a href={state.url} target="_blank" rel="noreferrer" title="Abrir en tamaño completo">
      <img src={state.url} alt="Comprobante original"
        className="max-h-72 w-full rounded-card object-contain bg-surface-warm" />
    </a>
  )
}

function Field({ label, value }) {
  if (!value) return null
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="font-caption text-xs text-content-muted">{label}</span>
      <span className="font-caption text-xs font-semibold text-content-primary text-right">{value}</span>
    </div>
  )
}

// A small amber alert for anything that needs the owner's attention.
function Flag({ children }) {
  return (
    <div className="rounded-lg bg-brand-orange/10 px-3 py-2">
      <p className="font-caption text-xs font-semibold text-orange-700">⚠ {children}</p>
    </div>
  )
}

// The parsed transfer summary + the flags. `ex` is the extracted record.
function ExtractionPanel({ ex, selectedTotal, recipientOk }) {
  const dateStr = ex.transfer_date
    ? `${formatDateShort(ex.transfer_date)}${ex.transfer_time ? ` · ${ex.transfer_time}` : ''}`
    : null
  const amountMismatch =
    ex.amount != null && selectedTotal > 0 && Math.abs(Number(ex.amount) - selectedTotal) > 0.5
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-caption text-xs uppercase tracking-wide text-content-muted">Monto del comprobante</p>
          <p className="font-heading text-2xl font-bold text-content-primary">
            {ex.amount != null ? formatCurrency(ex.amount) : '—'}
          </p>
        </div>
        {dateStr && <p className="font-caption text-xs text-content-muted pb-1">{dateStr}</p>}
      </div>
      {ex.confidence === 'low' && <Flag>Lectura poco confiable — verifica contra el original.</Flag>}
      {amountMismatch && (
        <Flag>El monto leído ({formatCurrency(ex.amount)}) no coincide con lo seleccionado ({formatCurrency(selectedTotal)}).</Flag>
      )}
      {!recipientOk && ex.recipient_name && (
        <Flag>Destinatario detectado: "{ex.recipient_name}" — no parece una cuenta de Mariana. ¿Transferencia equivocada?</Flag>
      )}
    </div>
  )
}

// Runs (or reads cached) OCR for a proof, lazily when it scrolls into view so
// the first-open batch doesn't fire dozens of reads / burn credits at once.
function useExtraction(proof) {
  const hasCached = proof.extractionStatus === 'ok' || proof.extractionStatus === 'needs_review'
  const [state, setState] = useState(
    hasCached ? { status: proof.extractionStatus, extracted: proof.extracted } : { status: 'idle', extracted: null },
  )
  const [visible, setVisible] = useState(hasCached)
  const boxRef = useRef(null)

  useEffect(() => {
    const el = boxRef.current
    if (!el || visible) return
    const io = new IntersectionObserver(
      (es) => { if (es.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect() } },
      { rootMargin: '200px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visible])

  const run = async (force = false) => {
    setState({ status: 'reading', extracted: null })
    const res = await extractProof(proof.id, { force })
    setState({ status: res.status || (res.ok ? 'ok' : 'failed'), extracted: res.extracted || null, reason: res.reason })
  }

  useEffect(() => {
    if (!visible || hasCached) return
    if (state.status === 'idle') run(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  return { ...state, boxRef, retry: () => run(true) }
}

function MatchedCard({ proof, onConfirm, onDismiss, busy }) {
  const sessions = proof.unpaidSessions
  const ex = useExtraction(proof)
  const [selected, setSelected] = useState(() =>
    sessions.length === 1 ? { [sessions[0].id]: true } : {},
  )
  const [metodo, setMetodo] = useState(null)
  const [showDetails, setShowDetails] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)

  const selectedIds = Object.keys(selected).filter((k) => selected[k])
  const selectedTotal = sessions.filter((s) => selected[s.id]).reduce((a, s) => a + Number(s.monto || 0), 0)
  const toggle = (id) => setSelected((p) => ({ ...p, [id]: !p[id] }))

  const data = ex.extracted
  // Método: detected destination → patient default → transferencia. `metodo`
  // state overrides once the owner touches the picker.
  const detected = data ? metodoFromDestination(data.destination) : null
  const metodoValue = metodo || detected || proof.patient?.metodo_pago || 'transferencia'
  const recipientOk = !data?.recipient_name || /mariana/i.test(data.recipient_name)

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div ref={ex.boxRef} className="flex items-start justify-between gap-3">
        <div>
          <p className="font-heading text-base font-bold text-content-primary">{patientLabel(proof.patient)}</p>
          <p className="font-caption text-xs text-content-muted">
            Enviado {proof.sentAt ? formatDateShort(proof.sentAt) : ''}
          </p>
        </div>
        <Badge variant="lavender">Comprobante</Badge>
      </div>

      {/* Extraction summary / status */}
      {ex.status === 'ok' && data && (
        <ExtractionPanel ex={data} selectedTotal={selectedTotal} recipientOk={recipientOk} />
      )}
      {(ex.status === 'idle' || ex.status === 'reading') && (
        <div className="h-20 w-full animate-pulse rounded-card bg-surface-warm" />
      )}
      {ex.status === 'needs_review' && (
        <Flag>No se pudo leer automáticamente (¿documento o imagen poco clara?). Ábrelo con "ver original" y regístralo a mano.</Flag>
      )}
      {ex.status === 'failed' && (
        <div className="space-y-2">
          <Flag>No pude leer el comprobante{ex.reason === 'balance' ? ' (revisa el saldo de APIMart)' : ''}. Puedes reintentar o registrarlo a mano con "ver original".</Flag>
          <Button variant="ghost" onClick={ex.retry} disabled={ex.status === 'reading'}>Reintentar lectura</Button>
        </div>
      )}

      {/* Sessions to mark paid */}
      {sessions.length === 0 ? (
        <div className="rounded-card bg-surface-warm p-3">
          <p className="font-caption text-xs text-content-muted">
            Sin sesiones por cobrar para este paciente. Puede estar al día o ser un pago adelantado. Descártalo o revísalo en Finanzas.
          </p>
        </div>
      ) : (
        <div>
          <p className="mb-2 font-caption text-xs font-bold uppercase tracking-wide text-content-muted">
            ¿Qué sesión(es) cubre este pago?
          </p>
          <div className="flex flex-col gap-1.5">
            {sessions.map((s) => (
              <label key={s.id}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors ${
                  selected[s.id] ? 'border-brand-lavender/60 bg-brand-lavender/10' : 'border-stroke bg-white hover:bg-surface-warm'
                }`}>
                <span className="flex items-center gap-2">
                  <input type="checkbox" checked={!!selected[s.id]} onChange={() => toggle(s.id)}
                    className="h-4 w-4 accent-brand-lavender" />
                  <span className="font-heading text-sm text-content-primary">
                    {formatDateShort(s.fecha)}
                    <span className="ml-2 font-caption text-xs font-normal text-content-muted">
                      {s.modalidad === 'en_linea' ? 'En línea' : 'Presencial'}
                    </span>
                  </span>
                </span>
                <span className="font-heading text-sm font-bold text-content-primary">{formatCurrency(s.monto)}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-3">
        {sessions.length > 0 && (
          <select value={metodoValue} onChange={(e) => setMetodo(e.target.value)} aria-label="Método de pago"
            className="rounded-lg border border-stroke bg-white px-3 py-2 font-heading text-sm font-bold text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-lavender/20">
            {METODO_PAGO_ORDER.map((m) => <option key={m} value={m}>{METODO_PAGO[m]}</option>)}
          </select>
        )}
        <Button variant="primary" disabled={busy || selectedIds.length === 0}
          onClick={() => onConfirm(proof, selectedIds, metodoValue)}>
          {selectedIds.length > 1
            ? `Marcar ${selectedIds.length} pagadas · ${formatCurrency(selectedTotal)}`
            : `Marcar pagado${selectedTotal ? ` · ${formatCurrency(selectedTotal)}` : ''}`}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => onDismiss(proof)}>Descartar</Button>
      </div>

      {/* Details + original, both collapsed by default to keep the card clean */}
      <div className="flex gap-4 border-t border-stroke pt-2">
        {data && (
          <button onClick={() => setShowDetails((v) => !v)}
            className="font-caption text-xs font-bold text-brand-lavender hover:underline">
            {showDetails ? 'Ocultar detalles' : 'Ver detalles'}
          </button>
        )}
        <button onClick={() => setShowOriginal((v) => !v)}
          className="font-caption text-xs font-bold text-brand-lavender hover:underline">
          {showOriginal ? 'Ocultar original' : 'Ver original'}
        </button>
      </div>
      {showDetails && data && (
        <div className="rounded-card bg-surface-warm p-3">
          <Field label="Banco origen" value={data.origin_bank} />
          <Field label="Remitente" value={data.sender_name} />
          <Field label="Destino" value={data.destination} />
          <Field label="N° de transferencia" value={data.transfer_id} />
          <Field label="Estado" value={data.status} />
          <Field label="Concepto (banco)" value={data.bank_description} />
          <Field label="Confianza de lectura" value={data.confidence} />
          <Field label="Mensaje de WhatsApp" value={proof.caption || proof.cuerpo} />
        </div>
      )}
      {showOriginal && <OriginalImage proof={proof} />}
    </Card>
  )
}

// Unmatched proof (patient_id null): manual-attention path, never a silent drop.
function UnmatchedCard({ proof, onDismiss, busy }) {
  const ex = useExtraction(proof)
  const [showOriginal, setShowOriginal] = useState(false)
  const data = ex.extracted
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div ref={ex.boxRef} className="flex items-start justify-between gap-3">
        <div>
          <p className="font-heading text-base font-bold text-content-primary">{proof.waName || 'Remitente desconocido'}</p>
          <p className="font-caption text-xs text-content-muted">{proof.fromPhone ? `+${proof.fromPhone}` : 'sin número'}</p>
          <p className="font-caption text-xs text-content-muted">Enviado {proof.sentAt ? formatDateShort(proof.sentAt) : ''}</p>
        </div>
        <Badge variant="orange">Sin paciente</Badge>
      </div>

      {ex.status === 'ok' && data && (
        <ExtractionPanel ex={data} selectedTotal={0} recipientOk={!data.recipient_name || /mariana/i.test(data.recipient_name)} />
      )}
      {(ex.status === 'idle' || ex.status === 'reading') && (
        <div className="h-16 w-full animate-pulse rounded-card bg-surface-warm" />
      )}

      <div className="rounded-card bg-brand-orange/10 p-3">
        <p className="font-caption text-xs text-content-secondary">
          Este número no coincide con ningún paciente. Identifícalo y, si corresponde, guarda su teléfono en la ficha (Pacientes) para que sus próximos comprobantes se asocien solos. Luego descártalo.
        </p>
      </div>

      <div className="flex gap-4">
        <Button variant="ghost" disabled={busy} onClick={() => onDismiss(proof)}>Descartar</Button>
        <button onClick={() => setShowOriginal((v) => !v)}
          className="font-caption text-xs font-bold text-brand-lavender hover:underline self-center">
          {showOriginal ? 'Ocultar original' : 'Ver original'}
        </button>
      </div>
      {showOriginal && <OriginalImage proof={proof} />}
    </Card>
  )
}

export default function Comprobantes() {
  const ctx = useOutletContext()
  const [data, setData] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)
  const [showProcessed, setShowProcessed] = useState(false)

  const load = async () => {
    const d = await getPaymentProofsData()
    setData(d)
    ctx?.setDataSource?.(d.source === 'demo' ? 'demo' : 'live')
  }

  useEffect(() => {
    let alive = true
    getPaymentProofsData().then((d) => {
      if (!alive) return
      setData(d)
      ctx?.setDataSource?.(d.source === 'demo' ? 'demo' : 'live')
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { pendingMatched, pendingUnmatched, processed, anyFailed } = useMemo(() => {
    const proofs = data?.proofs || []
    const pending = proofs.filter((p) => !p.reconciledAt)
    return {
      pendingMatched: pending.filter((p) => p.patient),
      pendingUnmatched: pending.filter((p) => !p.patient),
      processed: proofs.filter((p) => p.reconciledAt),
      anyFailed: pending.some((p) => p.extractionStatus === 'failed'),
    }
  }, [data])

  const handleConfirm = async (proof, sessionIds, metodo) => {
    setBusyId(proof.id); setError(null)
    const res = await confirmProofPayment(proof.id, sessionIds, metodo)
    setBusyId(null)
    if (res.ok) await load()
    else setError(res.error || 'No se pudo confirmar el pago.')
  }
  const handleDismiss = async (proof) => {
    setBusyId(proof.id); setError(null)
    const res = await dismissProof(proof.id)
    setBusyId(null)
    if (res.ok) await load()
    else setError(res.error || 'No se pudo descartar el comprobante.')
  }

  if (!data) {
    return (
      <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2">
        {[0, 1].map((i) => <div key={i} className="h-72 animate-pulse rounded-card bg-white/50" />)}
      </div>
    )
  }

  const totalPending = pendingMatched.length + pendingUnmatched.length

  return (
    <div className="space-y-5 pt-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="font-heading text-xl font-bold text-content-primary">Comprobantes</h1>
          <p className="font-caption text-xs text-content-muted">
            Pagos recibidos por WhatsApp en los últimos 7 días, leídos automáticamente. No verificado con el banco: revisa cada comprobante antes de marcar pagado.
          </p>
        </div>
        <Badge variant={totalPending ? 'lavender' : 'neutral'}>
          {totalPending} {totalPending === 1 ? 'pendiente' : 'pendientes'}
        </Badge>
      </div>

      {anyFailed && (
        <div className="rounded-card bg-brand-orange/10 p-3">
          <p className="font-caption text-xs font-bold text-orange-700">
            Algunos comprobantes no se pudieron leer automáticamente. Si son varios, revisa el saldo de APIMart. Mientras tanto puedes registrarlos a mano con "ver original".
          </p>
        </div>
      )}
      {error && (
        <div className="rounded-card bg-brand-pink/15 p-3">
          <p className="font-caption text-xs font-bold text-rose-700">{error}</p>
        </div>
      )}
      {data.source === 'error' && (
        <div className="rounded-card bg-brand-orange/10 p-3">
          <p className="font-caption text-xs text-content-secondary">No se pudieron cargar los comprobantes en este momento.</p>
        </div>
      )}
      {totalPending === 0 && data.source !== 'error' && (
        <Card className="p-6 text-center">
          <p className="font-heading text-sm font-bold text-content-primary">Todo al día</p>
          <p className="mt-1 font-caption text-xs text-content-muted">No hay comprobantes pendientes de los últimos 7 días.</p>
        </Card>
      )}

      {pendingMatched.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {pendingMatched.map((p) => (
            <MatchedCard key={p.id} proof={p} busy={busyId === p.id} onConfirm={handleConfirm} onDismiss={handleDismiss} />
          ))}
        </div>
      )}

      {pendingUnmatched.length > 0 && (
        <div>
          <p className="mb-2 font-caption text-xs font-bold uppercase tracking-wide text-content-muted">
            Requieren atención — sin paciente ({pendingUnmatched.length})
          </p>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {pendingUnmatched.map((p) => (
              <UnmatchedCard key={p.id} proof={p} busy={busyId === p.id} onDismiss={handleDismiss} />
            ))}
          </div>
        </div>
      )}

      {processed.length > 0 && (
        <div>
          <button onClick={() => setShowProcessed((v) => !v)}
            className="font-caption text-xs font-bold text-brand-lavender hover:underline">
            {showProcessed ? 'Ocultar' : 'Ver'} procesados ({processed.length})
          </button>
          {showProcessed && (
            <div className="mt-2 grid grid-cols-1 gap-2">
              {processed.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-card bg-white/60 px-4 py-2">
                  <span className="font-heading text-sm text-content-primary">
                    {p.patient ? patientLabel(p.patient) : p.waName || p.fromPhone || 'Desconocido'}
                  </span>
                  <span className="font-caption text-xs text-content-muted">
                    {p.reconciledSessionIds?.length ? `${p.reconciledSessionIds.length} sesión(es) marcada(s)` : 'Descartado'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
