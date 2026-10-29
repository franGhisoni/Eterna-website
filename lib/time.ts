export const TIME_ZONE = "America/Argentina/Buenos_Aires"
const OFFSET = "-03:00"

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export function todayAR(now = new Date()): string {
  return new Date(now.getTime() - 3 * 3600_000).toISOString().slice(0, 10)
}

export function toInstant(day: string, time: string): Date {
  return new Date(`${day}T${time}:00${OFFSET}`)
}

export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function weekdayOf(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay()
}

export function minutesOf(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

export function formatSlot(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  const s = new Intl.DateTimeFormat("es-AR", {
    timeZone: TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function formatDay(day: string): string {
  const s = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${day}T12:00:00Z`))
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function formatARS(n: number): string {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n)
}
