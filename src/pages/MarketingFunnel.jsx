import React, { useMemo, useState } from 'react'
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts'

import { Card } from '../components/Card/Card.jsx'
import { Badge } from '../components/Badge/Badge.jsx'
import { Button } from '../components/Button/Button.jsx'
import { Select } from '../components/Select/Select.jsx'
import { Input } from '../components/Input/Input.jsx'
import { Toggle } from '../components/Toggle/Toggle.jsx'
import { dateKey } from '../lib/format.js'
import {
  FUNNEL_STAGES, computeFunnel, filterByRange, funnelByAd, funnelSeries,
} from '../lib/funnel.js'

// ─── Lead-bot funnel dashboard + config (owner-only, #4 + #20) ───────────────
// Reads the `leads` rows and derives the button-bot funnel. The old campaign
// spend view lives on in the "Campañas" tab; this is the new default view.

const pct = (n) => (n == null ? '—' : `${(n * 100).toFixed(0)}%`)

function humanMinutes(min) {
  if (min == null) return '—'
  if (min < 60) return `${Math.round(min)} min`
  if (min < 60 * 24) return `${(min / 60).toFixed(1)} h`
  return `${(min / 1440).toFixed(1)} d`
}

const FUNNEL_PERIODS = [
  { value: 'todo', label: 'Todo el historial' },
  { value: 'este_mes', label: 'Este mes' },
  { value: 'ultimas_4', label: 'Últimas 4 semanas' },
]
function funnelRange(period, now) {
  if (period === 'este_mes') return { from: dateKey(new Date(now.getFullYear(), now.getMonth(), 1)), to: dateKey(now) }
  if (period === 'ultimas_4') { const f = new Date(now); f.setDate(f.getDate() - 27); return { from: dateKey(f), to: dateKey(now) } }
  return { from: null, to: null }
}

function KpiCard({ label, value, caption }) {
  return (
    <Card className="p-4">
      <p className="font-heading text-xs font-bold uppercase tracking-wide text-content-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold text-content-primary">{value}</p>
      {caption && <p className="mt-0.5 font-body text-xs text-content-secondary">{caption}</p>}
    </Card>
  )
}

// Horizontal funnel: one bar per stage, width ∝ share of total, with the
// step-to-step conversion beside it.
function FunnelBars({ funnel }) {
  const max = funnel.counts.leads || 1
  return (
    <div className="space-y-2">
      {FUNNEL_STAGES.map((s, i) => {
        const count = funnel.counts[s.key]
        const step = funnel.steps.find((x) => x.to === s.key)
        return (
          <div key={s.key} className="flex items-center gap-3">
            <div className="w-28 shrink-0 font-heading text-sm font-bold text-content-secondary">{s.label}</div>
            <div className="relative h-8 flex-1 overflow-hidden rounded-lg bg-surface-warm">
              <div
                className="flex h-full items-center rounded-lg bg-brand-lavender/80 px-2 transition-all"
                style={{ width: `${Math.max(6, (100 * count) / max)}%` }}
              >
                <span className="font-heading text-sm font-bold text-white">{count}</span>
              </div>
            </div>
            <div className="w-16 shrink-0 text-right font-body text-xs text-content-secondary">
              {i === 0 ? `${pct(count / max)}` : step ? pct(step.pct) : '—'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function FunnelDashboard({ data }) {
  const now = new Date()
  const [period, setPeriod] = useState('todo')
  const [weekly, setWeekly] = useState(false)

  const scoped = useMemo(() => {
    const { from, to } = funnelRange(period, now)
    return filterByRange(data.leads || [], from, to)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.leads, period])

  const funnel = useMemo(() => computeFunnel(scoped), [scoped])
  const byAd = useMemo(() => funnelByAd(scoped), [scoped])
  const series = useMemo(() => funnelSeries(scoped, { weekly }), [scoped, weekly])

  const leadToBooked = funnel.counts.leads ? funnel.counts.agendo / funnel.counts.leads : null
  const leadToPatient = funnel.counts.leads ? funnel.counts.paciente / funnel.counts.leads : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-56">
          <Select value={period} onChange={(e) => setPeriod(e.target.value)} options={FUNNEL_PERIODS} />
        </div>
        <Toggle checked={weekly} onChange={setWeekly} label={weekly ? 'Por semana' : 'Por día'} />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Leads" value={funnel.counts.leads} caption={`${funnel.counts.agendo} agendaron`} />
        <KpiCard label="Lead → agendó" value={pct(leadToBooked)} caption="meta ≥ 25%" />
        <KpiCard label="Lead → paciente" value={pct(leadToPatient)} caption={`${funnel.counts.paciente} pacientes`} />
        <KpiCard label="Tiempo a agendar" value={humanMinutes(funnel.medianBookingMin)} caption="mediana" />
      </div>

      <Card className="p-5">
        <h3 className="mb-4 font-display text-lg font-bold text-content-primary">Embudo</h3>
        {funnel.counts.leads === 0
          ? <p className="font-body text-sm text-content-secondary">Aún no hay leads en este período.</p>
          : <FunnelBars funnel={funnel} />}
      </Card>

      <Card className="p-5">
        <h3 className="mb-4 font-display text-lg font-bold text-content-primary">
          Leads y conversión {weekly ? 'por semana' : 'por día'}
        </h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="leads" name="Leads" fill="#c9b8ec" radius={[4, 4, 0, 0]} />
              <Line dataKey="agendo" name="Agendó" stroke="#7c5cbf" strokeWidth={2} dot={false} />
              <Line dataKey="paciente" name="Paciente" stroke="#2f9e6f" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="mb-4 font-display text-lg font-bold text-content-primary">Por anuncio</h3>
        {byAd.length === 0
          ? <p className="font-body text-sm text-content-secondary">Sin datos.</p>
          : (
            <div className="overflow-x-auto">
              <table className="w-full text-left font-body text-sm">
                <thead>
                  <tr className="border-b border-stroke text-xs uppercase text-content-muted">
                    <th className="py-2 pr-3">Anuncio</th>
                    <th className="px-2 text-right">Leads</th>
                    <th className="px-2 text-right">Tocó</th>
                    <th className="px-2 text-right">Agendó</th>
                    <th className="px-2 text-right">Paciente</th>
                    <th className="px-2 text-right">Lead→agendó</th>
                  </tr>
                </thead>
                <tbody>
                  {byAd.map((g) => (
                    <tr key={g.key} className="border-b border-stroke/50">
                      <td className="py-2 pr-3 text-content-primary">
                        {g.headline || (g.source === 'meta_ctwa' ? 'Meta (sin título)' : 'Orgánico')}
                      </td>
                      <td className="px-2 text-right">{g.funnel.counts.leads}</td>
                      <td className="px-2 text-right">{g.funnel.counts.toco}</td>
                      <td className="px-2 text-right">{g.funnel.counts.agendo}</td>
                      <td className="px-2 text-right">{g.funnel.counts.paciente}</td>
                      <td className="px-2 text-right">
                        {pct(g.funnel.counts.leads ? g.funnel.counts.agendo / g.funnel.counts.leads : null)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>
    </div>
  )
}

// ─── Config: category → cards mapping + captions/recibe_nuevos ───────────────

function CategoriaEditor({ cat, therapists, onSave }) {
  const [ids, setIds] = useState(cat.terapeutas || [])
  const [busy, setBusy] = useState(false)
  const byId = new Map(therapists.map((t) => [t.id, t]))
  const inList = new Set(ids)
  const available = therapists.filter((t) => !inList.has(t.id) && t.activo)

  const move = (i, d) => {
    const next = [...ids]
    const j = i + d
    if (j < 0 || j >= next.length) return
    ;[next[i], next[j]] = [next[j], next[i]]
    setIds(next)
  }
  const remove = (id) => setIds(ids.filter((x) => x !== id))
  const add = (id) => id && setIds([...ids, id])

  const dirty = JSON.stringify(ids) !== JSON.stringify(cat.terapeutas || [])
  const save = async () => { setBusy(true); await onSave(cat.id, { terapeutas: ids }); setBusy(false) }

  if (cat.especial === 'no_seguro') {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <span className="font-heading font-bold text-content-primary">{cat.etiqueta}</span>
          <Badge variant="neutral">automático</Badge>
        </div>
        <p className="mt-1 font-body text-xs text-content-secondary">
          3 terapeutas con horario más cercano (recibe nuevos); Francisco siempre incluido.
        </p>
      </Card>
    )
  }

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-heading font-bold text-content-primary">{cat.etiqueta}</span>
        {dirty && <Button size="sm" onClick={save} disabled={busy}>Guardar</Button>}
      </div>
      <p className="mb-2 font-body text-xs text-content-muted">
        Orden de las tarjetas. El bot filtra por “recibe nuevos” y muestra las primeras 3.
      </p>
      <ol className="space-y-1">
        {ids.map((id, i) => {
          const t = byId.get(id)
          const shows = i < 3 && t?.recibe_nuevos
          return (
            <li key={id} className="flex items-center gap-2 rounded-lg bg-surface-warm px-2 py-1.5">
              <span className="w-5 text-center font-heading text-xs font-bold text-content-muted">{i + 1}</span>
              <span className="flex-1 font-body text-sm text-content-primary">
                {t ? `${t.nombre} ${t.apellido}` : id}
                {t && !t.recibe_nuevos && <span className="ml-1 text-xs text-content-muted">(no recibe)</span>}
              </span>
              {shows && <Badge variant="neutral" className="bg-emerald-100 text-emerald-700">visible</Badge>}
              <button className="px-1 text-content-muted hover:text-content-primary" onClick={() => move(i, -1)} aria-label="subir">↑</button>
              <button className="px-1 text-content-muted hover:text-content-primary" onClick={() => move(i, 1)} aria-label="bajar">↓</button>
              <button className="px-1 text-rose-600 hover:opacity-70" onClick={() => remove(id)} aria-label="quitar">✕</button>
            </li>
          )
        })}
      </ol>
      {available.length > 0 && (
        <div className="mt-2 w-56">
          <Select
            value=""
            onChange={(e) => add(e.target.value)}
            placeholder="Añadir terapeuta…"
            options={available.map((t) => ({ value: t.id, label: `${t.nombre} ${t.apellido}` }))}
          />
        </div>
      )}
    </Card>
  )
}

function TherapistFunnelRow({ t, onSave }) {
  const [caption, setCaption] = useState(t.funnel_caption || '')
  const [cardUrl, setCardUrl] = useState(t.funnel_card_url || '')
  const [recibe, setRecibe] = useState(!!t.recibe_nuevos)
  const [busy, setBusy] = useState(false)
  const dirty = caption !== (t.funnel_caption || '') || cardUrl !== (t.funnel_card_url || '') || recibe !== !!t.recibe_nuevos
  const save = async () => {
    setBusy(true)
    await onSave(t.id, { funnel_caption: caption, funnel_card_url: cardUrl || null, recibe_nuevos: recibe })
    setBusy(false)
  }
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-heading font-bold text-content-primary">{t.nombre} {t.apellido}</span>
        <div className="flex items-center gap-3">
          <Toggle checked={recibe} onChange={setRecibe} label="Recibe nuevos" />
          {dirty && <Button size="sm" onClick={save} disabled={busy}>Guardar</Button>}
        </div>
      </div>
      <textarea
        className="w-full rounded-lg border border-stroke bg-white p-2 font-body text-sm text-content-primary"
        rows={3} value={caption} placeholder="Frase de la tarjeta…"
        onChange={(e) => setCaption(e.target.value)}
      />
      <div className="mt-2">
        <Input
          label="URL de la imagen de la tarjeta"
          value={cardUrl} placeholder="https://…"
          onChange={(e) => setCardUrl(e.target.value)}
        />
      </div>
    </Card>
  )
}

export function FunnelConfig({ data, onSaveCategoria, onSaveTherapist }) {
  const therapists = data.therapists || []
  // Mariana is excluded permanently — no card, never in the pool.
  const pool = therapists.filter((t) => t.nombre !== 'Mariana')
  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-1 font-display text-lg font-bold text-content-primary">Categorías → tarjetas</h3>
        <p className="mb-3 font-body text-sm text-content-secondary">
          Qué terapeutas se recomiendan por tema, en orden. El bot muestra las 3 primeras que reciben nuevos.
        </p>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {(data.categorias || []).map((cat) => (
            <CategoriaEditor key={cat.id} cat={cat} therapists={pool} onSave={onSaveCategoria} />
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-1 font-display text-lg font-bold text-content-primary">Terapeutas: frases y tarjetas</h3>
        <p className="mb-3 font-body text-sm text-content-secondary">
          Frase de la tarjeta, imagen y si reciben pacientes nuevos por el bot.
        </p>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {pool.map((t) => (
            <TherapistFunnelRow key={t.id} t={t} onSave={onSaveTherapist} />
          ))}
        </div>
      </section>
    </div>
  )
}
