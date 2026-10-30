// netlify/lib/ownerGate.mjs — shared CORS + owner-only gate for panel-facing HQ functions (#97).
// Verifies the caller's Supabase access token and requires profiles.role = 'owner'.

const ALLOWED_ORIGINS = [
  'https://efimeramente-panel.netlify.app',
  'https://genuine-praline-0f8e70.netlify.app',
  'http://localhost:5173',
  'https://efimeramente-hq.netlify.app', // #97: the HQ office game (separate site)
  'http://localhost:5174',
]

export function corsFor(req, methods = 'GET, OPTIONS') {
  const origin = req.headers.get('origin') || ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': methods,
  }
}

// Returns null when the caller is the owner, else the HTTP status to answer with.
export async function ownerGateStatus(supabase, req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return 401
  const { data: userData, error } = await supabase.auth.getUser(token)
  if (error || !userData?.user) return 401
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', userData.user.id).single()
  return profile?.role === 'owner' ? null : 403
}
