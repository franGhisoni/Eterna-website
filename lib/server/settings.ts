import { db } from "./db"

export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high"

export type AiSettings = { model: string; reasoning: ReasoningEffort; knowledge: string }
export type BusinessSettings = { name: string; address: string; whatsapp: string; hours: string }
export type BookingSettings = { slotMinutes: number; minHoursAhead: number; holdMinutes: number; capacity: number }

export type TransferSettings = { alias: string; holder: string; bank: string; cbu: string }

export type Settings = { ai: AiSettings; business: BusinessSettings; booking: BookingSettings; transfer: TransferSettings }

export const REASONING_EFFORTS: ReasoningEffort[] = ["none", "minimal", "low", "medium", "high"]

const DEFAULT_KNOWLEDGE = `Eterna es un centro de estética integral que funciona dentro del Instituto Ghisoni, en Lomas de Zamora: un entorno médico real, con estándares clínicos, higiene y atención personalizada.

Servicios:
- Depilación láser definitiva con láser diodo de alta potencia. Rostro y cuerpo completo. El plan se adapta al tipo de piel, la zona y los objetivos; la reducción es progresiva según cada caso. Hay evaluación y seguimiento personalizado.
- Medicina estética: tratamientos orientados a resultados naturales y armónicos, que se definen después de una consulta de evaluación. Enfoque sutil y equilibrado, con información clara antes de decidir.
- HIFU: ultrasonido focalizado de alta intensidad para un lifting no invasivo. Es un tratamiento incorporado recientemente; hay que evaluar si es adecuado para cada persona.

Antes de la sesión de depilación láser: venir con la zona rasurada, sin cremas ni autobronceantes, y evitar el sol intenso los días previos. (Completar o corregir según los protocolos del centro.)`

export const DEFAULT_SETTINGS: Settings = {
  ai: { model: "gpt-6-luna", reasoning: "low", knowledge: DEFAULT_KNOWLEDGE },
  business: {
    name: "Eterna",
    address: "José Pereyra Lucena 575, Lomas de Zamora, Buenos Aires",
    whatsapp: "541140420769",
    hours: "Lunes a viernes de 10 a 19 hs",
  },
  booking: { slotMinutes: 30, minHoursAhead: 12, holdMinutes: 30, capacity: 1 },
  transfer: { alias: "", holder: "", bank: "", cbu: "" },
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
  const reasoning = REASONING_EFFORTS.includes(ai.reasoning as ReasoningEffort) ? (ai.reasoning as ReasoningEffort) : current.ai.reasoning
  const model = str(ai.model, 80, current.ai.model)
  return {
    ai: {
      model: /^[\w.:-]+$/.test(model) ? model : current.ai.model,
      reasoning,
      knowledge: str(ai.knowledge, 30000, current.ai.knowledge),
    },
    business: {
      name: str(business.name, 80, current.business.name) || current.business.name,
      address: str(business.address, 200, current.business.address) || current.business.address,
      whatsapp: str(business.whatsapp, 20, current.business.whatsapp).replace(/\D/g, "") || current.business.whatsapp,
      hours: str(business.hours, 200, current.business.hours),
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
