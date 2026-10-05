// netlify/lib/payrollCopy.mjs
//
// Monthly therapist payroll check (#48) — the verbatim copy. Double-blind: each
// therapist sends their own list of the month's sessions to the 9933; it is
// compared with the system — ONLY confirmed, non-llamada sessions. Match → message +
// the system PDF (src/lib/sessionReport.js) → they invoice Mariana. Mismatch → the
// copy below. Llamadas are NEVER part of the payroll conversation (Nicolás, 5 Oct:
// their only state is Convirtió/No convirtió; sessions.estado on them is legacy).
//
// EXCEPTION to the no-emoji rule (Nicolás): every payroll message is signed
// FIRMA (emoji included) and must NEVER pass through waSend's cleanBotText —
// send with payroll-send.mjs (plain session messages), not the lead-bot path.

export const FIRMA = 'Att: La Caracola Mágica🐚✨'

const seguro = (genero) => (genero === 'M' ? 'seguro' : 'segura')

export function matchMessage({ nombre, n, monto }) {
  return `Hola ${nombre}, revisé tus sesiones de septiembre y todo cuadra con el sistema: ${n} sesiones, total ${monto}. Te adjunto el reporte. Ya puedes hacer tu factura a Mariana y mandármela por aquí. Gracias!\n${FIRMA}`
}

export function pedirListaMessage({ nombre }) {
  return `Hola ${nombre}, me pasas el detalle de tus sesiones de septiembre (fecha y paciente) para cruzarlo con el sistema y hacer tu pago? Gracias!\n${FIRMA}`
}

// Mismatch (both blocks in one message if both apply).
//   soloEllos:  ['dd/mm — paciente', …]       sessions they have and the system doesn't
//   soloSistema: ['dd/mm hh:mm — paciente', …] sessions the system has and they don't
export function mismatchMessage({ nombre, genero, soloEllos = [], soloSistema = [] }) {
  const blocks = []
  if (soloEllos.length) {
    blocks.push(`Hola ${nombre}, cruzando tu lista de septiembre con el sistema hay sesiones que tú tienes y el sistema no:\n${soloEllos.join('\n')}\nEstás 100% ${seguro(genero)} de que se dieron? Por qué no están en el sistema?`)
  }
  if (soloSistema.length) {
    const intro = soloEllos.length ? 'Y en el sistema tenemos estas sesiones que no están en tu lista:' : `Hola ${nombre}, en el sistema tenemos estas sesiones que no están en tu lista:`
    blocks.push(`${intro}\n${soloSistema.join('\n')}\nSe dieron? Quizás se confirmaron y se cancelaron a último momento? Porfa revisa y me cuentas.`)
  }
  return blocks.length ? `${blocks.join('\n\n')}\n${FIRMA}` : null
}
