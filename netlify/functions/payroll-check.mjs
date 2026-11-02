// netlify/functions/payroll-check.mjs
//
// SCHEDULED, hourly at :05 (#48 payroll workflow). Only hands off to the BACKGROUND
// function (reading screenshots + building/sending PDFs doesn't fit a scheduled run's
// ~30 s), which does the work under the 'payroll-check' lock. Acts only on payroll_runs
// rows in pendiente_lista — nothing happens until payroll-run?action=start creates them.

export const config = { schedule: '5 * * * *' }

export default async () => {
  const base = process.env.URL || 'https://efimeramente-panel.netlify.app'
  const token = process.env.PAYROLL_TOKEN
  if (!token) { console.error('[payroll-check] PAYROLL_TOKEN missing'); return new Response('ok') }
  try {
    const res = await fetch(`${base}/.netlify/functions/payroll-check-background`, {
      method: 'POST', headers: { 'x-payroll-token': token },
    })
    console.log('[payroll-check] background fired:', res.status)
  } catch (e) {
    console.error('[payroll-check] fire failed:', e.message)
  }
  return new Response('ok')
}
