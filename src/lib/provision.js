// Single source of truth for what the practice provisions (owes) a therapist
// per session. Shared by Finanzas (payroll reserve) and the Sesiones report so
// the two can never disagree.
//
// Rules (Nicolas): base rate lives in therapists.provision_rate ($24 default;
// Mariana = 0, she keeps 100%). Pareja (couple) sessions pay MORE ($30). A
// therapist on a 0 base is never provisioned, whatever the session type.
// Trial period (Nicolás, 5 Oct 2026): new therapists are paid $20 per
// non-pareja session for their first 2 months — therapists.prueba_hasta
// (inclusive) marks its end; null = no trial.
export const PROVISION_DEFAULT = 24
export const PROVISION_PAREJA = 30
export const PROVISION_PRUEBA = 20

export function sessionProvision(session, baseRate, pruebaHasta = null) {
  const base = Number(baseRate ?? PROVISION_DEFAULT)
  if (base === 0) return 0
  if (session?.tipo === 'pareja') return PROVISION_PAREJA
  if (pruebaHasta && session?.fecha && session.fecha <= pruebaHasta) return PROVISION_PRUEBA
  return base
}
