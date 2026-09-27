// netlify/lib/leadBrain.mjs
//
// T2 of the three-tier lead handler (BUILD #24). When a lead sends FREE TEXT
// (not a button tap), this asks Claude (Anthropic Messages API, Sonnet) to
// EITHER answer from a curated fact sheet OR derive the conversation to a human.
//
//   T1 = button taps            → handled entirely in leadBot.mjs, no model.
//   T2 = free text              → this file: Claude decides {responder|derivar}.
//   T3 = derivar                → leadBot.mjs sends the handoff line + pauses.
//
// HARD SAFETY MODEL — the model NEVER free-writes to a lead unchecked:
//   • It answers ONLY from the fact sheet (funnel_knowledge + live therapist
//     captions). Anything the fact sheet doesn't cover → it must DERIVE.
//   • Distress / crisis / self-harm / violence / any clinical question →
//     derive with motivo "urgente"; if there's explicit risk to life the reply
//     includes ECU 911. The webhook pushes URGENTE to Nicolás + pauses the bot.
//   • Complaints, existing-patient admin, long personal stories, anything
//     uncertain → derive.
//   • Style: Spanish, tú, ≤3 short lines, warm but not salesy. leadBot re-attaches
//     the [Elegir terapeuta] [Otra pregunta] buttons — never a bare "¿agendas?".
//
// Raw fetch (not the SDK): matches this repo's uniform external-API convention
// (waSend, calendar, proofOcr) and gives a precise 8s AbortController budget —
// on failure/timeout the caller falls back to the keyword path. Best-effort:
// returns null rather than throwing, so a model hiccup never breaks the webhook.
//
// Env: ANTHROPIC_API_KEY (Sonnet). Absent ⇒ returns null ⇒ keyword fallback.

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6' // spec: Sonnet
const TIMEOUT_MS = 8000

const STEP_ES = {
  msg1: 'acaba de recibir el mensaje de bienvenida',
  categoria: 'está viendo la lista de temas ("¿Qué te gustaría trabajar?")',
  cards: 'está viendo las tarjetas de terapeutas recomendados',
  slots: 'está viendo los horarios disponibles para su llamada',
  faq: 'está viendo la lista de preguntas frecuentes',
  answered: 'acaba de recibir una respuesta a una pregunta',
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

const SYSTEM_RULES = `Eres el asistente de WhatsApp de Efimeramente, un consultorio de psicología en Cumbayá (Ecuador). Escribes a un posible paciente que llegó por un anuncio. Tu trabajo es responder mensajes de TEXTO LIBRE de dos maneras: "responder" (contestar con datos de la HOJA DE DATOS) o "derivar" (pasar la conversación a una persona del equipo).

REGLAS ESTRICTAS (obligatorias):
1. Solo puedes afirmar hechos que estén EN LA HOJA DE DATOS de abajo. Si el mensaje pide algo que la hoja no cubre, DERIVA. Nunca inventes precios, coberturas de seguros, horarios ni disponibilidad.
2. Cualquier señal de crisis, malestar emocional fuerte, ideas de autolesión o suicidio, violencia, o una pregunta clínica ("¿qué hago con mi ansiedad?", diagnósticos, tratamientos) → DERIVA con motivo "urgente". Si hay riesgo de vida explícito, incluye en "texto" una línea cálida de contención y el número de emergencias del Ecuador: "Si estás en peligro inmediato, llama al 911 (ECU 911)." No des consejo clínico.
3. Quejas, reclamos, temas de pacientes que ya se atienden (reagendar, facturas, cambios), historias personales largas, o cualquier cosa de la que no estés seguro → DERIVA.
4. Saludos y agradecimientos NUNCA se derivan; contéstalos con una línea breve y cálida (acción "responder").
5. NO ofreces visitas a domicilio (no está en la hoja). Si lo piden, DERIVA.

ESTILO (cuando la acción es "responder"):
- Español, tú, cálido pero nada vendedor.
- Máximo 3 líneas cortas. Nada de párrafos largos.
- Responde SOLO lo que preguntaron; no agregues un cierre tipo "¿quieres agendar?" ni "¿te ayudo a agendar?". El sistema añadirá los botones automáticamente.
- Si mencionan disponibilidad y hay horarios en el contexto, puedes decir que hay horarios libres y que toque "Elegir terapeuta", sin inventar horas exactas que no estén listadas.

FORMATO DE SALIDA: llama a la herramienta "responder" con:
- accion: "responder" o "derivar".
- texto: cuando accion="responder", el mensaje para el cliente. Cuando accion="derivar" con motivo "urgente", el mensaje cálido de contención (con 911 si hay riesgo de vida). En otras derivaciones, deja "texto" vacío (el sistema envía el mensaje de traspaso estándar).
- motivo: una razón corta ("saludo", "precio", "seguros", "ubicacion", "urgente", "fuera_de_alcance", "queja", "paciente_existente", "domicilio", etc.).`

const TOOL = {
  name: 'responder',
  description: 'Decide cómo responder al mensaje del posible paciente.',
  input_schema: {
    type: 'object',
    properties: {
      accion: { type: 'string', enum: ['responder', 'derivar'] },
      texto: { type: 'string' },
      motivo: { type: 'string' },
    },
    required: ['accion', 'texto', 'motivo'],
  },
}

// Ask Claude to classify+answer one free-text message. Returns
// { accion, texto, motivo, model, latencyMs } or null (API missing/error/timeout
// → caller uses the keyword fallback). `history` = recent inbound lines (oldest
// first); `slots` = the chosen therapist's next free slots (human strings).
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
        system: `${SYSTEM_RULES}`,
        messages: [{ role: 'user', content: user }],
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'responder' },
      }),
    })
    if (!res.ok) {
      console.error('[brain] Anthropic', res.status, (await res.text()).slice(0, 300))
      return null
    }
    const data = await res.json()
    const block = (data?.content || []).find((b) => b.type === 'tool_use')
    const out = block?.input
    if (!out || (out.accion !== 'responder' && out.accion !== 'derivar')) return null
    return {
      accion: out.accion,
      texto: typeof out.texto === 'string' ? out.texto.trim() : '',
      motivo: (out.motivo || '').toString().slice(0, 60),
      model: MODEL,
      latencyMs: Date.now() - t0,
    }
  } catch (e) {
    console.error('[brain] decideFreeText failed:', e.name === 'AbortError' ? 'timeout' : e.message)
    return null
  } finally {
    clearTimeout(timer)
  }
}
