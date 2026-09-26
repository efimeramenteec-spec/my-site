// netlify/functions/submit-lead-templates.mjs
//
// One-shot ADMIN endpoint: submits the lead-funnel follow-up templates to Meta
// for review, via the Dualhook proxy (which holds WA_DUALHOOK_API_KEY server-side;
// the key is not in the local .env, so submission can't run locally). Idempotent-
// ish — Meta rejects a duplicate name with a clear error that's returned, not
// thrown. Safe to re-hit.
//
// Guard: GET ?token=<LEAD_TOOLS_TOKEN>. Returns per-template {status, body} so you
// can see each template's Meta id + PENDING state. Delete or ignore after go-live.

import { submitTemplates, listTemplates } from '../lib/leadTemplates.mjs'

export default async (req) => {
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const expected = process.env.LEAD_TOOLS_TOKEN
  if (!expected || token !== expected) return new Response('forbidden', { status: 403 })
  // ?list — fast read of current Meta status (no submit). Use to verify after a
  // submit whose HTTP response was eaten by a proxy timeout.
  if (url.searchParams.get('list') != null) {
    try {
      const out = await listTemplates()
      return new Response(JSON.stringify({ ok: true, ...out }, null, 2),
        { status: 200, headers: { 'Content-Type': 'application/json' } })
    } catch (e) {
      return new Response(JSON.stringify({ ok: false, error: e.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
  }
  try {
    const results = await submitTemplates()
    return new Response(JSON.stringify({ ok: true, results }, null, 2),
      { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } })
  }
}
