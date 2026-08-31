import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'

import { Card } from '../components/Card/Card.jsx'
import { Badge } from '../components/Badge/Badge.jsx'
import { Button } from '../components/Button/Button.jsx'
import { Input } from '../components/Input/Input.jsx'
import { Select } from '../components/Select/Select.jsx'

import { useAuth } from '../lib/auth.jsx'
import { getPatientsData, createPatient, updatePatient, deletePatient } from '../lib/queries.js'
import { formatCurrency, formatTime, formatDateShort, fullName, patientLabel, patientSearchText } from '../lib/format.js'
import { hasPackage as patientHasPackage } from '../lib/packages.js'
import {
  ESTADO_PACIENTE,
  TIPO_PACIENTE,
  METODO_PAGO,
  TIPO_SESION,
  ESTADO_SESION,
  FUENTE_PACIENTE,
  FRECUENCIA_PACIENTE,
  toOptions,
  TARIFA_DEFAULT,
} from '../lib/constants.js'
import {
  IconUsers,
  IconPlus,
  IconChevronRight,
  IconPin,
  IconVideo,
  IconSearch,
  IconX,
  IconPhone,
  IconMail,
} from '../layout/icons.jsx'

// ─── Small helpers ──────────────────────────────────────────────

function TherapistDot({ color }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
      style={{ backgroundColor: color || '#b48ae4' }}
    />
  )
}

function SectionTitle({ children }) {
  return (
    <h3 className="font-heading text-[11px] font-bold uppercase tracking-wider text-content-muted">
      {children}
    </h3>
  )
}

// ─── Patient row (list) ─────────────────────────────────────────

function PatientRow({ patient, therapist, hasPackage = false, isSelected, onClick }) {
  const estado = ESTADO_PACIENTE[patient.estado_general] || { label: patient.estado_general, badge: 'neutral' }

  return (
    <button
      onClick={onClick}
      className={[
        'w-full text-left flex items-center gap-3 px-4 py-3.5',
        'border-b border-stroke/40 last:border-0',
        'transition-colors',
        isSelected
          ? 'bg-brand-lavender/10'
          : 'hover:bg-white/60',
      ].join(' ')}
    >
      <TherapistDot color={therapist?.color} />

      <div className="min-w-0 flex-1">
        <p className="flex items-center font-body font-bold text-content-primary">
          <span className="truncate">{patientLabel(patient)}</span>
          {hasPackage && <span title="Cliente de paquete" className="ml-1 flex-shrink-0 text-amber-500">★</span>}
        </p>
        <p className="mt-0.5 truncate font-caption text-xs text-content-muted">
          {therapist ? `${therapist.nombre} ${therapist.apellido}` : '—'}
          {patient.motivo_consulta ? ` · ${patient.motivo_consulta}` : ''}
        </p>
      </div>

      <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
        <Badge variant={estado.badge}>{estado.label}</Badge>
        <span className="font-caption text-xs text-content-muted">
          {formatCurrency(patient.tarifa)}
        </span>
      </div>

      <IconChevronRight size={16} className="flex-shrink-0 text-content-muted" />
    </button>
  )
}

// ─── Patient detail panel ───────────────────────────────────────

const formFromPatient = (patient) => ({
  tipo_paciente: patient.tipo_paciente || 'individual',
  nombre: patient.nombre || '',
  apellido: patient.apellido || '',
  nombre_2: patient.nombre_2 || '',
  apellido_2: patient.apellido_2 || '',
  telefono: patient.telefono || '',
  email: patient.email || '',
  cedula: patient.cedula || '',
  terapeuta_id: patient.terapeuta_id || '',
  tarifa: String(patient.tarifa ?? TARIFA_DEFAULT),
  metodo_pago: patient.metodo_pago || 'transferencia',
  estado_general: patient.estado_general || 'activo',
  fuente: patient.fuente || '',
  frecuencia: patient.frecuencia || '',
})

function PatientDetail({ patient, therapist, therapists = [], sessions, fullAccess = true, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(() => formFromPatient(patient))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    setForm(formFromPatient(patient))
    setSaved(false)
    setError(null)
  }, [patient.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const handleSave = async () => {
    const isIndividual = form.tipo_paciente === 'individual'
    // Owner can fix identity/contact typos, but these must never be blanked.
    if (fullAccess) {
      if (!form.nombre.trim() || !form.apellido.trim() || !form.telefono.trim()) {
        setError('Nombre, apellido y teléfono no pueden quedar vacíos.')
        return
      }
      if (!isIndividual && (!form.nombre_2.trim() || !form.apellido_2.trim())) {
        setError('La segunda persona necesita nombre y apellido.')
        return
      }
    }
    setSaving(true)
    setError(null)
    // Therapists only edit estado + frecuencia; identity, contact, reassignment,
    // billing and marketing attribution stay owner-only (the RLS WITH CHECK
    // would reject an identity/terapeuta_id change from them anyway).
    const patch = {
      estado_general: form.estado_general,
      frecuencia: form.frecuencia || null,
    }
    if (fullAccess) {
      patch.tipo_paciente = form.tipo_paciente
      patch.nombre = form.nombre.trim()
      patch.apellido = form.apellido.trim()
      patch.nombre_2 = isIndividual ? null : form.nombre_2.trim()
      patch.apellido_2 = isIndividual ? null : form.apellido_2.trim()
      patch.telefono = form.telefono.trim()
      patch.email = form.email.trim() || null
      patch.cedula = form.cedula.trim() || null
      patch.terapeuta_id = form.terapeuta_id || null
      patch.tarifa = parseFloat(form.tarifa) || TARIFA_DEFAULT
      patch.metodo_pago = form.metodo_pago
      patch.fuente = form.fuente || null
    }
    const res = await onSave(patient.id, patch)
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
  }

  const handleDelete = async () => {
    const n = sessions.length
    const detail =
      n > 0
        ? `Se borran el paciente y sus ${n} ${n === 1 ? 'sesión' : 'sesiones'} (incluidos sus eventos de Google Calendar).`
        : 'No tiene sesiones registradas.'
    const ok = window.confirm(
      `¿Eliminar a ${patientLabel(patient)}?\n\n${detail} Esta acción no se puede deshacer.`,
    )
    if (!ok) return
    setDeleting(true)
    const res = await onDelete(patient.id)
    setDeleting(false)
    if (!res.ok) setError(res.error)
  }

  const sorted = useMemo(
    () =>
      [...sessions].sort((a, b) =>
        `${b.fecha} ${b.hora_inicio}`.localeCompare(`${a.fecha} ${a.hora_inicio}`),
      ),
    [sessions],
  )

  const totalPaid = sorted.filter((s) => s.pagado).reduce((a, s) => a + Number(s.monto || 0), 0)

  return (
    // The height clamp lives HERE, not on the wrapping Card: Card inserts its
    // own auto-height div around children, which breaks any h-full chain — a
    // max-height on the Card just clips the panel instead of letting the body
    // scroll (bug: unreachable bottom / no inner scroll).
    <div className="flex flex-col overflow-hidden" style={{ maxHeight: 'calc(100vh - 5rem)' }}>
      {/* Header */}
      <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-stroke/40 px-6 pb-4 pt-6">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            {therapist && <TherapistDot color={therapist.color} />}
            <span className="font-caption text-xs text-content-muted">
              {therapist ? fullName(therapist) : '—'}
            </span>
          </div>
          <h2 className="font-serif text-2xl font-bold leading-tight text-content-primary">
            {patientLabel(patient)}
            {patientHasPackage(sessions) && (
              <span title="Cliente de paquete" className="ml-1.5 text-amber-500">★</span>
            )}
          </h2>
          {patient.motivo_consulta && (
            <p className="mt-1 font-body text-sm text-content-secondary">
              {patient.motivo_consulta}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="flex-shrink-0 rounded-xl p-2 text-content-muted transition-colors hover:bg-white/60 hover:text-content-primary"
          aria-label="Cerrar"
        >
          <IconX size={20} />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
        {/* Contact — read-only for therapists; the owner edits these fields
            (name, phone, email) in Configuración below. */}
        {!fullAccess && (
        <section className="space-y-3">
          <SectionTitle>Contacto</SectionTitle>
          {patient.telefono && (
            <div className="flex items-center gap-2.5">
              <IconPhone size={15} className="flex-shrink-0 text-content-muted" />
              <span className="font-body text-sm text-content-primary">{patient.telefono}</span>
            </div>
          )}
          {patient.email && (
            <div className="flex items-center gap-2.5">
              <IconMail size={15} className="flex-shrink-0 text-content-muted" />
              <span className="font-body text-sm text-content-primary">{patient.email}</span>
            </div>
          )}
          {!patient.telefono && !patient.email && (
            <p className="font-caption text-sm text-content-muted">Sin datos de contacto.</p>
          )}
        </section>
        )}

        {/* Editable settings */}
        <section className="space-y-3">
          <SectionTitle>Configuración</SectionTitle>
          {fullAccess && (
            <>
              <Select
                label="Tipo de paciente"
                value={form.tipo_paciente}
                onChange={(e) => set('tipo_paciente', e.target.value)}
                options={toOptions(TIPO_PACIENTE)}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label={withRole('Nombre', personRoles(form.tipo_paciente).one)}
                  value={form.nombre}
                  onChange={(e) => set('nombre', e.target.value)}
                />
                <Input
                  label={withRole('Apellido', personRoles(form.tipo_paciente).one)}
                  value={form.apellido}
                  onChange={(e) => set('apellido', e.target.value)}
                />
              </div>
              {personRoles(form.tipo_paciente).two && (
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label={withRole('Nombre', personRoles(form.tipo_paciente).two)}
                    value={form.nombre_2}
                    onChange={(e) => set('nombre_2', e.target.value)}
                  />
                  <Input
                    label={withRole('Apellido', personRoles(form.tipo_paciente).two)}
                    value={form.apellido_2}
                    onChange={(e) => set('apellido_2', e.target.value)}
                  />
                </div>
              )}
              <Input
                label="Teléfono"
                type="tel"
                value={form.telefono}
                onChange={(e) => set('telefono', e.target.value)}
                hint="+593…"
              />
              <Input
                label="Email"
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
              />
              <Input
                label="Cédula / RUC"
                value={form.cedula}
                onChange={(e) => set('cedula', e.target.value)}
                hint="Requerido para facturar en Contífico"
              />
              <Select
                label="Terapeuta"
                value={form.terapeuta_id}
                onChange={(e) => set('terapeuta_id', e.target.value)}
                options={therapists.map((t) => ({ value: t.id, label: fullName(t) }))}
                placeholder="Sin asignar…"
              />
              {form.terapeuta_id !== (patient.terapeuta_id || '') && (
                <p className="font-caption text-xs text-amber-600">
                  Reasignar solo cambia el terapeuta del paciente. Las sesiones ya
                  agendadas siguen con el terapeuta anterior.
                </p>
              )}
              <Input
                label="Tarifa por sesión (USD)"
                type="number"
                min="0"
                step="1"
                value={form.tarifa}
                onChange={(e) => set('tarifa', e.target.value)}
              />
              <Select
                label="Método de pago"
                value={form.metodo_pago}
                onChange={(e) => set('metodo_pago', e.target.value)}
                options={toOptions(METODO_PAGO)}
                placeholder={null}
              />
            </>
          )}
          <Select
            label="Estado"
            value={form.estado_general}
            onChange={(e) => set('estado_general', e.target.value)}
            options={toOptions(ESTADO_PACIENTE)}
            placeholder={null}
            hint="Inactivo y Descontinuado salen del Seguimiento (adherencia y en riesgo)."
          />
          <Select
            label="Frecuencia"
            value={form.frecuencia}
            onChange={(e) => set('frecuencia', e.target.value)}
            options={toOptions(FRECUENCIA_PACIENTE)}
            placeholder="Sin definir…"
            hint="Cada cuánto se espera que venga — alimenta la adherencia en Seguimiento."
          />
          {fullAccess && (
            <Select
              label="Fuente"
              value={form.fuente}
              onChange={(e) => set('fuente', e.target.value)}
              options={toOptions(FUENTE_PACIENTE)}
              placeholder="Sin registrar…"
              hint="Marca 'Referido' para excluirlo de la atribución de campañas (Marketing)."
            />
          )}
          {error && <p className="font-caption text-xs text-red-500">{error}</p>}
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={handleSave}
            disabled={saving}
          >
            {saved ? '✓ Guardado' : saving ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </section>

        {/* Expediente removed 2026-08-31 (C1): no clinical/personal free-text
            stored in the app while security isn't guaranteed. */}

        {/* Session history */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <SectionTitle>
              Historial · {sorted.length} {sorted.length === 1 ? 'sesión' : 'sesiones'}
            </SectionTitle>
            {totalPaid > 0 && (
              <span className="font-caption text-xs text-content-muted">
                {formatCurrency(totalPaid)} cobrado
              </span>
            )}
          </div>

          {sorted.length === 0 ? (
            <p className="font-caption text-sm text-content-muted">Sin sesiones registradas.</p>
          ) : (
            <div>
              {sorted.map((s) => {
                const est = ESTADO_SESION[s.estado] || { label: s.estado, badge: 'neutral' }
                const ModIcon = s.modalidad === 'en_linea' ? IconVideo : IconPin
                return (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 border-b border-stroke/30 py-2.5 last:border-0"
                  >
                    <div className="w-16 flex-shrink-0">
                      <p className="font-heading text-xs font-bold text-content-primary">
                        {formatDateShort(s.fecha)}
                      </p>
                      <p className="font-caption text-[11px] text-content-muted">
                        {formatTime(s.hora_inicio)}
                      </p>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 font-caption text-xs text-content-muted">
                        <ModIcon size={12} />
                        <span>{TIPO_SESION[s.tipo] || s.tipo}</span>
                      </div>
                    </div>

                    <Badge variant={est.badge}>{est.label}</Badge>

                    <div className="flex-shrink-0 text-right">
                      <p className="font-heading text-xs font-bold text-content-primary">
                        {formatCurrency(s.monto)}
                      </p>
                      <p
                        className={`font-caption text-[10px] ${
                          s.pagado ? 'text-green-600' : 'text-content-muted'
                        }`}
                      >
                        {s.pagado ? 'Pagado' : 'Pendiente'}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Danger zone — owner only (RLS blocks therapist deletes anyway) */}
        {fullAccess && (
        <section className="border-t border-stroke/40 pt-4">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="w-full rounded-xl border border-red-200 px-4 py-2.5 font-heading text-sm font-bold text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            {deleting ? 'Eliminando…' : 'Eliminar paciente'}
          </button>
          <p className="mt-1.5 text-center font-caption text-[11px] text-content-muted">
            Borra el paciente y todas sus sesiones. No se puede deshacer.
          </p>
        </section>
        )}
      </div>
    </div>
  )
}

// ─── Create patient drawer ──────────────────────────────────────

const EMPTY_FORM = {
  tipo_paciente: 'individual',
  nombre: '',
  apellido: '',
  nombre_2: '',
  apellido_2: '',
  telefono: '',
  email: '',
  cedula: '',
  motivo_consulta: '',
  terapeuta_id: '',
  tarifa: String(TARIFA_DEFAULT),
  metodo_pago: 'transferencia',
  frecuencia: '',
}

// For pareja/menor, the two people get role suffixes on their name fields;
// individual has just one unlabelled person. Person 1 is always the contact
// (the tutor for a minor). Returns null for the second person when individual.
function personRoles(tipo) {
  if (tipo === 'pareja') return { one: 'Persona 1', two: 'Persona 2' }
  if (tipo === 'menor') return { one: 'Tutor', two: 'Menor' }
  return { one: '', two: null }
}
const withRole = (base, role) => (role ? `${base} (${role})` : base)

function CreatePatientDrawer({ therapists, fullAccess = true, terapeutaId = null, onClose, onCreate }) {
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [apiError, setApiError] = useState(null)

  const set = (k, v) => {
    setForm((f) => ({ ...f, [k]: v }))
    if (errors[k]) setErrors((e) => ({ ...e, [k]: null }))
  }

  const validate = () => {
    const e = {}
    if (!form.nombre.trim()) e.nombre = 'Requerido'
    if (!form.apellido.trim()) e.apellido = 'Requerido'
    // Pareja/Menor need the second person's name too.
    if (form.tipo_paciente !== 'individual') {
      if (!form.nombre_2.trim()) e.nombre_2 = 'Requerido'
      if (!form.apellido_2.trim()) e.apellido_2 = 'Requerido'
    }
    if (!form.telefono.trim()) e.telefono = 'Requerido'
    // Email + cédula are required to be able to invoice the patient in Contífico.
    if (!form.email.trim()) e.email = 'Requerido para facturar'
    else if (!form.email.includes('@')) e.email = 'Email inválido'
    if (!form.cedula.trim()) e.cedula = 'Requerido para facturar'
    if (fullAccess && !form.terapeuta_id) e.terapeuta_id = 'Selecciona un terapeuta'
    if (fullAccess && (!form.tarifa || isNaN(parseFloat(form.tarifa)))) e.tarifa = 'Ingresa un valor'
    return e
  }

  const handleSubmit = async () => {
    const e = validate()
    if (Object.keys(e).length) {
      setErrors(e)
      return
    }
    setSaving(true)
    setApiError(null)
    // Therapists create patients assigned to THEMSELVES with default billing
    // (mirrors the inline create in SesionDrawer; RLS enforces the same).
    const isIndividual = form.tipo_paciente === 'individual'
    const res = await onCreate({
      tipo_paciente: form.tipo_paciente,
      nombre: form.nombre.trim(),
      apellido: form.apellido.trim(),
      nombre_2: isIndividual ? null : form.nombre_2.trim(),
      apellido_2: isIndividual ? null : form.apellido_2.trim(),
      telefono: form.telefono.trim(),
      email: form.email.trim() || null,
      cedula: form.cedula.trim() || null,
      motivo_consulta: form.motivo_consulta.trim() || null,
      terapeuta_id: fullAccess ? form.terapeuta_id : terapeutaId,
      estado_general: 'activo',
      frecuencia: form.frecuencia || null,
      ...(fullAccess ? { tarifa: parseFloat(form.tarifa), metodo_pago: form.metodo_pago } : {}),
    })
    setSaving(false)
    if (!res.ok) {
      setApiError(res.error)
    }
  }

  const therapistOptions = therapists.map((t) => ({
    value: t.id,
    label: fullName(t),
  }))

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-surface-warm shadow-glow">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-stroke/40 px-6 py-5">
          <h2 className="font-serif text-xl font-bold text-content-primary">Nuevo Paciente</h2>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-content-muted transition-colors hover:bg-white/60 hover:text-content-primary"
            aria-label="Cerrar"
          >
            <IconX size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <Select
            label="Tipo de paciente"
            value={form.tipo_paciente}
            onChange={(e) => set('tipo_paciente', e.target.value)}
            options={toOptions(TIPO_PACIENTE)}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label={withRole('Nombre', personRoles(form.tipo_paciente).one)}
              value={form.nombre}
              onChange={(e) => set('nombre', e.target.value)}
              error={errors.nombre}
              autoFocus
            />
            <Input
              label={withRole('Apellido', personRoles(form.tipo_paciente).one)}
              value={form.apellido}
              onChange={(e) => set('apellido', e.target.value)}
              error={errors.apellido}
            />
          </div>

          {personRoles(form.tipo_paciente).two && (
            <div className="grid grid-cols-2 gap-3">
              <Input
                label={withRole('Nombre', personRoles(form.tipo_paciente).two)}
                value={form.nombre_2}
                onChange={(e) => set('nombre_2', e.target.value)}
                error={errors.nombre_2}
              />
              <Input
                label={withRole('Apellido', personRoles(form.tipo_paciente).two)}
                value={form.apellido_2}
                onChange={(e) => set('apellido_2', e.target.value)}
                error={errors.apellido_2}
              />
            </div>
          )}

          <Input
            label="Teléfono"
            type="tel"
            value={form.telefono}
            onChange={(e) => set('telefono', e.target.value)}
            error={errors.telefono}
            hint="+593…"
          />

          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            error={errors.email}
            hint="Requerido para facturar"
          />

          <Input
            label="Cédula / RUC"
            value={form.cedula}
            onChange={(e) => set('cedula', e.target.value)}
            error={errors.cedula}
            hint="Requerido para facturar"
          />

          <div className="flex flex-col gap-1.5">
            <label className="font-heading text-sm font-bold text-content-secondary">
              Motivo de consulta
            </label>
            <textarea
              value={form.motivo_consulta}
              onChange={(e) => set('motivo_consulta', e.target.value)}
              rows={2}
              placeholder="Ej. Ansiedad, duelo, terapia de pareja…"
              className="w-full resize-none rounded-xl border border-stroke bg-white px-4 py-3 font-body text-content-primary placeholder:text-content-muted focus:border-brand-lavender focus:outline-none focus:ring-2 focus:ring-brand-lavender/20"
            />
          </div>

          {fullAccess && (
            <Select
              label="Terapeuta"
              value={form.terapeuta_id}
              onChange={(e) => set('terapeuta_id', e.target.value)}
              options={therapistOptions}
              placeholder="Seleccionar terapeuta…"
              error={errors.terapeuta_id}
            />
          )}

          <Select
            label="Frecuencia"
            value={form.frecuencia}
            onChange={(e) => set('frecuencia', e.target.value)}
            options={toOptions(FRECUENCIA_PACIENTE)}
            placeholder="Sin definir…"
            hint="Cada cuánto se espera que venga — alimenta la adherencia en Seguimiento."
          />

          {fullAccess ? (
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Tarifa (USD)"
                type="number"
                min="0"
                step="1"
                value={form.tarifa}
                onChange={(e) => set('tarifa', e.target.value)}
                error={errors.tarifa}
              />
              <Select
                label="Método de pago"
                value={form.metodo_pago}
                onChange={(e) => set('metodo_pago', e.target.value)}
                options={toOptions(METODO_PAGO)}
                placeholder={null}
              />
            </div>
          ) : (
            <p className="font-caption text-xs text-content-muted">
              Se asigna a ti. La tarifa y el método de pago se establecen luego.
            </p>
          )}

          {apiError && (
            <p className="font-caption text-sm text-red-500">{apiError}</p>
          )}
        </div>

        <div className="flex flex-shrink-0 gap-3 border-t border-stroke/40 px-6 py-4">
          <Button variant="secondary" size="sm" className="flex-1" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" size="sm" className="flex-1" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Creando…' : 'Crear paciente'}
          </Button>
        </div>
      </div>
    </>
  )
}

// ─── Filter chip ────────────────────────────────────────────────

function FilterChip({ active, onClick, children, style }) {
  return (
    <button
      onClick={onClick}
      style={style}
      className={[
        'rounded-pill px-3 py-1.5 font-heading text-xs font-bold transition-colors',
        active
          ? 'bg-brand-lavender text-white shadow-soft'
          : 'border border-stroke bg-white/60 text-content-secondary hover:bg-white',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

// ─── Main page ──────────────────────────────────────────────────

const ESTADO_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'activo', label: 'Activos' },
  { value: 'inactivo', label: 'Inactivos' },
]

export default function Pacientes() {
  const ctx = useOutletContext()
  // Therapists reach this page too (2026-07-04): RLS already limits their
  // reads/updates to their own patients — fullAccess only gates UI extras
  // (reassign, billing, marketing attribution, delete).
  const { fullAccess, terapeutaId } = useAuth()
  const [data, setData] = useState(null)
  const [search, setSearch] = useState('')
  const [filterEstado, setFilterEstado] = useState('all')
  const [filterTerapeuta, setFilterTerapeuta] = useState('all')
  const [selectedId, setSelectedId] = useState(null)
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    let alive = true
    getPatientsData().then((d) => {
      if (!alive) return
      setData(d)
      ctx?.setDataSource?.(d.source)
    })
    return () => { alive = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const therapistMap = useMemo(() => {
    if (!data) return {}
    return Object.fromEntries(data.therapists.map((t) => [t.id, t]))
  }, [data])

  const filtered = useMemo(() => {
    if (!data) return []
    const q = search.toLowerCase()
    return data.patients.filter((p) => {
      if (filterEstado !== 'all' && p.estado_general !== filterEstado) return false
      if (filterTerapeuta !== 'all' && p.terapeuta_id !== filterTerapeuta) return false
      if (q) {
        const name = patientSearchText(p) // covers both people (pareja/menor)
        const t = therapistMap[p.terapeuta_id]
        const tName = t ? fullName(t).toLowerCase() : ''
        const motivo = (p.motivo_consulta || '').toLowerCase()
        if (!name.includes(q) && !tName.includes(q) && !motivo.includes(q)) return false
      }
      return true
    })
  }, [data, search, filterEstado, filterTerapeuta, therapistMap])

  const selectedPatient = selectedId && data
    ? data.patients.find((p) => p.id === selectedId) || null
    : null
  const patientSessions = selectedId && data
    ? data.sessions.filter((s) => s.patient_id === selectedId)
    : []

  // Patients who have ever bought a package (⭐), derived from anchor sessions.
  const packagePatientIds = useMemo(
    () => new Set((data?.sessions || []).filter((s) => s.package_anchor).map((s) => s.patient_id)),
    [data],
  )

  const handleUpdate = useCallback(async (id, patch) => {
    const res = await updatePatient(id, patch)
    if (res.ok) {
      setData((d) => ({
        ...d,
        patients: d.patients.map((p) => (p.id === id ? { ...p, ...res.data } : p)),
      }))
    }
    return res
  }, [])

  const handleDelete = useCallback(async (id) => {
    const res = await deletePatient(id)
    if (res.ok) {
      setSelectedId(null)
      setData((d) => ({
        ...d,
        patients: d.patients.filter((p) => p.id !== id),
        sessions: d.sessions.filter((s) => s.patient_id !== id),
      }))
    }
    return res
  }, [])

  const handleCreate = useCallback(async (payload) => {
    const res = await createPatient(payload)
    if (res.ok) {
      setData((d) => ({
        ...d,
        patients: [...d.patients, res.data].sort((a, b) => a.nombre.localeCompare(b.nombre)),
      }))
      setShowCreate(false)
      setSelectedId(res.data.id)
    }
    return res
  }, [])

  if (!data) {
    return (
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <div className="h-8 w-36 animate-pulse rounded-xl bg-white/50" />
          <div className="h-9 w-36 animate-pulse rounded-pill bg-white/50" />
        </div>
        <div className="h-10 animate-pulse rounded-xl bg-white/50" />
        <div className="h-[500px] animate-pulse rounded-card bg-white/50" />
      </div>
    )
  }

  const hasPanel = !!selectedPatient

  return (
    <>
      <div className="flex items-start gap-6">
        {/* ── LIST ── */}
        <div className={['flex flex-col gap-4 min-w-0', hasPanel ? 'hidden lg:flex flex-1' : 'flex flex-1'].join(' ')}>
          <div className="flex items-center justify-between gap-3">
            <h1 className="font-serif text-2xl font-bold text-content-primary">
              Pacientes
              <span className="ml-2 font-caption text-base font-normal text-content-muted">
                {data.patients.length}
              </span>
            </h1>
            <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
              <IconPlus size={15} />
              Nuevo Paciente
            </Button>
          </div>

          <div className="relative">
            <IconSearch size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-content-muted" />
            <input
              type="search"
              placeholder="Buscar por nombre, terapeuta, motivo…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-stroke bg-white/70 py-2.5 pl-9 pr-4 font-body text-sm text-content-primary placeholder:text-content-muted backdrop-blur-sm focus:border-brand-lavender focus:outline-none focus:ring-2 focus:ring-brand-lavender/20"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {ESTADO_FILTERS.map((f) => (
              <FilterChip key={f.value} active={filterEstado === f.value} onClick={() => setFilterEstado(f.value)}>
                {f.label}
              </FilterChip>
            ))}
          </div>

          {fullAccess && data.therapists.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <FilterChip active={filterTerapeuta === 'all'} onClick={() => setFilterTerapeuta('all')}>
                Todos
              </FilterChip>
              {data.therapists.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setFilterTerapeuta(t.id)}
                  className={[
                    'flex items-center gap-1.5 rounded-pill px-3 py-1.5 font-heading text-xs font-bold transition-colors',
                    filterTerapeuta === t.id
                      ? 'shadow-soft'
                      : 'border border-stroke bg-white/60 text-content-secondary hover:bg-white',
                  ].join(' ')}
                  style={
                    filterTerapeuta === t.id
                      ? { backgroundColor: t.color + '22', borderColor: t.color, color: t.color, border: '2px solid' }
                      : {}
                  }
                >
                  <TherapistDot color={t.color} />
                  {t.nombre}
                </button>
              ))}
            </div>
          )}

          <Card noPadding>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-card bg-brand-lavender/15 text-purple-500">
                  <IconUsers size={22} />
                </div>
                <p className="font-body text-content-secondary">
                  {search || filterEstado !== 'all' || filterTerapeuta !== 'all'
                    ? 'Sin resultados para estos filtros.'
                    : 'Aún no hay pacientes registrados.'}
                </p>
                {!search && filterEstado === 'all' && filterTerapeuta === 'all' && (
                  <Button variant="secondary" size="sm" onClick={() => setShowCreate(true)} className="mt-2">
                    <IconPlus size={14} />
                    Crear primer paciente
                  </Button>
                )}
              </div>
            ) : (
              filtered.map((p) => (
                <PatientRow
                  key={p.id}
                  patient={p}
                  therapist={therapistMap[p.terapeuta_id]}
                  hasPackage={packagePatientIds.has(p.id)}
                  isSelected={p.id === selectedId}
                  onClick={() => setSelectedId((cur) => (cur === p.id ? null : p.id))}
                />
              ))
            )}
          </Card>
        </div>

        {/* ── DETAIL PANEL ── */}
        {hasPanel && (
          <div className="w-full flex-shrink-0 lg:w-[420px]">
            <button
              onClick={() => setSelectedId(null)}
              className="mb-3 flex items-center gap-1.5 font-heading text-sm font-bold text-brand-lavender lg:hidden"
            >
              ← Lista de pacientes
            </button>
            <Card noPadding className="sticky overflow-hidden" style={{ top: '1.5rem' }}>
              <PatientDetail
                patient={selectedPatient}
                therapist={therapistMap[selectedPatient.terapeuta_id]}
                therapists={data.therapists}
                sessions={patientSessions}
                fullAccess={fullAccess}
                onClose={() => setSelectedId(null)}
                onSave={handleUpdate}
                onDelete={handleDelete}
              />
            </Card>
          </div>
        )}
      </div>

      {showCreate && (
        <CreatePatientDrawer
          therapists={data.therapists}
          fullAccess={fullAccess}
          terapeutaId={terapeutaId}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </>
  )
}
