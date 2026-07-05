import React, { useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'
import { Card } from '../components/Card/Card.jsx'
import { Badge } from '../components/Badge/Badge.jsx'
import { getSeguimientoData } from '../lib/queries.js'
import { adherence, isAttended, hasUpcoming } from '../lib/adherence.js'
import { dateKey, fullName, formatDateShort, capitalize, toDate } from '../lib/format.js'
import { FRECUENCIA_PACIENTE } from '../lib/constants.js'

// Seguimiento — patient adherence to therapy (owner + therapists; RLS scopes
// therapists to their own patients/sessions automatically).
// Core metric: historic attendance rate = confirmadas vs expected from the
// patient's frecuencia (semanal 4/mes, quincenal 2/mes; >100% allowed).
// Plus retention: monthly actives (nuevos vs recurrentes + % retención),
// pacientes en riesgo, and lifetime sessions per patient.

// Days without an attended session before a patient counts as "en riesgo":
// twice their expected interval; conservative default when frecuencia is unset.
const RIESGO_DIAS = { semanal: 14, quincenal: 28, default: 21 }

const daysSince = (fecha) =>
  Math.max(0, Math.floor((Date.now() - toDate(fecha).getTime()) / 86400000))

const pct = (rate) => (rate == null ? '—' : `${Math.round(rate * 100)}%`)

// Worst adherence reads red, healthy reads teal — actionable at a glance.
const rateColor = (rate) =>
  rate == null ? 'text-content-muted'
    : rate >= 0.85 ? 'text-teal-600'
    : rate >= 0.6 ? 'text-amber-600'
    : 'text-red-500'

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

function TherapistDot({ color }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full"
      style={{ backgroundColor: color || '#9ca3af' }}
    />
  )
}

export default function Seguimiento() {
  const ctx = useOutletContext()
  const [data, setData] = useState(null)
  const [showRiesgo, setShowRiesgo] = useState(false)

  useEffect(() => {
    let alive = true
    getSeguimientoData().then((d) => {
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
    const therapistById = Object.fromEntries(data.therapists.map((t) => [t.id, t]))

    // Date-ascending guaranteed here (the live query orders, demo may not) —
    // "first"/"última" lookups below rely on it.
    const byPatient = {}
    for (const s of [...data.sessions].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
      ;(byPatient[s.patient_id] ||= []).push(s)
    }
    const attendedOf = (p) => (byPatient[p.id] || []).filter((s) => isAttended(s, today))

    // ── Adherencia ──
    const conFrecuencia = data.patients.filter((p) => p.frecuencia)
    const adherencia = []
    const sinSesiones = []
    for (const p of conFrecuencia) {
      const a = adherence(p, byPatient[p.id] || [], today)
      const row = { patient: p, therapist: therapistById[p.terapeuta_id], ...a }
      if (a.rate == null) sinSesiones.push(row)
      else adherencia.push(row)
    }
    adherencia.sort((a, b) => a.rate - b.rate)
    const promedio = adherencia.length
      ? adherencia.reduce((acc, r) => acc + r.rate, 0) / adherencia.length
      : null

    // Patients already in therapy but without a defined cadence — they are
    // invisible to the metric until someone sets their frecuencia.
    const sinFrecuencia = data.patients
      .filter((p) => !p.frecuencia)
      .map((p) => ({ patient: p, therapist: therapistById[p.terapeuta_id], asistidas: attendedOf(p).length }))
      .filter((r) => r.asistidas > 0)
      .sort((a, b) => b.asistidas - a.asistidas)

    // ── Pacientes en riesgo ──
    // Came at least once, nothing on the calendar, and silent for longer than
    // twice their expected interval. Alta/baja patients left out — they exited
    // deliberately, they are not "at risk".
    const enRiesgo = []
    for (const p of data.patients) {
      if (p.estado_general === 'alta' || p.estado_general === 'baja') continue
      const attended = attendedOf(p)
      if (attended.length === 0) continue
      if (hasUpcoming(byPatient[p.id] || [], today)) continue
      const ultima = attended[attended.length - 1].fecha
      const dias = daysSince(ultima)
      const limite = RIESGO_DIAS[p.frecuencia] || RIESGO_DIAS.default
      if (dias > limite) {
        enRiesgo.push({ patient: p, therapist: therapistById[p.terapeuta_id], ultima, dias, sesiones: attended.length })
      }
    }
    enRiesgo.sort((a, b) => b.dias - a.dias)

    // ── Actividad mensual (fixed last-12-months window, like Finanzas) ──
    const firstMonthOf = {}
    for (const p of data.patients) {
      const attended = attendedOf(p)
      if (attended.length) firstMonthOf[p.id] = attended[0].fecha.slice(0, 7)
    }
    const activeSets = []
    const meses = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = dateKey(d).slice(0, 7)
      const activos = new Set()
      for (const p of data.patients) {
        if (attendedOf(p).some((s) => s.fecha.slice(0, 7) === key)) activos.add(p.id)
      }
      let nuevos = 0
      for (const id of activos) if (firstMonthOf[id] === key) nuevos++
      const prev = activeSets[activeSets.length - 1]
      let retencion = null
      if (prev && prev.size > 0) {
        let kept = 0
        for (const id of prev) if (activos.has(id)) kept++
        retencion = Math.round((kept / prev.size) * 100)
      }
      activeSets.push(activos)
      meses.push({
        label: `${capitalize(new Intl.DateTimeFormat('es-EC', { month: 'short' }).format(d)).replace('.', '')} ${String(d.getFullYear()).slice(2)}`,
        nuevos,
        recurrentes: activos.size - nuevos,
        retencion,
      })
    }

    // ── Sesiones por paciente (lifetime) ──
    const counts = data.patients.map((p) => attendedOf(p).length).filter((n) => n > 0)
    const totalAsistidas = counts.reduce((a, n) => a + n, 0)
    const promedioSesiones = counts.length ? totalAsistidas / counts.length : null
    const buckets = [
      { label: '1 sesión', test: (n) => n === 1 },
      { label: '2–5 sesiones', test: (n) => n >= 2 && n <= 5 },
      { label: '6–10 sesiones', test: (n) => n >= 6 && n <= 10 },
      { label: '11+ sesiones', test: (n) => n >= 11 },
    ].map((b) => ({ label: b.label, n: counts.filter(b.test).length }))

    return {
      adherencia, sinSesiones, promedio, sinFrecuencia, enRiesgo, meses,
      promedioSesiones, pacientesConSesiones: counts.length, buckets,
    }
  }, [data, today])

  if (!data || !m) {
    return (
      <div className="grid grid-cols-1 gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-card bg-white/50" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-5 pt-2">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Adherencia promedio"
          value={pct(m.promedio)}
          caption={`${m.adherencia.length} ${m.adherencia.length === 1 ? 'paciente' : 'pacientes'} con frecuencia y sesiones`}
        />
        <KpiCard
          label="En seguimiento"
          value={m.adherencia.length + m.sinSesiones.length}
          caption={
            m.sinFrecuencia.length > 0
              ? `${m.sinFrecuencia.length} en terapia sin frecuencia definida`
              : 'Todos los pacientes activos tienen frecuencia'
          }
        />
        <KpiCard
          label="Pacientes en riesgo"
          value={m.enRiesgo.length}
          caption="Sin próxima cita y ausentes más de lo esperado · toca para ver quiénes"
          onClick={() => setShowRiesgo((v) => !v)}
          active={showRiesgo}
        />
        <KpiCard
          label="Sesiones por paciente"
          value={m.promedioSesiones == null ? '—' : m.promedioSesiones.toFixed(1)}
          caption={`Promedio histórico · ${m.pacientesConSesiones} pacientes con sesiones`}
        />
      </div>

      {/* Pacientes en riesgo — expanded from the KPI, like Deudores in
          Finanzas. The daily contact list: came before, nothing scheduled,
          silent longer than twice their expected cadence. */}
      {showRiesgo && (
        <Card className="p-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="font-caption text-xs font-bold uppercase tracking-wide text-content-muted">
              Pacientes en riesgo — más tiempo ausente primero
            </p>
            <p className="font-caption text-xs text-content-muted">
              Sin próxima cita agendada y sin venir hace más del doble de su frecuencia
            </p>
          </div>
          <div className="mt-3 divide-y divide-stroke/40">
            {m.enRiesgo.map((r) => (
              <div key={r.patient.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <TherapistDot color={r.therapist?.color} />
                <div className="min-w-[160px] flex-1">
                  <p className="truncate font-body font-bold text-content-primary">{fullName(r.patient)}</p>
                  {r.patient.telefono && (
                    <p className="font-caption text-xs text-content-muted">{r.patient.telefono}</p>
                  )}
                </div>
                <span className="font-caption text-xs text-content-muted">
                  {r.sesiones} {r.sesiones === 1 ? 'sesión' : 'sesiones'}
                </span>
                <span className="font-caption text-xs text-red-500">
                  última {formatDateShort(r.ultima)} · hace {r.dias} días
                </span>
              </div>
            ))}
            {m.enRiesgo.length === 0 && (
              <p className="py-2 font-caption text-sm text-content-muted">
                Nadie en riesgo: todos tienen cita próxima o vinieron hace poco. 🎉
              </p>
            )}
          </div>
        </Card>
      )}

      {/* Adherencia por paciente */}
      <Card className="p-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-caption text-xs font-bold uppercase tracking-wide text-content-muted">
            Adherencia por paciente — de menor a mayor
          </p>
          <p className="font-caption text-xs text-content-muted">
            Asistidas (confirmadas) vs esperadas según frecuencia · semanal ≈ 4/mes, quincenal ≈ 2/mes · &gt;100% posible
          </p>
        </div>
        <div className="mt-3 divide-y divide-stroke/40">
          {m.adherencia.map((r) => (
            <div key={r.patient.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
              <TherapistDot color={r.therapist?.color} />
              <div className="min-w-[160px] flex-1">
                <p className="truncate font-body font-bold text-content-primary">{fullName(r.patient)}</p>
                <p className="font-caption text-xs text-content-muted">
                  desde {formatDateShort(r.desde)}
                </p>
              </div>
              <Badge variant={r.patient.frecuencia === 'semanal' ? 'lavender' : 'yellow'}>
                {FRECUENCIA_PACIENTE[r.patient.frecuencia]}
              </Badge>
              <span className="font-caption text-xs text-content-muted">
                {r.asistidas} de {Math.round(r.esperadas)} esperadas
              </span>
              <span className={`w-14 text-right font-heading text-sm font-bold ${rateColor(r.rate)}`}>
                {pct(r.rate)}
              </span>
            </div>
          ))}
          {m.adherencia.length === 0 && (
            <p className="py-2 font-caption text-sm text-content-muted">
              Ningún paciente tiene frecuencia definida todavía. Se configura en la ficha del
              paciente (Pacientes → Configuración → Frecuencia).
            </p>
          )}
        </div>
        {m.sinSesiones.length > 0 && (
          <p className="mt-3 font-caption text-xs text-content-muted">
            Con frecuencia pero aún sin sesiones confirmadas:{' '}
            {m.sinSesiones.map((r) => fullName(r.patient)).join(', ')}.
          </p>
        )}
        {m.sinFrecuencia.length > 0 && (
          <p className="mt-2 font-caption text-xs text-amber-600">
            Sin frecuencia definida (no aparecen arriba):{' '}
            {m.sinFrecuencia.map((r) => `${fullName(r.patient)} (${r.asistidas})`).join(', ')}.
          </p>
        )}
      </Card>

      {/* Actividad mensual */}
      <Card className="p-5">
        <p className="font-caption text-xs font-bold uppercase tracking-wide text-content-muted">
          Pacientes activos por mes — últimos 12 meses
        </p>
        <p className="mt-1 font-caption text-xs text-content-muted">
          Activo = al menos una sesión confirmada en el mes. Retención = % de los activos del mes
          anterior que volvieron.
        </p>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={m.meses} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#00000012" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="n" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
              <YAxis yAxisId="pct" orientation="right" domain={[0, 100]} tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={40} unit="%" />
              <Tooltip formatter={(v, name) => (name === 'Retención' ? [`${v}%`, name] : [v, name])} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="n" dataKey="recurrentes" name="Recurrentes" stackId="a" fill="#b48ae4" radius={[0, 0, 0, 0]} />
              <Bar yAxisId="n" dataKey="nuevos" name="Nuevos" stackId="a" fill="#14B8A6" radius={[6, 6, 0, 0]} />
              <Line yAxisId="pct" dataKey="retencion" name="Retención" stroke="#F97316" strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Distribución de sesiones por paciente */}
      <Card className="p-5">
        <p className="font-caption text-xs font-bold uppercase tracking-wide text-content-muted">
          Cuánto duran los procesos — sesiones confirmadas por paciente (histórico)
        </p>
        <div className="mt-3 divide-y divide-stroke/40">
          {m.buckets.map((b) => (
            <div key={b.label} className="flex items-center gap-3 py-2">
              <span className="w-32 flex-shrink-0 font-body text-sm text-content-primary">{b.label}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-pill bg-stroke/30">
                <div
                  className="h-full rounded-pill bg-brand-lavender"
                  style={{ width: `${m.pacientesConSesiones ? (b.n / m.pacientesConSesiones) * 100 : 0}%` }}
                />
              </div>
              <span className="w-24 flex-shrink-0 text-right font-caption text-xs text-content-muted">
                {b.n} {b.n === 1 ? 'paciente' : 'pacientes'}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
