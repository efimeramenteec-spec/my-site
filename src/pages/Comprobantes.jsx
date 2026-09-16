import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Card } from '../components/Card/Card.jsx'
import { Button } from '../components/Button/Button.jsx'
import { Badge } from '../components/Badge/Badge.jsx'
import { supabase } from '../lib/supabase.js'
import { getPaymentProofsData, confirmProofPayment, dismissProof } from '../lib/queries.js'
import { METODO_PAGO, METODO_PAGO_ORDER } from '../lib/constants.js'
import { patientLabel, formatCurrency, formatDateShort } from '../lib/format.js'

// Comprobantes — WhatsApp payment-proof reading layer (owner-only).
// Patients send bank-transfer screenshots to the central number; the Cloud API
// webhook logs them to whatsapp_messages, matched to a patient by phone. Here
// the owner SEES each proof next to the patient's unpaid sessions and confirms
// the payment with one tap. Trust-based, NOT bank-verified — nothing is ever
// auto-marked. Each comprobante is stamped reconciled on confirm, so the same
// payment can never be registered twice.

const MEDIA_FN = '/.netlify/functions/wa-proof-media'

// Fetches the proof media through the owner-gated function (which holds the
// Dualhook secret), passing the Supabase access token. Renders an <img> for
// screenshots and an "open" tile for PDF/other documents. Object URLs are
// revoked on unmount so blobs don't leak.
function ProofMedia({ proof }) {
  const [state, setState] = useState({ status: 'idle', url: null })
  const [visible, setVisible] = useState(false)
  const urlRef = useRef(null)
  const boxRef = useRef(null)

  // Only fetch media once the card scrolls near the viewport — the first open
  // after the history sync can list dozens of proofs, and we don't want to fire
  // dozens of Dualhook downloads (or load sensitive images) all at once.
  useEffect(() => {
    const el = boxRef.current
    if (!el || visible) return
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect() } },
      { rootMargin: '200px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [visible])

  useEffect(() => {
    if (!visible) return
    let alive = true
    setState({ status: 'loading', url: null })
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
    return () => {
      alive = false
      if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null }
    }
  }, [proof.id, visible])

  if (state.status === 'idle' || state.status === 'loading') {
    return <div ref={boxRef} className="h-48 w-full animate-pulse rounded-card bg-surface-warm" />
  }
  if (state.status === 'error') {
    return (
      <div className="flex h-48 w-full flex-col items-center justify-center rounded-card bg-surface-warm text-center">
        <p className="font-caption text-xs text-content-muted">No se pudo cargar el comprobante.</p>
        <p className="mt-1 font-caption text-[11px] text-content-muted">{proof.cuerpo}</p>
      </div>
    )
  }
  if (proof.mediaType === 'image') {
    return (
      <a href={state.url} target="_blank" rel="noreferrer" title="Abrir en tamaño completo">
        <img
          src={state.url}
          alt="Comprobante de pago"
          className="max-h-72 w-full rounded-card object-contain bg-surface-warm"
        />
      </a>
    )
  }
  // Document (PDF, etc.)
  return (
    <a
      href={state.url}
      target="_blank"
      rel="noreferrer"
      className="flex h-32 w-full flex-col items-center justify-center rounded-card border border-stroke bg-surface-warm text-center transition-shadow hover:shadow-card"
    >
      <span className="font-heading text-sm font-bold text-content-primary">
        {proof.filename || 'Documento'}
      </span>
      <span className="mt-1 font-caption text-xs text-brand-lavender">Abrir documento →</span>
    </a>
  )
}

function ProofHeader({ proof }) {
  const when = proof.sentAt ? formatDateShort(proof.sentAt) : ''
  const time = proof.sentAt
    ? new Date(proof.sentAt).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })
    : ''
  return (
    <p className="font-caption text-xs text-content-muted">
      Enviado {when} {time && `· ${time}`}
    </p>
  )
}

// Matched proof: patient + their unpaid sessions to confirm.
function MatchedCard({ proof, onConfirm, onDismiss, busy }) {
  const sessions = proof.unpaidSessions
  const [selected, setSelected] = useState(() =>
    sessions.length === 1 ? { [sessions[0].id]: true } : {},
  )
  const [metodo, setMetodo] = useState(proof.patient?.metodo_pago || 'transferencia')

  const selectedIds = Object.keys(selected).filter((k) => selected[k])
  const selectedTotal = sessions
    .filter((s) => selected[s.id])
    .reduce((a, s) => a + Number(s.monto || 0), 0)

  const toggle = (id) => setSelected((prev) => ({ ...prev, [id]: !prev[id] }))

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-heading text-base font-bold text-content-primary">
            {patientLabel(proof.patient)}
          </p>
          <ProofHeader proof={proof} />
        </div>
        <Badge variant="lavender">Comprobante</Badge>
      </div>

      <ProofMedia proof={proof} />
      {proof.caption && (
        <p className="font-caption text-xs italic text-content-muted">“{proof.caption}”</p>
      )}

      {sessions.length === 0 ? (
        <div className="rounded-card bg-surface-warm p-3">
          <p className="font-caption text-xs text-content-muted">
            Sin sesiones por cobrar para este paciente. Puede que ya esté al día o que el pago sea
            de una sesión futura. Descártalo o revísalo en Finanzas.
          </p>
        </div>
      ) : (
        <div>
          <p className="mb-2 font-caption text-xs font-bold uppercase tracking-wide text-content-muted">
            ¿Qué sesión(es) cubre este pago?
          </p>
          <div className="flex flex-col gap-1.5">
            {sessions.map((s) => (
              <label
                key={s.id}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 transition-colors ${
                  selected[s.id]
                    ? 'border-brand-lavender/60 bg-brand-lavender/10'
                    : 'border-stroke bg-white hover:bg-surface-warm'
                }`}
              >
                <span className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!selected[s.id]}
                    onChange={() => toggle(s.id)}
                    className="h-4 w-4 accent-brand-lavender"
                  />
                  <span className="font-heading text-sm text-content-primary">
                    {formatDateShort(s.fecha)}
                    <span className="ml-2 font-caption text-xs font-normal text-content-muted">
                      {s.modalidad === 'en_linea' ? 'En línea' : 'Presencial'}
                    </span>
                  </span>
                </span>
                <span className="font-heading text-sm font-bold text-content-primary">
                  {formatCurrency(s.monto)}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {sessions.length > 0 && (
          <select
            value={metodo}
            onChange={(e) => setMetodo(e.target.value)}
            aria-label="Método de pago"
            className="rounded-lg border border-stroke bg-white px-3 py-2 font-heading text-sm font-bold text-content-primary focus:outline-none focus:ring-2 focus:ring-brand-lavender/20"
          >
            {METODO_PAGO_ORDER.map((m) => (
              <option key={m} value={m}>{METODO_PAGO[m]}</option>
            ))}
          </select>
        )}
        <Button
          variant="primary"
          disabled={busy || selectedIds.length === 0}
          onClick={() => onConfirm(proof, selectedIds, metodo)}
        >
          {selectedIds.length > 1
            ? `Marcar ${selectedIds.length} pagadas · ${formatCurrency(selectedTotal)}`
            : `Marcar pagado${selectedTotal ? ` · ${formatCurrency(selectedTotal)}` : ''}`}
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => onDismiss(proof)}>
          Descartar
        </Button>
      </div>
    </Card>
  )
}

// Unmatched proof (patient_id null): a manual-attention path, never a silent
// drop. Show who sent it so the owner can identify + assign the patient (edit
// their teléfono in Pacientes so future proofs match), then dismiss.
function UnmatchedCard({ proof, onDismiss, busy }) {
  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-heading text-base font-bold text-content-primary">
            {proof.waName || 'Remitente desconocido'}
          </p>
          <p className="font-caption text-xs text-content-muted">
            {proof.fromPhone ? `+${proof.fromPhone}` : 'sin número'}
          </p>
          <ProofHeader proof={proof} />
        </div>
        <Badge variant="orange">Sin paciente</Badge>
      </div>

      <ProofMedia proof={proof} />
      {proof.caption && (
        <p className="font-caption text-xs italic text-content-muted">“{proof.caption}”</p>
      )}

      <div className="rounded-card bg-brand-orange/10 p-3">
        <p className="font-caption text-xs text-content-secondary">
          Este número no coincide con ningún paciente. Identifica quién es y, si corresponde,
          guarda este teléfono en su ficha (Pacientes) para que sus próximos comprobantes se
          asocien solos. Luego descártalo aquí.
        </p>
      </div>

      <div>
        <Button variant="ghost" disabled={busy} onClick={() => onDismiss(proof)}>
          Descartar
        </Button>
      </div>
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

  const { pendingMatched, pendingUnmatched, processed } = useMemo(() => {
    const proofs = data?.proofs || []
    const pending = proofs.filter((p) => !p.reconciledAt)
    return {
      pendingMatched: pending.filter((p) => p.patient),
      pendingUnmatched: pending.filter((p) => !p.patient),
      processed: proofs.filter((p) => p.reconciledAt),
    }
  }, [data])

  const handleConfirm = async (proof, sessionIds, metodo) => {
    setBusyId(proof.id)
    setError(null)
    const res = await confirmProofPayment(proof.id, sessionIds, metodo)
    setBusyId(null)
    if (res.ok) await load()
    else setError(res.error || 'No se pudo confirmar el pago.')
  }

  const handleDismiss = async (proof) => {
    setBusyId(proof.id)
    setError(null)
    const res = await dismissProof(proof.id)
    setBusyId(null)
    if (res.ok) await load()
    else setError(res.error || 'No se pudo descartar el comprobante.')
  }

  if (!data) {
    return (
      <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2">
        {[0, 1].map((i) => (
          <div key={i} className="h-80 animate-pulse rounded-card bg-white/50" />
        ))}
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
            Pagos recibidos por WhatsApp en los últimos 7 días · confírmalos para registrarlos.
            No verificado con el banco: revisa cada comprobante antes de marcar pagado.
          </p>
        </div>
        <Badge variant={totalPending ? 'lavender' : 'neutral'}>
          {totalPending} {totalPending === 1 ? 'pendiente' : 'pendientes'}
        </Badge>
      </div>

      {error && (
        <div className="rounded-card bg-brand-pink/15 p-3">
          <p className="font-caption text-xs font-bold text-rose-700">{error}</p>
        </div>
      )}

      {data.source === 'error' && (
        <div className="rounded-card bg-brand-orange/10 p-3">
          <p className="font-caption text-xs text-content-secondary">
            No se pudieron cargar los comprobantes en este momento.
          </p>
        </div>
      )}

      {totalPending === 0 && data.source !== 'error' && (
        <Card className="p-6 text-center">
          <p className="font-heading text-sm font-bold text-content-primary">Todo al día</p>
          <p className="mt-1 font-caption text-xs text-content-muted">
            No hay comprobantes pendientes de los últimos 7 días.
          </p>
        </Card>
      )}

      {pendingMatched.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {pendingMatched.map((p) => (
            <MatchedCard
              key={p.id}
              proof={p}
              busy={busyId === p.id}
              onConfirm={handleConfirm}
              onDismiss={handleDismiss}
            />
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
              <UnmatchedCard
                key={p.id}
                proof={p}
                busy={busyId === p.id}
                onDismiss={handleDismiss}
              />
            ))}
          </div>
        </div>
      )}

      {processed.length > 0 && (
        <div>
          <button
            onClick={() => setShowProcessed((v) => !v)}
            className="font-caption text-xs font-bold text-brand-lavender hover:underline"
          >
            {showProcessed ? 'Ocultar' : 'Ver'} procesados ({processed.length})
          </button>
          {showProcessed && (
            <div className="mt-2 grid grid-cols-1 gap-2">
              {processed.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-card bg-white/60 px-4 py-2"
                >
                  <span className="font-heading text-sm text-content-primary">
                    {p.patient ? patientLabel(p.patient) : p.waName || p.fromPhone || 'Desconocido'}
                  </span>
                  <span className="font-caption text-xs text-content-muted">
                    {p.reconciledSessionIds?.length
                      ? `${p.reconciledSessionIds.length} sesión(es) marcada(s)`
                      : 'Descartado'}
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
