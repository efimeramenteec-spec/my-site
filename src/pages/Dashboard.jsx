import React, { useEffect, useState } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

import { Card } from '../components/Card/Card.jsx'
import { Badge } from '../components/Badge/Badge.jsx'
import { Button } from '../components/Button/Button.jsx'

import { getDashboardData } from '../lib/queries.js'
import {
  formatCurrency,
  formatTime,
  relativeDayLabel,
  fullName,
  capitalize,
} from '../lib/format.js'
import { ESTADO_SESION, TIPO_SESION, MODALIDAD } from '../lib/constants.js'
import {
  IconCalendar,
  IconClock,
  IconWallet,
  IconUsers,
  IconChat,
  IconChevronRight,
  IconVideo,
  IconPin,
  IconCheck,
  IconBell,
  IconSparkle,
} from '../layout/icons.jsx'

const TINTS = {
  lavender: 'bg-brand-lavender/15 text-purple-600',
  orange: 'bg-brand-orange/20 text-orange-600',
  pink: 'bg-brand-pink/20 text-rose-600',
  yellow: 'bg-brand-yellow/25 text-amber-600',
}

const plural = (n, sing, plur) => (n === 1 ? sing : plur)

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Buenos días'
  if (h < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

// ─── Subcomponents ──────────────────────────────────────────────

function KpiCard({ label, value, caption, icon: Icon, tint = 'lavender' }) {
  return (
    <Card className="h-full">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-sm font-bold text-content-secondary">{label}</p>
          <p className="mt-2 font-display text-4xl font-bold text-content-primary leading-none">
            {value}
          </p>
          {caption && <p className="mt-2 font-caption text-xs text-content-muted">{caption}</p>}
        </div>
        <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-card ${TINTS[tint]}`}>
          <Icon size={22} />
        </div>
      </div>
    </Card>
  )
}

function TherapistDot({ color }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
      style={{ backgroundColor: color || '#b48ae4' }}
    />
  )
}

function SessionRow({ s }) {
  const estado = ESTADO_SESION[s.estado] || { label: s.estado, badge: 'neutral' }
  const ModIcon = s.modalidad === 'en_linea' ? IconVideo : IconPin
  return (
    <div className="flex items-center gap-4 rounded-card px-3 py-3 transition-colors hover:bg-white/60">
      <div className="w-20 flex-shrink-0 text-center">
        <p className="font-heading text-sm font-bold text-content-primary leading-tight">
          {formatTime(s.hora_inicio)}
        </p>
        <p className="font-caption text-[11px] text-content-muted">{relativeDayLabel(s.fecha)}</p>
      </div>

      <div className="h-9 w-px bg-stroke/70" />

      <div className="min-w-0 flex-1">
        <p className="truncate font-body font-bold text-content-primary">
          {fullName(s.patient)}
        </p>
        <div className="mt-0.5 flex items-center gap-2 font-caption text-xs text-content-muted">
          <span>{TIPO_SESION[s.tipo] || s.tipo}</span>
          <span aria-hidden="true">·</span>
          <ModIcon size={13} />
          <span>{MODALIDAD[s.modalidad] || s.modalidad}</span>
          {s.therapist && (
            <>
              <span aria-hidden="true">·</span>
              <TherapistDot color={s.therapist.color} />
              <span className="truncate">{s.therapist.nombre}</span>
            </>
          )}
        </div>
      </div>

      <Badge variant={estado.badge}>{estado.label}</Badge>
    </div>
  )
}

const WA = [
  { key: 'confirmadas', label: 'Confirmadas', color: '#b48ae4', icon: IconCheck },
  { key: 'pendientes', label: 'Pendientes', color: '#ffd84a', icon: IconClock },
  { key: 'canceladas', label: 'Canceladas', color: '#f5a8a0', icon: IconBell },
]

function WhatsAppSummary({ data }) {
  const total = WA.reduce((a, w) => a + (data[w.key] || 0), 0)
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-pill bg-surface-warm">
        {total === 0 ? (
          <div className="h-full w-full bg-stroke/50" />
        ) : (
          WA.map((w) => {
            const n = data[w.key] || 0
            if (!n) return null
            return (
              <div
                key={w.key}
                style={{ width: `${(n / total) * 100}%`, backgroundColor: w.color }}
                className="h-full"
              />
            )
          })
        )}
      </div>

      <div className="mt-5 space-y-3">
        {WA.map((w) => (
          <div key={w.key} className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: w.color }} />
              <span className="font-body text-sm text-content-secondary">{w.label}</span>
            </div>
            <span className="font-heading text-sm font-bold text-content-primary">
              {data[w.key] || 0}
            </span>
          </div>
        ))}
      </div>

      {total === 0 && (
        <p className="mt-4 font-caption text-xs text-content-muted">
          Sin sesiones programadas para hoy.
        </p>
      )}
    </div>
  )
}

function WeeklyTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const p = payload[0].payload
  return (
    <div className="rounded-xl border border-white/80 bg-white/90 px-3 py-2 shadow-card backdrop-blur-sm">
      <p className="font-heading text-xs font-bold text-content-primary">{p.day}</p>
      <p className="font-caption text-xs text-content-muted">
        {p.count} {plural(p.count, 'sesión', 'sesiones')}
      </p>
    </div>
  )
}

function WeeklyChart({ data }) {
  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
          <XAxis
            dataKey="day"
            axisLine={false}
            tickLine={false}
            tick={{ fill: '#9ca3af', fontSize: 12, fontFamily: 'Source Sans 3, sans-serif' }}
            dy={6}
          />
          <Tooltip cursor={{ fill: 'rgba(180,138,228,0.08)' }} content={<WeeklyTooltip />} />
          <Bar dataKey="count" radius={[8, 8, 8, 8]} maxBarSize={42}>
            {data.map((d) => (
              <Cell key={d.fecha} fill={d.isToday ? '#b48ae4' : '#e7ddf6'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function SkeletonCard({ className = '' }) {
  return <div className={`animate-pulse rounded-card bg-white/50 ${className}`} />
}

// ─── Page ───────────────────────────────────────────────────────

export default function Dashboard() {
  const ctx = useOutletContext()
  const navigate = useNavigate()
  const [data, setData] = useState(null)

  useEffect(() => {
    let alive = true
    getDashboardData().then((d) => {
      if (!alive) return
      setData(d)
      ctx?.setDataSource?.(d.source)
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!data) {
    return (
      <div className="space-y-6 pt-2">
        <SkeletonCard className="h-20 max-w-md" />
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} className="h-32" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <SkeletonCard className="h-72 lg:col-span-2" />
          <SkeletonCard className="h-72" />
        </div>
      </div>
    )
  }

  const { stats, upcoming, whatsapp, weekly } = data
  const pend = stats.pagosPendientes

  return (
    <div className="space-y-6 pt-2">
      {/* Greeting hero */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-content-primary">
            {greeting()}, Nicolas
            <span className="text-brand-lavender">✦</span>
          </h2>
          <p className="mt-1 font-body text-content-secondary">
            Hoy hay{' '}
            <span className="font-bold text-content-primary">{stats.sesionesHoy}</span>{' '}
            {plural(stats.sesionesHoy, 'sesión', 'sesiones')}
            {pend.count > 0 ? (
              <>
                {' '}y{' '}
                <span className="font-bold text-content-primary">{pend.count}</span>{' '}
                {plural(pend.count, 'pago pendiente', 'pagos pendientes')}.
              </>
            ) : (
              '. Sin pagos pendientes.'
            )}
          </p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Sesiones hoy"
          value={stats.sesionesHoy}
          caption={`${whatsapp.confirmadas} ${plural(whatsapp.confirmadas, 'confirmada', 'confirmadas')}`}
          icon={IconCalendar}
          tint="lavender"
        />
        <KpiCard
          label="Esta semana"
          value={stats.sesionesSemana}
          caption="sesiones agendadas"
          icon={IconClock}
          tint="orange"
        />
        <KpiCard
          label="Pagos pendientes"
          value={formatCurrency(pend.total)}
          caption={`${pend.count} ${plural(pend.count, 'sesión por cobrar', 'sesiones por cobrar')}`}
          icon={IconWallet}
          tint="pink"
        />
        <KpiCard
          label="Pacientes activos"
          value={stats.pacientesActivos}
          caption="en seguimiento activo"
          icon={IconUsers}
          tint="yellow"
        />
      </div>

      {/* Upcoming + WhatsApp */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-serif text-xl font-bold text-content-primary">Próximas sesiones</h3>
            <button
              onClick={() => navigate('/sesiones')}
              className="flex items-center gap-1 font-heading text-sm font-bold text-brand-lavender transition-colors hover:text-brand-pink"
            >
              Ver todas <IconChevronRight size={15} />
            </button>
          </div>

          {upcoming.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-card bg-brand-lavender/15 text-purple-500">
                <IconSparkle size={22} />
              </div>
              <p className="font-body text-content-secondary">No hay sesiones próximas.</p>
            </div>
          ) : (
            <div className="-mx-3 divide-y divide-stroke/50">
              {upcoming.map((s) => (
                <SessionRow key={s.id} s={s} />
              ))}
            </div>
          )}
        </Card>

        <Card withOrbs className="lg:col-span-1">
          <div className="mb-5 flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-card bg-brand-lavender/15 text-purple-600">
              <IconChat size={18} />
            </div>
            <div>
              <h3 className="font-serif text-xl font-bold text-content-primary leading-tight">
                WhatsApp hoy
              </h3>
              <p className="font-caption text-xs text-content-muted">Confirmaciones de pacientes</p>
            </div>
          </div>
          <WhatsAppSummary data={whatsapp} />
        </Card>
      </div>

      {/* Weekly activity */}
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-serif text-xl font-bold text-content-primary">Actividad de la semana</h3>
          <Badge variant="neutral">
            {capitalize(plural(stats.sesionesSemana, 'sesión', 'sesiones'))}: {stats.sesionesSemana}
          </Badge>
        </div>
        <WeeklyChart data={weekly} />
      </Card>
    </div>
  )
}
