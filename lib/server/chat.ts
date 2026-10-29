import { createBooking, freeSlots, getService, listServices, type Service } from "./agenda"
import { createDepositCheckout, mercadoPagoEnabled } from "./mercadopago"
import { mapsDirectionsUrl, mapsEmbedUrl, whatsappUrl, type Settings } from "./settings"
import type { ChatCard, ChatOutput } from "../chat-types"
import { addDays, DAY_RE, formatARS, formatSlot, TIME_ZONE, todayAR } from "../time"

const TOOLS = [
  {
    type: "function",
    name: "mostrar_servicios",
    description: "Muestra en pantalla la lista de servicios con duración, precio y seña. Usala cuando pregunten qué servicios hay o cuánto cuestan.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "buscar_horarios",
    description: "Busca turnos libres reales para un servicio. Nunca inventes horarios: pedilos siempre con esta herramienta. Los turnos se muestran en pantalla para que la persona elija.",
    parameters: {
      type: "object",
      properties: {
        servicio_id: { type: "integer", description: "id del servicio" },
        desde: { type: "string", description: "Primer día a buscar, AAAA-MM-DD. Si la persona no dijo un día, usá hoy." },
        hasta: { type: "string", description: "Último día a buscar, AAAA-MM-DD. Para un día puntual, el mismo que desde. Si no hay preferencia, desde + 14 días." },
      },
      required: ["servicio_id", "desde", "hasta"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "reservar_turno",
    description: "Reserva un turno elegido. SOLO después de que la persona eligió un horario devuelto por buscar_horarios, confirmó explícitamente el resumen y diste su nombre y teléfono. Si el servicio tiene seña, muestra el botón de pago de Mercado Pago.",
    parameters: {
      type: "object",
      properties: {
        servicio_id: { type: "integer" },
        inicio: { type: "string", description: "El valor 'inicio' exacto que devolvió buscar_horarios" },
        nombre: { type: "string", description: "Nombre y apellido" },
        telefono: { type: "string", description: "Teléfono o WhatsApp" },
        email: { type: "string", description: "Email, o cadena vacía si no lo dio" },
      },
      required: ["servicio_id", "inicio", "nombre", "telefono", "email"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "mostrar_ubicacion",
    description: "Muestra el mapa con la dirección y el botón para llegar. Usala cuando pregunten dónde queda, la dirección o cómo llegar.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    type: "function",
    name: "derivar_whatsapp",
    description: "Ofrece hablar con una persona del equipo por WhatsApp: reclamos, cambios o cancelaciones de turnos, consultas médicas puntuales, problemas con un pago, o cuando no puedas resolver algo.",
    parameters: {
      type: "object",
      properties: { motivo: { type: "string", description: "Motivo breve, se usa como mensaje inicial" } },
      required: ["motivo"],
      additionalProperties: false,
    },
  },
]

function nowLabel(): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date())
}

function serviceLine(s: Service): string {
  const price = s.price > 0 ? formatARS(s.price) : "precio a confirmar en la evaluación"
  const deposit = s.deposit > 0 ? `seña ${formatARS(s.deposit)} por Mercado Pago` : "sin seña"
  return `- id ${s.id} · ${s.name} · ${s.duration_min} min · ${price} · ${deposit}. ${s.description}`
}

function instructions(settings: Settings, services: Service[]): string {
  const b = settings.business
  return `Sos la asistente virtual de ${b.name}, atendiendo por chat en la web a personas que quieren conocer los servicios o reservar un turno. Español rioplatense con voseo, tono cálido, profesional y claro. Respuestas breves: una a tres frases. Sin emojis.

Ahora es ${nowLabel()} (hora de Argentina). Hoy es ${todayAR()}.

Datos del centro:
- Dirección: ${b.address}
- Horario de atención: ${b.hours}
- WhatsApp: +${b.whatsapp}

Servicios que se pueden reservar online:
${services.map(serviceLine).join("\n") || "- (no hay servicios cargados: derivá a WhatsApp)"}

Cómo reservar:
- Necesitás el servicio y el día o rango de días que prefiere. Pedí solo lo que falte, de a una cosa por vez.
- Buscá turnos con buscar_horarios y no los enumeres en el texto: ya aparecen en pantalla. Decí solo una frase para que elija.
- Cuando elija uno, pedí nombre y teléfono si faltan (el email es opcional), repetí el resumen (servicio, día y hora, precio y seña) y pedí confirmación explícita antes de llamar a reservar_turno.
- Si el servicio tiene seña, después de reservar contá que el turno queda guardado ${settings.booking.holdMinutes} minutos hasta que pague la seña con el botón de Mercado Pago. Nunca digas que algo está pagado: lo confirma el sistema.
- Si una herramienta devuelve error, no inventes la causa; ofrecé buscar otro horario o derivar a WhatsApp.
- Cambios, cancelaciones y reclamos se resuelven por WhatsApp con derivar_whatsapp.

Reglas:
- Los horarios, precios y la disponibilidad salen SIEMPRE de este mensaje o de las herramientas; nunca los inventes.
- No des diagnósticos ni indicaciones médicas personales, ni prometas resultados. Si hay una condición de salud, embarazo, medicación o dudas sobre si un tratamiento es adecuado, explicá que se define en la evaluación con el profesional y ofrecé reservar la consulta o derivar a WhatsApp.
- Si preguntan la dirección o cómo llegar, usá mostrar_ubicacion.
- Hablá solo de ${b.name} y sus servicios; si preguntan otra cosa, volvé con amabilidad al tema.

Conocimiento sobre el centro y los procedimientos (fuente principal para responder consultas):
${settings.ai.knowledge}`
}

type ToolResult = { output: unknown; card?: ChatCard }

async function runTool(name: string, rawArgs: string, settings: Settings, baseUrl: string): Promise<ToolResult> {
  let args: Record<string, unknown> = {}
  try {
    args = JSON.parse(rawArgs || "{}")
  } catch {
    return { output: { error: "argumentos_invalidos" } }
  }
  const b = settings.business

  if (name === "mostrar_servicios") {
    const services = await listServices()
    return {
      output: { mostrado: true, servicios: services.map((s) => ({ id: s.id, nombre: s.name, minutos: s.duration_min, precio: s.price, sena: s.deposit })) },
      card: {
        type: "services",
        items: services.map((s) => ({ id: s.id, name: s.name, description: s.description, duration: s.duration_min, price: s.price, deposit: s.deposit })),
      },
    }
  }

  if (name === "buscar_horarios") {
    const service = await getService(Number(args.servicio_id))
    if (!service || !service.active) return { output: { error: "servicio_inexistente" } }
    const today = todayAR()
    let from = typeof args.desde === "string" && DAY_RE.test(args.desde) ? args.desde : today
    if (from < today) from = today
    let to = typeof args.hasta === "string" && DAY_RE.test(args.hasta) ? args.hasta : addDays(from, 14)
    if (to < from) to = from
    if (to > addDays(from, 60)) to = addDays(from, 60)
    const all = await freeSlots(service, from, to, settings.booking, { limit: 200 })
    // spread the options: at most 3 per day, 9 in total
    const perDay = new Map<string, number>()
    const picked = all.filter((s) => {
      const d = todayAR(s.start)
      const n = perDay.get(d) ?? 0
      if (n >= 3) return false
      perDay.set(d, n + 1)
      return true
    }).slice(0, 9)
    if (!picked.length) {
      const next = await freeSlots(service, addDays(to, 1), addDays(to, 60), settings.booking, { limit: 1 })
      return { output: { turnos: [], proximo_disponible: next[0] ? formatSlot(next[0].start) : null } }
    }
    return {
      output: { servicio: service.name, mostrados_en_pantalla: picked.map((s) => ({ inicio: s.start.toISOString(), etiqueta: formatSlot(s.start) })) },
      card: { type: "slots", service: service.name, items: picked.map((s) => ({ start: s.start.toISOString(), label: formatSlot(s.start) })) },
    }
  }

  if (name === "reservar_turno") {
    const service = await getService(Number(args.servicio_id))
    const start = typeof args.inicio === "string" ? new Date(args.inicio) : new Date(NaN)
    const nombre = typeof args.nombre === "string" ? args.nombre.trim().slice(0, 120) : ""
    const telefono = typeof args.telefono === "string" ? args.telefono.trim().slice(0, 40) : ""
    const emailRaw = typeof args.email === "string" ? args.email.trim().slice(0, 160) : ""
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : ""
    if (!service || !service.active) return { output: { error: "servicio_inexistente" } }
    if (Number.isNaN(start.getTime())) return { output: { error: "horario_invalido" } }
    if (nombre.length < 2) return { output: { error: "falta_nombre" } }
    if (telefono.replace(/\D/g, "").length < 6) return { output: { error: "falta_telefono" } }
    const r = await createBooking({ service, start, name: nombre, phone: telefono, email }, settings.booking)
    if (!r.ok) return { output: { error: "horario_no_disponible", detalle: "Ese horario ya no está libre. Ofrecé buscar otro." } }
    const bk = r.booking
    const rows: Array<[string, string]> = [
      ["Servicio", bk.service_name],
      ["Día y hora", formatSlot(bk.starts_at)],
      ["A nombre de", bk.name],
      ...(bk.price > 0 ? ([["Precio", formatARS(bk.price)]] as Array<[string, string]>) : []),
    ]
    if (bk.status === "confirmed") {
      return { output: { reservado: true, estado: "confirmado", sin_sena: true }, card: { type: "confirmed", bookingId: bk.id, rows } }
    }
    let checkoutUrl: string | null = null
    if (mercadoPagoEnabled()) {
      try {
        checkoutUrl = await createDepositCheckout(bk, baseUrl)
      } catch (e) {
        console.error("chat: no se pudo crear el pago", e instanceof Error ? e.message : e)
      }
    }
    const wa = whatsappUrl(b.whatsapp, `Hola! Reservé ${bk.service_name} para el ${formatSlot(bk.starts_at)} a nombre de ${bk.name} y quiero coordinar la seña.`)
    return {
      output: {
        reservado: true,
        estado: "pendiente_de_pago",
        sena: bk.deposit,
        reservado_por_minutos: settings.booking.holdMinutes,
        pago_online: !!checkoutUrl,
        ...(checkoutUrl ? {} : { nota: "El pago online no está disponible ahora: pedile que coordine la seña por WhatsApp con el botón." }),
      },
      card: { type: "payment", bookingId: bk.id, rows: [...rows, ["Seña", formatARS(bk.deposit)]], amount: bk.deposit, checkoutUrl, whatsappUrl: wa },
    }
  }

  if (name === "mostrar_ubicacion") {
    return {
      output: { mostrado: true, direccion: b.address },
      card: { type: "map", address: b.address, embedUrl: mapsEmbedUrl(b.address), directionsUrl: mapsDirectionsUrl(b.address) },
    }
  }

  if (name === "derivar_whatsapp") {
    const reason = typeof args.motivo === "string" ? args.motivo.trim().slice(0, 300) : ""
    return {
      output: { mostrado: true },
      card: { type: "whatsapp", reason, url: whatsappUrl(b.whatsapp, `Hola! Te escribo desde la web de ${b.name}. ${reason}`.trim()) },
    }
  }

  return { output: { error: "herramienta_desconocida" } }
}

type InputItem = { role: "user"; content: string } | { type: "function_call_output"; call_id: string; output: string }
type OutputItem = { type: string; call_id?: string; name?: string; arguments?: string; content?: Array<{ type: string; text?: string }> }

export class ChatError extends Error {
  constructor(readonly code: "sin_modelo" | "modelo_no_disponible" | "sin_respuesta") {
    super(code)
  }
}

export async function runChat(message: string, previousId: string | undefined, settings: Settings, baseUrl: string): Promise<{ responseId: string; outputs: ChatOutput[] }> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new ChatError("sin_modelo")
  const services = await listServices()
  const system = instructions(settings, services)
  const outputs: ChatOutput[] = []
  let input: InputItem[] = [{ role: "user", content: message }]
  let prev = previousId
  const MAX_ROUNDS = 6

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let res: Response
    try {
      res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(90_000),
        body: JSON.stringify({
          model: settings.ai.model,
          instructions: system,
          input,
          tools: TOOLS,
          // last round: no more tools, so every call made so far gets its output and the thread stays resumable
          ...(round === MAX_ROUNDS - 1 ? { tool_choice: "none" } : {}),
          ...(settings.ai.reasoning !== "none" ? { reasoning: { effort: settings.ai.reasoning } } : {}),
          previous_response_id: prev,
          store: true,
        }),
      })
    } catch (e) {
      console.error("chat: OpenAI sin respuesta", e instanceof Error ? e.message : e)
      throw new ChatError("sin_respuesta")
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string; output?: OutputItem[]; error?: { message?: string } }
    if (!res.ok || !data.id) {
      console.error("chat: OpenAI", res.status, data.error?.message)
      throw new ChatError("modelo_no_disponible")
    }
    prev = data.id
    const items = data.output ?? []
    const text = items
      .filter((o) => o.type === "message")
      .flatMap((o) => o.content ?? [])
      .filter((c) => c.type === "output_text")
      .map((c) => c.text ?? "")
      .join("\n")
      .trim()
    if (text) outputs.push({ text })
    const calls = items.filter((o) => o.type === "function_call")
    if (!calls.length) break
    input = []
    for (const call of calls) {
      let result: ToolResult
      try {
        result = await runTool(call.name ?? "", call.arguments ?? "{}", settings, baseUrl)
      } catch (e) {
        console.error(`chat: herramienta ${call.name}`, e instanceof Error ? e.message : e)
        result = { output: { error: "error_interno" } }
      }
      if (result.card) outputs.push({ card: result.card })
      input.push({ type: "function_call_output", call_id: String(call.call_id), output: JSON.stringify(result.output) })
    }
  }
  return { responseId: prev!, outputs }
}
