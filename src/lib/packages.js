// 4-session packages — #4 (2026-08-31).
//
// A patient buys a prepaid pack of PACKAGE_SIZE sessions. The owner marks the
// FIRST session of the pack with sessions.package_anchor=true; everything else
// is derived here (no separate table, no counters to keep in sync):
//   • The pack covers the anchor + the next PACKAGE_SIZE-1 REAL sessions
//     (real = not a llamada, not cancelled) in date order.
//   • When scheduling a new session for a patient whose current pack still has
//     open slots, it defaults to paid (prepaid).
//   • A patient "has a package" (⭐) if they have ANY anchor session, ever —
//     even a finished one.
// Re-buying is just another anchor later in the timeline: hitting an anchor
// resets the open-slot counter, so consecutive packs count independently.

export const PACKAGE_SIZE = 4

const isCancelled = (estado) => estado === 'cancelada' || estado === 'no_show'
const isReal = (s) => s && s.tipo !== 'llamada' && !isCancelled(s.estado)

// A patient's real sessions in chronological order (stable tie-break by id).
function realSorted(patientSessions = []) {
  return patientSessions.filter(isReal).sort((a, b) =>
    a.fecha !== b.fecha
      ? a.fecha.localeCompare(b.fecha)
      : (a.hora_inicio || '').localeCompare(b.hora_inicio || '') ||
        String(a.id).localeCompare(String(b.id)),
  )
}

// Slots still open in the patient's currently-open pack, AFTER accounting for
// all their existing real sessions. A newly-scheduled session is prepaid iff
// this is > 0. (The anchor itself is slot 1 of the pack.)
export function remainingPackSlots(patientSessions = []) {
  let remaining = 0
  for (const s of realSorted(patientSessions)) {
    if (s.package_anchor) remaining = PACKAGE_SIZE // a new pack starts here
    if (remaining > 0) remaining -= 1 // this session consumes a slot
  }
  return remaining
}

// Has the patient ever bought a package? (drives the ⭐ marker)
export function hasPackage(patientSessions = []) {
  return patientSessions.some((s) => s && s.package_anchor)
}
