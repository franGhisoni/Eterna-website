import { db } from "./db"
import { DEFAULT_DIALOGUE } from "../chat-defaults"

export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high"

export type AiSettings = { model: string; reasoning: ReasoningEffort; knowledge: string; dialogue: string }
export type BusinessSettings = { name: string; address: string; whatsapp: string; hours: string; email: string; instagram: string; bookingUrl: string; directions: string }
export type BookingSettings = { slotMinutes: number; minHoursAhead: number; holdMinutes: number; capacity: number }

export type TransferSettings = { alias: string; holder: string; bank: string; cbu: string }

export type PaymentSettings = { methods: string[]; depositPercent: number }
export type TeamSettings = { professionals: string[] }
export type PolicySettings = { cancellation: string; reschedule: string; deposit: string; minCancelHours: number }
export type FollowupSettings = { depositHours: number; continueAfterDays: number; inactiveAfterDays: number }

export type Settings = {
  ai: AiSettings
  business: BusinessSettings
  booking: BookingSettings
  transfer: TransferSettings
  payments: PaymentSettings
  team: TeamSettings
  policies: PolicySettings
  followup: FollowupSettings
}

export const REASONING_EFFORTS: ReasoningEffort[] = ["none", "minimal", "low", "medium", "high"]

const DEFAULT_KNOWLEDGE = `Eterna es un centro de estética integral que funciona dentro del Instituto Ghisoni, en Lomas de Zamora: un entorno médico real, con estándares clínicos, higiene y atención personalizada.

Servicios:
- Depilación láser definitiva con equipo Alma Láser Soprano Ice Platinum, para mujeres y hombres. Rostro y cuerpo completo. El plan se adapta al tipo de piel, la zona y los objetivos; la reducción es progresiva según cada caso. Hay evaluación y seguimiento personalizado.
- Medicina estética: tratamientos orientados a resultados naturales y armónicos, que se definen después de una consulta de evaluación. Enfoque sutil y equilibrado, con información clara antes de decidir.
- HIFU (equipo HIFU 25D 360 MAX): ultrasonido focalizado de alta intensidad para un lifting no invasivo, facial y corporal. Es un tratamiento incorporado recientemente; hay que evaluar si es adecuado para cada persona.

Antes de la sesión de depilación láser: venir con la zona rasurada, sin cremas ni autobronceantes, y evitar el sol intenso los días previos. (Completar o corregir según los protocolos del centro.)`

export const DEFAULT_SETTINGS: Settings = {
  ai: { model: "gpt-6-luna", reasoning: "low", knowledge: DEFAULT_KNOWLEDGE, dialogue: DEFAULT_DIALOGUE },
  business: {
    name: "Eterna",
    address: "José Pereyra Lucena 575, Lomas de Zamora, Buenos Aires",
    whatsapp: "541140420769",
    hours: "Lunes a viernes de 10 a 19 hs",
    email: "",
    instagram: "",
    bookingUrl: "https://eterna.ghisoni.com.ar/chat",
    directions: "Dentro del Instituto Ghisoni.",
  },
  booking: { slotMinutes: 30, minHoursAhead: 12, holdMinutes: 30, capacity: 1 },
  transfer: { alias: "", holder: "", bank: "", cbu: "" },
  payments: { methods: ["Efectivo", "Transferencia", "Mercado Pago", "Tarjeta de débito", "Tarjeta de crédito"], depositPercent: 25 },
  team: { professionals: [] },
  policies: { cancellation: "", reschedule: "", deposit: "Para reservar se abona una seña del 25 % del valor del tratamiento.", minCancelHours: 24 },
  followup: { depositHours: 48, continueAfterDays: 45, inactiveAfterDays: 90 },
}

export async function getSettings(): Promise<Settings> {
  const { rows } = await (await db()).query<{ key: keyof Settings; value: object }>("select key, value from settings")
  const out = structuredClone(DEFAULT_SETTINGS) as Settings
  for (const r of rows) {
    if (r.key in out) Object.assign(out[r.key], r.value)
  }
  return out
}

const clampInt = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback
}
const str = (v: unknown, max: number, fallback: string) => (typeof v === "string" ? v.trim().slice(0, max) : fallback)

export function sanitizeSettings(input: Partial<Record<keyof Settings, Record<string, unknown>>>, current: Settings): Settings {
  const ai = input.ai ?? {}
  const business = input.business ?? {}
  const booking = input.booking ?? {}
  const transfer = input.transfer ?? {}
  const payments = input.payments ?? {}
  const team = input.team ?? {}
  const policies = input.policies ?? {}
  const followup = input.followup ?? {}
  const list = (v: unknown, fallback: string[], max: number) =>
    Array.isArray(v) ? Array.from(new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 60)).filter(Boolean))).slice(0, max) : fallback
  const reasoning = REASONING_EFFORTS.includes(ai.reasoning as ReasoningEffort) ? (ai.reasoning as ReasoningEffort) : current.ai.reasoning
  const model = str(ai.model, 80, current.ai.model)
  return {
    ai: {
      model: /^[\w.:-]+$/.test(model) ? model : current.ai.model,
      reasoning,
      knowledge: str(ai.knowledge, 30000, current.ai.knowledge),
      dialogue: str(ai.dialogue, 15000, current.ai.dialogue),
    },
    business: {
      name: str(business.name, 80, current.business.name) || current.business.name,
      address: str(business.address, 200, current.business.address) || current.business.address,
      whatsapp: str(business.whatsapp, 20, current.business.whatsapp).replace(/\D/g, "") || current.business.whatsapp,
      hours: str(business.hours, 200, current.business.hours),
      email: str(business.email, 160, current.business.email),
      instagram: str(business.instagram, 160, current.business.instagram),
      bookingUrl: str(business.bookingUrl, 200, current.business.bookingUrl),
      directions: str(business.directions, 1000, current.business.directions),
    },
    booking: {
      slotMinutes: clampInt(booking.slotMinutes, 5, 240, current.booking.slotMinutes),
      minHoursAhead: clampInt(booking.minHoursAhead, 0, 24 * 14, current.booking.minHoursAhead),
      holdMinutes: clampInt(booking.holdMinutes, 10, 24 * 60, current.booking.holdMinutes),
      capacity: clampInt(booking.capacity, 1, 20, current.booking.capacity),
    },
    transfer: {
      alias: str(transfer.alias, 60, current.transfer.alias),
      holder: str(transfer.holder, 120, current.transfer.holder),
      bank: str(transfer.bank, 80, current.transfer.bank),
      cbu: str(transfer.cbu, 30, current.transfer.cbu).replace(/\D/g, ""),
    },
    payments: {
      methods: list(payments.methods, current.payments.methods, 20).length ? list(payments.methods, current.payments.methods, 20) : current.payments.methods,
      depositPercent: clampInt(payments.depositPercent, 0, 100, current.payments.depositPercent),
    },
    team: { professionals: list(team.professionals, current.team.professionals, 50) },
    policies: {
      cancellation: str(policies.cancellation, 2000, current.policies.cancellation),
      reschedule: str(policies.reschedule, 2000, current.policies.reschedule),
      deposit: str(policies.deposit, 2000, current.policies.deposit),
      minCancelHours: clampInt(policies.minCancelHours, 0, 24 * 14, current.policies.minCancelHours),
    },
    followup: {
      depositHours: clampInt(followup.depositHours, 1, 24 * 14, current.followup.depositHours),
      continueAfterDays: clampInt(followup.continueAfterDays, 1, 365, current.followup.continueAfterDays),
      inactiveAfterDays: clampInt(followup.inactiveAfterDays, 7, 1000, current.followup.inactiveAfterDays),
    },
  }
}

export async function saveSettings(next: Settings): Promise<void> {
  const pool = await db()
  for (const key of Object.keys(next) as Array<keyof Settings>) {
    await pool.query("insert into settings (key, value) values ($1, $2) on conflict (key) do update set value = excluded.value", [key, JSON.stringify(next[key])])
  }
}

export const mapsEmbedUrl = (address: string) => `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`
export const mapsDirectionsUrl = (address: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
export const whatsappUrl = (phone: string, text: string) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
