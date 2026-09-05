import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'

import { Card } from '../components/Card/Card.jsx'
import { Badge } from '../components/Badge/Badge.jsx'
import { Button } from '../components/Button/Button.jsx'
import { Select } from '../components/Select/Select.jsx'

import { getMarketingData, updateCampaign, importCampaignWeeks } from '../lib/queries.js'
import { parseMetaCsv } from '../lib/metaCsv.js'
import { computeMarketing, computeFlags, campaignOn } from '../lib/marketing.js'
import { groupSessionsByPatient } from '../lib/conversion.js'
import { formatCurrency, formatDateShort, fullName, patientLabel, dateKey } from '../lib/format.js'
import { IconWallet, IconUsers, IconPulse, IconChat, IconPhone, IconMegaphone, IconChevronRight } from '../layout/icons.jsx'

// Marketing v2 (owner-only). Funnel: Meta Ads → conversación de WhatsApp →
// llamada gratuita → paciente. Data arrives weekly via /marketize (see
// MARKETING-CONSULTORIO-2026.md) — this page reads campaign_weeks + derives
// the bottom of the funnel live from sessions/patients using date-based
// attribution (src/lib/marketing.js). The CSV button here is the manual
// fallback for the same weekly report.

const num = new Intl.NumberFormat('es-EC')
const money2 = (n) =>
  new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol' })
    .format(Number(n) || 0)
const pct = (part, whole) => (whole > 0 ? `${((100 * part) / whole).toFixed(1)}%` : '—')

function monthRange(d) {
  const y = d.getFullYear()
  const m = d.getMonth()
  return { from: dateKey(new Date(y, m, 1)), to: dateKey(new Date(y, m + 1, 0)) }
}

const PERIODS = [
  { value: 'todo', label: 'Todo el historial' },
  { value: 'este_mes', label: 'Este mes' },
  { value: 'mes_pasado', label: 'Mes pasado' },
  { value: 'ultimas_4', label: 'Últimas 4 semanas' },
  { value: 'personalizado', label: 'Período personalizado…' },
]

function periodRange(period, custom, now) {
  switch (period) {
    case 'este_mes': return monthRange(now)
    case 'mes_pasado': return monthRange(new Date(now.getFullYear(), now.getMonth() - 1, 1))
    case 'ultimas_4': {
      const from = new Date(now); from.setDate(from.getDate() - 27)
      return { from: dateKey(from), to: dateKey(now) }
    }
    case 'personalizado': return { from: custom.from || null, to: custom.to || null }
    default: return { from: null, to: null }
  }
}

const CHART_METRICS = [
  { value: 'costo_conversacion', label: 'Costo por conversación', money: true },
  { value: 'cpa', label: 'Costo por paciente (CPA)', money: true },
  { value: 'conversaciones', label: 'Conversaciones' },
  { value: 'llamadas', label: 'Llamadas agendadas' },
  { value: 'pacientes', label: 'Pacientes nuevos' },
  { value: 'frecuencia', label: 'Frecuencia' },
  { value: 'ctr', label: 'CTR (%)' },
  { value: 'cpm', label: 'CPM', money: true },
]

// ─── Subcomponents ───────────────────────────────────────────────────────────

const TINTS = {
  lavender: 'bg-brand-lavender/15 text-purple-600',
  orange: 'bg-brand-orange/20 text-orange-600',
  pink: 'bg-brand-pink/20 text-rose-600',
  yellow: 'bg-brand-yellow/25 text-amber-600',
}

function KpiCard({ label, value, caption, icon: Icon, tint = 'lavender' }) {
  return (
    <Card className="h-full">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-sm font-bold text-content-secondary">{label}</p>
          <p className="mt-2 font-display text-3xl font-bold text-content-primary leading-none">{value}</p>
          {caption && <p className="mt-2 font-caption text-xs text-content-muted">{caption}</p>}
        </div>
        <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-card ${TINTS[tint]}`}>
          <Icon size={22} />
        </div>
      </div>
    </Card>
  )
}

const FLAG_STYLES = {
  red: 'border-red-200 bg-red-50 text-red-700',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
}
const FLAG_DOTS = { red: '●', amber: '●', green: '●' }

function FlagsPanel({ flags, campaignName }) {
  return (
    <Card>
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-card bg-brand-yellow/25 text-amber-600">
          <IconPulse size={18} />
        </div>
        <div>
          <h3 className="font-serif text-xl font-bold text-content-primary leading-tight">Señales</h3>
          <p className="font-caption text-xs text-content-muted">
            {campaignName ? `Última semana de "${campaignName}" vs la anterior.` : 'Sin campaña activa que evaluar.'}
          </p>
        </div>
      </div>
      {flags.length === 0 ? (
        <p className="py-4 text-center font-body text-sm text-content-muted">
          Nada que requiera tu atención esta semana. ✦
        </p>
      ) : (
        <div className="space-y-2">
          {flags.map((f, i) => (
            <div key={i} className={`flex items-start gap-2.5 rounded-card border px-3.5 py-2.5 ${FLAG_STYLES[f.level]}`}>
              <span aria-hidden="true" className="mt-0.5 text-[10px]">{FLAG_DOTS[f.level]}</span>
              <p className="font-body text-sm">{f.message}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

// Conversaciones → Llamadas → Pacientes, with the conversion rate under each
// hop — the rates are where the insight lives. Impressions/spend are context,
// not funnel stages (you don't "convert" an impression).
function Funnel({ m }) {
  const stages = [
    { label: 'Conversaciones', value: m.conversations, hint: 'WhatsApp (Meta)' },
    { label: 'Llamadas', value: m.llamadas, hint: 'agendadas' },
    { label: 'Pacientes', value: m.pacientes, hint: 'primera sesión' },
  ]
  return (
    <Card>
      <div className="flex flex-wrap items-stretch gap-2">
        {stages.map((st, i) => (
          <React.Fragment key={st.label}>
            {i > 0 && (
              <div className="flex flex-col items-center justify-center px-1.5">
                <span className="text-content-muted" aria-hidden="true">→</span>
                <span className="font-caption text-[11px] font-bold text-content-secondary">
                  {pct(st.value, stages[i - 1].value)}
                </span>
              </div>
            )}
            <div className="flex min-w-[110px] flex-1 flex-col justify-between rounded-card bg-surface-warm px-3.5 py-2.5">
              <p className="font-caption text-[11px] text-content-muted">{st.label} <span className="opacity-70">· {st.hint}</span></p>
              <p className="font-heading text-2xl font-bold text-content-primary">{num.format(st.value || 0)}</p>
            </div>
          </React.Fragment>
        ))}
      </div>
      <p className="mt-3 font-caption text-xs text-content-muted">
        Contexto del período: {money2(m.spend)} invertidos · {num.format(m.impressions)} impresiones
        {m.acqSinCampana > 0 && (
          <span className="text-amber-600"> · {m.acqSinCampana} paciente{m.acqSinCampana === 1 ? '' : 's'} nuevo{m.acqSinCampana === 1 ? '' : 's'} sin campaña activa (orgánico/fuera de ventana)</span>
        )}
      </p>
    </Card>
  )
}

function WeeklyChart({ series, metric, onMetric }) {
  const def = CHART_METRICS.find((x) => x.value === metric) || CHART_METRICS[0]
  const data = series.map((w) => ({
    ...w,
    semanaLabel: formatDateShort(w.semana),
    [metric]: w[metric] == null ? null : Number(Number(w[metric]).toFixed(2)),
  }))
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-serif text-xl font-bold text-content-primary">Evolución semanal</h3>
        <div className="w-64">
          <Select options={CHART_METRICS} value={metric} onChange={(e) => onMetric(e.target.value)} placeholder="" />
        </div>
      </div>
      {data.length === 0 ? (
        <p className="py-10 text-center font-body text-sm text-content-muted">
          Aún no hay semanas importadas en este período.
        </p>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="semanaLabel" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="gasto" tick={{ fontSize: 11 }} width={44} />
              <YAxis yAxisId="metric" orientation="right" tick={{ fontSize: 11 }} width={44} />
              <Tooltip
                formatter={(value, name) => {
                  if (name === 'Gasto') return [money2(value), name]
                  return [def.money ? money2(value) : num.format(value), name]
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="gasto" dataKey="gasto" name="Gasto" fill="#CBBDF0" radius={[6, 6, 0, 0]} />
              <Line
                yAxisId="metric" type="monotone" dataKey={metric} name={def.label}
                stroke="#F97316" strokeWidth={2.5} dot={{ r: 3 }} connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

// Lifetime economics per campaign + editable attribution window. The window
// (fecha_inicio → fecha_fin) is what drives attribution, so it must be
// fixable by hand — e.g. May 2026 had several campaigns at once and the
// backfill needs manual boundaries.
function CampaignRow({ p, onPatch }) {
  const c = p.campaign
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ fecha_inicio: c.fecha_inicio, fecha_fin: c.fecha_fin || '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    setBusy(true)
    setError('')
    const res = await onPatch(c.id, {
      fecha_inicio: form.fecha_inicio,
      fecha_fin: form.fecha_fin || null,
    })
    setBusy(false)
    if (!res.ok) setError(res.error)
    else setEditing(false)
  }

  const running = !c.fecha_fin
  return (
    <div className="border-b border-stroke/50 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate font-body font-bold text-content-primary">{c.nombre}</p>
            <Badge variant={running ? 'lavender' : 'neutral'}>{running ? 'En curso' : 'Finalizada'}</Badge>
          </div>
          <p className="font-caption text-xs text-content-muted">
            {formatDateShort(c.fecha_inicio)}{c.fecha_fin ? ` – ${formatDateShort(c.fecha_fin)}` : ' – hoy'}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-x-5 gap-y-1 text-right sm:grid-cols-6">
          <MiniStat label="Gasto">{money2(p.spend)}</MiniStat>
          <MiniStat label="Pacientes">{p.pacientes}</MiniStat>
          <MiniStat label="CPA">{p.cpa == null ? '—' : money2(p.cpa)}</MiniStat>
          <MiniStat label="LTV">{p.ltv == null ? '—' : money2(p.ltv)}</MiniStat>
          <MiniStat label="Ingreso">{formatCurrency(p.revenue)}</MiniStat>
          <MiniStat label="Payback">
            {p.pct == null ? '—' : (
              <span className={p.pct >= 100 ? 'text-emerald-600' : ''}>{Math.round(p.pct)}%</span>
            )}
          </MiniStat>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setEditing((v) => !v)}>
          {editing ? 'Cerrar' : 'Editar fechas'}
        </Button>
      </div>
      {editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-card bg-surface-warm px-3 py-2.5">
          <input
            type="date" value={form.fecha_inicio}
            onChange={(e) => setForm((f) => ({ ...f, fecha_inicio: e.target.value }))}
            className="rounded-xl border border-stroke bg-white/70 px-3 py-1.5 font-body text-sm"
          />
          <span className="font-caption text-xs text-content-muted">a</span>
          <input
            type="date" value={form.fecha_fin}
            onChange={(e) => setForm((f) => ({ ...f, fecha_fin: e.target.value }))}
            className="rounded-xl border border-stroke bg-white/70 px-3 py-1.5 font-body text-sm"
          />
          <span className="font-caption text-[11px] text-content-muted">(fin vacío = sigue en curso)</span>
          <Button size="sm" onClick={save} disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</Button>
          {error && <p className="font-caption text-xs text-red-500">{error}</p>}
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, children }) {
  return (
    <div>
      <p className="font-caption text-[10px] text-content-muted">{label}</p>
      <p className="font-heading text-sm font-bold text-content-primary">{children}</p>
    </div>
  )
}

function CohortCard({ cohorts }) {
  const monthLabel = (mes) => {
    const [y, m] = mes.split('-')
    return new Intl.DateTimeFormat('es-EC', { month: 'short', year: '2-digit' })
      .format(new Date(Number(y), Number(m) - 1, 1))
  }
  return (
    <Card>
      <h3 className="font-serif text-xl font-bold text-content-primary">LTV por cohorte</h3>
      <p className="mb-3 font-caption text-xs text-content-muted">
        Pacientes agrupados por mes de llegada — el ingreso promedio de cada cohorte sigue
        creciendo mientras el paciente siga viniendo ("LTV a la fecha").
      </p>
      {cohorts.length === 0 ? (
        <p className="py-4 text-center font-body text-sm text-content-muted">Sin pacientes nuevos aún.</p>
      ) : (
        <div className="divide-y divide-stroke/50">
          {cohorts.map((c) => (
            <div key={c.mes} className="flex items-center justify-between gap-3 py-2">
              <p className="font-body text-sm font-bold capitalize text-content-primary">{monthLabel(c.mes)}</p>
              <p className="font-caption text-xs text-content-muted">
                {c.pacientes} paciente{c.pacientes === 1 ? '' : 's'}
              </p>
              <p className="font-heading text-sm font-bold text-content-primary">{money2(c.ltv)} / paciente</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function OrphanCalls({ orphans }) {
  return (
    <Card>
      <div className="mb-1 flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-card bg-brand-orange/20 text-orange-600">
          <IconPhone size={18} />
        </div>
        <div>
          <h3 className="font-serif text-xl font-bold text-content-primary leading-tight">
            Llamadas sin sesión
          </h3>
          <p className="font-caption text-xs text-content-muted">
            Hicieron la llamada gratuita y aún no agendan — tu lista de seguimiento.
          </p>
        </div>
      </div>
      {orphans.length === 0 ? (
        <p className="py-6 text-center font-body text-sm text-content-muted">
          Nadie pendiente de seguimiento. ✦
        </p>
      ) : (
        <div className="divide-y divide-stroke/50">
          {orphans.slice(0, 12).map(({ patient, lastCall, days }) => (
            <div key={patient.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate font-body font-bold text-content-primary">{patientLabel(patient)}</p>
                <p className="font-caption text-xs text-content-muted">{patient.telefono || 'sin teléfono'}</p>
              </div>
              <Badge variant={days > 7 ? 'pink' : 'yellow'}>
                hace {days} día{days === 1 ? '' : 's'} · {formatDateShort(lastCall)}
              </Badge>
            </div>
          ))}
          {orphans.length > 12 && (
            <p className="pt-3 font-caption text-xs text-content-muted">+{orphans.length - 12} más…</p>
          )}
        </div>
      )}
    </Card>
  )
}

function SkeletonCard({ className = '' }) {
  return <div className={`animate-pulse rounded-card bg-white/50 ${className}`} />
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Marketing() {
  const ctx = useOutletContext()
  const [data, setData] = useState(null)
  const [period, setPeriod] = useState('todo')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [campaignId, setCampaignId] = useState('')
  const [metric, setMetric] = useState('costo_conversacion')
  const [pendingImport, setPendingImport] = useState(null) // { weeks, summary }
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const fileRef = useRef(null)

  const load = () =>
    getMarketingData().then((d) => {
      setData(d)
      ctx?.setDataSource?.(d.source)
    })

  useEffect(() => {
    let alive = true
    getMarketingData().then((d) => {
      if (!alive) return
      setData(d)
      ctx?.setDataSource?.(d.source)
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const now = new Date()
  const today = dateKey(now)

  const m = useMemo(() => {
    if (!data) return null
    const { from, to } = periodRange(period, custom, now)
    return computeMarketing(data, { from, to, campaignId: campaignId || null }, today)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, period, custom, campaignId, today])

  const flags = useMemo(
    () => (data ? computeFlags(data, campaignId || null, today) : []),
    [data, campaignId, today],
  )

  // Month navigator for the "Nuevos pacientes" card (independent of the campaign
  // period selector below). Defaults to the current month.
  const [monthCursor, setMonthCursor] = useState(() => new Date(now.getFullYear(), now.getMonth(), 1))
  const [showNuevos, setShowNuevos] = useState(false)

  // New patients acquired in the selected month. Attribution (Nicolas,
  // 2026-09-05): a patient is credited to the month they CONVERTED — i.e. the
  // month of their (first) llamada if they had one, else the month of their
  // first real session (they walked in without a call). Only patients who
  // actually became patients (≥1 real session) count.
  const nuevos = useMemo(() => {
    if (!data) return null
    const from = dateKey(new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1))
    const to = dateKey(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 0))
    const byPatient = groupSessionsByPatient(data.sessions)
    const notCancelled = (s) => s.estado !== 'cancelada' && s.estado !== 'no_show'
    const byFecha = (a, b) => a.fecha.localeCompare(b.fecha)
    const rows = []
    for (const p of data.patients) {
      const ss = byPatient[p.id] || []
      const real = ss.filter((s) => s.tipo !== 'llamada' && notCancelled(s)).sort(byFecha)
      if (!real.length) continue // never became a patient
      const llamadas = ss.filter((s) => s.tipo === 'llamada' && notCancelled(s)).sort(byFecha)
      const acqDate = llamadas.length ? llamadas[0].fecha : real[0].fecha
      if (acqDate >= from && acqDate <= to) {
        rows.push({ patient: p, llamadaFecha: llamadas.length ? llamadas[0].fecha : null, acqDate })
      }
    }
    rows.sort((a, b) => a.acqDate.localeCompare(b.acqDate))
    return rows
  }, [data, monthCursor])

  const monthLabel = (() => {
    const s = new Intl.DateTimeFormat('es-EC', { month: 'long', year: 'numeric' }).format(monthCursor)
    return s.charAt(0).toUpperCase() + s.slice(1)
  })()
  const isCurrentMonth = monthCursor.getFullYear() === now.getFullYear() && monthCursor.getMonth() === now.getMonth()
  const shiftMonth = (d) => setMonthCursor((c) => new Date(c.getFullYear(), c.getMonth() + d, 1))

  const handlePatchCampaign = async (id, patch) => {
    const res = await updateCampaign(id, patch)
    if (res.ok) {
      setData((d) => ({ ...d, campaigns: d.campaigns.map((c) => (c.id === id ? res.data : c)) }))
    }
    return res
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError('')
    setNotice('')
    const parsed = parseMetaCsv(await file.text())
    if (!parsed.ok) { setError(parsed.error); return }
    const totalSpend = parsed.weeks.reduce((a, w) => a + w.spend, 0)
    setPendingImport({
      weeks: parsed.weeks,
      summary: `${parsed.weeks.length} fila(s) · ${parsed.weeks[0].semana_inicio} → ${parsed.weeks[parsed.weeks.length - 1].semana_fin} · ${money2(totalSpend)}`,
    })
  }

  const confirmImport = async () => {
    setBusy(true)
    setError('')
    const res = await importCampaignWeeks(pendingImport.weeks)
    setBusy(false)
    setPendingImport(null)
    if (!res.ok) setError(res.error)
    else {
      setNotice(`Reporte importado: ${res.imported} semana(s)${res.created ? `, ${res.created} campaña(s) nueva(s)` : ''}.`)
      load()
    }
  }

  if (!data || !m) {
    return (
      <div className="space-y-6 pt-2">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} className="h-32" />)}
        </div>
        <SkeletonCard className="h-64" />
      </div>
    )
  }

  const activeCampaign = data.campaigns.find((c) => c.id === campaignId) ||
    campaignOn(data.campaigns, today, today)
  const campaignOptions = [
    { value: '', label: 'Todas las campañas' },
    ...data.campaigns.map((c) => ({ value: c.id, label: c.nombre })),
  ]

  return (
    <div className="space-y-6 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-content-primary">
            Embudo de adquisición <span className="text-brand-lavender">✦</span>
          </h2>
          <p className="mt-1 font-body text-sm text-content-secondary">
            Meta Ads → WhatsApp → llamada gratuita → paciente. Se alimenta cada lunes con /marketize.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
          Importar reporte (CSV)
        </Button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
      </div>

      {/* Headline: new patients acquired in the selected month (credited to the
          month they converted = their call month, else their first session).
          Tap to expand the list; navigate months with the arrows. */}
      {nuevos && (
        <Card>
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={() => setShowNuevos((v) => !v)} className="min-w-0 text-left">
              <p className="font-caption text-xs font-bold uppercase tracking-wide text-content-muted">
                Nuevos pacientes
              </p>
              <p className="mt-1 font-heading text-4xl font-bold text-content-primary">{nuevos.length}</p>
              <p className="mt-0.5 font-caption text-xs font-bold text-brand-lavender">
                {showNuevos ? 'Ocultar lista ▲' : 'Ver lista ▼'}
              </p>
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="rounded-full p-1.5 text-content-muted transition-colors hover:bg-surface-warm hover:text-content-primary"
                aria-label="Mes anterior"
              >
                <span className="inline-block rotate-180"><IconChevronRight size={18} /></span>
              </button>
              <span className="min-w-[130px] text-center font-heading text-sm font-bold text-content-primary">{monthLabel}</span>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                disabled={isCurrentMonth}
                className="rounded-full p-1.5 text-content-muted transition-colors enabled:hover:bg-surface-warm enabled:hover:text-content-primary disabled:opacity-30"
                aria-label="Mes siguiente"
              >
                <IconChevronRight size={18} />
              </button>
            </div>
          </div>
          {showNuevos && (
            <div className="mt-4 border-t border-stroke/50 pt-3">
              {nuevos.length === 0 ? (
                <p className="font-caption text-sm text-content-muted">No hubo pacientes nuevos en {monthLabel}.</p>
              ) : (
                <ul className="divide-y divide-stroke/40">
                  {nuevos.map((r) => (
                    <li key={r.patient.id} className="flex items-center justify-between gap-3 py-2">
                      <p className="min-w-0 truncate font-body text-sm font-bold text-content-primary">{patientLabel(r.patient)}</p>
                      {r.llamadaFecha ? (
                        <span className="flex-shrink-0 rounded-pill bg-emerald-100 px-2.5 py-1 font-caption text-[11px] font-bold text-emerald-700">
                          Llamada: {formatDateShort(r.llamadaFecha)}
                        </span>
                      ) : (
                        <span className="flex-shrink-0 rounded-pill bg-stone-100 px-2.5 py-1 font-caption text-[11px] font-bold text-content-muted">
                          Entró sin llamada
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>
      )}

      {pendingImport && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-brand-lavender/40 bg-brand-lavender/10 px-4 py-3">
          <p className="flex-1 font-caption text-sm text-content-primary">
            Importar {pendingImport.summary}. Las semanas repetidas se reemplazan (nunca se duplican).
          </p>
          <Button size="sm" onClick={confirmImport} disabled={busy}>
            {busy ? 'Importando…' : 'Confirmar'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPendingImport(null)}>Cancelar</Button>
        </div>
      )}
      {error && <p className="font-caption text-xs text-red-500">{error}</p>}
      {notice && <p className="font-caption text-xs text-emerald-600">{notice}</p>}

      {m.overlaps.length > 0 && (
        <div className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="font-caption text-sm text-amber-700">
            ⚠ Ventanas de campaña superpuestas ({m.overlaps.map(([a, b]) => `"${a.nombre}" / "${b.nombre}"`).join(', ')}).
            La atribución usa la campaña de inicio más reciente — ajusta las fechas abajo para que cada período tenga UNA campaña.
          </p>
        </div>
      )}

      {/* Selectors */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-52">
          <Select options={PERIODS} value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="" />
        </div>
        {period === 'personalizado' && (
          <div className="flex items-center gap-2">
            <input
              type="date" value={custom.from}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              className="rounded-xl border border-stroke bg-white/70 px-3 py-2 font-body text-sm text-content-primary focus:border-brand-lavender focus:outline-none"
            />
            <span className="font-caption text-xs text-content-muted">a</span>
            <input
              type="date" value={custom.to}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              className="rounded-xl border border-stroke bg-white/70 px-3 py-2 font-body text-sm text-content-primary focus:border-brand-lavender focus:outline-none"
            />
          </div>
        )}
        <div className="w-60">
          <Select options={campaignOptions} value={campaignId} onChange={(e) => setCampaignId(e.target.value)} placeholder="" />
        </div>
      </div>

      {/* Señales — what needs attention this week */}
      <FlagsPanel flags={flags} campaignName={activeCampaign?.nombre} />

      {/* KPI header (period-scoped) */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Costo por paciente"
          value={m.cpa == null ? '—' : money2(m.cpa)}
          caption={`${money2(m.spend)} invertidos ÷ ${m.pacientes} paciente${m.pacientes === 1 ? '' : 's'} nuevo${m.pacientes === 1 ? '' : 's'}`}
          icon={IconMegaphone}
          tint="lavender"
        />
        <KpiCard
          label="Costo por conversación"
          value={m.costoConversacion == null ? '—' : money2(m.costoConversacion)}
          caption={`${num.format(m.conversations)} conversaciones iniciadas`}
          icon={IconChat}
          tint="orange"
        />
        <KpiCard
          label="LTV a la fecha"
          value={m.ltv == null ? '—' : money2(m.ltv)}
          caption="ingreso pagado promedio por paciente adquirido (sigue creciendo)"
          icon={IconUsers}
          tint="pink"
        />
        <KpiCard
          label="LTV : CAC"
          value={m.ltvCac == null ? '—' : `${m.ltvCac.toFixed(1)}x`}
          caption={m.ltvCac == null ? 'necesita gasto y pacientes atribuidos' : m.ltvCac >= 3 ? 'saludable (≥3x)' : 'bajo (meta: ≥3x)'}
          icon={IconWallet}
          tint="yellow"
        />
      </div>

      <Funnel m={m} />

      <WeeklyChart series={m.series} metric={metric} onMetric={setMetric} />

      {/* Campaigns — lifetime economics + attribution windows */}
      <Card>
        <h3 className="font-serif text-xl font-bold text-content-primary">Campañas</h3>
        <p className="mb-2 font-caption text-xs text-content-muted">
          Economía de por vida (ignora el período de arriba). Las fechas definen la atribución:
          todo paciente nuevo se asigna a la campaña activa el día que agendó su primera sesión.
        </p>
        {m.payback.length === 0 ? (
          <p className="py-6 text-center font-body text-sm text-content-muted">
            Aún no hay campañas — corre /marketize o importa el reporte semanal de Meta.
          </p>
        ) : (
          m.payback.map((p) => (
            <CampaignRow key={p.campaign.id} p={p} onPatch={handlePatchCampaign} />
          ))
        )}
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <CohortCard cohorts={m.cohorts} />
        <OrphanCalls orphans={m.orphans} />
      </div>
    </div>
  )
}
