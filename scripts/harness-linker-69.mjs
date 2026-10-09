// #69 — pure checks for netlify/lib/leadLinker.mjs (matching order, ambiguity, es_prueba, only-null patch).
import assert from 'node:assert/strict'
import { matchLead, linkPatch, phoneDistance, nameMatches } from '../netlify/lib/leadLinker.mjs'

const T = Date.parse('2026-10-04T01:14:56Z'), H = 3600e3
const lead = (id, phone, extra = {}) => ({ id, phone, wa_name: null, es_prueba: false, activeAtMs: [T - 2 * H], ...extra })

assert.equal(phoneDistance('+59363158790', '+593963158790'), 1)       // dropped digit (Wolfgang)
assert.equal(phoneDistance('+593987284059', '+593984287059'), 2)      // two digits swapped (Gissela)
assert.ok(nameMatches({ nombre: 'Génesis', apellido: 'Taco' }, 'GENESIS taco 🌸'))
assert.ok(!nameMatches({ nombre: 'Gissela', apellido: 'Morales' }, 'Gissela'))   // first name alone isn't enough

const b = { telefono: '+593987284059', nombre: 'Gissela', apellido: 'Morales', bookedAtMs: T }
// (1) last-9 wins over a typo match
assert.equal(matchLead(b, [lead('x', '+593987284059', { activeAtMs: [] }), lead('y', '+593984287059')]).lead.id, 'x')
// (2) typo, only when active in the 72 h before booking
assert.equal(matchLead(b, [lead('y', '+593984287059')]).rule, 'phone_typo')
assert.ok(matchLead(b, [lead('y', '+593984287059', { activeAtMs: [T - 80 * H] })]).none)
// ambiguous → no link
assert.equal(matchLead(b, [lead('y', '+593984287059'), lead('z', '+593987284000')]).ambiguous, 'phone_typo')
// (3) name
assert.equal(matchLead(b, [lead('n', '+593911111111', { wa_name: 'Gissela Morales' })]).rule, 'wa_name')
// es_prueba never linked
assert.ok(matchLead(b, [lead('p', '+593987284059', { es_prueba: true })]).none)

// only-null patch, never stage; conflict on another patient
const s = { id: 's1', patient_id: 'p1', tipo: 'llamada', created_at: '2026-10-04T01:14:56Z' }
assert.deepEqual(linkPatch({ patient_id: null, session_id: 'old', agendo_at: null }, s).patch, { patient_id: 'p1', agendo_at: s.created_at })
assert.equal(linkPatch({ patient_id: 'p2' }, s).conflict, 'lead_has_other_patient')
assert.ok(!('stage' in linkPatch({}, s).patch))
assert.deepEqual(linkPatch({}, { ...s, tipo: 'individual' }).patch, { patient_id: 'p1', session_id: 's1' })
console.log('OK — all #69 linker checks passed')
