// netlify/functions/calendar.js
// Google Calendar write-back for Efimeramente
// Runs as a Netlify serverless function — secrets never reach the browser.

const { google } = require('googleapis');

const ALLOWED_ORIGINS = [
  'https://genuine-praline-0f8e70.netlify.app',
  'http://localhost:5173',
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

exports.handler = async (event) => {
  const origin = (event.headers && event.headers.origin) || '';

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: corsHeaders(origin), body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders(origin),
      body: JSON.stringify({ success: false, error: 'Method not allowed' }),
    };
  }

  // --- Parse body ---
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 200,
      headers: corsHeaders(origin),
      body: JSON.stringify({ success: false, error: 'Invalid JSON body' }),
    };
  }

  const { action, calendarId, eventId, event: calEvent } = body;

  if (!action || !calendarId) {
    return {
      statusCode: 200,
      headers: corsHeaders(origin),
      body: JSON.stringify({ success: false, error: 'Missing required fields: action, calendarId' }),
    };
  }

  // --- Auth ---
  const keyB64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!keyB64) {
    return {
      statusCode: 200,
      headers: corsHeaders(origin),
      body: JSON.stringify({ success: false, error: 'Server misconfiguration: missing service account key' }),
    };
  }

  let credentials;
  try {
    credentials = JSON.parse(Buffer.from(keyB64, 'base64').toString('utf8'));
  } catch {
    return {
      statusCode: 200,
      headers: corsHeaders(origin),
      body: JSON.stringify({ success: false, error: 'Server misconfiguration: could not parse service account key' }),
    };
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/calendar'],
  });

  const calendar = google.calendar({ version: 'v3', auth });

  // --- Dispatch ---
  try {
    if (action === 'create') {
      if (!calEvent) {
        return {
          statusCode: 200,
          headers: corsHeaders(origin),
          body: JSON.stringify({ success: false, error: 'Missing event body for create' }),
        };
      }
      const res = await calendar.events.insert({
        calendarId,
        requestBody: calEvent,
      });
      return {
        statusCode: 200,
        headers: corsHeaders(origin),
        body: JSON.stringify({ success: true, eventId: res.data.id }),
      };
    }

    if (action === 'update') {
      if (!eventId || !calEvent) {
        return {
          statusCode: 200,
          headers: corsHeaders(origin),
          body: JSON.stringify({ success: false, error: 'Missing eventId or event body for update' }),
        };
      }
      const res = await calendar.events.update({
        calendarId,
        eventId,
        requestBody: calEvent,
      });
      return {
        statusCode: 200,
        headers: corsHeaders(origin),
        body: JSON.stringify({ success: true, eventId: res.data.id }),
      };
    }

    if (action === 'delete') {
      if (!eventId) {
        return {
          statusCode: 200,
          headers: corsHeaders(origin),
          body: JSON.stringify({ success: false, error: 'Missing eventId for delete' }),
        };
      }
      await calendar.events.delete({ calendarId, eventId });
      return {
        statusCode: 200,
        headers: corsHeaders(origin),
        body: JSON.stringify({ success: true }),
      };
    }

    return {
      statusCode: 200,
      headers: corsHeaders(origin),
      body: JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
    };
  } catch (err) {
    const message = err?.response?.data?.error?.message || err.message || 'Unknown error';
    return {
      statusCode: 200,
      headers: corsHeaders(origin),
      body: JSON.stringify({ success: false, error: message }),
    };
  }
};
