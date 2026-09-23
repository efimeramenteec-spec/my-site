// netlify/functions/cf-probe.mjs
//
// TEMPORARY, token-guarded, READ-ONLY probe for the Contífico REST API.
// Same throwaway pattern as the deleted dh-probe. DELETE after use.
//
// api.contifico.com is not reachable from the local VM (egress blocked), so
// every Contífico call must run from a Netlify function.
//
// HARD RULE: this file only ever issues GET requests to Contífico. It never
// POSTs to /documento/ (that would emit a real SRI-authorized legal invoice).
// The fetch method is hardcoded to GET below — do not add a POST path.
//
// Guarded by ?probe=<token>; anything else 404s. Credential values are never
// logged or returned.
//
//   GET /.netlify/functions/cf-probe?probe=<token>&action=auth
//        → runs the auth-combo matrix against GET /persona/ and reports which works
//   GET /.netlify/functions/cf-probe?probe=<token>&path=/persona/&pos=1&auth=key
//        → generic GET passthrough (method always GET) for exploration
//
// Env: CONTIFICO_API_KEY, CONTIFICO_POS_TOKEN (Netlify secrets, functions scope).

const PROBE_TOKEN = '71411d674e34b1c3c208a4834b291c28e8b8c4cdd81b927f'
const BASE = 'https://api.contifico.com/sistema/api/v1'

const API_KEY = process.env.CONTIFICO_API_KEY || ''
const POS_TOKEN = process.env.CONTIFICO_POS_TOKEN || ''

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'content-type': 'application/json' },
  })

// A single GET attempt. `auth` = 'key' | 'bearer' | 'none'. `pos` appends the
// POS token as a query param. Returns status + a trimmed body snippet.
async function attempt({ path, auth = 'key', pos = false }) {
  let url = BASE + path
  if (pos) url += (url.includes('?') ? '&' : '?') + 'pos=' + encodeURIComponent(POS_TOKEN)

  const headers = { 'Content-Type': 'application/json' }
  if (auth === 'key') headers['Authorization'] = API_KEY
  else if (auth === 'bearer') headers['Authorization'] = 'Bearer ' + API_KEY

  const res = await fetch(url, { method: 'GET', headers })
  const text = await res.text()
  let parsed = null
  try { parsed = JSON.parse(text) } catch { /* keep raw */ }

  return {
    request: { path, auth, pos, urlHadPos: url.includes('pos=') },
    status: res.status,
    ok: res.ok,
    contentType: res.headers.get('content-type'),
    bodyLen: text.length,
    // small snippet only; never dumps full client lists here
    snippet: parsed
      ? (Array.isArray(parsed)
          ? { isArray: true, len: parsed.length, first: parsed[0] || null }
          : parsed)
      : text.slice(0, 600),
  }
}

export default async (req) => {
  const url = new URL(req.url)
  if (url.searchParams.get('probe') !== PROBE_TOKEN) {
    return new Response('Not found', { status: 404 })
  }
  if (!API_KEY || !POS_TOKEN) {
    return json({ error: 'missing_env', hasKey: !!API_KEY, hasPos: !!POS_TOKEN }, 500)
  }

  const action = url.searchParams.get('action')

  try {
    if (action === 'auth') {
      // Try the documented combinations against a tiny /persona/ read.
      const probePath = '/persona/'
      const combos = [
        { path: probePath, auth: 'key', pos: false },
        { path: probePath, auth: 'key', pos: true },
        { path: probePath, auth: 'bearer', pos: false },
        { path: probePath, auth: 'bearer', pos: true },
        { path: probePath, auth: 'none', pos: true },
        { path: probePath, auth: 'none', pos: false },
      ]
      const results = []
      for (const c of combos) {
        try { results.push(await attempt(c)) }
        catch (e) { results.push({ request: c, error: String(e) }) }
      }
      return json({ action: 'auth', results })
    }

    // Generic GET passthrough (method always GET).
    const path = url.searchParams.get('path') || '/persona/'
    const auth = url.searchParams.get('auth') || 'key'
    const pos = url.searchParams.get('pos') === '1'
    const full = url.searchParams.get('full') === '1'

    const res = await attempt({ path, auth, pos })
    // `full=1` returns the entire parsed body (used for the persona dump &
    // invoice inspection). Still GET, still read-only.
    if (full) {
      let u = BASE + path
      if (pos) u += (u.includes('?') ? '&' : '?') + 'pos=' + encodeURIComponent(POS_TOKEN)
      const headers = { 'Content-Type': 'application/json' }
      if (auth === 'key') headers['Authorization'] = API_KEY
      else if (auth === 'bearer') headers['Authorization'] = 'Bearer ' + API_KEY
      const r = await fetch(u, { method: 'GET', headers })
      const t = await r.text()
      let p = null
      try { p = JSON.parse(t) } catch { /* raw */ }
      return json({ status: r.status, full: true, body: p ?? t })
    }
    return json(res)
  } catch (e) {
    return json({ error: String(e), stack: e?.stack?.split('\n').slice(0, 4) }, 500)
  }
}
