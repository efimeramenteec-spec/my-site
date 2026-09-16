import React, { useEffect, useState } from 'react'
import {
  THERAPIST_QUESTION, CHECKIN_OPTIONS, PATIENT_COMPONENTS,
  getSessionCheckins, setTherapistCheckin,
} from '../../lib/checkins.js'

const answerLabel = (v) => (v == null ? '—' : CHECKIN_OPTIONS.find((o) => o.value === v)?.label ?? '—')
const answerTone = (v) => (v === 2 ? 'text-teal-600' : v === 1 ? 'text-amber-600' : v === 0 ? 'text-rose-500' : 'text-content-muted')

// Therapist side of the mirrored check-in, shown on a completed session.
// One tap; writes immediately (independent of the scheduling form's save).
export function AllianceCheckin({ session }) {
  const [patient, setPatient] = useState(null)
  const [progress, setProgress] = useState(null) // therapist's own answer
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    getSessionCheckins(session.id).then((r) => {
      if (!alive) return
      setPatient(r.patient)
      setProgress(r.therapist?.t_progress ?? null)
      setLoading(false)
    })
    return () => { alive = false }
  }, [session.id])

  async function choose(value) {
    if (saving) return
    const prev = progress
    setProgress(value) // optimistic
    setSaving(true)
    setError('')
    const { error: e } = await setTherapistCheckin(session, value)
    setSaving(false)
    if (e) { setProgress(prev); setError('No se pudo guardar. Intenta de nuevo.') }
  }

  // In-session divergence on the "avance" dimension — the signal worth a word.
  const diverges =
    progress != null && patient?.q_goals != null && Math.abs(progress - patient.q_goals) >= 2

  return (
    <div className="space-y-4 rounded-card border border-stroke/60 bg-surface-warm/60 p-5">
      <div>
        <h3 className="font-heading text-sm font-bold text-content-secondary">Alianza · check-in</h3>
        <p className="font-caption text-xs text-content-muted">Comparar, nunca calificar · dos miradas de la misma sesión.</p>
      </div>

      {/* Therapist's one tap */}
      <div className="space-y-2">
        <p className="font-heading text-sm font-bold text-content-primary">{THERAPIST_QUESTION}</p>
        <div className="grid grid-cols-3 gap-2">
          {CHECKIN_OPTIONS.map((o) => {
            const on = progress === o.value
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => choose(o.value)}
                disabled={saving || loading}
                className={[
                  'rounded-xl py-2 font-heading text-sm font-bold transition-all duration-200',
                  on
                    ? 'bg-brand-lavender text-white shadow-soft'
                    : 'border border-stroke bg-white text-content-secondary hover:border-brand-lavender/50',
                ].join(' ')}
              >
                {o.label}
              </button>
            )
          })}
        </div>
        {error && <p className="font-caption text-xs text-rose-500">{error}</p>}
      </div>

      {/* Patient's view — the comparison */}
      {loading ? null : patient ? (
        <div className="space-y-2 rounded-xl border border-stroke/50 bg-white/70 p-4">
          <p className="font-caption text-xs uppercase tracking-wide text-content-muted">Cómo lo vivió el paciente</p>
          {PATIENT_COMPONENTS.map((c) => (
            <div key={c.key} className="flex items-center justify-between">
              <span className="font-body text-sm text-content-secondary">{c.label}</span>
              <span className={`font-heading text-sm font-bold ${answerTone(patient[c.key])}`}>{answerLabel(patient[c.key])}</span>
            </div>
          ))}
          {diverges && (
            <p className="mt-1 rounded-lg bg-amber-50 px-3 py-2 font-caption text-xs text-amber-700">
              Sus miradas sobre el avance difieren — vale la pena abrir la próxima sesión con esto.
            </p>
          )}
        </div>
      ) : (
        <p className="font-caption text-xs text-content-muted">El paciente aún no ha respondido su check-in.</p>
      )}
    </div>
  )
}
