import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'

import { Card } from '../components/Card/Card.jsx'
import { Badge } from '../components/Badge/Badge.jsx'
import { Button } from '../components/Button/Button.jsx'
import { Input } from '../components/Input/Input.jsx'
import { Toggle } from '../components/Toggle/Toggle.jsx'

import {
  getMarketingData, createCampaign, updateCampaign, importCampaignMetrics,
} from '../lib/queries.js'
import { parseMetaCsv } from '../lib/metaCsv.js'
import { formatCurrency, formatDateShort, fullName, dateKey } from '../lib/format.js'
import { IconWallet, IconUsers, IconPulse, IconChat, IconPhone, IconMegaphone } from '../layout/icons.jsx'

// Owner-only marketing funnel: Meta Ads → WhatsApp → llamada 10 min → paciente.
// Top of the funnel (spend/impressions/clicks/conversations) is entered per
// campaign — by hand or importing the Meta Ads CSV report. The bottom half
// (llamadas, pacientes, ingreso) is derived live from sessions/patients via
// campaign attribution (?c=<slug> links + the Fuente field in Pacientes).

const num = new Intl.NumberFormat('es-EC')
const money2 = (n) =>
  new Intl.NumberFormat('es-EC', { style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol' })
    .format(Number(n) || 0)
const pct = (part, whole) => (whole > 0 ? `${((100 * part) / whole).toFixed(1)}%` : '—')

const isRealSession = (s) =>
  s.tipo !== 'llamada' && s.estado !== 'cancelada' && s.estado !== 'no_show'
const isLlamada = (s) =>
  s.tipo === 'llamada' && s.estado !== 'cancelada' && s.estado !== 'no_show'

const slugify = (name) =>
  String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

// ─── Metric derivation ───────────────────────────────────────────────────────

function computeMarketing({ campaigns, patients, sessions }) {
  const today = dateKey()
  const sessionsByPatient = new Map()
  for (const s of sessions) {
    const list = sessionsByPatient.get(s.patient_id)
    if (list) list.push(s)
    else sessionsByPatient.set(s.patient_id, [s])
  }
  const paidTotal = (p) =>
    (sessionsByPatient.get(p.id) || []).reduce(
      (a, s) => a + (s.pagado ? Number(s.monto || 0) : 0), 0)
  const hasRealSession = (p) => (sessionsByPatient.get(p.id) || []).some(isRealSession)

  // Practice-wide LTV: total paid revenue ÷ patients with ≥1 real session.
  const withSession = patients.filter(hasRealSession)
  const totalPaid = withSession.reduce((a, p) => a + paidTotal(p), 0)
  const ltvGlobal = withSession.length ? totalPaid / withSession.length : 0

  // Practice-wide llamada→paciente conversion (all time): among patients whose
  // first llamada already happened, how many scheduled a real session after it.
  let called = 0
  let converted = 0
  for (const p of patients) {
    const list = sessionsByPatient.get(p.id) || []
    const firstCall = list.filter(isLlamada).map((s) => s.fecha).sort()[0]
    if (!firstCall || firstCall > today) continue
    called++
    if (list.some((s) => isRealSession(s) && s.fecha >= firstCall)) converted++
  }

  const perCampaign = campaigns.map((c) => {
    const attributed = patients.filter((p) => p.campaign_id === c.id)
    const cSessions = sessions.filter((s) => s.campaign_id === c.id)
    const llamadas = cSessions.filter(isLlamada).length
    const convertedPatients = attributed.filter(hasRealSession)
    const revenue = attributed.reduce((a, p) => a + paidTotal(p), 0)
    const spend = Number(c.spend || 0)
    // Patients created inside the campaign window with no explicit source —
    // shown as an ESTIMATE, never mixed into the exact numbers.
    const end = c.fecha_fin || today
    const estimated = patients.filter(
      (p) => !p.fuente && !p.campaign_id &&
        String(p.created_at || '').slice(0, 10) >= c.fecha_inicio &&
        String(p.created_at || '').slice(0, 10) <= end,
    ).length
    return {
      campaign: c,
      llamadas,
      pacientes: convertedPatients.length,
      leads: attributed.length,
      revenue,
      estimated,
      cpa: convertedPatients.length ? spend / convertedPatients.length : null,
      ltv: convertedPatients.length ? revenue / convertedPatients.length : null,
      roas: spend > 0 ? revenue / spend : null,
    }
  })

  const totalSpend = perCampaign.reduce((a, r) => a + Number(r.campaign.spend || 0), 0)
  const totalAcquired = perCampaign.reduce((a, r) => a + r.pacientes, 0)
  const cpaGlobal = totalAcquired ? totalSpend / totalAcquired : null

  // Warm follow-up list: llamada happened, no real session scheduled since.
  const orphans = []
  for (const p of patients) {
    const list = sessionsByPatient.get(p.id) || []
    const calls = list.filter(isLlamada).map((s) => s.fecha).sort()
    const lastCall = calls[calls.length - 1]
    if (!lastCall || lastCall >= today) continue
    if (list.some((s) => isRealSession(s) && s.fecha >= lastCall)) continue
    const days = Math.round((new Date(today) - new Date(lastCall)) / 86400e3)
    orphans.push({ patient: p, lastCall, days })
  }
  orphans.sort((a, b) => a.days - b.days)

  return {
    header: {
      totalSpend,
      totalAcquired,
      cpaGlobal,
      ltvGlobal,
      ltvCac: cpaGlobal ? ltvGlobal / cpaGlobal : null,
      called,
      converted,
    },
    perCampaign,
    orphans,
  }
}

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

function CopyBtn({ url, children }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable — noop */ }
  }
  return (
    <Button variant="secondary" size="sm" onClick={copy}>
      {copied ? '✓ Copiado' : children}
    </Button>
  )
}

// Impresiones → Conversaciones → Llamadas → Pacientes, with the conversion
// rate under each hop — the rates are where the insight lives.
function Funnel({ c, r }) {
  const stages = [
    { label: 'Impresiones', value: c.impressions },
    { label: 'Conversaciones', value: c.conversations },
    { label: 'Llamadas', value: r.llamadas },
    { label: 'Pacientes', value: r.pacientes },
  ]
  return (
    <div className="flex flex-wrap items-stretch gap-2">
      {stages.map((st, i) => (
        <React.Fragment key={st.label}>
          {i > 0 && (
            <div className="flex flex-col items-center justify-center px-1">
              <span className="text-content-muted" aria-hidden="true">→</span>
              <span className="font-caption text-[11px] font-bold text-content-secondary">
                {pct(st.value, stages[i - 1].value)}
              </span>
            </div>
          )}
          <div className="flex min-w-[96px] flex-1 flex-col justify-between rounded-card bg-surface-warm px-3 py-2">
            <p className="font-caption text-[11px] text-content-muted">{st.label}</p>
            <p className="font-heading text-xl font-bold text-content-primary">{num.format(st.value || 0)}</p>
          </div>
        </React.Fragment>
      ))}
    </div>
  )
}

function Stat({ label, children }) {
  return (
    <div>
      <p className="font-caption text-[11px] text-content-muted">{label}</p>
      <p className="font-heading text-sm font-bold text-content-primary">{children}</p>
    </div>
  )
}

const emptyMetricsForm = (c) => ({
  spend: String(c.spend ?? 0),
  impressions: String(c.impressions ?? 0),
  clicks: String(c.clicks ?? 0),
  conversations: String(c.conversations ?? 0),
})

function CampaignCard({ r, onPatch }) {
  const c = r.campaign
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(() => emptyMetricsForm(c))
  const [pendingImport, setPendingImport] = useState(null) // { rows, summary }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const fileRef = useRef(null)

  const origin = window.location.origin
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const saveMetrics = async () => {
    setBusy(true)
    setError('')
    const res = await onPatch(c.id, {
      spend: parseFloat(form.spend) || 0,
      impressions: parseInt(form.impressions, 10) || 0,
      clicks: parseInt(form.clicks, 10) || 0,
      conversations: parseInt(form.conversations, 10) || 0,
    })
    setBusy(false)
    if (!res.ok) setError(res.error)
    else setEditing(false)
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return
    setError('')
    setNotice('')
    const parsed = parseMetaCsv(await file.text())
    if (!parsed.ok) {
      setError(parsed.error)
      return
    }
    const t = parsed.rows.reduce(
      (a, x) => ({ spend: a.spend + x.spend, impressions: a.impressions + x.impressions }),
      { spend: 0, impressions: 0 },
    )
    setPendingImport({
      rows: parsed.rows,
      summary: `${parsed.rows.length} días (${parsed.rows[0].fecha} → ${parsed.rows[parsed.rows.length - 1].fecha}) · ${money2(t.spend)} · ${num.format(t.impressions)} impresiones`,
    })
  }

  const confirmImport = async () => {
    setBusy(true)
    setError('')
    const res = await importCampaignMetrics(c.id, pendingImport.rows)
    setBusy(false)
    setPendingImport(null)
    if (!res.ok) setError(res.error)
    else {
      setNotice('CSV importado — totales actualizados.')
      onPatch(c.id, null, res.data) // refresh local state with server row
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-serif text-xl font-bold text-content-primary">{c.nombre}</h3>
            <Badge variant={c.activa ? 'lavender' : 'neutral'}>{c.activa ? 'Activa' : 'Finalizada'}</Badge>
          </div>
          <p className="font-caption text-xs text-content-muted">
            {formatDateShort(c.fecha_inicio)}{c.fecha_fin ? ` – ${formatDateShort(c.fecha_fin)}` : ' – en curso'}
            {' · '}enlace: <span className="font-bold">?c={c.slug}</span>
          </p>
        </div>
        <Toggle
          checked={!!c.activa}
          onChange={(v) => onPatch(c.id, { activa: v })}
          label="Activa"
        />
      </div>

      <Funnel c={c} r={r} />

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        <Stat label="Gasto">{money2(c.spend)}</Stat>
        <Stat label="CPA">{r.cpa == null ? '—' : money2(r.cpa)}</Stat>
        <Stat label="Ingreso atribuido">{formatCurrency(r.revenue)}</Stat>
        <Stat label="LTV">{r.ltv == null ? '—' : money2(r.ltv)}</Stat>
        <Stat label="ROAS">{r.roas == null ? '—' : `${r.roas.toFixed(1)}x`}</Stat>
        <Stat label="Leads (sin sesión)">{Math.max(0, r.leads - r.pacientes)}</Stat>
      </div>

      {r.estimated > 0 && (
        <p className="font-caption text-xs text-amber-600">
          ≈ {r.estimated} paciente{r.estimated === 1 ? '' : 's'} sin fuente creado{r.estimated === 1 ? '' : 's'} durante
          la campaña — atribución no confirmada (asígnala en Pacientes → Fuente).
        </p>
      )}

      {editing && (
        <div className="grid grid-cols-2 gap-3 rounded-card bg-surface-warm p-4 sm:grid-cols-4">
          <Input label="Gasto (USD)" type="number" min="0" step="0.01" value={form.spend}
            onChange={(e) => set('spend', e.target.value)} />
          <Input label="Impresiones" type="number" min="0" value={form.impressions}
            onChange={(e) => set('impressions', e.target.value)} />
          <Input label="Clics" type="number" min="0" value={form.clicks}
            onChange={(e) => set('clicks', e.target.value)} />
          <Input label="Conversaciones" type="number" min="0" value={form.conversations}
            onChange={(e) => set('conversations', e.target.value)} />
          <div className="col-span-2 flex gap-2 sm:col-span-4">
            <Button size="sm" onClick={saveMetrics} disabled={busy}>
              {busy ? 'Guardando…' : 'Guardar cifras'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancelar</Button>
          </div>
        </div>
      )}

      {pendingImport && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-brand-lavender/40 bg-brand-lavender/10 px-4 py-3">
          <p className="flex-1 font-caption text-sm text-content-primary">
            Importar {pendingImport.summary}. Los totales de la campaña se recalcularán.
          </p>
          <Button size="sm" onClick={confirmImport} disabled={busy}>
            {busy ? 'Importando…' : 'Confirmar'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPendingImport(null)}>Cancelar</Button>
        </div>
      )}

      {error && <p className="font-caption text-xs text-red-500">{error}</p>}
      {notice && <p className="font-caption text-xs text-emerald-600">{notice}</p>}

      <div className="flex flex-wrap gap-2">
        <CopyBtn url={`${origin}/agendar?c=${c.slug}`}>Enlace llamada</CopyBtn>
        <CopyBtn url={`${origin}/reservar?c=${c.slug}`}>Enlace sesión</CopyBtn>
        <Button variant="secondary" size="sm"
          onClick={() => { setForm(emptyMetricsForm(c)); setEditing((v) => !v) }}>
          Actualizar cifras
        </Button>
        <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
          Importar CSV (Meta)
        </Button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
      </div>
    </Card>
  )
}

function NewCampaignForm({ onCreate, onClose }) {
  const [form, setForm] = useState({
    nombre: '', slug: '', fecha_inicio: dateKey(), fecha_fin: '', notas: '',
  })
  const [slugTouched, setSlugTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const setNombre = (v) =>
    setForm((f) => ({ ...f, nombre: v, slug: slugTouched ? f.slug : slugify(v) }))

  const submit = async () => {
    if (!form.nombre.trim()) { setError('Ponle un nombre a la campaña.'); return }
    const slug = slugify(form.slug || form.nombre)
    if (!slug) { setError('El enlace (slug) no puede quedar vacío.'); return }
    setBusy(true)
    setError('')
    const res = await onCreate({
      nombre: form.nombre.trim(),
      slug,
      fecha_inicio: form.fecha_inicio,
      fecha_fin: form.fecha_fin || null,
      notas: form.notas.trim() || null,
    })
    setBusy(false)
    if (!res.ok) setError(res.error)
    else onClose()
  }

  return (
    <Card className="flex flex-col gap-4">
      <h3 className="font-serif text-xl font-bold text-content-primary">Nueva campaña</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Nombre" value={form.nombre} placeholder="Campaña Ansiedad Julio"
          onChange={(e) => setNombre(e.target.value)} />
        <Input label="Enlace (slug)" value={form.slug} hint="Va en el link: /agendar?c=…"
          onChange={(e) => { setSlugTouched(true); setForm((f) => ({ ...f, slug: e.target.value })) }} />
        <Input label="Inicio" type="date" value={form.fecha_inicio}
          onChange={(e) => setForm((f) => ({ ...f, fecha_inicio: e.target.value }))} />
        <Input label="Fin (opcional)" type="date" value={form.fecha_fin}
          onChange={(e) => setForm((f) => ({ ...f, fecha_fin: e.target.value }))} />
      </div>
      <Input label="Notas (opcional)" value={form.notas} placeholder="Audiencia, creativos, objetivo…"
        onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))} />
      {error && <p className="font-caption text-xs text-red-500">{error}</p>}
      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={busy}>{busy ? 'Creando…' : 'Crear campaña'}</Button>
        <Button size="sm" variant="ghost" onClick={onClose}>Cancelar</Button>
      </div>
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
            Hicieron la llamada de 10 min y aún no agendan — tu lista de seguimiento.
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
                <p className="truncate font-body font-bold text-content-primary">{fullName(patient)}</p>
                <p className="font-caption text-xs text-content-muted">{patient.telefono || 'sin teléfono'}</p>
              </div>
              <Badge variant={days > 7 ? 'pink' : 'yellow'}>
                hace {days} día{days === 1 ? '' : 's'} · {formatDateShort(lastCall)}
              </Badge>
            </div>
          ))}
          {orphans.length > 12 && (
            <p className="pt-3 font-caption text-xs text-content-muted">
              +{orphans.length - 12} más…
            </p>
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
  const [creating, setCreating] = useState(false)

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

  const computed = useMemo(() => (data ? computeMarketing(data) : null), [data])

  const handleCreate = async (payload) => {
    const res = await createCampaign(payload)
    if (res.ok) setData((d) => ({ ...d, campaigns: [res.data, ...d.campaigns] }))
    return res
  }

  // patch=null + row → just swap in a fresh server row (post-CSV-import).
  const handlePatch = async (id, patch, freshRow = null) => {
    if (!patch) {
      if (freshRow) {
        setData((d) => ({ ...d, campaigns: d.campaigns.map((c) => (c.id === id ? freshRow : c)) }))
      }
      return { ok: true }
    }
    const res = await updateCampaign(id, patch)
    if (res.ok) {
      setData((d) => ({ ...d, campaigns: d.campaigns.map((c) => (c.id === id ? res.data : c)) }))
    }
    return res
  }

  if (!data) {
    return (
      <div className="space-y-6 pt-2">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} className="h-32" />)}
        </div>
        <SkeletonCard className="h-64" />
      </div>
    )
  }

  const { header, perCampaign, orphans } = computed

  return (
    <div className="space-y-6 pt-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-bold text-content-primary">
            Embudo de adquisición <span className="text-brand-lavender">✦</span>
          </h2>
          <p className="mt-1 font-body text-sm text-content-secondary">
            Meta Ads → WhatsApp → llamada 10 min → paciente.
          </p>
        </div>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>+ Nueva campaña</Button>
        )}
      </div>

      {/* KPI header */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Inversión total"
          value={money2(header.totalSpend)}
          caption={`${header.totalAcquired} paciente${header.totalAcquired === 1 ? '' : 's'} adquirido${header.totalAcquired === 1 ? '' : 's'} por campañas`}
          icon={IconMegaphone}
          tint="lavender"
        />
        <KpiCard
          label="CPA"
          value={header.cpaGlobal == null ? '—' : money2(header.cpaGlobal)}
          caption="costo por paciente adquirido"
          icon={IconWallet}
          tint="orange"
        />
        <KpiCard
          label="LTV"
          value={money2(header.ltvGlobal)}
          caption="ingreso pagado promedio por paciente (toda la práctica)"
          icon={IconUsers}
          tint="pink"
        />
        <KpiCard
          label="LTV : CAC"
          value={header.ltvCac == null ? '—' : `${header.ltvCac.toFixed(1)}x`}
          caption={header.ltvCac == null ? 'necesita gasto y pacientes atribuidos' : header.ltvCac >= 3 ? 'saludable (≥3x)' : 'bajo (meta: ≥3x)'}
          icon={IconPulse}
          tint="yellow"
        />
      </div>

      {/* Practice-wide conversion note */}
      <Card className="flex items-center gap-3 py-4">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-card bg-brand-lavender/15 text-purple-600">
          <IconChat size={18} />
        </div>
        <p className="font-body text-sm text-content-secondary">
          Conversión llamada → paciente (histórico):{' '}
          <span className="font-bold text-content-primary">{pct(header.converted, header.called)}</span>
          {header.called > 0 && (
            <span className="font-caption text-xs text-content-muted"> · {header.converted} de {header.called} llamadas realizadas</span>
          )}
        </p>
      </Card>

      {creating && <NewCampaignForm onCreate={handleCreate} onClose={() => setCreating(false)} />}

      {/* Campaigns */}
      {perCampaign.length === 0 && !creating ? (
        <Card className="flex flex-col items-center gap-2 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-card bg-brand-lavender/15 text-purple-500">
            <IconMegaphone size={22} />
          </div>
          <p className="font-body text-content-secondary">Aún no hay campañas.</p>
          <p className="max-w-md font-caption text-xs text-content-muted">
            Crea una campaña, usa su enlace ?c= en tus conversaciones de WhatsApp y el embudo
            se llenará solo con las llamadas, pacientes e ingresos que genere.
          </p>
        </Card>
      ) : (
        perCampaign.map((r) => (
          <CampaignCard key={r.campaign.id} r={r} onPatch={handlePatch} />
        ))
      )}

      <OrphanCalls orphans={orphans} />
    </div>
  )
}
