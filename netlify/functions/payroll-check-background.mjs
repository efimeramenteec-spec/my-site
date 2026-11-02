// netlify/functions/payroll-check-background.mjs
//
// BACKGROUND (#48 payroll workflow): one pass of runPayrollCheck — read each pending
// therapist's reply, compare the COUNT with the system, send report on match, tell
// Nicolás on mismatch / unreadable / 24 h without a list. Fired hourly by
// payroll-check and on demand by payroll-run?action=check. One at a time (#99 lock).
//
// Guard: header x-payroll-token = PAYROLL_TOKEN.

import { getSupabaseAdmin } from '../lib/whatsapp.mjs'
import { withCronLock } from '../lib/cronLock.mjs'
import { runPayrollCheck } from '../lib/payrollFlow.mjs'

export default async (req) => {
  const expected = process.env.PAYROLL_TOKEN
  if (!expected || req.headers.get('x-payroll-token') !== expected) return new Response('forbidden', { status: 403 })
  const supabase = getSupabaseAdmin()
  if (!supabase) { console.error('[payroll] no SUPABASE_SERVICE_KEY'); return new Response('ok') }
  try {
    const r = await withCronLock(supabase, 'payroll-check', () => runPayrollCheck(supabase), { ttlSec: 900 })
    console.log('[payroll]', JSON.stringify(r))
  } catch (e) {
    console.error('[payroll] check failed:', e.message)
  }
  return new Response('ok')
}
