import React, { useEffect, useState } from 'react'
import { Button } from '../../components/Button/Button.jsx'
import { Select } from '../../components/Select/Select.jsx'
import { PatientSelect } from './PatientSelect.jsx'
import { dateKey, addMinutesToTime, formatTime, fullName } from '../../lib/format.js'
import { TIPO_FORM, MODALIDAD, DURACION_MIN, TARIFA_DEFAULT, toOptions } from '../../lib/constants.js'
import { findConflict } from '../../lib/conflicts.js'

const nativeInput =
  'w-full rounded-xl bg-white border border-stroke px-4 py-3 font-body text-content-primary ' +
  'focus:border-brand-lavender focus:outline-none focus:ring-2 focus:ring-brand-lavender/20 transition-all duration-200'

function Field({ label, children, error }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-heading text-sm font-bold text-content-secondary">{label}</label>
      {children}
      {error && <p className="font-caption text-xs text-red-500">{error}</p>}
    </div>
  )
}

function durLabel(min) {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h} h${m ? ` ${m} min` : ''}`
}

function blankForm(defaultDate, therapists) {
  return {
    patient_id: '',
    terapeuta_id: therapists[0]?.id || '',
    fecha: defaultDate || dateKey(new Date()),
    hora_inicio: '10:00',
    tipo: 'individual',
    modalidad: 'presencial',
    monto: TARIFA_DEFAULT,
  }
}

export function SesionDrawer({ open, mode = 'create', initial, defaultDate, patients = [], therapists = [], sessions = [], onClose, onSubmit }) {
  const [form, setForm] = useState(() => blankForm(defaultDate, therapists))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && initial) {
      setForm({
        patient_id: initial.patient_id || '',
        terapeuta_id: initial.terapeuta_id || therapists[0]?.id || '',
        fecha: initial.fecha,
        hora_inicio: (initial.hora_inicio || '').slice(0, 5),
        tipo: initial.tipo || 'individual',
        modalidad: initial.modalidad || 'presencial',
        monto: initial.monto ?? TARIFA_DEFAULT,
      })
    } else {
      setForm(blankForm(defaultDate, therapists))
    }
    setErrors({})
    setSubmitError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, initial])

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }))

  // Picking a patient pre-fills their fixed rate (still editable).
  const onPatient = (id) => {
    const p = patients.find((x) => x.id === id)
    setForm((f) => ({ ...f, patient_id: id, monto: p?.tarifa ?? f.monto }))
  }

  const dur = DURACION_MIN[form.tipo] || 75
  const endTime = form.hora_inicio ? addMinutesToTime(form.hora_inicio, dur) : ''
  const conflict = findConflict(
    sessions,
    { terapeuta_id: form.terapeuta_id, fecha: form.fecha, hora_inicio: form.hora_inicio, tipo: form.tipo },
    mode === 'edit' && initial ? initial.id : null,
  )

  function validate() {
    const e = {}
    if (!form.patient_id) e.patient_id = 'Selecciona un paciente'
    if (!form.terapeuta_id) e.terapeuta_id = 'Selecciona un terapeuta'
    if (!form.fecha) e.fecha = 'Elige una fecha'
    if (!form.hora_inicio) e.hora_inicio = 'Elige una hora'
    if (form.monto === '' || Number(form.monto) < 0) e.monto = 'Tarifa inválida'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(ev) {
    ev.preventDefault()
    if (!validate()) return
    if (conflict) {
      setSubmitError('Hay un conflicto de horario. Cambia la fecha u hora.')
      return
    }
    setSaving(true)
    setSubmitError('')
    const patient = patients.find((p) => p.id === form.patient_id)
    const base = {
      patient_id: form.patient_id,
      terapeuta_id: form.terapeuta_id,
      fecha: form.fecha,
      hora_inicio: form.hora_inicio + ':00',
      hora_fin: addMinutesToTime(form.hora_inicio, dur) + ':00',
      tipo: form.tipo,
      modalidad: form.modalidad,
      monto: Number(form.monto),
    }
    const payload =
      mode === 'edit' && initial
        ? { ...base, estado: initial.estado, pagado: initial.pagado, metodo_pago: initial.metodo_pago }
        : { ...base, estado: 'programada', pagado: false, metodo_pago: patient?.metodo_pago || 'transferencia' }

    const res = await onSubmit(payload)
    setSaving(false)
    if (res?.ok) onClose()
    else setSubmitError(res?.error || 'No se pudo guardar. Intenta de nuevo.')
  }

  const therapistOptions = therapists.map((t) => ({ value: t.id, label: fullName(t) }))

  return (
    <div className={`fixed inset-0 z-40 ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/20 backdrop-blur-[2px] transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
      />
      <form
        onSubmit={handleSubmit}
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-white/80 bg-white/90 shadow-card backdrop-blur-xl transition-transform duration-300 ease-out ${open ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-stroke/60 px-6 py-5">
          <h2 className="font-serif text-2xl font-bold text-content-primary">
            {mode === 'edit' ? 'Editar sesión' : 'Nueva sesión'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full text-content-muted transition-colors hover:bg-surface-warm hover:text-content-primary"
            aria-label="Cerrar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
          <PatientSelect patients={patients} value={form.patient_id} onChange={onPatient} error={errors.patient_id} />

          <Select label="Terapeuta" options={therapistOptions} value={form.terapeuta_id} onChange={(e) => set('terapeuta_id', e.target.value)} error={errors.terapeuta_id} placeholder="Seleccionar…" />

          <Field label="Fecha" error={errors.fecha}>
            <input type="date" className={nativeInput} value={form.fecha} onChange={(e) => set('fecha', e.target.value)} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Hora inicio" error={errors.hora_inicio}>
              <input type="time" className={nativeInput} value={form.hora_inicio} onChange={(e) => set('hora_inicio', e.target.value)} />
            </Field>
            <Select label="Tipo" options={toOptions(TIPO_FORM)} value={form.tipo} onChange={(e) => set('tipo', e.target.value)} placeholder="Tipo…" />
          </div>

          {/* Auto-computed duration → end time */}
          <div className="flex items-center justify-between rounded-card border border-stroke/50 bg-brand-lavender/5 px-4 py-3">
            <span className="font-caption text-xs text-content-muted">Duración {durLabel(dur)} (incluye buffer)</span>
            <span className="font-heading text-sm font-bold text-content-primary">
              Termina {endTime ? formatTime(endTime) : '—'}
            </span>
          </div>

          {conflict && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
              <p className="font-heading text-sm font-bold text-rose-700">Conflicto de horario</p>
              <p className="mt-0.5 font-caption text-xs text-rose-600">
                {fullName(conflict.therapist)} ya tiene a {fullName(conflict.patient)} de {formatTime(conflict.hora_inicio)} a {formatTime(conflict.hora_fin)}.
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Select label="Modalidad" options={toOptions(MODALIDAD)} value={form.modalidad} onChange={(e) => set('modalidad', e.target.value)} placeholder="Modalidad…" />
            <Field label="Tarifa (USD)" error={errors.monto}>
              <input type="number" min="0" step="1" className={nativeInput} value={form.monto} onChange={(e) => set('monto', e.target.value)} />
            </Field>
          </div>

          <p className="font-caption text-xs text-content-muted">
            Se agenda como <span className="font-bold text-content-secondary">pendiente de confirmación</span> y sin pagar. La confirmación y el pago se gestionan en la vista de Lista.
          </p>

          {submitError && <p className="rounded-xl bg-red-50 px-4 py-3 font-caption text-sm text-red-600">{submitError}</p>}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-stroke/60 px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={saving || !!conflict}>
            {saving ? 'Guardando…' : mode === 'edit' ? 'Guardar cambios' : 'Crear sesión'}
          </Button>
        </div>
      </form>
    </div>
  )
}
