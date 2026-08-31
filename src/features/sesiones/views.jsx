import React from 'react'
import { Toggle } from '../../components/Toggle/Toggle.jsx'
import {
  formatTime,
  fullName,
  patientLabel,
  formatCurrency,
  weekDays,
  monthMatrix,
  dateKey,
  capitalize,
  toDate,
} from '../../lib/format.js'
import { CONFIRMACION, TIPO_SESION, MODALIDAD, METODO_PAGO, METODO_PAGO_ORDER } from '../../lib/constants.js'
import { llamadaConverted } from '../../lib/conversion.js'
import { hasPackage } from '../../lib/packages.js'

// ⭐ marker for patients who have ever bought a package (#4).
function PackageStar({ patientSessions }) {
  if (!hasPackage(patientSessions)) return null
  return (
    <span title="Cliente de paquete" className="ml-1 flex-shrink-0 text-amber-500" aria-label="Cliente de paquete">★</span>
  )
}
import { IconVideo, IconPin, IconPlus } from '../../layout/icons.jsx'

const ESTADO_COLOR = {
  programada: '#ffd84a',
  confirmada: '#b48ae4',
  cancelada: '#f5a8a0',
  completada: '#b48ae4', // legacy
  no_show: '#f5a8a0', // legacy
}
const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function ModIcon({ modalidad, size = 12 }) {
  const Icon = modalidad === 'en_linea' ? IconVideo : IconPin
  return <Icon size={size} />
}

const byTime = (a, b) => `${a.fecha} ${a.hora_inicio}`.localeCompare(`${b.fecha} ${b.hora_inicio}`)

// Normalize legacy estados onto the 3-state confirmation model.
const normEstado = (e) => (e === 'completada' ? 'confirmada' : e === 'no_show' ? 'cancelada' : e)

// Inline 3-state confirmation control.
function ConfSeg({ value, onChange }) {
  const v = normEstado(value)
  return (
    <div className="inline-flex rounded-pill border border-stroke/70 bg-white/70 p-0.5">
      {CONFIRMACION.map((c) => {
        const active = v === c.value
        return (
          <button
            key={c.value}
            type="button"
            onClick={() => onChange(c.value)}
            style={active ? { backgroundColor: c.color } : undefined}
            className={`rounded-pill px-2.5 py-1 font-caption text-[11px] font-bold transition-colors ${
              active ? (c.value === 'programada' ? 'text-content-primary' : 'text-white') : 'text-content-muted hover:text-content-primary'
            }`}
          >
            {c.short}
          </button>
        )
      })}
    </div>
  )
}

// Inline 2-state conversion control for llamadas (#3, 2026-08-31). Llamadas
// aren't confirmed/cancelled, so they use this instead of ConfSeg: did the
// intro call turn into a real patient? Red "No convirtió" (default) / green
// "Convirtió". Clicking sets a manual override (sessions.convirtio).
function ConvSeg({ converted, onChange }) {
  const opts = [
    { value: false, short: 'No convirtió', color: '#ef4444' },
    { value: true, short: 'Convirtió', color: '#22c55e' },
  ]
  return (
    <div className="inline-flex rounded-pill border border-stroke/70 bg-white/70 p-0.5">
      {opts.map((o) => {
        const active = converted === o.value
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(o.value)}
            style={active ? { backgroundColor: o.color } : undefined}
            className={`rounded-pill px-2.5 py-1 font-caption text-[11px] font-bold transition-colors ${
              active ? 'text-white' : 'text-content-muted hover:text-content-primary'
            }`}
          >
            {o.short}
          </button>
        )
      })}
    </div>
  )
}

// ─── Week ───────────────────────────────────────────────────────

export function WeekView({ sessions, cursor, onEdit, onCreateOn }) {
  const days = weekDays(cursor)
  const today = dateKey(new Date())

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[820px] grid-cols-7 gap-2">
        {days.map((day) => {
          const key = dateKey(day)
          const isToday = key === today
          const items = sessions.filter((s) => s.fecha === key).sort(byTime)
          return (
            <div key={key} className="flex flex-col">
              <div className={`mb-2 rounded-xl px-2 py-1.5 text-center ${isToday ? 'bg-brand-gradient text-white' : 'text-content-secondary'}`}>
                <p className="font-caption text-[11px] font-bold uppercase tracking-wide">{WEEKDAY_LABELS[(day.getDay() + 6) % 7]}</p>
                <p className="font-heading text-lg font-bold leading-none">{day.getDate()}</p>
              </div>
              <div className="group flex min-h-[120px] flex-col gap-1.5 rounded-card bg-white/40 p-1.5">
                {items.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => onEdit(s)}
                    style={{ borderLeft: `3px solid ${s.therapist?.color || '#b48ae4'}` }}
                    className="w-full rounded-lg border border-white/70 bg-white/85 px-2 py-1.5 text-left shadow-soft transition-all duration-200 hover:shadow-card"
                  >
                    <p className="font-heading text-xs font-bold text-content-primary leading-tight">{formatTime(s.hora_inicio)}</p>
                    <p className="truncate font-body text-[13px] text-content-primary">{patientLabel(s.patient)}</p>
                    <div className="mt-0.5 flex items-center gap-1 text-content-muted">
                      <ModIcon modalidad={s.modalidad} size={11} />
                      <span className="truncate font-caption text-[10px]">{TIPO_SESION[s.tipo] || s.tipo}</span>
                    </div>
                  </button>
                ))}
                <button
                  onClick={() => onCreateOn(key)}
                  className="mt-auto flex items-center justify-center gap-1 rounded-lg py-1 font-caption text-[11px] text-content-muted opacity-0 transition-opacity duration-200 hover:bg-brand-lavender/10 hover:text-brand-lavender focus:opacity-100 group-hover:opacity-100"
                >
                  <IconPlus size={12} /> Agregar
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Month ──────────────────────────────────────────────────────

export function MonthView({ sessions, cursor, onEdit, onCreateOn }) {
  const weeks = monthMatrix(cursor)
  const month = cursor.getMonth()
  const today = dateKey(new Date())
  const MAX = 3

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="mb-2 grid grid-cols-7 gap-2">
          {WEEKDAY_LABELS.map((d) => (
            <p key={d} className="text-center font-caption text-[11px] font-bold uppercase tracking-wide text-content-muted">{d}</p>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-2">
          {weeks.flat().map((day) => {
            const key = dateKey(day)
            const inMonth = day.getMonth() === month
            const isToday = key === today
            const items = sessions.filter((s) => s.fecha === key).sort(byTime)
            return (
              <div key={key} className={`flex min-h-[112px] flex-col rounded-card border p-2 transition-colors ${inMonth ? 'border-white/70 bg-white/55' : 'border-transparent bg-white/20'}`}>
                <button
                  onClick={() => onCreateOn(key)}
                  className={`mb-1 flex h-6 w-6 items-center justify-center self-start rounded-full font-heading text-xs font-bold transition-colors ${
                    isToday ? 'bg-brand-gradient text-white' : inMonth ? 'text-content-secondary hover:bg-brand-lavender/15' : 'text-content-muted'
                  }`}
                  title="Agregar sesión"
                >
                  {day.getDate()}
                </button>
                <div className="flex flex-col gap-1">
                  {items.slice(0, MAX).map((s) => (
                    <button
                      key={s.id}
                      onClick={() => onEdit(s)}
                      style={{ backgroundColor: `${s.therapist?.color || '#b48ae4'}22` }}
                      className="flex w-full items-center gap-1 truncate rounded-lg px-1.5 py-0.5 text-left"
                    >
                      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: s.therapist?.color || '#b48ae4' }} />
                      <span className="truncate font-caption text-[10px] font-bold text-content-primary">{formatTime(s.hora_inicio)} {s.patient?.nombre}</span>
                    </button>
                  ))}
                  {items.length > MAX && <span className="px-1.5 font-caption text-[10px] text-content-muted">+{items.length - MAX} más</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── List ───────────────────────────────────────────────────────

// WhatsApp-reminder status legend. Llamadas are excluded from the reminder
// cron, so they never show one. "No enviado aún" only makes sense for future
// Pendiente sessions (only estado=programada gets reminders); past sessions
// without a stamp show nothing to avoid noise on historical rows.
function ReminderLegend({ s, today }) {
  if (s.tipo === 'llamada') return null
  const estado = normEstado(s.estado)
  if (s.reminder_sent_at) {
    const pending = estado === 'programada'
    return (
      <p className={`mt-0.5 font-caption text-[11px] ${pending ? 'text-amber-600' : 'text-content-muted'}`}>
        {pending ? 'WhatsApp enviado · sin respuesta' : 'WhatsApp enviado'}
      </p>
    )
  }
  if (s.fecha >= today && estado === 'programada') {
    return <p className="mt-0.5 font-caption text-[11px] text-content-muted">WhatsApp no enviado aún</p>
  }
  return null
}

// Pay picker for the Lista (2026-08-31): "Sin pagar" or one of the 3 methods.
// Choosing a method marks the session paid WITH that method; "Sin pagar" marks
// it unpaid. Green when paid, muted when not — so each row shows payment status
// AND method at a glance. Replaces the old on/off pago toggle.
function PagoSelect({ s, onSetPago }) {
  const value = s.pagado ? (s.metodo_pago || 'transferencia') : ''
  return (
    <select
      value={value}
      onChange={(e) => onSetPago(s, e.target.value)}
      aria-label="Estado de pago"
      className={`rounded-lg border px-2 py-1 font-heading text-xs font-bold focus:outline-none focus:ring-2 focus:ring-brand-lavender/20 ${
        value
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
          : 'border-stroke bg-white text-content-muted'
      }`}
    >
      <option value="">Sin pagar</option>
      {METODO_PAGO_ORDER.map((m) => (
        <option key={m} value={m}>{METODO_PAGO[m]}</option>
      ))}
    </select>
  )
}

export function ListView({ sessions, sessionsByPatient = {}, onEdit, onSetEstado, onSetConvirtio, onSetPago, onToggleFacturada, onDelete }) {
  const today = dateKey(new Date())

  // Single continuous list: furthest-future first, scrolling down goes
  // through today and into the past.
  const rows = [...sessions].sort((a, b) => -byTime(a, b))

  if (rows.length === 0) {
    return <div className="py-16 text-center font-body text-content-secondary">No hay sesiones.</div>
  }
  return (
    <div>
    <div className="divide-y divide-stroke/50">
      {rows.map((s) => {
        // Cancelled sessions never charge — the pago toggle is locked off.
        const cancelled = normEstado(s.estado) === 'cancelada'
        // Llamadas gratuitas are free intro calls: never charged, never
        // invoiced. Both toggles are locked off so they can't stain the
        // cobro/factura metrics (which also exclude llamadas by design).
        const llamada = s.tipo === 'llamada'
        const noBilling = cancelled || llamada
        return (
        <div key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-2 py-3 transition-colors hover:bg-white/50">
          <div className="w-28 flex-shrink-0">
            <p className="font-heading text-sm font-bold text-content-primary">{capitalize(new Intl.DateTimeFormat('es-EC', { weekday: 'short', day: 'numeric', month: 'short' }).format(toDate(s.fecha)))}</p>
            <p className="font-caption text-xs text-content-muted">{toDate(s.fecha).getFullYear()} · {formatTime(s.hora_inicio)}</p>
          </div>

          <div className="min-w-[150px] flex-1">
            <p className="flex items-center font-body font-bold text-content-primary">
              <span className="truncate">{patientLabel(s.patient)}</span>
              <PackageStar patientSessions={sessionsByPatient[s.patient_id] || []} />
            </p>
            <div className="mt-0.5 flex items-center gap-2 font-caption text-xs text-content-muted">
              <span>{TIPO_SESION[s.tipo] || s.tipo}</span>
              <span aria-hidden="true">·</span>
              <ModIcon modalidad={s.modalidad} size={12} />
              <span>{MODALIDAD[s.modalidad] || s.modalidad}</span>
              {s.therapist && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.therapist.color || '#b48ae4' }} />
                  <span className="truncate">{s.therapist.nombre}</span>
                </>
              )}
            </div>
            <ReminderLegend s={s} today={today} />
          </div>

          {llamada ? (
            <ConvSeg
              converted={llamadaConverted(s, sessionsByPatient[s.patient_id] || [])}
              onChange={(v) => onSetConvirtio(s, v)}
            />
          ) : (
            <ConfSeg value={s.estado} onChange={(estado) => onSetEstado(s, estado)} />
          )}

          <div className="flex items-center gap-2.5">
            <div className="leading-tight text-right">
              <p className={`font-heading text-sm font-bold ${noBilling ? 'text-content-muted line-through' : 'text-content-primary'}`}>{formatCurrency(s.monto)}</p>
              {noBilling && (
                <p className="font-caption text-[11px] text-content-muted">{cancelled ? 'No se cobra' : 'Gratis'}</p>
              )}
            </div>
            {!noBilling && <PagoSelect s={s} onSetPago={onSetPago} />}
          </div>

          {/* Facturación — manual for now. Sky blue on purpose: visually
              distinct from the lavender pago toggle right next to it. */}
          <div className="flex items-center gap-2.5">
            <Toggle checked={!noBilling && !!s.facturada} disabled={noBilling} onClass="bg-sky-500" onChange={(v) => onToggleFacturada(s, v)} />
            <div className="leading-tight">
              <p className="font-caption text-[11px] font-bold uppercase tracking-wide text-sky-600">Factura</p>
              <p className="font-caption text-[11px] text-content-muted">{noBilling ? 'No se factura' : s.facturada ? 'Facturada' : 'Sin facturar'}</p>
            </div>
          </div>

          <button onClick={() => onEdit(s)} className="rounded-full px-3 py-1.5 font-heading text-xs font-bold text-brand-lavender transition-colors hover:bg-brand-lavender/10">Editar</button>
          {onDelete && (
            <button onClick={() => onDelete(s)} className="rounded-full px-3 py-1.5 font-heading text-xs font-bold text-red-500 transition-colors hover:bg-red-50">Eliminar</button>
          )}
        </div>
        )
      })}
    </div>
    </div>
  )
}
