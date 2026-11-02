// netlify/functions/payroll-run.mjs
//
// Token-guarded admin trigger for the monthly payroll workflow (#48). GET with ?token=PAYROLL_TOKEN:
//   &action=start&periodo=2026-10[&skip=Daniela,Francisco][&only=Camila][&live=1]
//        → sends the conteo_sesiones template (live=1; default = plan only) and creates the payroll_runs rows
//   &action=check                       → fires one background pass now (same as the hourly run)
//   &action=recheck&periodo=…&nombre=X  → "revisa a X": back to pendiente_lista, re-read on the next pass
//   &action=status&periodo=…            → the month's rows

import { getSupabaseAdmin } from '../lib/whatsapp.mjs'
import { startPayroll, recheckPayroll } from '../lib/payrollFlow.mjs'

const json = (o, s = 200) => new Response(JSON.stringify(o, null, 2), { status: s, headers: { 'Content-Type': 'application/json' } })
const list = (v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean) : [])

export default async (req) => {
  const url = new URL(req.url)
  const token = process.env.PAYROLL_TOKEN
  if (!token || url.searchParams.get('token') !== token) return new Response('Not found', { status: 404 })
  const supabase = getSupabaseAdmin()
  if (!supabase) return json({ error: 'SUPABASE_SERVICE_KEY not set' }, 500)
  const action = url.searchParams.get('action') || 'status'
  const periodo = url.searchParams.get('periodo')
  try {
    if (action === 'start') {
      if (!/^\d{4}-\d{2}$/.test(periodo || '')) return json({ error: 'periodo=YYYY-MM' }, 400)
      const only = list(url.searchParams.get('only'))
      return json(await startPayroll(supabase, { periodo, skip: list(url.searchParams.get('skip')), only: only.length ? only : null,
        live: url.searchParams.get('live') === '1' }))
    }
    if (action === 'check') {
      const base = process.env.URL || 'https://efimeramente-panel.netlify.app'
      const res = await fetch(`${base}/.netlify/functions/payroll-check-background`, { method: 'POST', headers: { 'x-payroll-token': token } })
      return json({ fired: res.status })
    }
    if (action === 'recheck') return json(await recheckPayroll(supabase, { periodo, nombre: url.searchParams.get('nombre') }))
    const { data, error } = await supabase.from('payroll_runs')
      .select('periodo, estado, sesiones, monto, conteo_terapeuta, pedido_at, revisado_hasta, aviso_sin_lista_at, aviso_owner_at, therapist:therapists(nombre)')
      .eq('periodo', periodo || '').order('created_at')
    if (error) throw new Error(error.message)
    return json({ periodo, rows: data })
  } catch (e) {
    return json({ error: e.message }, 500)
  }
}
