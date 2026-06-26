import React from 'react'
import { Toggle } from '../../components/Toggle/Toggle.jsx'
import {
  formatTime,
  fullName,
  formatCurrency,
  weekDays,
  monthMatrix,
  dateKey,
  capitalize,
} from '../../lib/format.js'
import { CONFIRMACION, TIPO_SESION, MODALIDAD, METODO_PAGO } from '../../lib/constants.js'
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
                    style={{ borderLeft: `3px solid ${ESTADO_COLOR[s.estado] || '#b48ae4'}` }}
                    className="w-full rounded-lg border border-white/70 bg-white/85 px-2 py-1.5 text-left shadow-soft transition-all duration-200 hover:shadow-card"
                  >
                    <p className="font-heading text-xs font-bold text-content-primary leading-tight">{formatTime(s.hora_inicio)}</p>
                    <p className="truncate font-body text-[13px] text-content-primary">{fullName(s.patient)}</p>
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
                      style={{ backgroundColor: `${ESTADO_COLOR[s.estado] || '#b48ae4'}22` }}
                      className="flex w-full items-center gap-1 truncate rounded-lg px-1.5 py-0.5 text-left"
                    >
                      <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: ESTADO_COLOR[s.estado] || '#b48ae4' }} />
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

export function ListView({ sessions, onEdit, onSetEstado, onTogglePaid }) {
  const rows = [...sessions].sort(byTime)
  if (rows.length === 0) {
    return <div className="py-16 text-center font-body text-content-secondary">No hay sesiones con estos filtros.</div>
  }
  return (
    <div className="divide-y divide-stroke/50">
      {rows.map((s) => (
        <div key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-2 py-3 transition-colors hover:bg-white/50">
          <div className="w-24 flex-shrink-0">
            <p className="font-heading text-sm font-bold text-content-primary">{capitalize(new Intl.DateTimeFormat('es-EC', { weekday: 'short', day: 'numeric' }).format(new Date(s.fecha)))}</p>
            <p className="font-caption text-xs text-content-muted">{formatTime(s.hora_inicio)}</p>
          </div>

          <div className="min-w-[150px] flex-1">
            <p className="truncate font-body font-bold text-content-primary">{fullName(s.patient)}</p>
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
          </div>

          <ConfSeg value={s.estado} onChange={(estado) => onSetEstado(s, estado)} />

          <div className="flex items-center gap-2.5">
            <Toggle checked={!!s.pagado} onChange={(v) => onTogglePaid(s, v)} />
            <div className="leading-tight">
              <p className="font-heading text-sm font-bold text-content-primary">{formatCurrency(s.monto)}</p>
              <p className="font-caption text-[11px] text-content-muted">{s.pagado ? METODO_PAGO[s.metodo_pago] || 'Pagada' : 'Sin pagar'}</p>
            </div>
          </div>

          <button onClick={() => onEdit(s)} className="rounded-full px-3 py-1.5 font-heading text-xs font-bold text-brand-lavender transition-colors hover:bg-brand-lavender/10">Editar</button>
        </div>
      ))}
    </div>
  )
}
