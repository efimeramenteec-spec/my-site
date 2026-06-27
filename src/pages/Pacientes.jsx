import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'

import { Card } from '../components/Card/Card.jsx'
import { Badge } from '../components/Badge/Badge.jsx'
import { Button } from '../components/Button/Button.jsx'
import { Input } from '../components/Input/Input.jsx'
import { Select } from '../components/Select/Select.jsx'

import { getPatientsData, createPatient, updatePatient } from '../lib/queries.js'
import { formatCurrency, formatTime, formatDateShort, fullName } from '../lib/format.js'
import {
  ESTADO_PACIENTE,
  METODO_PAGO,
  TIPO_SESION,
  ESTADO_SESION,
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

// âââ Small helpers âââââââââââââââââââââââââââââââââââââââââââââââ

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

// âââ Patient row (list) ââââââââââââââââââââââââââââââââââââââââââ

function PatientRow({ patient, therapist, isSelected, onClick }) {
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
        <p className="truncate font-body font-bold text-content-primary">
          {fullName(patient)}
        </p>
        <p className="mt-0.5 truncate font-caption text-xs text-content-muted">
          {therapist ? `${therapist.nombre} ${therapist.apellido}` : 'â'}
          {patient.motivo_consulta ? ` Â· ${patient.motivo_consulta}` : ''}
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

// âââ Patient detail panel ââââââââââââââââââââââââââââââââââââââââ

function PatientDetail({ patient, therapist, sessions, onClose, onSave }) {
  const [form, setForm] = useState({
    tarifa: String(patient.tarifa ?? TARIFA_DEFAULT),
    metodo_pago: patient.metodo_pago || 'transferencia',
    estado_general: patient.estado_general || 'activo',
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState(null)

  // Reset form when a different patient is opened
  useEffect(() => {
    setForm({
      tarifa: String(patient.tarifa ?? TARIFA_DEFAULT),
      metodo_pago: patient.metodo_pago || 'transferencia',
      estado_general: patient.estado_general || 'activo',
    })
    setSaved(false)
    setError(null)
  }, [patient.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    const res = await onSave(patient.id, {
      tarifa: parseFloat(form.tarifa) || TARIFA_DEFAULT,
      metodo_pago: form.metodo_pago,
      estado_general: form.estado_general,
    })
    setSaving(false)
    if (!res.ok) {
      setError(res.error)
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
  }

  // Sort sessions newest-first
  const sorted = useMemo(
    () =>
      [...sessions].sort((a, b) =>
        `${b.fecha} ${b.hora_inicio}`.localeCompare(`${a.fecha} ${a.hora_inicio}`),
      ),
    [sessions],
  )

  const totalPaid = sorted.filter((s) => s.pagado).reduce((a, s) => a + Number(s.monto || 0), 0)

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex flex-shrink-0 items-start justify-between gap-3 border-b border-stroke/40 px-6 pb-4 pt-6">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            {therapist && <TherapistDot color={therapist.color} />}
            <span className="font-caption text-xs text-content-muted">
              {therapist ? fullName(therapist) : 'â'}
            </span>
          </div>
          <h2 className="font-serif text-2xl font-bold leading-tight text-content-primary">
            {fullName(patient)}
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
      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
        {/* Contact */}
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

        {/* Editable settings */}
        <section className="space-y-3">
          <SectionTitle>ConfiguraciÃ³n</SectionTitle>
          <Input
            label="Tarifa por sesiÃ³n (USD)"
            type="number"
            min="0"
            step="1"
            value={form.tarifa}
            onChange={(e) => set('tarifa', e.target.value)}
          />
          <Select
            label="MÃ©todo de pago"
            value={form.metodo_pago}
            onChange={(e) => set('metodo_pago', e.target.value)}
            options={toOptions(METODO_PAGO)}
            placeholder={null}
          />
          <Select
            label="Estado"
            value={form.estado_general}
            onChange={(e) => set('estado_general', e.target.value)}
            options={toOptions(ESTADO_PACIENTE)}
            placeholder={null}
          />
          {error && <p className="font-caption text-xs text-red-500">{error}</p>}
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={handleSave}
            disabled={saving}
          >
            {saved ? 'â Guardado' : saving ? 'Guardandoâ¦' : 'Guardar cambios'}
          </Button>
        </section>

        {/* Session history */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <SectionTitle>
              Historial Â· {sorted.length} {sorted.length === 1 ? 'sesiÃ³n' : 'sesiones'}
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
                    {/* Date + time */}
                    <div className="w-16 flex-shrink-0">
                      <p className="font-heading text-xs font-bold text-content-primary">
                        {formatDateShort(s.fecha)}
                      </p>
                      <p className="font-caption text-[11px] text-content-muted">
                        {formatTime(s.hora_inicio)}
                      </p>
                    </div>

                    {/* Type + modality */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 font-caption text-xs text-content-muted">
                        <ModIcon size={12} />
                        <span>{TIPO_SESION[s.tipo] || s.tipo}</span>
                      </div>
                    </div>

                    {/* Estado badge */}
                    <Badge variant={est.badge}>{est.label}</Badge>

                    {/* Amount + paid status */}
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
      </div>
    </div>
  )
}

// âââ Create patient drawer âââââââââââââââââââââââââââââââââââââââ

const EMPTY_FORM = {
  nombre: '',
  apellido: '',
  telefono: '',
  email: '',
  motivo_consulta: '',
  terapeuta_id: '',
  tarifa: String(TARIFA_DEFAULT),
  metodo_pago: 'transferencia',
}

function CreatePatientDrawer({ therapists, onClose, onCreate }) {
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
    if (!form.telefono.trim()) e.telefono = 'Requerido'
    if (!form.terapeuta_id) e.terapeuta_id = 'Selecciona un terapeuta'
    if (!form.tarifa || isNaN(parseFloat(form.tarifa))) e.tarifa = 'Ingresa un valor'
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
    const res = await onCreate({
      nombre: form.nombre.trim(),
      apellido: form.apellido.trim(),
      telefono: form.telefono.trim(),
      email: form.email.trim() || null,
      motivo_consulta: form.motivo_consulta.trim() || null,
      terapeuta_id: form.terapeuta_id,
      tarifa: parseFloat(form.tarifa),
      metodo_pago: form.metodo_pago,
      estado_general: 'activo',
    })
    setSaving(false)
    if (!res.ok) {
      setApiError(res.error)
    }
    // onClose is called by the parent after successful creation
  }

  const therapistOptions = therapists.map((t) => ({
    value: t.id,
    label: fullName(t),
  }))

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-surface-warm shadow-glow">
        {/* Header */}
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

        {/* Scrollable form body */}
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Nombre"
              value={form.nombre}
              onChange={(e) => set('nombre', e.target.value)}
              error={errors.nombre}
              autoFocus
            />
            <Input
              label="Apellido"
              value={form.apellido}
              onChange={(e) => set('apellido', e.target.value)}
              error={errors.apellido}
            />
          </div>

          <Input
            label="TelÃ©fono"
            type="tel"
            value={form.telefono}
            onChange={(e) => set('telefono', e.target.value)}
            error={errors.telefono}
            hint="+593â¦"
          />

          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
          />

          <div className="flex flex-col gap-1.5">
            <label className="font-heading text-sm font-bold text-content-secondary">
              Motivo de consulta
            </label>
            <textarea
              value={form.motivo_consulta}
              onChange={(e) => set('motivo_consulta', e.target.value)}
              rows={2}
              placeholder="Ej. Ansiedad, duelo, terapia de parejaâ¦"
              className="w-full resize-none rounded-xl border border-stroke bg-white px-4 py-3 font-body text-content-primary placeholder:text-content-muted focus:border-brand-lavender focus:outline-none focus:ring-2 focus:ring-brand-lavender/20"
            />
          </div>

          <Select
            label="Terapeuta"
            value={form.terapeuta_id}
            onChange={(e) => set('terapeuta_id', e.target.value)}
            options={therapistOptions}
            placeholder="Seleccionar terapeutaâ¦"
            error={errors.terapeuta_id}
          />

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
              label="MÃ©todo de pago"
              value={form.metodo_pago}
              onChange={(e) => set('metodo_pago', e.target.value)}
              options={toOptions(METODO_PAGO)}
              placeholder={null}
            />
          </div>

          {apiError && (
            <p className="font-caption text-sm text-red-500">{apiError}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-shrink-0 gap-3 border-t border-stroke/40 px-6 py-4">
          <Button
            variant="secondary"
            size="sm"
            className="flex-1"
            onClick={onClose}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="sm"
            className="flex-1"
            onClick={handleSubmit}
            disabled={saving}
          >
            {saving ? 'Creandoâ¦' : 'Crear paciente'}
          </Button>
        </div>
      </div>
    </>
  )
}

// âââ Filter chip row âââââââââââââââââââââââââââââââââââââââââââââ

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

// âââ Main page âââââââââââââââââââââââââââââââââââââââââââââââââââ

const ESTADO_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'activo', label: 'Activos' },
  { value: 'pausado', label: 'Pausados' },
  { value: 'alta', label: 'Alta' },
  { value: 'baja', label: 'Baja' },
]

export default function Pacientes() {
  const ctx = useOutletContext()
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
    return () => {
      alive = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Build therapist lookup map once
  const therapistMap = useMemo(() => {
    if (!data) return {}
    return Object.fromEntries(data.therapists.map((t) => [t.id, t]))
  }, [data])

  // Filtered patient list
  const filtered = useMemo(() => {
    if (!data) return []
    const q = search.toLowerCase()
    return data.patients.filter((p) => {
      if (filterEstado !== 'all' && p.estado_general !== filterEstado) return false
      if (filterTerapeuta !== 'all' && p.terapeuta_id !== filterTerapeuta) return false
      if (q) {
        const name = fullName(p).toLowerCase()
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

  // Update patient in local state after save
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

  // Add new patient to local state after create
  const handleCreate = useCallback(async (payload) => {
    const res = await createPatient(payload)
    if (res.ok) {
      setData((d) => ({
        ...d,
        patients: [...d.patients, res.data].sort((a, b) =>
          a.nombre.localeCompare(b.nombre),
        ),
      }))
      setShowCreate(false)
      setSelectedId(res.data.id)
    }
    return res
  }, [])

  // ââ Loading skeleton ââ
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
        {/* ââ LIST COLUMN ââ */}
        <div
          className={[
            'flex flex-col gap-4 min-w-0',
            // On mobile: hide list when detail panel is open; on desktop: always show
            hasPanel ? 'hidden lg:flex flex-1' : 'flex flex-1',
          ].join(' ')}
        >
          {/* Page header */}
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

          {/* Search */}
          <div className="relative">
            <IconSearch
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-content-muted"
            />
            <input
              type="search"
              placeholder="Buscar por nombre, terapeuta, motivoâ¦"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-stroke bg-white/70 py-2.5 pl-9 pr-4 font-body text-sm text-content-primary placeholder:text-content-muted backdrop-blur-sm focus:border-brand-lavender focus:outline-none focus:ring-2 focus:ring-brand-lavender/20"
            />
          </div>

          {/* Estado filter chips */}
          <div className="flex flex-wrap gap-2">
            {ESTADO_FILTERS.map((f) => (
              <FilterChip
                key={f.value}
                active={filterEstado === f.value}
                onClick={() => setFilterEstado(f.value)}
              >
                {f.label}
              </FilterChip>
            ))}
          </div>

          {/* Therapist filter chips */}
          {data.therapists.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <FilterChip
                active={filterTerapeuta === 'all'}
                onClick={() => setFilterTerapeuta('all')}
              >
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

          {/* Patient list */}
          <Card noPadding>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-card bg-brand-lavender/15 text-purple-500">
                  <IconUsers size={22} />
                </div>
                <p className="font-body text-content-secondary">
                  {search || filterEstado !== 'all' || filterTerapeuta !== 'all'
                    ? 'Sin resultados para estos filtros.'
                    : 'AÃºn no hay pacientes registrados.'}
                </p>
                {!search && filterEstado === 'all' && filterTerapeuta === 'all' && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowCreate(true)}
                    className="mt-2"
                  >
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
                  isSelected={p.id === selectedId}
                  onClick={() => setSelectedId((cur) => (cur === p.id ? null : p.id))}
                />
              ))
            )}
          </Card>
        </div>

        {/* ââ DETAIL PANEL ââ */}
        {hasPanel && (
          <div className="w-full flex-shrink-0 lg:w-[420px]">
            {/* Mobile: back button */}
            <button
              onClick={() => setSelectedId(null)}
              className="mb-3 flex items-center gap-1.5 font-heading text-sm font-bold text-brand-lavender lg:hidden"
            >
              â Lista de pacientes
            </button>

            <Card
              noPadding
              className="sticky overflow-hidden"
              style={{ top: '1.5rem', maxHeight: 'calc(100vh - 5rem)' }}
            >
              <PatientDetail
                patient={selectedPatient}
                therapist={therapistMap[selectedPatient.terapeuta_id]}
                sessions={patientSessions}
                onClose={() => setSelectedId(null)}
                onSave={handleUpdate}
              />
            </Card>
          </div>
        )}
      </div>

      {/* Create patient drawer (portal-style overlay) */}
      {showCreate && (
        <CreatePatientDrawer
          therapists={data.therapists}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </>
  )
}
