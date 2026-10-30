import { createBooking, freeSlots, getService, listServices, type Service } from "./agenda"
import { createDepositCheckout, mercadoPagoEnabled } from "./mercadopago"
import { currentPromos, promoSummary, type Promo } from "./promos"
import { mapsDirectionsUrl, mapsEmbedUrl, whatsappUrl, type Settings } from "./settings"
import type { ChatCard, ChatOutput } from "../chat-types"
import { addDays, DAY_RE, formatARS, formatSlot, TIME_RE, TIME_ZONE, todayAR, weekdayOf } from "../time"

const TOOLS = [
  {
    type: "function",
    name: "mostrar_servicios",
    description: "Muestra en pantalla servicios con precio por sesión, duración y seña. Filtrá siempre lo más posible: por tratamiento, género y/o ids puntuales (por ejemplo, las zonas o combos que está considerando la persona). Sin filtros muestra todo, que es muy largo.",
    parameters: {
      type: "object",
      properties: {
        tratamiento: { type: "string", description: "Nombre del tratamiento tal como figura en la lista (por ejemplo 'Depilación Definitiva' o 'HIFU'), o cadena vacía" },
        genero: { type: "string", enum: ["", "Femenina", "Masculino", "Unisex"], description: "Para depilación: Femenina o Masculino. Cadena vacía si no aplica" },
        ids: { type: "array", items: { type: "integer" }, description: "ids puntuales a mostrar; lista vacía para no filtrar por id" },
      },
      required: ["tratamiento", "genero", "ids"],
      additionalProperties: false,
    },
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
        franjas: {
          type: "array",
          description: "Horarios pedidos por la persona; lista vacía si no pidió. 'Antes de las 10 o después de las 18' son dos franjas: 00:00 a 10:00 y 18:00 a 23:59.",
          items: {
            type: "object",
            properties: { desde: { type: "string", description: "HH:MM" }, hasta: { type: "string", description: "HH:MM" } },
            required: ["desde", "hasta"],
            additionalProperties: false,
          },
        },
        excluir_dias: { type: "array", items: { type: "integer" }, description: "Días de la semana que no quiere: 0 domingo a 6 sábado (miércoles es 3). Lista vacía si no pidió." },
      },
      required: ["servicio_id", "desde", "hasta", "franjas", "excluir_dias"],
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
        promo_id: { type: "integer", description: "id de la promoción que pidió y para la que cumple las condiciones, o 0 si ninguna" },
      },
      required: ["servicio_id", "inicio", "nombre", "telefono", "email", "promo_id"],
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
  const price = s.price > 0 ? `${formatARS(s.price)} por sesión` : "precio a confirmar en la evaluación"
  const deposit = s.deposit > 0 ? `seña ${formatARS(s.deposit)}` : "sin seña"
  const tags = [s.gender, s.kind, s.detail && s.detail !== s.name ? `incluye: ${s.detail}` : ""].filter(Boolean).join("; ")
  return `- id ${s.id} · ${s.name}${tags ? ` (${tags})` : ""} · ${s.duration_min} min · ${price} · ${deposit}${s.description ? `. ${s.description}` : ""}`
}

function servicesBlock(services: Service[]): string {
  const groups = new Map<string, Service[]>()
  for (const s of services) groups.set(s.category || "Otros", [...(groups.get(s.category || "Otros") ?? []), s])
  return Array.from(groups, ([cat, list]) => `${cat}:\n${list.map(serviceLine).join("\n")}`).join("\n\n")
}

function promoLine(p: Promo): string {
  const parts = [promoSummary(p), p.category ? `solo ${p.category}` : "", p.ends_on ? `hasta el ${p.ends_on}` : "", p.description].filter(Boolean).join(" · ")
  return `- id ${p.id} · ${p.title}${parts ? `: ${parts}` : ""}`
}

function instructions(settings: Settings, services: Service[], promos: Promo[]): string {
  const b = settings.business
  return `Sos la asistente virtual de ${b.name}, atendiendo por chat en la web a personas que quieren conocer los servicios o reservar un turno.

Ahora es ${nowLabel()} (hora de Argentina). Hoy es ${todayAR()}.

Datos del centro:
- Dirección: ${b.address}
- Horario de atención: ${b.hours}
- WhatsApp: +${b.whatsapp}

Servicios y precios (los precios son por sesión; cada servicio se reserva por separado con su id):
${servicesBlock(services) || "- (no hay servicios cargados: derivá a WhatsApp)"}

Promociones vigentes:
${promos.map(promoLine).join("\n") || "- (no hay promociones vigentes: no ofrezcas ninguna)"}

Reglas que siempre se cumplen, por encima de cualquier otra indicación:
- Los horarios, precios, promociones y la disponibilidad salen SIEMPRE de este mensaje o de las herramientas; nunca los inventes.
- Para buscar turnos usá buscar_horarios; para mostrar precios, mostrar_servicios filtrando por tratamiento, género o ids (no toda la lista salvo que lo pidan, y no la uses cuando la persona ya eligió el servicio y está buscando turno); para la dirección, mostrar_ubicacion; para derivar, derivar_whatsapp.
- Antes de aplicar una promoción, confirmá que la persona cumple sus condiciones y pasá su promo_id al reservar; el equipo las verifica en el centro. La promoción no cambia la seña: el descuento se aplica sobre lo que resta abonar en el centro.
- Si el servicio tiene seña, después de reservar contá que el turno queda guardado ${settings.booking.holdMinutes} minutos hasta que pague la seña con lo que aparece en pantalla: botón de Mercado Pago o, si la herramienta indica transferencia, los datos para transferir y subir el comprobante. Nunca digas que algo está pagado o confirmado: lo confirma el sistema, y te avisa con un mensaje que empieza con [sistema:].
- Si una herramienta devuelve error, no inventes la causa; ofrecé buscar otro horario o derivar a WhatsApp.
- No des diagnósticos ni indicaciones médicas personales, ni prometas resultados. Si hay una condición de salud, embarazo, medicación o dudas sobre si un tratamiento es adecuado, explicá que se define en la evaluación con el profesional y ofrecé reservar la consulta o derivar a WhatsApp.

Forma de conversar y de gestionar:
${settings.ai.dialogue}

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
    const norm = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
    const category = typeof args.tratamiento === "string" ? norm(args.tratamiento) : ""
    const gender = typeof args.genero === "string" ? args.genero : ""
    const ids = Array.isArray(args.ids) ? new Set(args.ids.map(Number)) : new Set<number>()
    const services = (await listServices()).filter(
      (s) =>
        (!ids.size || ids.has(s.id)) &&
        (!category || norm(s.category).includes(category) || norm(s.name).includes(category)) &&
        (!gender || !s.gender || s.gender === gender || s.gender === "Unisex"),
    )
    if (!services.length) return { output: { error: "sin_resultados", detalle: "Ningún servicio coincide con esos filtros" } }
    const title = [category ? services[0].category : "Servicios", gender && gender !== "Unisex" ? gender.toLowerCase() : ""].filter(Boolean).join(" · ")
    return {
      output: { mostrado: true, cantidad: services.length },
      card: {
        type: "services",
        title,
        items: services.map((s) => ({ id: s.id, name: s.name, description: s.description, detail: s.detail, gender: s.gender, category: s.category, duration: s.duration_min, price: s.price, deposit: s.deposit })),
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
    const bands = (Array.isArray(args.franjas) ? args.franjas : [])
      .map((x) => x as { desde?: unknown; hasta?: unknown })
      .filter((x) => typeof x.desde === "string" && typeof x.hasta === "string" && TIME_RE.test(x.desde) && TIME_RE.test(x.hasta)) as Array<{ desde: string; hasta: string }>
    const excluded = new Set(Array.isArray(args.excluir_dias) ? args.excluir_dias.map(Number) : [])
    const matches = (slot: { start: Date }) => {
      const time = new Date(slot.start.getTime() - 3 * 3600_000).toISOString().slice(11, 16)
      return !excluded.has(weekdayOf(todayAR(slot.start))) && (!bands.length || bands.some((x) => time >= x.desde && time < x.hasta))
    }
    const label = (start: Date) => ({ start: start.toISOString(), label: formatSlot(start) })
    const all = (await freeSlots(service, from, to, settings.booking)).filter(matches)
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
      const future = await freeSlots(service, today, addDays(today, 180), settings.booking)
      const after = (slots: typeof future) => slots.find((s) => todayAR(s.start) > to) ?? slots[0]
      const wanted = after(future.filter(matches))
      const next = wanted ?? after(future)
      if (!next) return { output: { turnos: [], proximo_disponible: null, agenda_sin_fechas: true } }
      const day = todayAR(next.start)
      const items = future.filter((s) => todayAR(s.start) === day && (!wanted || matches(s))).slice(0, 6)
      return {
        output: {
          turnos: [],
          [wanted ? "proximo_disponible" : "proximo_disponible_fuera_de_lo_pedido"]: formatSlot(next.start),
          mostrados_en_pantalla: items.map((s) => ({ inicio: s.start.toISOString(), etiqueta: formatSlot(s.start) })),
        },
        card: { type: "slots", service: service.name, items: items.map((s) => label(s.start)) },
      }
    }
    return {
      output: { servicio: service.name, mostrados_en_pantalla: picked.map((s) => ({ inicio: s.start.toISOString(), etiqueta: formatSlot(s.start) })) },
      card: { type: "slots", service: service.name, items: picked.map((s) => label(s.start)) },
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
    const promoId = Number(args.promo_id)
    const promo = promoId > 0 ? (await currentPromos()).find((p) => p.id === promoId && (!p.category || p.category === service.category)) : undefined
    if (promoId > 0 && !promo) return { output: { error: "promocion_no_aplica" } }
    const notes = promo ? `Promo: ${promo.title}${promoSummary(promo) ? ` (${promoSummary(promo)})` : ""}` : ""
    const r = await createBooking({ service, start, name: nombre, phone: telefono, email, notes }, settings.booking)
    if (!r.ok) return { output: { error: "horario_no_disponible", detalle: "Ese horario ya no está libre. Ofrecé buscar otro." } }
    const bk = r.booking
    const rows: Array<[string, string]> = [
      ["Servicio", bk.service_name],
      ["Día y hora", formatSlot(bk.starts_at)],
      ["A nombre de", bk.name],
      ...(bk.price > 0 ? ([["Precio", formatARS(bk.price)]] as Array<[string, string]>) : []),
      ...(promo ? ([["Promoción", promo.title]] as Array<[string, string]>) : []),
      ...(promo?.kind === "percent" && bk.price > 0 ? ([["Precio con promoción", formatARS(Math.round(bk.price * (1 - promo.percent / 100)))]] as Array<[string, string]>) : []),
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
    const transfer = !checkoutUrl && settings.transfer.alias ? settings.transfer : null
    return {
      output: {
        reservado: true,
        estado: "pendiente_de_pago",
        sena: bk.deposit,
        reservado_por_minutos: settings.booking.holdMinutes,
        medio_de_pago: checkoutUrl ? "mercado_pago" : transfer ? "transferencia" : "whatsapp",
        ...(transfer ? { nota: "Los datos para transferir y el lugar para subir el comprobante ya están en pantalla. No los repitas." } : {}),
        ...(!checkoutUrl && !transfer ? { nota: "El pago online no está disponible ahora: pedile que coordine la seña por WhatsApp con el botón." } : {}),
      },
      card: { type: "payment", bookingId: bk.id, rows: [...rows, ["Seña", formatARS(bk.deposit)]], amount: bk.deposit, checkoutUrl, whatsappUrl: wa, transfer },
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
  const [services, promos] = await Promise.all([listServices(), currentPromos()])
  const system = instructions(settings, services, promos)
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
      console.error("chat: OpenAI sin respuesta", e instanceof Error ? `${e.message} ${String(e.cause ?? "")}` : e)
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
