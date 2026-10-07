// netlify/lib/leadBrain.mjs
//
// T2 of the three-tier lead handler — funnel v2 (#27). When a lead sends FREE
// TEXT (not a button tap), Claude (Anthropic Messages API, Sonnet) EITHER answers
// from a curated fact sheet OR derives the conversation to a human. In v2 Claude
// is the ENTRY POINT: a real question is answered first, and only then does the
// bot offer to show therapists (the invitation, sent once, lives in leadBot).
//
//   T1 = button taps            → handled entirely in leadBot.mjs, no model.
//   T2 = free text              → this file: Claude decides {responder|derivar}.
//   T3 = derivar                → leadBot.mjs pushes Nicolás + pauses (day = silent,
//                                 night = one line; urgent = containment + ECU 911).
//
// HARD SAFETY MODEL — the model NEVER free-writes to a lead unchecked:
//   • It answers ONLY from the fact sheet (funnel_knowledge + live therapist
//     captions). Anything the fact sheet doesn't cover → it must DERIVE.
//   • Distress / crisis / self-harm / violence / clinical question → derive with
//     motivo "urgente"; only on explicit risk to life the reply carries ECU 911.
//   • Complaints, existing-patient admin, long personal stories, "¿bot o persona?",
//     anything uncertain → derive.
//   • Style (#37): Spanish, tú, short like a person on WhatsApp, speaking as "Nico".
//     NO emojis at all, NO opening ¿ or ¡ (waSend's sanitizer enforces it too). Answer ONLY what
//     was asked. Never a closing "¿quieres agendar?" — leadBot adds the offer.
//
// It also detects the consultation REASON when it's clear from the text (e.g.
// "es para mi hijo de 15" → categoria "hijo"), so the one-time invitation can skip
// the reason list and jump straight to that reason's therapist cards.
//
// matchTherapistsForText() is the v2 helper for reasons 7 (diagnóstico) and 9
// (varios motivos): given the lead's free-text description + the bookable roster,
// Claude picks up to 3 therapists to show as cards, or derives to Nicolás for the
// always-human cases (no fit, eating disorders, psychosis, bipolar, self-harm,
// audio, long/emotional/unclear).
//
// Raw fetch (not the SDK): matches this repo's external-API convention and gives a
// precise 8s AbortController budget — on failure/timeout the caller falls back to
// the keyword path. Best-effort: returns null rather than throwing.
//
// Env: ANTHROPIC_API_KEY (Sonnet). Absent ⇒ returns null ⇒ keyword fallback.

import MAPA from './mapaCasos.json' with { type: 'json' }

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6' // spec: Sonnet
const TIMEOUT_MS = 8000

// The reason claves the model may attach to an answer (must mirror funnel_categorias).
const CATEGORIA_CLAVES = [
  'hijo', 'ruptura', 'problemas_pareja', 'depresion_ansiedad', 'consumo',
  'terapia_pareja', 'terapia_familiar', 'diagnostico', 'trauma', 'varios', 'otro', '',
]

const STEP_ES = {
  quien: 'le preguntamos para quién busca terapia (para sí, en pareja o para su hijo/a)',
  edad: 'le preguntamos la edad de su hijo/a',
  cards: 'está viendo las tarjetas de los terapeutas recomendados para elegir uno',
  reasons: 'le preguntamos qué le trae a terapia',
  diagnostico_prompt: 'le pedimos que cuente su diagnóstico',
  varios_prompt: 'le pedimos que cuente qué le trajo a terapia',
  link_enviado: 'ya eligió terapeuta y recibió el link para agendar la llamada gratuita',
  answered: 'acaba de recibir una respuesta a una pregunta',
  pregunta_abierta: 'dijo que tiene otra pregunta',
  agendado: 'ya agendó su llamada gratuita',
}

// Captions are written for WhatsApp, so they carry newlines (one bullet per
// line). Both prompts list one therapist per line — flatten before embedding.
const oneLine = (s) => String(s || '')
  .split('\n')
  .map((l) => l.replace(/^[\s•·\-*]+/, '').trim())
  .filter(Boolean)
  .join(' · ')

// Build the fact sheet block from funnel_knowledge + live therapist captions.
// Only ACTIVE knowledge rows and therapists that receive new patients are
// included, so the model's "availability" reflects the real bot pool.
export async function buildFactSheet(supabase) {
  const [kRes, tRes] = await Promise.all([
    supabase.from('funnel_knowledge').select('titulo, contenido').eq('activo', true).order('orden'),
    supabase.from('therapists').select('nombre, apellido, funnel_caption')
      .eq('recibe_nuevos', true).eq('activo', true),
  ])
  const facts = (kRes.data || []).map((k) => `- ${k.titulo}: ${k.contenido}`).join('\n')
  const teamRows = (tRes.data || [])
    .filter((t) => t.funnel_caption)
    .map((t) => `- ${t.nombre} ${t.apellido}: ${oneLine(t.funnel_caption)}`)
  const team = teamRows.length ? `\n\nTerapeutas disponibles (para elegir en el chat):\n${teamRows.join('\n')}` : ''
  return `${facts}${team}`
}

// #54 — Claude ONLY CLASSIFIES. It returns an ordered list of `intents` (the
// lead's order, no duplicates, max 4); the code answers each with Nicolás's
// verbatim CANNED copy or runs the step the old button tap ran. There is no
// "libre" any more: a question no CANNED answer covers is DERIVED to Nicolás —
// the model never composes text for a lead (except the urgent containment line).
// Keep the CANNED keys in sync with leadBot's CANNED.
export const CANNED_INTENTS = [
  'precio', 'ubicacion', 'saludsa', 'seguros', 'adolescentes', 'duracion',
  'horarios', 'psiquiatra', 'pareja', 'familia', 'pago', 'objecion_precio',
]
const FLOW_INTENTS = [
  'afirmativo', 'negativo', 'quien_yo', 'quien_pareja', 'quien_hijo', 'edad',
  'elige_terapeuta', 'motivo', 'agendar', 'saludo', 'gracias',
]
const INTENTS = [...CANNED_INTENTS, ...FLOW_INTENTS]

const SYSTEM_RULES = `Eres el clasificador del WhatsApp de Efimeramente, un consultorio de psicología en Cumbayá (Ecuador). Un posible paciente que llegó por un anuncio escribe TEXTO LIBRE. Tu ÚNICO trabajo es CLASIFICAR el mensaje: devolver la lista de "intents" que contiene (en el orden en que los escribió, sin repetir, máximo 4) y decidir si el sistema "responde" o "deriva" a una persona. NUNCA escribes la respuesta: el sistema envía textos ya redactados o ejecuta el paso del flujo.

MENSAJES SEGUIDOS: si el cliente mandó varios mensajes seguidos, llegan juntos en el MENSAJE ACTUAL, uno por línea. Clasifícalos como UN solo turno.

YA RESPONDIDO: recibes la lista de respuestas fijas que ya se le enviaron en esta conversación. NO vuelvas a poner un intent solo porque aparece en los mensajes anteriores. Si en el MENSAJE ACTUAL vuelve a preguntar algo ya respondido, usa el mismo intent (se le responde de nuevo).

CONTEXTO: recibes el paso actual de la conversación, la ÚLTIMA PREGUNTA que le hizo el sistema y los terapeutas que se le mostraron. Úsalos para entender respuestas cortas: "si", "dale", "claro" responden a la última pregunta; "para mi hijo de 15" responde a "para quién"; "me gustaría con francisco por favor" elige a ese terapeuta.

INTENTS CON RESPUESTA FIJA (una pregunta del cliente):
- precio: costo / valor / cuánto cuesta la sesión.
- ubicacion: dónde están / dirección / si es presencial u online.
- saludsa: pregunta específicamente si Saludsa (o Ecuasanitas) cubre o reembolsa.
- seguros: pregunta general por seguros/reembolso (otra aseguradora, o "aceptan seguros?").
- adolescentes: pregunta si atienden adolescentes o jóvenes.
- duracion: cuánto dura la sesión o cada cuánto es la frecuencia.
- horarios: qué días u horas atienden.
- psiquiatra: si tienen psiquiatra o dan medicación.
- pareja: busca terapia o sesiones de pareja, o pregunta por ella. SOLO para una pareja (dos adultos en una relación). NUNCA para "familia" / "familiar".
- familia: terapia familiar, dinámicas familiares, padres e hijos juntos ("terapias familiares?", "terapia para toda la familia").
- pago: cómo o cuándo se paga / formas de pago.
- objecion_precio: dice que es caro, que no le alcanza, que tiene poco presupuesto.

INTENTS DEL FLUJO (responde a lo que el sistema preguntó o avanza):
- afirmativo: acepta claramente la ÚLTIMA PREGUNTA ("si", "sí", "dale", "claro", "ok, sí", "por favor", "me gustaría verlos").
- negativo: rechaza la última pregunta ("no", "no gracias", "todavía no").
- quien_yo / quien_pareja / quien_hijo: para quién es la terapia (para sí mismo/a · en pareja · para su hijo/a).
- edad: la edad del hijo/a. Pon el número en "valor" (ej. "15").
- elige_terapeuta: elige o pide a un terapeuta por su nombre o apellido (con o sin "Dra./Dr."). Pon el nombre en "valor".
- motivo: describe su motivo de consulta (ansiedad, depresión, duelo, ruptura, consumo, un diagnóstico...).
- agendar: quiere agendar / empezar terapia SIN nombrar a ningún terapeuta.
- saludo: solo saluda.
- gracias: agradece o solo acusa recibo ("ok", "jaja", "perfecto", "gracias", "ya", un emoji) SIN aceptar ni pedir nada. "jaja ok" es gracias, NO afirmativo.

REGLAS DE DERIVACIÓN (accion "derivar", intents vacío salvo lo que sí entendiste):
1. Pregunta algo que NINGÚN intent de respuesta fija cubre (incluye visitas a domicilio, otros servicios, temas que no estén arriba) → deriva, motivo "fuera_de_alcance" (o "domicilio"). Nunca inventes.
2. SOLO crisis real → motivo "urgente": ideas, intención o plan de autolesión o suicidio; violencia ocurriendo; o una pregunta clínica directa (diagnóstico, si necesita medicación, qué tratamiento). En "texto" una línea cálida breve de contención, y SOLO si hay riesgo de vida explícito añade: "Si estás en peligro inmediato, llama al 911 (ECU 911)." El malestar común NO es urgente.
3. Historias personales largas o muy emocionales, quejas, temas de pacientes actuales, "cuál me recomiendas?", o si preguntan si hablan con un bot o una persona → deriva, "texto" vacío, motivo "emocional"/"queja"/"recomendacion"/"paciente_existente"/"bot". No es urgente.
Si el mensaje trae una pregunta fija Y algo que no cubres, deriva (una persona responde todo).

"texto" va SIEMPRE vacío, salvo la línea de contención de una derivación "urgente" (español, tú, sin emojis, sin "¿" ni "¡" de apertura).

CATEGORIA: si del mensaje se entiende el motivo de consulta, ponla (hijo, ruptura, problemas_pareja, depresion_ansiedad, consumo, terapia_pareja, terapia_familiar, diagnostico, trauma, varios, otro); si no, "". Familia/familiar es terapia_familiar, nunca terapia_pareja.

EJEMPLOS:
- "cuánto cuesta" → responder, [precio]
- "Cuál es el precio? Donde están ubicados" → responder, [precio, ubicacion]
- "cuánto dura la sesión" → responder, [duracion]
- "atienden adolescentes?" → responder, [adolescentes], categoria hijo
- "Busco terapia de pareja" → responder, [pareja], categoria terapia_pareja
- "hacen terapia familiar?" → responder, [familia], categoria terapia_familiar
- "Hola ustedes atienden terapia para 16 años manejo de ira ?" + salto de línea + "O terapias familiares ?" → responder, [saludo, adolescentes, edad "16", familia], categoria terapia_familiar
- "me parece caro" → responder, [objecion_precio]
- (última pregunta "Te gustaría ver a nuestros terapeutas disponibles?") "si" → responder, [afirmativo]
- (última pregunta "para quién buscas empezar terapia?") "para mi hijo, tiene 15" → responder, [quien_hijo, edad "15"], categoria hijo
- (última pregunta "para quién...") "para mí" → responder, [quien_yo]
- (paso: viendo terapeutas) "me gustaría con francisco por favor" → responder, [elige_terapeuta "Francisco"]
- "quiero una cita con Carolina Almeida" → responder, [elige_terapeuta "Carolina Almeida"]
- (última pregunta "Qué te trae a terapia?") "ansiedad" → responder, [motivo], categoria depresion_ansiedad
- "quiero agendar una cita" → responder, [agendar]
- "jaja ok" → responder, [gracias]
- "buen día" → responder, [saludo]
- "hacen visitas a domicilio?" → derivar, motivo domicilio
- "mi hija necesita medicación?" → derivar, motivo urgente

FORMATO DE SALIDA: llama a la herramienta "clasificar".`

const TOOL = {
  name: 'clasificar',
  description: 'Clasifica el mensaje del posible paciente en intents y decide responder o derivar.',
  input_schema: {
    type: 'object',
    properties: {
      accion: { type: 'string', enum: ['responder', 'derivar'] },
      intents: {
        type: 'array',
        maxItems: 4,
        description: 'Intents en el orden del mensaje, sin repetir.',
        items: {
          type: 'object',
          properties: {
            intent: { type: 'string', enum: INTENTS },
            valor: { type: 'string', description: 'edad → el número; elige_terapeuta → el nombre mencionado.' },
          },
          required: ['intent'],
        },
      },
      texto: { type: 'string', description: 'Vacío salvo la línea de contención de una derivación urgente.' },
      motivo: { type: 'string' },
      categoria: { type: 'string', enum: CATEGORIA_CLAVES },
    },
    required: ['accion', 'intents', 'motivo'],
  },
}

// Ask Claude to classify one free-text message. Returns
// { accion, intents:[{intent, valor}], texto, motivo, categoria, model, latencyMs }
// or null (API missing/error/timeout → the caller's keyword fallback).
// `pregunta` = the bot's last question; `ofrecidos` = therapist names on offer.
export async function decideFreeText({ history, step, pregunta, ofrecidos, text, yaRespondidos = [] }) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const stepLine = STEP_ES[step] || 'acaba de escribir por primera vez o está conversando'
  const histBlock = (history && history.length)
    ? `\nMensajes anteriores del cliente (más antiguo primero):\n${history.map((h) => `- "${h}"`).join('\n')}`
    : ''
  const user = `PASO ACTUAL: el cliente ${stepLine}.
ÚLTIMA PREGUNTA DEL SISTEMA: ${pregunta ? `"${pregunta}"` : '(ninguna)'}
TERAPEUTAS MOSTRADOS: ${ofrecidos && ofrecidos.length ? ofrecidos.join(', ') : '(ninguno)'}
YA RESPONDIDO: ${yaRespondidos.length ? yaRespondidos.join(', ') : '(nada)'}${histBlock}

MENSAJE ACTUAL DEL CLIENTE:
"${String(text).slice(0, 1000)}"

Clasifica y llama a la herramienta "clasificar".`

  const out = await callTool({ apiKey, system: SYSTEM_RULES, user, tool: TOOL })
  if (!out || (out.accion !== 'responder' && out.accion !== 'derivar')) return null
  const seen = new Set()
  const intents = (Array.isArray(out.intents) ? out.intents : [])
    .map((i) => (typeof i === 'string' ? { intent: i } : i))
    .filter((i) => i && INTENTS.includes(i.intent) && !seen.has(i.intent) && seen.add(i.intent))
    .slice(0, 4)
    .map((i) => ({ intent: i.intent, valor: typeof i.valor === 'string' ? i.valor.trim().slice(0, 80) : '' }))
  return {
    accion: out.accion,
    intents,
    texto: typeof out.texto === 'string' ? out.texto.trim() : '',
    motivo: (out.motivo || '').toString().slice(0, 60),
    categoria: CATEGORIA_CLAVES.includes(out.categoria) ? (out.categoria || '') : '',
    model: MODEL,
    latencyMs: out.latencyMs,
  }
}

// ── Reasons 7 (diagnóstico) & 9 (varios) — match free text against the roster ──
const MATCH_TOOL = {
  name: 'recomendar',
  description: 'Recomienda terapeutas para el motivo del posible paciente, o deriva a una persona.',
  input_schema: {
    type: 'object',
    properties: {
      accion: { type: 'string', enum: ['cards', 'derivar'] },
      nombres: { type: 'array', items: { type: 'string' }, description: 'Nombres (solo el primer nombre) de hasta 3 terapeutas del ROSTER.' },
      motivo: { type: 'string' },
    },
    required: ['accion', 'nombres', 'motivo'],
  },
}

const MATCH_SYSTEM = `Eres el asistente de un consultorio de psicología en Cumbayá (Ecuador). El posible paciente describió su motivo de consulta con texto libre. Tu trabajo es elegir hasta 3 terapeutas del ROSTER que mejor encajen, o DERIVAR a una persona del equipo.

REGLAS:
- Elige SOLO terapeutas que estén en el ROSTER (usa su primer nombre exacto). Máximo 3, del más al menos afín.
- Guíate por el MAPA DE CASOS: es lo que cada terapeuta respondió sobre qué puede atender. Manda sobre cualquier otra señal. Prioriza a quien tiene ESPECIALIDAD en el tema; después a quien puede trabajarlo. Lo que no aparece como ESPECIALIDAD ni como "NO trabaja" es algo que sí puede tomar.
- NUNCA recomiendes a alguien para un tema que el mapa marca como "NO trabaja", ni a alguien cuyas EXCLUSIONES choquen con lo que cuenta el cliente (edad, población).
- DERIVA (accion "derivar") si: ningún terapeuta del roster cubre el caso; el tema es trastorno alimentario, psicosis, trastorno bipolar, o autolesión/ideas suicidas; el mensaje es una historia larga/muy emocional; o no queda claro qué busca. En una derivación pon un motivo corto (ej. "sin_fit", "riesgo", "poco_claro", "trastorno_alimentario").
- No escribes nada al cliente; solo devuelves la decisión. No inventes especialidades: guíate por el MAPA y por las descripciones del roster.`

// ── MAPA DE CASOS — matrix + hard exclusions (reasons 7 & 9) ─────────────────
// The matrix is data (mapaCasos.json). It's rendered into the prompt for ONLY
// the roster therapists, and backed by a deterministic filter that drops anyone
// an exclusion rules out. That filter fires ONLY on signals the lead states
// outright (an explicit age, the word "adicción") — never on an inferred one,
// because silently dropping a good match on a guessed age is worse than letting
// the model weigh it. "mi hijo" with no age is passed to the model as context,
// not treated as proof the patient is a minor.

// One line per therapist: specialties and no-gos. Anything unlisted is "○".
function mapaBlockFor(nombres) {
  const lines = []
  for (const n of nombres) {
    const t = MAPA.terapeutas[n]
    if (!t) continue
    const pick = (obj, mark) => Object.entries(obj)
      .filter(([, v]) => v === mark).map(([k]) => k.replace(/_/g, ' '))
    const esp = [...pick(t.motivos, '★'), ...pick(t.poblaciones, '★'), ...pick(t.diagnosticos, '★')]
    const no = [...pick(t.motivos, '✗'), ...pick(t.poblaciones, '✗'), ...pick(t.diagnosticos, '✗')]
    const row = [`- ${n}:`]
    if (esp.length) row.push(`ESPECIALIDAD: ${esp.join(', ')}.`)
    if (no.length) row.push(`NO trabaja: ${no.join(', ')}.`)
    if (t.exclusiones?.length) row.push(`EXCLUSIONES: ${t.exclusiones.join('; ')}.`)
    if (t.tambien_trabaja?.length) row.push(`También: ${t.tambien_trabaja.join(', ')}.`)
    lines.push(row.join(' '))
  }
  return lines.join('\n')
}

// Signals the lead states outright. Everything here must be explicit in the text.
function readSignals(text) {
  const s = String(text || '').toLowerCase()
  const out = { edad: null, paraHijo: false, adultoMayor: false, hombre: false, adiccion: false }
  // Most explicit first. The lookahead keeps "tengo 2 hijos" / "de 4 sesiones"
  // from being read as an age.
  const AGE_RE = [
    // "8 años" — but not "llevo 8 años de casado" (a duration, not an age).
    /(\d{1,2})\s*a(?:ñ|n)(?:os|itos)\b(?!\s*(?:de\s+)?(?:casad|juntos|junt[oa]s|relaci|matrimoni|novi|trabaj|convivi|separad|divorciad))/,
    /\bmi\s+(?:hij[oa]|ni(?:ñ|n)[oa]|peque(?:ñ|n)[oa])\s+de\s+(\d{1,2})\b/,
    /\b(?:tengo|tiene)\s+(\d{1,2})\b(?!\s*(?:hij|herman|sesion|mes|semana|a(?:ñ|n)os\s+de\s+casad))/,
  ]
  for (const re of AGE_RE) {
    const m = s.match(re)
    if (!m) continue
    const n = parseInt(m[1], 10)
    if (n >= 1 && n <= 99) { out.edad = n; break }
  }
  out.paraHijo = /\bmi\s+(hij[oa]|ni(?:ñ|n)[oa]|peque(?:ñ|n)[oa])\b/.test(s)
  out.adultoMayor = /adult[oa]\s+mayor|tercera\s+edad/.test(s) || (out.edad != null && out.edad >= 65)
  out.hombre = /\bsoy\s+(un\s+)?(hombre|var[oó]n)\b/.test(s)
  out.adiccion = /adicci[oó]n|adict[oa]|alcoh[oó]lic|drogadic/.test(s)
  return out
}

// Why this therapist can't take this case, or null. Explicit signals only.
function excludedByMapa(nombre, sig) {
  const t = MAPA.terapeutas[nombre]
  if (!t?.exclusiones?.length) return null
  const has = (re) => t.exclusiones.some((e) => re.test(e))
  const { edad } = sig
  if (edad != null && edad < 18 && has(/menores de edad/)) return 'menor_de_edad'
  if (edad != null && edad < 12 && has(/menores de 12/)) return 'nino_menor_12'
  if (sig.adultoMayor && has(/adultos mayores/)) return 'adulto_mayor'
  if (sig.hombre && edad != null && edad > 50 && has(/hombres mayores de 50/)) return 'hombre_mayor_50'
  if (sig.adiccion && has(/adicciones/)) return 'adicciones'
  return null
}

// Given the lead's free-text motive + the bookable roster, pick cards or derive.
// roster: [{ nombre, caption }] (recibe_nuevos therapists). mode: 'diagnostico'|'varios'|'motivo'.
// Returns { accion:'cards'|'derivar', nombres:[], motivo, model, latencyMs } or null.
export async function matchTherapistsForText({ roster, text, mode }) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  // Exclusions are applied BEFORE asking (so an excluded therapist is never
  // offered) and again to the answer (so a hallucinated name can't slip past).
  const sig = readSignals(text)
  const allowed = (roster || []).filter((t) => !excludedByMapa(t.nombre, sig))
  if (!allowed.length) return { accion: 'derivar', nombres: [], motivo: 'sin_fit_exclusiones', model: MODEL, latencyMs: 0 }

  const rosterBlock = allowed.map((t) => `- ${t.nombre}: ${oneLine(t.caption)}`).join('\n')
  const mapaBlock = mapaBlockFor(allowed.map((t) => t.nombre))
  const modeLine = mode === 'diagnostico'
    ? 'El cliente eligió "Tengo un diagnóstico" y describe su diagnóstico o sospecha.'
    : mode === 'motivo'
      ? 'Le preguntamos "Qué te trae a terapia?" y el cliente describe su motivo de consulta.'
      : 'El cliente eligió "Varios motivos" y describe varias situaciones a la vez.'
  const hijoLine = sig.paraHijo
    ? '\nOJO: el cliente habla de su hijo/a. Si no dice la edad, considera que podría ser menor de edad y prioriza a quien sí atiende niños y adolescentes.'
    : ''
  const user = `ROSTER (terapeutas disponibles):
${rosterBlock}

MAPA DE CASOS (lo que cada uno respondió que puede atender — manda sobre el roster):
${mapaBlock}

CONTEXTO: ${modeLine}${hijoLine}

MENSAJE DEL CLIENTE:
"${String(text).slice(0, 1000)}"

Decide y llama a la herramienta "recomendar".`

  const out = await callTool({ apiKey, system: MATCH_SYSTEM, user, tool: MATCH_TOOL })
  if (!out || (out.accion !== 'cards' && out.accion !== 'derivar')) return null

  const byName = new Map(allowed.map((t) => [t.nombre.toLowerCase(), t.nombre]))
  const nombres = (Array.isArray(out.nombres) ? out.nombres : [])
    .map((n) => byName.get(String(n).trim().toLowerCase())) // roster-only, canonical spelling
    .filter(Boolean)
    .filter((n) => !excludedByMapa(n, sig))
    .filter((n, i, a) => a.indexOf(n) === i)
    .slice(0, 3)

  // Everything the model picked was ruled out ⇒ a human, not an empty card list.
  if (out.accion === 'cards' && !nombres.length) {
    return { accion: 'derivar', nombres: [], motivo: 'sin_fit_exclusiones', model: MODEL, latencyMs: out.latencyMs }
  }
  return {
    accion: out.accion,
    nombres,
    motivo: (out.motivo || '').toString().slice(0, 60),
    model: MODEL,
    latencyMs: out.latencyMs,
  }
}

// The deterministic half of the match, exported so it can be checked without a
// network call (there's no test runner in this repo — see CLAUDE.md).
export const _mapa = { readSignals, excludedByMapa, mapaBlockFor }

// Shared single-tool Anthropic call. Returns the tool input (+ latencyMs) or null.
async function callTool({ apiKey, system, user, tool }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const t0 = Date.now()
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        temperature: 0, // deterministic classification (verbatim answers are code-sent)
        system,
        messages: [{ role: 'user', content: user }],
        tools: [tool],
        tool_choice: { type: 'tool', name: tool.name },
      }),
    })
    if (!res.ok) {
      console.error('[brain] Anthropic', res.status, (await res.text()).slice(0, 300))
      return null
    }
    const data = await res.json()
    const block = (data?.content || []).find((b) => b.type === 'tool_use')
    if (!block?.input) return null
    return { ...block.input, latencyMs: Date.now() - t0 }
  } catch (e) {
    console.error('[brain] callTool failed:', e.name === 'AbortError' ? 'timeout' : e.message)
    return null
  } finally {
    clearTimeout(timer)
  }
}
