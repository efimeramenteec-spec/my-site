// Single source of truth for what the practice provisions (owes) a therapist
// per session. Shared by Finanzas (payroll reserve) and the Sesiones report so
// the two can never disagree.
//
// Rules (Nicolas): base rate lives in therapists.provision_rate ($24 default;
// Mariana = 0, she keeps 100%). Pareja (couple) sessions pay MORE ($30). A
// therapist on a 0 base is never provisioned, whatever the session type.
export const PROVISION_DEFAULT = 24
export const PROVISION_PAREJA = 30

export function sessionProvision(session, baseRate) {
  const base = Number(baseRate ?? PROVISION_DEFAULT)
  if (base === 0) return 0
  return session?.tipo === 'pareja' ? PROVISION_PAREJA : base
}
