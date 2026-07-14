// Marketing v2 — pure metric math. No imports, no Supabase, no React: this
// module is shared by the Marketing page AND the /marketize Monday briefing
// (run under plain node), so the app and the terminal can never disagree on a
// definition. See MARKETING-CONSULTORIO-2026.md for the protocol.
//
// Attribution rule (Nicolas, 2026-07-13): only ONE Meta campaign runs at a
// time, so every new patient — first real session — is attributed to the
// campaign whose date window covers the day that first session was BOOKED
// (sessions.created_at). Referral escape hatch: patients with
// fuente === 'referido' are excluded from campaign attribution entirely.

export const isRealSession = (s) =>
  s.tipo !== 'llamada' && s.estado !== 'cancelada' && s.estado !== 'no_show'
export const isLlamada = (s) =>
  s.tipo === 'llamada' && s.estado !== 'cancelada' && s.estado !== 'no_show'

const day = (ts) => String(ts || '').slice(0, 10)
const rate = (part, whole) => (whole > 0 ? part / whole : null)

// When a session was BOOKED. Normally created_at — but historical rows were
// bulk-imported (seed/sheet sync), so their created_at is the import date.
// A booking can never happen AFTER the session itself, so anything with
// created_at past fecha falls back to fecha.
export const bookedOn = (s) => {
  const c = day(s.created_at)
  return c && c < s.fecha ? c : s.fecha
}

// Active campaign on a date. One at a time by policy; if windows overlap
// (e.g. the messy May backfill), the latest-starting campaign wins.
export function campaignOn(campaigns, date, today) {
  let best = null
  for (const c of campaigns) {
    const fin = c.fecha_fin || today
    if (date >= c.fecha_inicio && date <= fin) {
      if (!best || c.fecha_inicio > best.fecha_inicio) best = c
    }
  }
  return best
}

// Campaign pairs whose windows overlap — surfaced as a data-quality warning
// so Nicolas fixes fecha_inicio/fecha_fin instead of silently mis-attributing.
export function overlappingCampaigns(campaigns, today) {
  const pairs = []
  for (let i = 0; i < campaigns.length; i++) {
    for (let j = i + 1; j < campaigns.length; j++) {
      const a = campaigns[i], b = campaigns[j]
      const aFin = a.fecha_fin || today
      const bFin = b.fecha_fin || today
      if (a.fecha_inicio <= bFin && b.fecha_inicio <= aFin) pairs.push([a, b])
    }
  }
  return pairs
}

// One acquisition event per non-referred patient with ≥1 real session:
// { patient, firstSession, scheduledOn (YYYY-MM-DD), campaign|null, paid }.
// paid = total PAID revenue of the patient to date (their LTV so far).
export function acquisitions({ campaigns, patients, sessions }, today) {
  const byPatient = new Map()
  for (const s of sessions) {
    const list = byPatient.get(s.patient_id)
    if (list) list.push(s)
    else byPatient.set(s.patient_id, [s])
  }
  const out = []
  for (const p of patients) {
    if (p.fuente === 'referido') continue
    const real = (byPatient.get(p.id) || []).filter(isRealSession)
    if (!real.length) continue
    real.sort((a, b) =>
      a.fecha.localeCompare(b.fecha) || String(a.hora_inicio || '').localeCompare(String(b.hora_inicio || '')))
    const first = real[0]
    const scheduledOn = bookedOn(first)
    out.push({
      patient: p,
      firstSession: first,
      scheduledOn,
      campaign: campaignOn(campaigns, scheduledOn, today),
      paid: (byPatient.get(p.id) || []).reduce((a, s) => a + (s.pagado ? Number(s.monto || 0) : 0), 0),
    })
  }
  return out
}

// Warm follow-up list: last llamada already happened, no real session since.
export function orphanCalls({ patients, sessions }, today) {
  const byPatient = new Map()
  for (const s of sessions) {
    const list = byPatient.get(s.patient_id)
    if (list) list.push(s)
    else byPatient.set(s.patient_id, [s])
  }
  const out = []
  for (const p of patients) {
    const list = byPatient.get(p.id) || []
    const calls = list.filter(isLlamada).map((s) => s.fecha).sort()
    const lastCall = calls[calls.length - 1]
    if (!lastCall || lastCall >= today) continue
    if (list.some((s) => isRealSession(s) && s.fecha >= lastCall)) continue
    const days = Math.round((new Date(today) - new Date(lastCall)) / 86400e3)
    out.push({ patient: p, lastCall, days })
  }
  out.sort((a, b) => a.days - b.days)
  return out
}

// ─── Period metrics ──────────────────────────────────────────────────────────
// Everything scoped by the page's date range + campaign selector. `weeks` are
// campaign_weeks rows; a week belongs to the period if the ranges overlap.

export function computeMarketing(data, { from = null, to = null, campaignId = null } = {}, today) {
  const { campaigns, weeks, patients, sessions } = data
  const inPeriod = (d) => d && (!from || d >= from) && (!to || d <= to)
  const weekInPeriod = (w) =>
    (!from || w.semana_fin >= from) && (!to || w.semana_inicio <= to)

  const scopedWeeks = weeks
    .filter((w) => (!campaignId || w.campaign_id === campaignId) && weekInPeriod(w))
    .sort((a, b) => a.semana_inicio.localeCompare(b.semana_inicio))

  const spend = scopedWeeks.reduce((a, w) => a + Number(w.spend || 0), 0)
  const conversations = scopedWeeks.reduce((a, w) => a + (w.conversations || 0), 0)
  const impressions = scopedWeeks.reduce((a, w) => a + (w.impressions || 0), 0)

  // Llamadas: free calls BOOKED during the period (created_at — "how many
  // calls have we scheduled"), attributed by booking date.
  const matchesCampaign = (dateStr) =>
    !campaignId || campaignOn(campaigns, dateStr, today)?.id === campaignId
  const llamadas = sessions.filter((s) => {
    if (!isLlamada(s)) return false
    const booked = bookedOn(s)
    return inPeriod(booked) && matchesCampaign(booked)
  })

  // Pacientes nuevos: acquisition events in the period (see acquisitions()).
  const allAcq = acquisitions(data, today)
  const acq = allAcq.filter((a) =>
    inPeriod(a.scheduledOn) && (!campaignId || a.campaign?.id === campaignId))
  const acqSinCampana = allAcq.filter((a) => inPeriod(a.scheduledOn) && !a.campaign)

  const revenue = acq.reduce((a, x) => a + x.paid, 0)
  const cpa = acq.length ? spend / acq.length : null
  const ltv = acq.length ? revenue / acq.length : null

  // Weekly series for the chart: metrics + funnel counts per report week.
  const series = scopedWeeks.map((w) => {
    const inWeek = (d) => d >= w.semana_inicio && d <= w.semana_fin
    const ll = sessions.filter((s) => isLlamada(s) && inWeek(bookedOn(s))).length
    const pa = allAcq.filter((a) => inWeek(a.scheduledOn) &&
      (!campaignId || a.campaign?.id === campaignId)).length
    return {
      semana: w.semana_inicio,
      campaign_id: w.campaign_id,
      gasto: Number(w.spend || 0),
      impresiones: w.impressions || 0,
      frecuencia: Number(w.frequency || 0),
      ctr: Number(w.ctr || 0),
      cpm: Number(w.cpm || 0),
      conversaciones: w.conversations || 0,
      costo_conversacion: w.conversations ? Number(w.spend || 0) / w.conversations : null,
      llamadas: ll,
      pacientes: pa,
      cpa: pa ? Number(w.spend || 0) / pa : null,
    }
  })

  // Cohort LTV: new patients grouped by acquisition month (all campaigns —
  // answers "does revenue per patient keep growing as data matures?").
  const cohortMap = new Map()
  for (const a of allAcq) {
    const mes = a.scheduledOn.slice(0, 7)
    const c = cohortMap.get(mes) || { mes, pacientes: 0, ingreso: 0 }
    c.pacientes++
    c.ingreso += a.paid
    cohortMap.set(mes, c)
  }
  const cohorts = [...cohortMap.values()]
    .map((c) => ({ ...c, ltv: c.ingreso / c.pacientes }))
    .sort((a, b) => a.mes.localeCompare(b.mes))

  // Payback per campaign (lifetime, ignores the period selector on purpose —
  // "has this campaign paid for itself yet?").
  const payback = campaigns.map((c) => {
    const cSpend = weeks.filter((w) => w.campaign_id === c.id)
      .reduce((a, w) => a + Number(w.spend || 0), 0)
    const cAcq = allAcq.filter((a) => a.campaign?.id === c.id)
    const cRevenue = cAcq.reduce((a, x) => a + x.paid, 0)
    return {
      campaign: c,
      spend: cSpend,
      pacientes: cAcq.length,
      revenue: cRevenue,
      pct: cSpend > 0 ? (100 * cRevenue) / cSpend : null,
      cpa: cAcq.length ? cSpend / cAcq.length : null,
      ltv: cAcq.length ? cRevenue / cAcq.length : null,
    }
  }).sort((a, b) => b.campaign.fecha_inicio.localeCompare(a.campaign.fecha_inicio))

  return {
    weeks: scopedWeeks,
    spend,
    impressions,
    conversations,
    llamadas: llamadas.length,
    pacientes: acq.length,
    acqSinCampana: acqSinCampana.length,
    revenue,
    cpa,
    ltv,
    ltvCac: cpa && ltv != null ? ltv / cpa : null,
    costoConversacion: conversations ? spend / conversations : null,
    convToLlamada: rate(llamadas.length, conversations),
    llamadaToPaciente: rate(acq.length, llamadas.length),
    series,
    cohorts,
    payback,
    orphans: orphanCalls(data, today),
    overlaps: overlappingCampaigns(campaigns, today),
  }
}

// ─── Flags ───────────────────────────────────────────────────────────────────
// Red/green signals that need attention, computed on the campaign's last two
// report weeks (week-over-week — data arrives weekly) + campaign averages.
// Deliberately few, each mapped to an action. Volume guards keep noise out.
//
// Returns [{ level: 'red'|'amber'|'green', metric, message }].

export function computeFlags(data, campaignId, today) {
  const { campaigns, weeks, sessions } = data
  const campaign = campaigns.find((c) => c.id === campaignId) ||
    campaignOn(campaigns, today, today)
  if (!campaign) return []

  const cw = weeks.filter((w) => w.campaign_id === campaign.id)
    .sort((a, b) => a.semana_inicio.localeCompare(b.semana_inicio))
  if (!cw.length) return []

  const flags = []
  const push = (level, metric, message) => flags.push({ level, metric, message })
  const pctChange = (now, before) => (before > 0 ? (100 * (now - before)) / before : null)
  const fmtPct = (v) => `${v > 0 ? '+' : ''}${Math.round(v)}%`
  const money = (n) => `$${Number(n).toFixed(2)}`

  const last = cw[cw.length - 1]
  const prev = cw.length > 1 ? cw[cw.length - 2] : null

  // 1. Costo por conversación WoW (±30% red / −20% green). Needs volume.
  const cc = (w) => (w.conversations >= 5 ? Number(w.spend) / w.conversations : null)
  if (prev && cc(last) != null && cc(prev) != null) {
    const ch = pctChange(cc(last), cc(prev))
    if (ch >= 30) push('red', 'costo_conversacion',
      `Tu costo por conversación subió ${fmtPct(ch)} esta semana (${money(cc(prev))} → ${money(cc(last))}). Revisa creativos/audiencia.`)
    else if (ch <= -20) push('green', 'costo_conversacion',
      `Tu costo por conversación bajó ${fmtPct(ch)} (${money(cc(prev))} → ${money(cc(last))}).`)
  }

  // 2. Frecuencia — fatiga creativa (≥2.5 amber, ≥3.5 red).
  const freq = Number(last.frequency || 0)
  if (freq >= 3.5) push('red', 'frecuencia',
    `Frecuencia ${freq.toFixed(1)}: saturación creativa. Rota los creativos ya.`)
  else if (freq >= 2.5) push('amber', 'frecuencia',
    `Frecuencia ${freq.toFixed(1)}: te acercas a la fatiga creativa (umbral 2.5). Prepara creativos nuevos.`)

  // 3. CTR — the LEADING fatigue indicator (moves before cost does).
  if (prev && Number(prev.ctr) > 0 && last.impressions >= 1000) {
    const ch = pctChange(Number(last.ctr), Number(prev.ctr))
    if (ch <= -25) push('amber', 'ctr',
      `El CTR cayó ${fmtPct(ch)} (${Number(prev.ctr).toFixed(2)}% → ${Number(last.ctr).toFixed(2)}%) — suele anticipar la fatiga del anuncio.`)
    else if (ch >= 25) push('green', 'ctr',
      `El CTR subió ${fmtPct(ch)} — el anuncio conecta mejor.`)
  }

  // 4. Conversación → llamada WoW — the leak Meta can't see. If ads hold but
  // fewer chats become calls, the problem is lead quality or the WhatsApp
  // handling, not the campaign.
  const llIn = (w) => sessions.filter((s) => {
    if (!isLlamada(s)) return false
    const booked = bookedOn(s)
    return booked >= w.semana_inicio && booked <= w.semana_fin
  }).length
  if (prev && prev.conversations >= 5 && last.conversations >= 5) {
    const rNow = llIn(last) / last.conversations
    const rPrev = llIn(prev) / prev.conversations
    if (rPrev > 0) {
      const ch = pctChange(rNow, rPrev)
      if (ch <= -30) push('amber', 'conv_llamada',
        `La conversión conversación → llamada cayó ${fmtPct(ch)} (${(100 * rPrev).toFixed(0)}% → ${(100 * rNow).toFixed(0)}%). Los anuncios traen gente, pero el WhatsApp no está cerrando llamadas.`)
    }
  }

  // 5. Llamada → paciente (close rate), campaign lifetime vs last 4 weeks.
  // Weekly is too noisy for this one; a sustained drop means the free call
  // itself needs work, not the ads.
  const allAcq = acquisitions(data, today)
  const cAcq = allAcq.filter((a) => a.campaign?.id === campaign.id)
  const cLl = sessions.filter((s) => {
    if (!isLlamada(s)) return false
    return campaignOn(campaigns, bookedOn(s), today)?.id === campaign.id
  })
  if (cLl.length >= 8 && cAcq.length >= 2) {
    const cutoff = new Date(new Date(today) - 28 * 86400e3).toISOString().slice(0, 10)
    const recent = cLl.filter((s) => bookedOn(s) >= cutoff)
    const recentAcq = cAcq.filter((a) => a.scheduledOn >= cutoff)
    const lifetime = cAcq.length / cLl.length
    if (recent.length >= 4) {
      const rRecent = recentAcq.length / recent.length
      if (rRecent < lifetime / 2) push('amber', 'llamada_paciente',
        `El cierre llamada → paciente de las últimas 4 semanas (${(100 * rRecent).toFixed(0)}%) está muy por debajo del histórico (${(100 * lifetime).toFixed(0)}%). El problema está en la llamada gratuita, no en los anuncios.`)
    }
  }

  // 6. CPA — costo por paciente, latest week vs campaign average (±30%/−25%).
  const wAcq = (w) => allAcq.filter((a) =>
    a.campaign?.id === campaign.id && a.scheduledOn >= w.semana_inicio && a.scheduledOn <= w.semana_fin).length
  const totalSpend = cw.reduce((a, w) => a + Number(w.spend || 0), 0)
  if (cAcq.length >= 2 && wAcq(last) >= 1) {
    const avgCpa = totalSpend / cAcq.length
    const lastCpa = Number(last.spend) / wAcq(last)
    const ch = pctChange(lastCpa, avgCpa)
    if (ch >= 30) push('red', 'cpa',
      `El costo por paciente de esta semana (${money(lastCpa)}) está ${fmtPct(ch)} sobre el promedio de la campaña (${money(avgCpa)}).`)
    else if (ch <= -25) push('green', 'cpa',
      `El costo por paciente bajó a ${money(lastCpa)} — ${fmtPct(ch)} vs el promedio de la campaña (${money(avgCpa)}).`)
  }

  // 7. LTV:CAC — sustained economics (needs ≥3 attributed patients to mean
  // anything; LTV is "a la fecha" and still maturing).
  if (cAcq.length >= 3 && totalSpend > 0) {
    const cRevenue = cAcq.reduce((a, x) => a + x.paid, 0)
    const ratio = (cRevenue / cAcq.length) / (totalSpend / cAcq.length)
    if (ratio < 1) push('red', 'ltv_cac',
      `LTV:CAC ${ratio.toFixed(1)}x — cada paciente aún cuesta más de lo que ha pagado. (LTV a la fecha; mejora con el tiempo.)`)
    else if (ratio < 3) push('amber', 'ltv_cac',
      `LTV:CAC ${ratio.toFixed(1)}x, bajo la meta de 3x. (LTV a la fecha; los pacientes siguen sumando sesiones.)`)
    else push('green', 'ltv_cac',
      `LTV:CAC ${ratio.toFixed(1)}x — economía saludable (meta ≥3x).`)
  }

  return flags
}
