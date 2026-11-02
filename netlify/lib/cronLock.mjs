// netlify/lib/cronLock.mjs
//
// One run at a time per scheduled function (#99, 2 Nov 2026).
//
// Netlify's scheduler gives up on a scheduled invocation after ~15 s (status 499)
// and invokes the function AGAIN, while the first execution keeps running to the
// end. Every job that sends first and stamps after then sent twice (payment
// reminders 23 Oct + 2 Nov, comprobante alerts to Nicolás, a sesión-pendiente
// reminder). Wrap the whole run: the retry finds the lock held and exits.
//
// Lock = public.cron_locks via try_cron_lock / release_cron_lock (service_role only,
// supabase/cron-locks-99.sql). The TTL only matters if a run dies without releasing.
// FAILS CLOSED: if the lock can't be checked, the run is skipped (the next tick
// catches up) — a skipped run is cheaper than a duplicated WhatsApp.
//
// Manual live triggers (payment-run, proofs-run) take the SAME lock name as their
// scheduled twin, so a manual run can't overlap the cron either.

import { randomUUID } from 'node:crypto'

export async function withCronLock(supabase, name, fn, { ttlSec = 300 } = {}) {
  const holder = randomUUID()
  const { data: got, error } = await supabase.rpc('try_cron_lock', { p_name: name, p_holder: holder, p_ttl_seconds: ttlSec })
  if (error) {
    console.error(`[cron-lock] ${name}: lock check failed — run skipped:`, error.message)
    return { skipped: 'lock_error', error: error.message }
  }
  if (!got) {
    console.log(`[cron-lock] ${name}: another run in progress — this invocation skipped`)
    return { skipped: 'locked' }
  }
  try {
    return { result: await fn() }
  } finally {
    const { error: rErr } = await supabase.rpc('release_cron_lock', { p_name: name, p_holder: holder })
    if (rErr) console.error(`[cron-lock] ${name}: release failed (expires in ${ttlSec}s):`, rErr.message)
  }
}
