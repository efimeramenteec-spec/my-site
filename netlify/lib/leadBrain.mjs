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
//   • Style (v2): Spanish, tú, short like a person on WhatsApp. NO opening ¿ or ¡.
//     Emojis ONLY as data markers (💳 🧾 📍 💻), never decorative. Answer ONLY what
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

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6' // spec: Sonnet
const TIMEOUT_MS = 8000

// The reason claves the model may attach to an answer (must mirror funnel_categorias).
const CATEGORIA_CLAVES = [
  'hijo', 'ruptura', 'problemas_pareja', 'depresion_ansiedad', 'consumo',
  'terapia_pareja', 'diagnostico', 'trauma', 'varios', 'otro', '',
]

const STEP_ES = {
  reasons: 'está viendo la lista de motivos de consulta',
  cards: 'está viendo las tarjetas de terapeutas recomendados',
  explicacion: 'acaba de elegir un terapeuta y vio la explicación de la llamada',
  slots: 'está viendo los horarios disponibles para su llamada',
  answered: 'acaba de recibir una respuesta a una pregunta',
  pregunta_abierta: 'pidió hacer otra pregunta',
  agendado: 'ya agendó su llamada gratuita',
}

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
    .map((t) => `- ${t.nombre} ${t.apellido}: ${t.funnel_caption}`)
  const team = teamRows.length ? `\n\nTerapeutas disponibles (para elegir en el chat):\n${teamRows.join('\n')}` : ''
  return `${facts}${team}`
}

// The known intents whose answer is FIXED, verbatim copy sent by the code
// (leadBot CANNED). For these the model only CLASSIFIES — it must NOT write the
// answer. "libre" = a legit question covered by the fact sheet but not one of the
// fixed cases (the model writes the answer). Keep in sync with leadBot's CANNED.
const INTENTS = [
  'precio', 'ubicacion', 'saludsa', 'seguros', 'adolescentes', 'duracion',
  'horarios', 'psiquiatra', 'pareja', 'pago', 'objecion_precio', 'saludo', 'libre',
]

const SYSTEM_RULES = `Eres el asistente de WhatsApp de Efimeramente, un consultorio de psicología en Cumbayá (Ecuador). Escribes a un posible paciente que llegó por un anuncio. Con cada mensaje de TEXTO LIBRE tu trabajo es CLASIFICARLO en un "intent" y decidir si el sistema debe "responder" o "derivar" (pasar a una persona del equipo).

IMPORTANTE: para los intents con respuesta fija (precio, ubicacion, saludsa, seguros, adolescentes, duracion, horarios, psiquiatra, pareja, pago, objecion_precio, saludo) el SISTEMA envía un texto ya redactado — NO escribas tú la respuesta, solo pon el intent correcto y deja "texto" vacío. SOLO cuando el intent sea "libre" escribe la respuesta en "texto", usando ÚNICAMENTE la HOJA DE DATOS.

INTENTS:
- precio: costo / valor / cuánto cuesta la sesión.
- ubicacion: dónde están / dirección / si es presencial u online.
- saludsa: pregunta específicamente si Saludsa (o Ecuasanitas) cubre o reembolsa.
- seguros: pregunta general por seguros/reembolso (otra aseguradora, o "aceptan seguros?").
- adolescentes: si atienden adolescentes o jóvenes.
- duracion: cuánto dura la sesión o cada cuánto es la frecuencia.
- horarios: qué días u horas atienden.
- psiquiatra: si tienen psiquiatra o dan medicación.
- pareja: terapia o sesiones de pareja.
- pago: cómo o cuándo se paga / formas de pago.
- objecion_precio: dice que es caro, que no le alcanza, que tiene poco presupuesto.
- saludo: saludo o texto del anuncio sin una pregunta concreta.
- libre: pregunta legítima que SÍ está en la hoja de datos pero no encaja arriba (escribe la respuesta en "texto").

REGLAS DE DERIVACIÓN (accion "derivar"):
1. Si piden algo que la HOJA DE DATOS no cubre (incluye visitas a domicilio) → deriva, motivo "domicilio" o "fuera_de_alcance". Nunca inventes datos.
2. SOLO crisis real → motivo "urgente": ideas, intención o plan de autolesión o suicidio; violencia ocurriendo; o una pregunta clínica directa (diagnóstico, si necesita medicación, qué tratamiento). En "texto" una línea cálida breve de contención, y SOLO si hay riesgo de vida explícito añade: "Si estás en peligro inmediato, llama al 911 (ECU 911)." El malestar común NO es urgente.
3. Historias personales o emocionales (tristeza, soledad, duelo, una ruptura contada con sentimiento), busca contención o conexión, quejas, temas de pacientes actuales, "¿cuál me recomiendas?", o si preguntan si hablan con un bot o una persona → deriva, "texto" vacío, motivo "emocional"/"queja"/"recomendacion"/"paciente_existente"/"bot". No es urgente, no mandes 911.

ESTILO (aplica SOLO al texto del intent "libre"; los intents fijos ya vienen redactados):
- Español, tú, corto, como una persona en WhatsApp. NUNCA abras con "¿" ni "¡".
- Emojis SOLO como marcadores de dato (💳 🧾 📍 💻), nunca decorativos.
- Responde SOLO lo que preguntaron (no menciones parqueadero si no lo preguntaron). Nunca cierres con "¿quieres agendar?": el sistema añade la invitación.
- Máximo 4 líneas.

CATEGORIA: si del mensaje se entiende el motivo de consulta, ponla (hijo, ruptura, problemas_pareja, depresion_ansiedad, consumo, terapia_pareja, diagnostico, trauma, varios, otro); si no, "".

EJEMPLOS (así responde el sistema — TEXTO LITERAL; una barra "/" separa mensajes de WhatsApp distintos):
- "cuánto cuesta" → intent precio → "Hola! La sesión cuesta $39, también tenemos paquetes de 4 sesiones por $35 c/u" / "💳 Aceptamos tarjeta" / "🧾 Muchos seguros privados reembolsan la terapia — Nosotros te ayudamos con el trámite" / "*Te gustaría ver a nuestros terapeutas disponibles?*"
- "dónde están" → intent ubicacion → https://maps.app.goo.gl/GZAFUpC1SAyW8GBT8 / "📍 Estamos en Cumbayá, a 3 minutos del Scala" / "💻 También atendemos online."
- "me cubre saludsa" → intent saludsa → "Sí, Saludsa te cubre por reembolso. Avísanos cuando hayas terminado tu primera sesión y te ayudamos con el trámite"
- "atienden adolescentes?" → intent adolescentes, categoria hijo → "Sí, tenemos varios psicólogos expertos en terapia juvenil. Deseas ver sus perfiles?"
- "cuánto dura, cada cuánto es" → intent duracion → "Las sesiones individuales duran una hora. La frecuencia puede ser cada 7 o cada 15 días, según tu preferencia y la recomendación del psicólogo después de tu primera sesión"
- "qué horarios tienen" → intent horarios → "Sí, trabajamos de Lunes a Sábado, de 8am a 8pm. Siempre en coordinación con tu terapeuta y con previa cita."
- "tienen psiquiatra?" → intent psiquiatra → "No tenemos un psiquiatra propio del centro, pero trabajamos en conjunto con el Dr. Camino cuando el caso lo requiere. Se hace una valoración psicológica primero, y luego derivamos al Dr. Camino, si se recomienda medicación."
- "terapia de pareja" → intent pareja, categoria terapia_pareja → "Sí, tenemos una psicóloga especialista, Carolina Almeida. Las sesiones de pareja duran una hora y media, y tienen un valor de $50. También puedes acceder a un paquete de 4 sesiones por $42 cada una" (+ tarjeta de Carolina)
- "cómo se paga" → intent pago → "Recibirás un recordatorio de pago 2 días *después de la sesión*, con los datos de pago. Aceptamos transferencias y pagos con tarjeta."
- "me parece caro" → intent objecion_precio → "Te entiendo totalmente. Me podrías decir qué presupuesto tenías en mente?"
- "es para mi hijo de 15" → intent adolescentes (o saludo si no hay pregunta), categoria hijo.
- "mi hija necesita medicación?" → derivar, motivo "urgente".

FORMATO DE SALIDA: llama a la herramienta "responder" con accion, intent, texto (vacío salvo intent "libre" o derivación "urgente"), motivo y categoria.`

const TOOL = {
  name: 'responder',
  description: 'Clasifica el mensaje del posible paciente y decide cómo responder.',
  input_schema: {
    type: 'object',
    properties: {
      accion: { type: 'string', enum: ['responder', 'derivar'] },
      intent: { type: 'string', enum: INTENTS },
      texto: { type: 'string' },
      motivo: { type: 'string' },
      categoria: { type: 'string', enum: CATEGORIA_CLAVES },
    },
    required: ['accion', 'intent', 'texto', 'motivo'],
  },
}

// Ask Claude to classify+answer one free-text message. Returns
// { accion, texto, motivo, categoria, model, latencyMs } or null (API missing/
// error/timeout → caller uses the keyword fallback). `history` = recent inbound
// lines (oldest first); `slots` = the chosen therapist's next free slots.
export async function decideFreeText({ factSheet, history, step, slots, text }) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const stepLine = STEP_ES[step] || 'está conversando con el bot'
  const histBlock = (history && history.length)
    ? `\n\nMensajes recientes del cliente (más antiguo primero):\n${history.map((h) => `- "${h}"`).join('\n')}`
    : ''
  const slotBlock = (slots && slots.length)
    ? `\n\nHorarios libres del terapeuta elegido (reales): ${slots.join(' · ')}`
    : ''
  const user = `HOJA DE DATOS (única fuente de hechos permitida):
${factSheet}

CONTEXTO: el cliente ${stepLine}.${histBlock}${slotBlock}

MENSAJE ACTUAL DEL CLIENTE:
"${String(text).slice(0, 1000)}"

Decide y llama a la herramienta "responder".`

  const out = await callTool({ apiKey, system: SYSTEM_RULES, user, tool: TOOL })
  if (!out || (out.accion !== 'responder' && out.accion !== 'derivar')) return null
  return {
    accion: out.accion,
    intent: INTENTS.includes(out.intent) ? out.intent : 'libre',
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
- DERIVA (accion "derivar") si: ningún terapeuta del roster cubre el caso; el tema es trastorno alimentario, psicosis, trastorno bipolar, o autolesión/ideas suicidas; el mensaje es una historia larga/muy emocional; o no queda claro qué busca. En una derivación pon un motivo corto (ej. "sin_fit", "riesgo", "poco_claro", "trastorno_alimentario").
- No escribes nada al cliente; solo devuelves la decisión. No inventes especialidades: guíate por las descripciones del roster.`

// Given the lead's free-text motive + the bookable roster, pick cards or derive.
// roster: [{ nombre, caption }] (recibe_nuevos therapists). mode: 'diagnostico'|'varios'.
// Returns { accion:'cards'|'derivar', nombres:[], motivo, model, latencyMs } or null.
export async function matchTherapistsForText({ roster, text, mode }) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  const rosterBlock = (roster || []).map((t) => `- ${t.nombre}: ${t.caption || ''}`).join('\n')
  const modeLine = mode === 'diagnostico'
    ? 'El cliente eligió "Tengo un diagnóstico" y describe su diagnóstico o sospecha.'
    : 'El cliente eligió "Varios motivos" y describe varias situaciones a la vez.'
  const user = `ROSTER (terapeutas disponibles):
${rosterBlock}

CONTEXTO: ${modeLine}

MENSAJE DEL CLIENTE:
"${String(text).slice(0, 1000)}"

Decide y llama a la herramienta "recomendar".`

  const out = await callTool({ apiKey, system: MATCH_SYSTEM, user, tool: MATCH_TOOL })
  if (!out || (out.accion !== 'cards' && out.accion !== 'derivar')) return null
  return {
    accion: out.accion,
    nombres: Array.isArray(out.nombres) ? out.nombres.map((n) => String(n).trim()).filter(Boolean).slice(0, 3) : [],
    motivo: (out.motivo || '').toString().slice(0, 60),
    model: MODEL,
    latencyMs: out.latencyMs,
  }
}

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
