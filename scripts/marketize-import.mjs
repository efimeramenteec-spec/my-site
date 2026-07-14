#!/usr/bin/env node
// /marketize importer — the heavy lifting of the Monday protocol.
// See MARKETING-CONSULTORIO-2026.md. Claude Code fetches the weekly Meta
// report CSV (Gmail → Downloads → Chrome, in that order) and runs:
//
//   node scripts/marketize-import.mjs <report.csv> [--dry-run]
//
// What it does:
//   1. Parses the CSV (src/lib/metaCsv.js — same parser as the app).
//   2. Upserts weekly rows into campaign_weeks by (campaign_id, semana_inicio)
//      — re-running with the same file never double-counts.
//   3. Maintains campaign windows: auto-creates campaigns for new Meta names;
//      for a CURRENT report (week ending ≤10 days ago) it reopens campaigns
//      present in the report and closes open ones that dropped out. Backfill
//      imports (older weeks) only ever GROW windows, never close/reopen.
//   4. Prints the Monday briefing: funnel + KPIs for the report week and the
//      red/amber/green flags (src/lib/marketing.js — same math as the app).

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { parseMetaCsv } from '../src/lib/metaCsv.js'
import { computeMarketing, computeFlags, campaignOn } from '../src/lib/marketing.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// ─── Setup ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const csvPath = args.find((a) => !a.startsWith('--'))
if (!csvPath) {
  console.error('Uso: node scripts/marketize-import.mjs <reporte.csv> [--dry-run]')
  process.exit(1)
}

const env = {}
for (const line of readFileSync(resolve(ROOT, '.env'), 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/)
  if (m) env[m[1]] = m[2]
}
if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
  console.error('Faltan VITE_SUPABASE_URL / SUPABASE_SERVICE_KEY en .env')
  process.exit(1)
}
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_KEY)
const die = (msg) => { console.error(`✗ ${msg}`); process.exit(1) }

const today = new Date().toISOString().slice(0, 10)
const money = (n) => `$${Number(n || 0).toFixed(2)}`
const pctOf = (part, whole) => (whole > 0 ? `${((100 * part) / whole).toFixed(1)}%` : '—')

// ─── Parse ───────────────────────────────────────────────────────────────────

const parsed = parseMetaCsv(readFileSync(csvPath, 'utf8'))
if (!parsed.ok) die(parsed.error)
const { weeks: parsedWeeks } = parsed

const rangeStart = parsedWeeks[0].semana_inicio
const rangeEnd = parsedWeeks.reduce((a, w) => (w.semana_fin > a ? w.semana_fin : a), '')
// "Current" report = its last week ended within 10 days — enables the
// open/close window maintenance. Backfills never touch open/closed state.
const isCurrent = (new Date(today) - new Date(rangeEnd)) / 86400e3 <= 10

console.log(`Reporte: ${parsedWeeks.length} fila(s) · ${rangeStart} → ${rangeEnd}${isCurrent ? '' : ' (backfill histórico)'}${dryRun ? ' · DRY RUN' : ''}\n`)

// ─── Upsert ──────────────────────────────────────────────────────────────────

const CAMPAIGN_SELECT = 'id,nombre,fecha_inicio,fecha_fin,presupuesto_diario,notas,created_at'
const cRes = await supabase.from('campaigns').select(CAMPAIGN_SELECT)
if (cRes.error) die(cRes.error.message)
const byName = new Map((cRes.data || []).map((c) => [c.nombre, c]))

const reportNames = new Set(parsedWeeks.map((w) => w.campaign))
let created = 0

for (const w of parsedWeeks) {
  let camp = byName.get(w.campaign)
  if (!camp) {
    console.log(`  + Nueva campaña: "${w.campaign}" (desde ${w.semana_inicio})`)
    created++
    if (dryRun) { byName.set(w.campaign, { id: `dry-${created}`, nombre: w.campaign, fecha_inicio: w.semana_inicio, fecha_fin: null }); continue }
    const ins = await supabase.from('campaigns')
      .insert({ nombre: w.campaign, fecha_inicio: w.semana_inicio })
      .select(CAMPAIGN_SELECT).single()
    if (ins.error) die(ins.error.message)
    camp = ins.data
    byName.set(camp.nombre, camp)
  } else if (w.semana_inicio < camp.fecha_inicio) {
    // Out-of-order backfill: the window grows backwards, never shrinks.
    if (!dryRun) {
      const up = await supabase.from('campaigns').update({ fecha_inicio: w.semana_inicio }).eq('id', camp.id)
      if (up.error) die(up.error.message)
    }
    camp.fecha_inicio = w.semana_inicio
  }
  if (dryRun) continue
  const up = await supabase.from('campaign_weeks').upsert({
    campaign_id: camp.id,
    semana_inicio: w.semana_inicio,
    semana_fin: w.semana_fin,
    spend: w.spend,
    impressions: w.impressions,
    reach: w.reach,
    frequency: w.frequency,
    link_clicks: w.link_clicks,
    ctr: w.ctr,
    cpm: w.cpm,
    conversations: w.conversations,
  }, { onConflict: 'campaign_id,semana_inicio' })
  if (up.error) die(up.error.message)
}

// Window maintenance (current reports only): what's in the report is running;
// what dropped out gets closed at its last known week end.
if (isCurrent && !dryRun) {
  for (const camp of byName.values()) {
    if (reportNames.has(camp.nombre) && camp.fecha_fin) {
      console.log(`  ↺ "${camp.nombre}" reabierta (aparece en el reporte)`)
      const up = await supabase.from('campaigns').update({ fecha_fin: null }).eq('id', camp.id)
      if (up.error) die(up.error.message)
      camp.fecha_fin = null
    } else if (!reportNames.has(camp.nombre) && !camp.fecha_fin) {
      const lw = await supabase.from('campaign_weeks')
        .select('semana_fin').eq('campaign_id', camp.id)
        .order('semana_fin', { ascending: false }).limit(1)
      if (lw.error) die(lw.error.message)
      const fin = lw.data?.[0]?.semana_fin || camp.fecha_inicio
      console.log(`  ■ "${camp.nombre}" cerrada al ${fin} (ya no aparece en el reporte)`)
      const up = await supabase.from('campaigns').update({ fecha_fin: fin }).eq('id', camp.id)
      if (up.error) die(up.error.message)
      camp.fecha_fin = fin
    }
  }
}

console.log(`✓ Importado: ${parsedWeeks.length} semana(s), ${created} campaña(s) nueva(s)\n`)
if (dryRun) process.exit(0)

// ─── Briefing ────────────────────────────────────────────────────────────────

const [wRes, pRes, sRes] = await Promise.all([
  supabase.from('campaign_weeks')
    .select('id,campaign_id,semana_inicio,semana_fin,spend,impressions,reach,frequency,link_clicks,ctr,cpm,conversations'),
  supabase.from('patients').select('id,nombre,apellido,telefono,estado_general,fuente,created_at'),
  supabase.from('sessions').select('id,patient_id,fecha,hora_inicio,tipo,estado,monto,pagado,created_at'),
])
for (const r of [wRes, pRes, sRes]) if (r.error) die(r.error.message)

const data = {
  campaigns: [...byName.values()],
  weeks: wRes.data,
  patients: pRes.data,
  sessions: sRes.data,
}

const week = computeMarketing(data, { from: rangeStart, to: rangeEnd }, today)
const total = computeMarketing(data, {}, today)
const active = campaignOn(data.campaigns, today, today)

console.log('══════════ BRIEFING SEMANAL ══════════')
console.log(`Semana del reporte (${rangeStart} → ${rangeEnd})${active ? ` · campaña activa: "${active.nombre}"` : ''}`)
console.log(`  Gasto ${money(week.spend)} · ${week.conversations} conversaciones · ${week.llamadas} llamadas agendadas · ${week.pacientes} paciente(s) nuevo(s)`)
console.log(`  Conversación→llamada ${pctOf(week.llamadas, week.conversations)} · llamada→paciente ${pctOf(week.pacientes, week.llamadas)}`)
console.log(`  Costo por conversación ${week.costoConversacion == null ? '—' : money(week.costoConversacion)} · costo por paciente ${week.cpa == null ? '—' : money(week.cpa)}`)

console.log('\nHistórico (todo)')
console.log(`  Inversión total ${money(total.spend)} · ${total.pacientes} pacientes adquiridos · CPA ${total.cpa == null ? '—' : money(total.cpa)}`)
console.log(`  LTV a la fecha ${total.ltv == null ? '—' : money(total.ltv)} · LTV:CAC ${total.ltvCac == null ? '—' : `${total.ltvCac.toFixed(1)}x`}`)

const flags = computeFlags(data, active?.id || null, today)
console.log('\nSeñales')
if (!flags.length) console.log('  ✦ Nada que requiera atención esta semana.')
const ICONS = { red: '🔴', amber: '🟡', green: '🟢' }
for (const f of flags) console.log(`  ${ICONS[f.level]} ${f.message}`)

if (week.orphans.length) {
  console.log(`\nSeguimiento: ${week.orphans.length} llamada(s) sin sesión posterior — revisa "Llamadas sin sesión" en /marketing.`)
}
if (total.overlaps.length) {
  console.log(`\n⚠ Ventanas de campaña superpuestas: ${total.overlaps.map(([a, b]) => `"${a.nombre}"/"${b.nombre}"`).join(', ')} — corrige las fechas en /marketing.`)
}
console.log('══════════════════════════════════════')
