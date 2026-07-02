// Shared Google Calendar helpers for the modern Netlify Functions runtime.
// Used by the browser-facing bridge (calendar.mjs) and the public booking
// function (public-booking.mjs) so freebusy has exactly ONE implementation.

import googleapis from 'googleapis'
const { google } = googleapis

// Builds an authenticated Calendar client from GOOGLE_SERVICE_ACCOUNT_KEY
// (base64 JSON). Throws with a caller-presentable message on misconfig.
export function getCalendarClient() {
  const keyB64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!keyB64) throw new Error('Server misconfiguration: missing service account key')
  let credentials
  try {
    credentials = JSON.parse(Buffer.from(keyB64, 'base64').toString('utf8'))
  } catch {
    throw new Error('Server misconfiguration: could not parse service account key')
  }
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/calendar'] })
  return google.calendar({ version: 'v3', auth })
}

// Busy periods for one calendar between two RFC3339 timestamps.
// Returns [{ start, end }] (ISO strings). Throws on API failure so callers
// decide whether to fail open or closed.
export async function queryFreebusy(calendar, calendarId, timeMin, timeMax) {
  const res = await calendar.freebusy.query({ requestBody: { timeMin, timeMax, items: [{ id: calendarId }] } })
  return (res.data.calendars[calendarId] && res.data.calendars[calendarId].busy) || []
}
