// #69 — one-off backfill of the lead linker (netlify/lib/leadLinker.mjs) from 2026-10-01.
//   node scripts/link-leads-69.mjs            → dry run (prints what WOULD link)
//   node scripts/link-leads-69.mjs --apply    → writes the links (only-null fields)
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { runLeadLinker } from '../netlify/lib/leadLinker.mjs'

const env = Object.fromEntries(fs.readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split('\n').filter((l) => l.includes('=') && !l.startsWith('#')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]))
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
const apply = process.argv.includes('--apply')
const { report, tally, error } = await runLeadLinker(supabase, { sinceIso: process.argv.find((a) => /^\d{4}-/.test(a)) || '2026-10-01T05:00:00Z', dryRun: !apply })
if (error) { console.error(error); process.exit(1) }
console.log(JSON.stringify({ mode: apply ? 'APPLY' : 'DRY RUN', tally }, null, 2))
for (const r of report) console.log(JSON.stringify(r))
