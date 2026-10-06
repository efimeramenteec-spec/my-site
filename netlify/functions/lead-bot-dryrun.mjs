// netlify/functions/lead-bot-dryrun.mjs
//
// #54 — token-gated DRY RUN of the lead bot with the REAL Claude classifier
// (ANTHROPIC_API_KEY only exists here, not locally). Runs leadBotSim's scenario
// set against an in-memory Supabase seeded read-only from the real tables, with
// the WhatsApp/push transport replaced by a recorder: nothing is sent, nothing is
// written. GET ?token=<LEAD_TOOLS_TOKEN>[&nokey=1 to force the keyword fallback]
// → text/plain transcript.

import { getSupabaseAdmin } from '../lib/whatsapp.mjs'
import { simulate, seedFrom, formatResults, SCENARIOS } from '../lib/leadBotSim.mjs'

export default async (req) => {
  const url = new URL(req.url)
  const expected = process.env.LEAD_TOOLS_TOKEN
  if (!expected || url.searchParams.get('token') !== expected) return new Response('forbidden', { status: 403 })
  const supabase = getSupabaseAdmin()
  if (!supabase) return new Response('no SUPABASE_SERVICE_KEY', { status: 500 })
  if (url.searchParams.get('nokey')) { delete process.env.ANTHROPIC_API_KEY; delete process.env.APIMART_API_KEY }
  const only = url.searchParams.get('only')
  const list = only ? SCENARIOS.filter((s) => only.split(',').includes(s.name.split('.')[0])) : SCENARIOS
  const results = await simulate(await seedFrom(supabase), list)
  const silent = results.flatMap((r) => r.turns.filter((t) => !t.out.length).map((t) => `${r.name}: ${t.in}`))
  const head = `MODE: ${process.env.ANTHROPIC_API_KEY ? 'Claude classifier' : 'keyword fallback'}\n`
  return new Response(`${head}${formatResults(results)}\n\nSILENCIOS: ${silent.length}${silent.length ? `\n  ${silent.join('\n  ')}` : ''}\n`, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
