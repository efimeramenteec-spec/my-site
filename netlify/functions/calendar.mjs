// netlify/functions/calendar.mjs
// Google Calendar write-back for Efimeramente — modern Netlify Function.
// Secrets never reach the browser. POST { action, calendarId, event, eventId }.
// Actions: create | update | delete | freebusy.

import googleapis from 'googleapis'
const { google } = googleapis

const ALLOWED_ORIGINS = [
  'https://efimeramente-panel.netlify.app',
  'https://genuine-praline-0f8e70.netlify.app',
  'http://localhost:5173',
]

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

export default async (req) => {
  const origin = req.headers.get('origin') || ''
  const cors = corsHeaders(origin)
  // Most business errors return 200 with { success:false } so the client's
  // best-effort sync never throws; only method/preflight use other codes.
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', ...cors } })

  // 204 = No Content: the body MUST be null. Passing '' throws in the modern
  // runtime (web Response constructor), which surfaced as a 502 on CORS preflight
  // and silently blocked every browser call to this function.
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405)

  let body
  try { body = await req.json() } catch { return json({ success: false, error: 'Invalid JSON body' }) }

  const { action, calendarId, eventId, event: calEvent } = body || {}
  if (!action || !calendarId) return json({ success: false, error: 'Missing required fields: action, calendarId' })

  const keyB64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!keyB64) return json({ success: false, error: 'Server misconfiguration: missing service account key' })

  let credentials
  try {
    credentials = JSON.parse(Buffer.from(keyB64, 'base64').toString('utf8'))
  } catch {
    return json({ success: false, error: 'Server misconfiguration: could not parse service account key' })
  }

  const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/calendar'] })
  const calendar = google.calendar({ version: 'v3', auth })

  try {
    if (action === 'create') {
      if (!calEvent) return json({ success: false, error: 'Missing event body for create' })
      const res = await calendar.events.insert({ calendarId, requestBody: calEvent })
      return json({ success: true, eventId: res.data.id })
    }

    if (action === 'update') {
      if (!eventId || !calEvent) return json({ success: false, error: 'Missing eventId or event body for update' })
      const res = await calendar.events.update({ calendarId, eventId, requestBody: calEvent })
      return json({ success: true, eventId: res.data.id })
    }

    if (action === 'delete') {
      if (!eventId) return json({ success: false, error: 'Missing eventId for delete' })
      await calendar.events.delete({ calendarId, eventId })
      return json({ success: true })
    }

    if (action === 'freebusy') {
      const { timeMin, timeMax } = body
      if (!timeMin || !timeMax) return json({ success: false, error: 'Missing timeMin or timeMax for freebusy' })
      const res = await calendar.freebusy.query({ requestBody: { timeMin, timeMax, items: [{ id: calendarId }] } })
      const busy = (res.data.calendars[calendarId] && res.data.calendars[calendarId].busy) || []
      return json({ success: true, busy })
    }

    return json({ success: false, error: `Unknown action: ${action}` })
  } catch (err) {
    const message = err?.response?.data?.error?.message || err.message || 'Unknown error'
    return json({ success: false, error: message })
  }
}
