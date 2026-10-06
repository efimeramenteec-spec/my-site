// Harness for #54 (lead bot without buttons). Real leadBot/leadBrain code, an
// in-memory Supabase seeded READ-ONLY from the real therapists/categorías, and a
// recording transport — nothing is sent, nothing is written.
// Run: node scripts/harness-lead-bot.mjs   (no ANTHROPIC_API_KEY locally → this
// exercises the keyword fallback; the real-classifier run is the token-gated
// lead-bot-dryrun function: GET /.netlify/functions/lead-bot-dryrun?token=…)
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { simulate, seedFrom, formatResults, SCENARIOS } from '../netlify/lib/leadBotSim.mjs'

const env = Object.fromEntries(fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
delete process.env.ANTHROPIC_API_KEY
delete process.env.APIMART_API_KEY
const real = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
const seed = await seedFrom(real)
const results = await simulate(seed, SCENARIOS)
console.log('MODE: keyword fallback (API down)')
console.log(formatResults(results))
const silent = results.flatMap((r) => r.turns.filter((t) => !t.out.length).map((t) => `${r.name}: ${t.in}`))
console.log(`\nSILENCIOS: ${silent.length}${silent.length ? `\n  ${silent.join('\n  ')}` : ''}`)
