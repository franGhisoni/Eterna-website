import type { PoolClient } from "pg"
import { db, transaction } from "./db"
import type { BookingSettings } from "./settings"
import { addDays, DAY_RE, minutesOf, TIME_RE, toInstant, todayAR } from "../time"

type Queryable = Pick<PoolClient, "query">

export type Service = {
  id: number
  name: string
  description: string
  duration_min: number
  price: number
  deposit: number
  active: boolean
  sort: number
  category: string
  kind: string
  gender: string
  detail: string
}

export type Range = { day: string; start_time: string; end_time: string }

export type BookingStatus = "pending_payment" | "pending_review" | "confirmed" | "cancelled" | "conflict"

export type Booking = {
  id: string
  service_id: number | null
  service_name: string
  starts_at: Date
  ends_at: Date
  name: string
  phone: string
  email: string
  notes: string
  status: BookingStatus
  price: number
  deposit: number
  mp_payment_id: string | null
  expires_at: Date | null
  created_at: Date
}

// a booking blocks its slot while confirmed, while its payment hold is alive, or when it was paid late into a taken slot
const BLOCKING = `(status in ('confirmed', 'conflict', 'pending_review') or (status = 'pending_payment' and expires_at > now()))`

export async function listServices(activeOnly = true): Promise<Service[]> {
  const { rows } = await (await db()).query<Service>(
    `select * from services ${activeOnly ? "where active" : ""} order by sort, id`,
  )
  return rows
}

export async function getService(id: number): Promise<Service | null> {
  if (!Number.isInteger(id)) return null
  const { rows } = await (await db()).query<Service>("select * from services where id = $1", [id])
  return rows[0] ?? null
}

export async function listRanges(from: string, to: string, q?: Queryable): Promise<Range[]> {
  const { rows } = await (q ?? (await db())).query<Range>(
    "select day, start_time, end_time from agenda_ranges where day between $1 and $2 order by day, start_time",
    [from, to],
  )
  return rows
}

export async function setDayRanges(day: string, ranges: Array<{ start: string; end: string }>, q?: Queryable): Promise<void> {
  const run = async (c: Queryable) => {
    await c.query("delete from agenda_ranges where day = $1", [day])
    for (const r of ranges) {
      await c.query("insert into agenda_ranges (day, start_time, end_time) values ($1, $2, $3)", [day, r.start, r.end])
    }
  }
  if (q) await run(q)
  else await transaction(run)
}

export function validRanges(input: unknown): Array<{ start: string; end: string }> | null {
  if (!Array.isArray(input) || input.length > 12) return null
  const out: Array<{ start: string; end: string }> = []
  for (const r of input) {
    const start = (r as { start?: unknown })?.start
    const end = (r as { end?: unknown })?.end
    if (typeof start !== "string" || typeof end !== "string" || !TIME_RE.test(start) || !TIME_RE.test(end)) return null
    if (minutesOf(end) <= minutesOf(start)) return null
    out.push({ start, end })
  }
  out.sort((a, b) => minutesOf(a.start) - minutesOf(b.start))
  for (let i = 1; i < out.length; i++) if (minutesOf(out[i].start) < minutesOf(out[i - 1].end)) return null
  return out
}

async function blockingBookings(from: Date, to: Date, q: Queryable): Promise<Array<{ starts_at: Date; ends_at: Date }>> {
  const { rows } = await q.query<{ starts_at: Date; ends_at: Date }>(
    `select starts_at, ends_at from bookings where ${BLOCKING} and starts_at < $2 and ends_at > $1`,
    [from, to],
  )
  return rows
}

export type Slot = { start: Date; end: Date }

export async function freeSlots(
  service: Pick<Service, "duration_min">,
  fromDay: string,
  toDay: string,
  booking: BookingSettings,
  opts: { limit?: number; q?: Queryable; now?: Date } = {},
): Promise<Slot[]> {
  const q = opts.q ?? (await db())
  const now = opts.now ?? new Date()
  const earliest = now.getTime() + booking.minHoursAhead * 3600_000
  const ranges = await listRanges(fromDay, toDay, q)
  if (!ranges.length) return []
  const taken = await blockingBookings(toInstant(fromDay, "00:00"), toInstant(addDays(toDay, 1), "00:00"), q)
  const durMs = service.duration_min * 60_000
  const stepMs = booking.slotMinutes * 60_000
  const out: Slot[] = []
  for (const r of ranges) {
    const rangeEnd = toInstant(r.day, r.end_time).getTime()
    for (let t = toInstant(r.day, r.start_time).getTime(); t + durMs <= rangeEnd; t += stepMs) {
      if (t < earliest) continue
      const overlapping = taken.filter((b) => b.starts_at.getTime() < t + durMs && b.ends_at.getTime() > t).length
      if (overlapping >= booking.capacity) continue
      out.push({ start: new Date(t), end: new Date(t + durMs) })
      if (opts.limit && out.length >= opts.limit) return out
    }
  }
  return out
}

export async function availableDays(month: string, booking: BookingSettings): Promise<string[]> {
  if (!/^\d{4}-\d{2}$/.test(month)) return []
  const services = await listServices()
  if (!services.length) return []
  const shortest = Math.min(...services.map((s) => s.duration_min))
  const first = `${month}-01`
  const last = addDays(addDays(first, 32).slice(0, 8) + "01", -1)
  const from = first < todayAR() ? todayAR() : first
  if (from > last) return []
  const slots = await freeSlots({ duration_min: shortest }, from, last, booking)
  return Array.from(new Set(slots.map((s) => todayAR(s.start))))
}

export type CreateBookingInput = {
  service: Service
  start: Date
  name: string
  phone: string
  email: string
  notes?: string
}

export async function createBooking(input: CreateBookingInput, booking: BookingSettings): Promise<{ ok: true; booking: Booking } | { ok: false; error: "slot_unavailable" }> {
  return transaction(async (c) => {
    await c.query("select pg_advisory_xact_lock(424242)")
    const day = todayAR(input.start)
    const slots = await freeSlots(input.service, day, day, booking, { q: c })
    if (!slots.some((s) => s.start.getTime() === input.start.getTime())) return { ok: false, error: "slot_unavailable" } as const
    const end = new Date(input.start.getTime() + input.service.duration_min * 60_000)
    const needsPayment = input.service.deposit > 0
    const { rows } = await c.query<Booking>(
      `insert into bookings (service_id, service_name, starts_at, ends_at, name, phone, email, notes, status, price, deposit, expires_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning *`,
      [
        input.service.id,
        input.service.gender && input.service.gender !== "Unisex" ? `${input.service.name} (${input.service.gender})` : input.service.name,
        input.start,
        end,
        input.name,
        input.phone,
        input.email,
        input.notes ?? "",
        needsPayment ? "pending_payment" : "confirmed",
        input.service.price,
        input.service.deposit,
        needsPayment ? new Date(Date.now() + booking.holdMinutes * 60_000) : null,
      ],
    )
    return { ok: true, booking: rows[0] } as const
  })
}

export async function getBooking(id: string): Promise<Booking | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const { rows } = await (await db()).query<Booking>("select * from bookings where id = $1", [id])
  return rows[0] ?? null
}

/** Applies an approved payment once. Paid after the hold expired into a slot someone else took → "conflict" for the team to resolve. */
export async function markBookingPaid(id: string, paymentId: string, amount: number): Promise<Booking | null> {
  return transaction(async (c) => {
    await c.query("select pg_advisory_xact_lock(424242)")
    const { rows } = await c.query<Booking>("select * from bookings where id = $1 for update", [id])
    const b = rows[0]
    if (!b) return null
    if (b.status === "confirmed" || b.status === "conflict" || b.mp_payment_id === paymentId) return b
    if (amount + 0.01 < b.deposit) {
      console.error(`mp: pago ${paymentId} de ${amount} menor a la seña ${b.deposit} del turno ${id}`)
      return b
    }
    const { rows: overlap } = await c.query(
      `select 1 from bookings where id <> $1 and ${BLOCKING} and starts_at < $3 and ends_at > $2`,
      [id, b.starts_at, b.ends_at],
    )
    const settingsCapacity = await c.query<{ value: { capacity?: number } }>("select value from settings where key = 'booking'")
    const capacity = settingsCapacity.rows[0]?.value?.capacity ?? 1
    const holdAlive = b.status === "pending_payment" && b.expires_at !== null && b.expires_at > new Date()
    const status: BookingStatus =
      b.status === "cancelled" ? "conflict" : holdAlive || overlap.length < capacity ? "confirmed" : "conflict"
    if (status === "conflict") console.error(`mp: COBRO CON CONFLICTO · pago ${paymentId} · turno ${id}. Revisar en el panel.`)
    const { rows: updated } = await c.query<Booking>(
      "update bookings set status = $2, mp_payment_id = $3, expires_at = null where id = $1 returning *",
      [id, status, paymentId],
    )
    return updated[0]
  })
}

export type ReceiptResult = "ok" | "not_found" | "expired" | "already_sent"

/** Stores the transfer receipt and frees the booking from its payment timer: the team confirms it after checking the money arrived. */
export async function submitReceipt(id: string, receipt: { name: string; mime: string; data: Buffer }): Promise<ReceiptResult> {
  return transaction(async (c) => {
    const { rows } = await c.query<Booking>("select * from bookings where id = $1 for update", [id])
    const b = rows[0]
    if (!b) return "not_found"
    if (b.status === "pending_review") return "already_sent"
    if (bookingState(b) !== "pending_payment") return "expired"
    await c.query("insert into booking_receipts (booking_id, name, mime, data) values ($1, $2, $3, $4)", [id, receipt.name, receipt.mime, receipt.data])
    await c.query("update bookings set status = 'pending_review', expires_at = null where id = $1", [id])
    return "ok"
  })
}

export async function getReceipt(id: string): Promise<{ name: string; mime: string; data: Buffer } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const { rows } = await (await db()).query<{ name: string; mime: string; data: Buffer }>("select name, mime, data from booking_receipts where booking_id = $1", [id])
  return rows[0] ?? null
}

export async function listBookings(fromDay: string): Promise<Array<Booking & { has_receipt: boolean }>> {
  if (!DAY_RE.test(fromDay)) return []
  const { rows } = await (await db()).query<Booking & { has_receipt: boolean }>(
    "select b.*, exists (select 1 from booking_receipts r where r.booking_id = b.id) as has_receipt from bookings b where b.starts_at >= $1 order by b.starts_at limit 500",
    [toInstant(fromDay, "00:00")],
  )
  return rows
}

export async function setBookingStatus(id: string, status: "confirmed" | "cancelled"): Promise<Booking | null> {
  const { rows } = await (await db()).query<Booking>(
    "update bookings set status = $2, expires_at = case when $2 = 'confirmed' then null else expires_at end where id = $1 returning *",
    [id, status],
  )
  return rows[0] ?? null
}

export function bookingState(b: Booking): BookingStatus | "expired" {
  if (b.status === "pending_payment" && (!b.expires_at || b.expires_at <= new Date())) return "expired"
  return b.status
}
