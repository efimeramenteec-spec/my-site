import React, { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts'
import { Card } from '../components/Card/Card.jsx'
import { Select } from '../components/Select/Select.jsx'
import { getFinanzasData } from '../lib/queries.js'
import { dateKey, weekRange, formatCurrency, fullName, capitalize, formatDateShort, toDate } from '../lib/format.js'

// Money page (replaced the old Dashboard, 2026-07-04). Definitions (Nicolas):
// - "Real" session = not cancelled and not a llamada (free 10-min intro calls
//   never charge nor provision).
// - Provisión = per-session amount owed to the therapist (therapists.provision_rate,
//   $24 default; Mariana 0 — she keeps 100%). Paid monthly for ALL non-cancelled
//   sessions of the month, regardless of cobrado (unpaid patients are the
//   practice's problem, the therapist is paid either way).
// - The standalone Provisión card is therefore strictly CURRENT MONTH; every
//   other metric follows the period selector.

const isReal = (s) =>
  s.tipo !== 'llamada' && s.estado !== 'cancelada' && s.estado !== 'no_show'

const rateOf = (s) => Number(s.therapist?.provision_rate ?? 24)

function monthRange(d) {
  const y = d.getFullYear()
  const m = d.getMonth()
  return { from: dateKey(new Date(y, m, 1)), to: dateKey(new Date(y, m + 1, 0)) }
}

const PERIODS = [
  { value: 'todo', label: 'Todo el historial' },
  { value: 'este_mes', label: 'Este mes' },
  { value: 'mes_pasado', label: 'Mes pasado' },
  { value: 'esta_semana', label: 'Esta semana' },
  { value: 'este_anio', label: 'Este año' },
  { value: 'personalizado', label: 'Período personalizado…' },
]

function periodRange(period, custom, now) {
  switch (period) {
    case 'este_mes':
      return monthRange(now)
    case 'mes_pasado':
      return monthRange(new Date(now.getFullYear(), now.getMonth() - 1, 1))
    case 'esta_semana': {
      const { start, end } = weekRange(now)
      return { from: start, to: end }
    }
    case 'este_anio':
      return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` }
    case 'personalizado':
      return { from: custom.from || null, to: custom.to || null }
    default:
      return { from: null, to: null } // todo el historial
  }
}

function KpiCard({ label, value, caption, onClick, active }) {
  return (
    <Card
      className={`p-5 ${onClick ? 'cursor-pointer transition-shadow hover:shadow-card' : ''} ${active ? 'ring-2 ring-brand-lavender/50' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
    >
      <p className="font-caption text-xs font-bold uppercase tracking-wide text-content-muted">{label}</p>
      <p className="mt-1 font-heading text-2xl font-bold text-content-primary">{value}</p>
      {caption && <p className="mt-1 font-caption text-xs text-content-muted">{caption}</p>}
    </Card>
  )
}

const daysSince = (fecha) => Math.max(0, Math.floor((Date.now() - toDate(fecha).getTime()) / 86400000))

export default function Finanzas() {
  const ctx = useOutletContext()
  const [data, setData] = useState(null)
  const [period, setPeriod] = useState('todo')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [showDeudores, setShowDeudores] = useState(false)

  useEffect(() => {
    let alive = true
    getFinanzasData().then((d) => {
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
    const inPeriod = (s) => (!from || s.fecha >= from) && (!to || s.fecha <= to)
    const real = data.sessions.filter(isReal)
    const scoped = real.filter(inPeriod)

    const sum = (rows) => rows.reduce((a, s) => a + Number(s.monto || 0), 0)

    // Por cobrar (debt): a session is only owed money if it ACTUALLY happened —
    // estado 'confirmada' AND past-dated (Nicolas, 2026-07-09). A 'programada'
    // (Pendiente) past session is NOT debt: it was never confirmed to have taken
    // place. (Contrast Ingreso Proyectado below, which DOES count Pendiente.)
    const porCobrarRows = scoped.filter(
      (s) => !s.pagado && s.estado === 'confirmada' && s.fecha < today,
    )

    // Facturación: pendiente = PAGADA sin factura (la factura sigue al pago).
    const sinFacturarRows = scoped.filter((s) => s.pagado && !s.facturada)
    const facturadas = scoped.filter((s) => s.facturada).length

    // Deudores: por-cobrar grouped by patient, OLDEST debt first — the
    // collection order (oldest debts must be chased first, per Nicolas).
    const deudAcc = {}
    for (const s of porCobrarRows) {
      const id = s.patient_id || 'sin'
      deudAcc[id] ||= { patient: s.patient, sesiones: 0, total: 0, desde: s.fecha }
      deudAcc[id].sesiones += 1
      deudAcc[id].total += Number(s.monto || 0)
      if (s.fecha < deudAcc[id].desde) deudAcc[id].desde = s.fecha
    }
    const deudores = Object.values(deudAcc).sort((a, b) => a.desde.localeCompare(b.desde))

    // Tendencia mensual: fixed last-12-months window (ignores the period
    // selector on purpose — it answers "am I growing?", not "this period").
    const trend = []
    const trendByKey = {}
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = dateKey(d).slice(0, 7)
      const row = {
        key,
        label: `${capitalize(new Intl.DateTimeFormat('es-EC', { month: 'short' }).format(d)).replace('.', '')} ${String(d.getFullYear()).slice(2)}`,
        bruto: 0,
        provision: 0,
      }
      trend.push(row)
      trendByKey[key] = row
    }
    for (const s of real) {
      const row = trendByKey[s.fecha.slice(0, 7)]
      if (!row) continue
      if (s.pagado) row.bruto += Number(s.monto || 0)
      row.provision += rateOf(s)
    }
    for (const row of trend) row.neto = row.bruto - row.provision
    const bruto = sum(scoped.filter((s) => s.pagado))
    const proyectado = sum(scoped)
    // Neto uses the provision of the SAME period so the subtraction is coherent
    // (the standalone Provisión card below is strictly current-month).
    const provisionPeriodo = scoped.reduce((a, s) => a + rateOf(s), 0)

    // Per-therapist lists are seeded from the therapists table so EVERYONE
    // appears, $0 included — grouping only the sessions would silently drop
    // therapists with no sessions in the window (per Nicolas, 2026-07-04).
    const seedByTherapist = (extra) => {
      const acc = {}
      for (const t of data.therapists) {
        if (t.activo === false) continue
        acc[t.id] = { therapist: t, sesiones: 0, ...extra }
      }
      return acc
    }

    // Provisión mensual (payroll reserve): current month, all real sessions.
    const mes = monthRange(now)
    const mesRows = real.filter((s) => s.fecha >= mes.from && s.fecha <= mes.to)
    const provisionMes = mesRows.reduce((a, s) => a + rateOf(s), 0)
    const provAcc = seedByTherapist({ monto: 0 })
    for (const s of mesRows) {
      const id = s.terapeuta_id || 'sin'
      provAcc[id] ||= { therapist: s.therapist, sesiones: 0, monto: 0 }
      provAcc[id].sesiones += 1
      provAcc[id].monto += rateOf(s)
    }
    const provisionPorTerapeuta = Object.values(provAcc).sort((a, b) => b.monto - a.monto)

    // Ingreso por terapeuta (period-scoped): paid revenue + session count.
    const ingresoAcc = seedByTherapist({ bruto: 0 })
    for (const s of scoped) {
      const id = s.terapeuta_id || 'sin'
      ingresoAcc[id] ||= { therapist: s.therapist, sesiones: 0, bruto: 0 }
      ingresoAcc[id].sesiones += 1
      if (s.pagado) ingresoAcc[id].bruto += Number(s.monto || 0)
    }
    const porTerapeuta = Object.values(ingresoAcc).sort((a, b) => b.bruto - a.bruto)

    return {
      porCobrar: { count: porCobrarRows.length, total: sum(porCobrarRows) },
      sinFacturar: { count: sinFacturarRows.length, total: sum(sinFacturarRows) },
      facturadas,
      deudores,
      trend,
      bruto,
      proyectado,
      neto: bruto - provisionPeriodo,
      provisionPeriodo,
      provisionMes,
      provisionPorTerapeuta,
      mesSesiones: mesRows.length,
      porTerapeuta,
      sesiones: scoped.length,
    }
  }, [data, period, custom, today]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!data || !m) {
    return (
      <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-card bg-white/50" />
        ))}
      </div>
    )
  }

  const monthLabel = capitalize(
    new Intl.DateTimeFormat('es-EC', { month: 'long', year: 'numeric' }).format(now),
  )

  return (
    <div className="space-y-5 pt-2">
      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-56">
          <Select
            options={PERIODS}
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            placeholder=""
          />
        </div>
        {period === 'personalizado' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={custom.from}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              className="rounded-xl border border-stroke bg-white/70 px-3 py-2 font-body text-sm text-content-primary focus:border-brand-lavender focus:outline-none"
            />
            <span className="font-caption text-xs text-content-muted">a</span>
            <input
              type="date"
              value={custom.to}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              className="rounded-xl border border-stroke bg-white/70 px-3 py-2 font-body text-sm text-content-primary focus:border-brand-lavender focus:outline-none"
            />
          </div>
        )}
        <span className="font-caption text-xs text-content-muted">
          {m.sesiones} sesiones en el período (llamadas y canceladas excluidas)
        </span>
      </div>

      {/* KPIs (period-scoped) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          label="Sesiones por cobrar"
          value={formatCurrency(m.porCobrar.total)}
          caption={`${m.porCobrar.count} ${m.porCobrar.count === 1 ? 'sesión pasada sin pagar' : 'sesiones pasadas sin pagar'} · toca para ver deudores`}
          onClick={() => setShowDeudores((v) => !v)}
          active={showDeudores}
        />
        <KpiCard
          label="Ingreso bruto"
          value={formatCurrency(m.bruto)}
          caption="Solo sesiones ya pagadas"
        />
        <KpiCard
          label="Ingreso proyectado"
          value={formatCurrency(m.proyectado)}
          caption="Pagadas + agendadas sin pagar"
        />
        <KpiCard
          label="Ingreso neto"
          value={formatCurrency(m.neto)}
          caption={`Bruto − provisión del período (${formatCurrency(m.provisionPeriodo)})`}
        />
        <KpiCard
          label="Pendientes de facturar"
          value={formatCurrency(m.sinFacturar.total)}
          caption={`${m.sinFacturar.count} ${m.sinFacturar.count === 1 ? 'pagada sin factura' : 'pagadas sin factura'} · ${m.facturadas} facturadas`}
        />
      </div>

      {/* Deudores — expanded from the por-cobrar KPI. Oldest debt first: the
          collection order. */}
      {showDeudores && (
        <Card className="p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-caption text-xs font-bold uppercase tracking-wide text-content-muted">
              Deudores — de la deuda más antigua a la más reciente
            </p>
            <p className="font-caption text-xs text-content-muted">
              {m.deudores.length} {m.deudores.length === 1 ? 'paciente' : 'pacientes'}
            </p>
          </div>
          <div className="mt-3 divide-y divide-stroke/40">
            {m.deudores.map((d, i) => (
              <div key={d.patient?.id || i} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <div className="min-w-[160px] flex-1">
                  <p className="truncate font-body font-bold text-content-primary">
                    {d.patient ? fullName(d.patient) : 'Paciente eliminado'}
                  </p>
                  {d.patient?.telefono && (
                    <p className="font-caption text-xs text-content-muted">{d.patient.telefono}</p>
                  )}
                </div>
                <span className="font-caption text-xs text-content-muted">
                  {d.sesiones} {d.sesiones === 1 ? 'sesión' : 'sesiones'}
                </span>
                <span className="font-caption text-xs text-amber-600">
                  desde {formatDateShort(d.desde)} · {daysSince(d.desde)} días
                </span>
                <span className="w-20 text-right font-heading text-sm font-bold text-content-primary">
                  {formatCurrency(d.total)}
                </span>
              </div>
            ))}
            {m.deudores.length === 0 && (
              <p className="py-2 font-caption text-sm text-content-muted">
                Nadie debe nada en el período seleccionado. 🎉
              </p>
            )}
          </div>
        </Card>
      )}

      {/* Tendencia mensual — fixed 12-month window, ignores the period selector */}
      <Card className="p-5">
        <p className="font-caption text-xs font-bold uppercase tracking-wide text-content-muted">
          Tendencia mensual — últimos 12 meses
        </p>
        <p className="mt-1 font-caption text-xs text-content-muted">
          Bruto = pagado por fecha de sesión · Neto = bruto − provisión del mes. No sigue el
          selector de período.
        </p>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={m.trend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#00000012" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
              <Tooltip formatter={(v, name) => [formatCurrency(v), name]} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="bruto" name="Ingreso bruto" fill="#b48ae4" radius={[6, 6, 0, 0]} />
              <Line dataKey="neto" name="Ingreso neto" stroke="#14B8A6" strokeWidth={2} dot={{ r: 2.5 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Provisión — strictly current month */}
        <Card className="p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-caption text-xs font-bold uppercase tracking-wide text-content-muted">
              Provisión de terapeutas — {monthLabel}
            </p>
            <p className="font-heading text-2xl font-bold text-content-primary">
              {formatCurrency(m.provisionMes)}
            </p>
          </div>
          <p className="mt-1 font-caption text-xs text-content-muted">
            Reserva líquida para pagar a los terapeutas por las {m.mesSesiones} sesiones del mes
            (confirmadas y pendientes; se paga aunque el paciente no haya pagado). Mariana no
            provisiona — recibe el 100%.
          </p>
          <div className="mt-4 divide-y divide-stroke/40">
            {m.provisionPorTerapeuta.map((row, i) => (
              <div key={row.therapist?.id || i} className="flex items-center gap-2.5 py-2">
                <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: row.therapist?.color || '#9ca3af' }} />
                <span className="min-w-0 flex-1 truncate font-body text-sm text-content-primary">
                  {row.therapist ? fullName(row.therapist) : 'Sin terapeuta'}
                </span>
                <span className="font-caption text-xs text-content-muted">
                  {row.sesiones} × {formatCurrency(rateOf(row))}
                </span>
                <span className="w-20 text-right font-heading text-sm font-bold text-content-primary">
                  {formatCurrency(row.monto)}
                </span>
              </div>
            ))}
            {m.provisionPorTerapeuta.length === 0 && (
              <p className="py-2 font-caption text-sm text-content-muted">Sin sesiones este mes.</p>
            )}
          </div>
        </Card>

        {/* Ingreso por terapeuta — period-scoped */}
        <Card className="p-5">
          <p className="font-caption text-xs font-bold uppercase tracking-wide text-content-muted">
            Ingreso por terapeuta
          </p>
          <p className="mt-1 font-caption text-xs text-content-muted">
            Ingreso bruto (solo pagado) y sesiones del período seleccionado.
          </p>
          <div className="mt-4 divide-y divide-stroke/40">
            {m.porTerapeuta.map((row, i) => (
              <div key={row.therapist?.id || i} className="flex items-center gap-2.5 py-2">
                <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: row.therapist?.color || '#9ca3af' }} />
                <span className="min-w-0 flex-1 truncate font-body text-sm text-content-primary">
                  {row.therapist ? fullName(row.therapist) : 'Sin terapeuta'}
                </span>
                <span className="font-caption text-xs text-content-muted">
                  {row.sesiones} {row.sesiones === 1 ? 'sesión' : 'sesiones'}
                </span>
                <span className="w-20 text-right font-heading text-sm font-bold text-content-primary">
                  {formatCurrency(row.bruto)}
                </span>
              </div>
            ))}
            {m.porTerapeuta.length === 0 && (
              <p className="py-2 font-caption text-sm text-content-muted">Sin sesiones en el período.</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
