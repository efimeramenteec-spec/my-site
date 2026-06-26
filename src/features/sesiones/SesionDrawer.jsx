import React, { useEffect, useState } from 'react'
import { Button } from '../../components/Button/Button.jsx'
import { Select } from '../../components/Select/Select.jsx'
import { Toggle } from '../../components/Toggle/Toggle.jsx'
import { PatientSelect } from './PatientSelect.jsx'
import { dateKey, addMinutesToTime, fullName } from '../../lib/format.js'
import { TIPO_SESION, MODALIDAD, METODO_PAGO, ESTADO_SESION, toOptions } from '../../lib/constants.js'

const PRECIO = { individual: 1000, pareja: 1400, familia: 1500, grupo: 600, evaluacion: 1800 }

const nativeInput =
  'w-full rounded-xl bg-white border border-stroke px-4 py-3 font-body text-content-primary ' +
  'focus:border-brand-lavender focus:outline-none focus:ring-2 focus:ring-brand-lavender/20 ' +
  'transition-all duration-200'

function Field({ label, children, error }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="font-heading text-sm font-bold text-content-secondary">{label}</label>
      {children}
      {error && <p className="font-caption text-xs text-red-500">{error}</p>}
    </div>
  )
}

function blankForm(defaultDate, therapists) {
  return {
    patient_id: '',
    terapeuta_id: therapists[0]?.id || '',
    fecha: defaultDate || dateKey(new Date()),
    hora_inicio: '10:00',
    hora_fin: '10:50',
    tipo: 'individual',
    modalidad: 'presencial',
    estado: 'programada',
    monto: PRECIO.individual,
    metodo_pago: 'pendiente',
    pagado: false,
  }
}

export function SesionDrawer({ open, mode = 'create', initial, defaultDate, patients = [], therapists = [], onClose, onSubmit }) {
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
        hora_fin: (initial.hora_fin || '').slice(0, 5),
        tipo: initial.tipo || 'individual',
        modalidad: initial.modalidad || 'presencial',
        estado: initial.estado || 'programada',
        monto: initial.monto ?? PRECIO.individual,
        metodo_pago: initial.metodo_pago || 'pendiente',
        pagado: !!initial.pagado,
      })
    } else {
      setForm(blankForm(defaultDate, therapists))
    }
    setErrors({})
    setSubmitError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, initial])

  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }))

  const onTipo = (tipo) => setForm((f) => ({ ...f, tipo, monto: PRECIO[tipo] ?? f.monto }))
  const onInicio = (hora_inicio) => setForm((f) => ({ ...f, hora_inicio, hora_fin: addMinutesToTime(hora_inicio, 50) }))
  const onPagado = (pagado) =>
    setForm((f) => ({
      ...f,
      pagado,
      metodo_pago: pagado ? (f.metodo_pago === 'pendiente' ? 'efectivo' : f.metodo_pago) : 'pendiente',
    }))

  function validate() {
    const e = {}
    if (!form.patient_id) e.patient_id = 'Selecciona un paciente'
    if (!form.terapeuta_id) e.terapeuta_id = 'Selecciona un terapeuta'
    if (!form.fecha) e.fecha = 'Elige una fecha'
    if (!form.hora_inicio) e.hora_inicio = 'Elige una hora'
    if (form.monto === '' || Number(form.monto) < 0) e.monto = 'Monto inválido'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(ev) {
    ev.preventDefault()
    if (!validate()) return
    setSaving(true)
    setSubmitError('')
    const payload = {
      patient_id: form.patient_id,
      terapeuta_id: form.terapeuta_id,
      fecha: form.fecha,
      hora_inicio: form.hora_inicio + ':00',
      hora_fin: form.hora_fin ? form.hora_fin + ':00' : null,
      tipo: form.tipo,
      modalidad: form.modalidad,
      estado: form.estado,
      monto: Number(form.monto),
      pagado: form.pagado,
      metodo_pago: form.metodo_pago,
    }
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
        {/* Header */}
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

        {/* Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
          <PatientSelect
            patients={patients}
            value={form.patient_id}
            onChange={(id) => set('patient_id', id)}
            error={errors.patient_id}
          />

          <Select
            label="Terapeuta"
            options={therapistOptions}
            value={form.terapeuta_id}
            onChange={(e) => set('terapeuta_id', e.target.value)}
            error={errors.terapeuta_id}
            placeholder="Seleccionar…"
          />

          <Field label="Fecha" error={errors.fecha}>
            <input type="date" className={nativeInput} value={form.fecha} onChange={(e) => set('fecha', e.target.value)} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Hora inicio" error={errors.hora_inicio}>
              <input type="time" className={nativeInput} value={form.hora_inicio} onChange={(e) => onInicio(e.target.value)} />
            </Field>
            <Field label="Hora fin">
              <input type="time" className={nativeInput} value={form.hora_fin} onChange={(e) => set('hora_fin', e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Select label="Tipo" options={toOptions(TIPO_SESION)} value={form.tipo} onChange={(e) => onTipo(e.target.value)} placeholder="Tipo…" />
            <Select label="Modalidad" options={toOptions(MODALIDAD)} value={form.modalidad} onChange={(e) => set('modalidad', e.target.value)} placeholder="Modalidad…" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Monto (MXN)" error={errors.monto}>
              <input type="number" min="0" step="50" className={nativeInput} value={form.monto} onChange={(e) => set('monto', e.target.value)} />
            </Field>
            <Select label="Método de pago" options={toOptions(METODO_PAGO)} value={form.metodo_pago} onChange={(e) => set('metodo_pago', e.target.value)} placeholder="Método…" />
          </div>

          <div className="flex items-center justify-between rounded-card border border-stroke/60 bg-white/60 px-4 py-3">
            <span className="font-heading text-sm font-bold text-content-secondary">¿Pagada?</span>
            <Toggle checked={form.pagado} onChange={onPagado} />
          </div>

          <Select label="Estado" options={toOptions(ESTADO_SESION)} value={form.estado} onChange={(e) => set('estado', e.target.value)} placeholder="Estado…" />

          {submitError && (
            <p className="rounded-xl bg-red-50 px-4 py-3 font-caption text-sm text-red-600">{submitError}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-stroke/60 px-6 py-4">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Guardando…' : mode === 'edit' ? 'Guardar cambios' : 'Crear sesión'}
          </Button>
        </div>
      </form>
    </div>
  )
}
