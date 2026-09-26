// src/lib/funnel.js — pure funnel math for the lead-bot dashboard (#4 + #20).
// Reads the `leads` rows (see getFunnelData in queries.js) and derives the
// stage funnel: leads → tocó → eligió → agendó → llamada hecha → paciente, with
// step conversion %, median time to booking, per-ad breakdown and a day/week
// time series. No React, no side effects — unit-checkable with node.

export const FUNNEL_STAGES = [
  { key: 'leads', label: 'Leads' },
  { key: 'toco', label: 'Tocó' },
  { key: 'eligio', label: 'Eligió' },
  { key: 'agendo', label: 'Agendó' },
  { key: 'llamada', label: 'Llamada hecha' },
  { key: 'paciente', label: 'Paciente' },
]

// Which stages a lead has reached (funnel is cumulative — a booked lead counts
// for every earlier step too). Uses the stamped stage timestamps; `paciente`
// mirrors the llamada session's convirtio (attached in getFunnelData).
export function reached(lead) {
  const toco = !!(lead.toco_at || lead.eligio_terapeuta_at || lead.agendo_at || lead.llamada_hecha_at)
  const eligio = !!(lead.eligio_terapeuta_at || lead.agendo_at || lead.llamada_hecha_at)
  const agendo = !!(lead.agendo_at || lead.llamada_hecha_at)
  const llamada = !!lead.llamada_hecha_at
  const paciente = lead.convirtio === true || lead.stage === 'paciente' || !!lead.paciente_at
  return { leads: true, toco, eligio, agendo, llamada, paciente }
}

function median(nums) {
  if (!nums.length) return null
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// Full funnel for a set of leads: cumulative counts per stage, step-to-step
// conversion %, and median minutes from first contact to booking.
export function computeFunnel(leads) {
  const counts = Object.fromEntries(FUNNEL_STAGES.map((s) => [s.key, 0]))
  for (const l of leads) {
    const r = reached(l)
    for (const s of FUNNEL_STAGES) if (r[s.key]) counts[s.key]++
  }
  const steps = FUNNEL_STAGES.map((s, i) => {
    if (i === 0) return null
    const prev = counts[FUNNEL_STAGES[i - 1].key]
    return { from: FUNNEL_STAGES[i - 1].key, to: s.key, label: s.label, count: counts[s.key], pct: prev > 0 ? counts[s.key] / prev : 0 }
  }).filter(Boolean)
  const bookMins = leads
    .filter((l) => l.agendo_at && l.first_at)
    .map((l) => (new Date(l.agendo_at) - new Date(l.first_at)) / 60000)
    .filter((n) => Number.isFinite(n) && n >= 0)
  return { total: leads.length, counts, steps, medianBookingMin: median(bookMins) }
}

// Filter by first_at within [from, to] (inclusive ISO dates, either optional).
export function filterByRange(leads, from, to) {
  return leads.filter((l) => {
    const d = String(l.first_at || '').slice(0, 10)
    if (from && d < from) return false
    if (to && d > to) return false
    return true
  })
}

// Per-ad breakdown, keyed by ad_source_id (falls back to headline / organic).
// Returns rows sorted by lead count desc, each with its own funnel.
export function funnelByAd(leads) {
  const groups = new Map()
  for (const l of leads) {
    const key = l.ad_source_id || l.ad_headline || (l.source === 'meta_ctwa' ? 'meta_sin_id' : 'orgánico')
    if (!groups.has(key)) groups.set(key, { key, headline: l.ad_headline || null, source: l.source, leads: [] })
    groups.get(key).leads.push(l)
  }
  return [...groups.values()]
    .map((g) => ({ ...g, funnel: computeFunnel(g.leads) }))
    .sort((a, b) => b.funnel.total - a.funnel.total)
}

// ISO week start (Monday) for a date string.
function weekStart(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  const dow = (d.getUTCDay() + 6) % 7 // Mon=0
  d.setUTCDate(d.getUTCDate() - dow)
  return d.toISOString().slice(0, 10)
}

// Time series of new leads / booked / patients by day or week (for the chart).
export function funnelSeries(leads, { weekly = false } = {}) {
  const bucket = new Map()
  const keyOf = (iso) => (weekly ? weekStart(iso) : iso)
  for (const l of leads) {
    const day = String(l.first_at || '').slice(0, 10)
    if (!day) continue
    const k = keyOf(day)
    if (!bucket.has(k)) bucket.set(k, { date: k, leads: 0, agendo: 0, paciente: 0 })
    const b = bucket.get(k)
    b.leads++
    const r = reached(l)
    if (r.agendo) b.agendo++
    if (r.paciente) b.paciente++
  }
  return [...bucket.values()].sort((a, b) => a.date.localeCompare(b.date))
}
