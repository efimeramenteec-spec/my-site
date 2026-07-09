import React, { useEffect, useState } from 'react'
import { Button } from '../../components/Button/Button.jsx'
import { Select } from '../../components/Select/Select.jsx'
import { PatientSelect } from './PatientSelect.jsx'
import { dateKey, addDays, addMinutesToTime, formatTime, fullName } from '../../lib/format.js'
import { TIPO_FORM, MODALIDAD, DURACION_MIN, TARIFA_DEFAULT, toOptions } from '../../lib/constants.js'
import { findConflict } from '../../lib/conflicts.js'
import { checkFreebusy } from '../../lib/queries.js'

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

const blankPatient = () => ({ nombre: '', apellido: '', telefono: '+593', email: '', cedula: '', motivo_consulta: '' })

export function SesionDrawer({ open, mode = 'create', initial, defaultDate, patients = [], therapists = [], sessions = [], fullAccess = true, terapeutaId = null, onClose, onSubmit, onCreatePatient }) {
  const [form, setForm] = useState(() => blankForm(defaultDate, therapists))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [calBusy, setCalBusy] = useState(false)
  // Inline "crear paciente" mini-form (null = closed).
  const [newPatient, setNewPatient] = useState(null)
  const [npErrors, setNpErrors] = useState({})
  const [npSaving, setNpSaving] = useState(false)
  const [npError, setNpError] = useState('')

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
    setNewPatient(null)
    setNpErrors({})
    setNpError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, initial])

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }))
  const setNp = (key, val) => setNewPatient((p) => ({ ...p, [key]: val }))

  // Create a patient inline, auto-assigned to the right therapist, then select
  // them into the session. Therapists get themselves; the owner gets whichever
  // therapist the session is currently set to. Tarifa/método use DB defaults.
  async function handleCreatePatient() {
    const e = {}
    if (!newPatient.nombre.trim()) e.nombre = 'Requerido'
    if (!newPatient.apellido.trim()) e.apellido = 'Requerido'
    if (!newPatient.telefono.trim() || newPatient.telefono.trim() === '+593') e.telefono = 'Requerido'
    // Email + cédula required so the patient can be invoiced in Contífico.
    if (!newPatient.email.trim()) e.email = 'Requerido para facturar'
    else if (!newPatient.email.includes('@')) e.email = 'Email inválido'
    if (!newPatient.cedula.trim()) e.cedula = 'Requerido para facturar'
    setNpErrors(e)
    if (Object.keys(e).length) return

    const assignTo = fullAccess ? form.terapeuta_id : terapeutaId
    if (!assignTo) { setNpError('No se pudo determinar el terapeuta.'); return }

    setNpSaving(true)
    setNpError('')
    const res = await onCreatePatient({
      nombre: newPatient.nombre.trim(),
      apellido: newPatient.apellido.trim(),
      telefono: newPatient.telefono.trim(),
      email: newPatient.email.trim() || null,
      cedula: newPatient.cedula.trim() || null,
      motivo_consulta: newPatient.motivo_consulta.trim() || null,
      terapeuta_id: assignTo,
    })
    setNpSaving(false)
    if (res?.ok && res.data) {
      onPatient(res.data.id)
      setNewPatient(null)
      setNpErrors({})
    } else {
      setNpError(res?.error || 'No se pudo crear el paciente.')
    }
  }

  // Picking a patient pre-fills their fixed rate (still editable).
  const onPatient = (id) => {
    const p = patients.find((x) => x.id === id)
    setForm((f) => ({
      ...f,
      patient_id: id,
      monto: p?.tarifa ?? f.monto,
      terapeuta_id: p?.terapeuta_id ?? f.terapeuta_id,
    }))
  }

  // Pending-payments warning (Nicolas, 2026-07-04): if the chosen patient has
  // unpaid real sessions and the oldest debt is 5+ days old, warn loudly.
  // Deliberately a NOTICE, never a block — some trusted patients are allowed
  // to pay late at the practice's discretion.
  // Real debt = a session that ACTUALLY HAPPENED and wasn't paid. That means
  // estado 'confirmada' (the patient attended) AND fecha in the past (Nicolas,
  // 2026-07-09). A still-'programada' (Pendiente) session — even a past-dated
  // one — is NOT debt: it was never confirmed to have taken place. Llamadas are
  // free, so they never count.
  const unpaid = (() => {
    if (!form.patient_id) return { count: 0, old: false }
    const today = dateKey(new Date())
    const cutoff = dateKey(addDays(new Date(), -5))
    const rows = sessions.filter(
      (s) =>
        s.patient_id === form.patient_id &&
        !s.pagado &&
        s.tipo !== 'llamada' &&
        s.estado === 'confirmada' &&
        s.fecha < today &&
        (mode !== 'edit' || !initial || s.id !== initial.id),
    )
    return { count: rows.length, old: rows.some((s) => s.fecha <= cutoff) }
  })()

  const dur = DURACION_MIN[form.tipo] || 75
  const endTime = form.hora_inicio ? addMinutesToTime(form.hora_inicio, dur) : ''
  const conflict = findConflict(
    sessions,
    { terapeuta_id: form.terapeuta_id, fecha: form.fecha, hora_inicio: form.hora_inicio, tipo: form.tipo },
    mode === 'edit' && initial ? initial.id : null,
  )

  // Soft Google Calendar conflict check: once date, time and therapist are
  // chosen, ask that therapist's calendar whether the window is already busy.
  // Best-effort and NON-blocking — checkFreebusy swallows failures (returns []),
  // a therapist without calendar_email is skipped, and an overlap only warns.
  useEffect(() => {
    const therapist = therapists.find((t) => t.id === form.terapeuta_id)
    const email = therapist?.calendar_email
    if (!open || !email || !form.fecha || !form.hora_inicio || !endTime) {
      setCalBusy(false)
      return
    }
    let alive = true
    const handle = setTimeout(async () => {
      const busy = await checkFreebusy(email, form.fecha, form.hora_inicio, endTime)
      if (alive) setCalBusy(Array.isArray(busy) && busy.length > 0)
    }, 350)
    return () => { alive = false; clearTimeout(handle) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.terapeuta_id, form.fecha, form.hora_inicio, endTime, therapists])

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
          <PatientSelect
            patients={patients}
            value={form.patient_id}
            onChange={onPatient}
            error={errors.patient_id}
            onCreateNew={onCreatePatient ? () => { setNewPatient(blankPatient()); setNpErrors({}); setNpError('') } : undefined}
          />

          {unpaid.old && (
            <div className="rounded-xl border-2 border-red-400 bg-red-50 px-4 py-3">
              <p className="font-heading text-sm font-extrabold uppercase tracking-wide text-red-600">
                El paciente tiene ({unpaid.count}) {unpaid.count === 1 ? 'sesión pendiente' : 'sesiones pendientes'} de
                pago. Solicitar pago previo a finalizar el agendamiento.
              </p>
            </div>
          )}

          {form.patient_id ? (
            <Field label="Terapeuta">
              <div className="w-full rounded-xl bg-surface-warm border border-stroke px-4 py-3 font-body text-content-secondary cursor-default">
                {therapistOptions.find((t) => t.value === form.terapeuta_id)?.label || '—'}
              </div>
            </Field>
          ) : (
            <Select label="Terapeuta" options={therapistOptions} value={form.terapeuta_id} onChange={(e) => set('terapeuta_id', e.target.value)} error={errors.terapeuta_id} placeholder="Seleccionar…" />
          )}

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

          {calBusy && !conflict && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="font-caption text-xs text-amber-700">
                La terapeuta tiene un evento en Google Calendar en ese horario.
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

        {/* Inline "crear paciente" overlay — covers the drawer while open. */}
        {newPatient && (
          <div className="absolute inset-0 z-10 flex flex-col bg-white/95 backdrop-blur-xl">
            <div className="flex items-center justify-between border-b border-stroke/60 px-6 py-5">
              <h3 className="font-serif text-xl font-bold text-content-primary">Nuevo paciente</h3>
              <button
                type="button"
                onClick={() => setNewPatient(null)}
                className="flex h-9 w-9 items-center justify-center rounded-full text-content-muted transition-colors hover:bg-surface-warm hover:text-content-primary"
                aria-label="Cerrar"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
              <div className="grid grid-cols-2 gap-4">
                <Field label="Nombre" error={npErrors.nombre}>
                  <input autoFocus className={nativeInput} value={newPatient.nombre} onChange={(e) => setNp('nombre', e.target.value)} />
                </Field>
                <Field label="Apellido" error={npErrors.apellido}>
                  <input className={nativeInput} value={newPatient.apellido} onChange={(e) => setNp('apellido', e.target.value)} />
                </Field>
              </div>

              <Field label="Teléfono" error={npErrors.telefono}>
                <input type="tel" className={nativeInput} value={newPatient.telefono} onChange={(e) => setNp('telefono', e.target.value)} placeholder="+593…" />
              </Field>

              <Field label="Email" error={npErrors.email}>
                <input type="email" className={nativeInput} value={newPatient.email} onChange={(e) => setNp('email', e.target.value)} />
              </Field>

              <Field label="Cédula / RUC" error={npErrors.cedula}>
                <input className={nativeInput} value={newPatient.cedula} onChange={(e) => setNp('cedula', e.target.value)} placeholder="Requerido para facturar" />
              </Field>

              <Field label="Motivo de consulta">
                <textarea
                  value={newPatient.motivo_consulta}
                  onChange={(e) => setNp('motivo_consulta', e.target.value)}
                  rows={2}
                  placeholder="Ej. Ansiedad, duelo, terapia de pareja…"
                  className="w-full resize-none rounded-xl border border-stroke bg-white px-4 py-3 font-body text-content-primary placeholder:text-content-muted focus:border-brand-lavender focus:outline-none focus:ring-2 focus:ring-brand-lavender/20"
                />
              </Field>

              <p className="font-caption text-xs text-content-muted">
                {(() => {
                  const assignTo = fullAccess ? form.terapeuta_id : terapeutaId
                  const t = therapists.find((x) => x.id === assignTo)
                  return t
                    ? `Se asigna a ${fullName(t)}. La tarifa y el método de pago se establecen luego.`
                    : 'La tarifa y el método de pago se establecen luego.'
                })()}
              </p>

              {npError && <p className="rounded-xl bg-red-50 px-4 py-3 font-caption text-sm text-red-600">{npError}</p>}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-stroke/60 px-6 py-4">
              <Button type="button" variant="secondary" onClick={() => setNewPatient(null)} disabled={npSaving}>Cancelar</Button>
              <Button type="button" variant="primary" onClick={handleCreatePatient} disabled={npSaving}>
                {npSaving ? 'Creando…' : 'Crear paciente'}
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  )
}
