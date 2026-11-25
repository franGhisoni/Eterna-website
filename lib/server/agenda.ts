import type { PoolClient } from "pg"
import { db, transaction } from "./db"
import type { Verdict } from "./receipts"
import type { BookingSettings } from "./settings"
import { findPatientByPhone, linkBookingPatient, priceWithPromo, recordAutomaticPayment } from "./ledger"
import type { Promo } from "./promos"
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
  online: boolean
  visible_web: boolean
  audience: string
  equipment: string
  indications: string
  contraindications: string
  promo_price: number | null
}


export type BookingStatus = "pending_payment" | "pending_review" | "confirmed" | "cancelled" | "conflict" | "reserved" | "done" | "no_show"

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
  patient_id?: number | null
  final_price?: number | null
}

// a booking blocks its slot while reserved/confirmed/done, while its payment hold is alive, or when it was paid late into a taken slot
export const BLOCKING = `(status in ('confirmed', 'conflict', 'pending_review', 'reserved', 'done') or (status = 'pending_payment' and expires_at > now()))`

export async function listServices(activeOnly = true): Promise<Service[]> {
  const { rows } = await (await db()).query<Service>(
    `select * from services ${activeOnly ? "where active and online" : ""} order by sort, id`,
  )
  return rows
}

export async function getService(id: number): Promise<Service | null> {
  if (!Number.isInteger(id)) return null
  const { rows } = await (await db()).query<Service>("select * from services where id = $1", [id])
  return rows[0] ?? null
}

export type Range = {
  day: string
  start_time: string
  end_time: string
  professional: string
  slot_minutes: number | null
  gap_minutes: number
  published: boolean
  notes: string
}
export type RangeInput = { start: string; end: string; professional?: string; slotMinutes?: number | null; gapMinutes?: number; published?: boolean; notes?: string }
export type Block = { id: number; day: string; start_time: string; end_time: string; professional: string; reason: string }

export async function listRanges(from: string, to: string, q?: Queryable, publishedOnly = false): Promise<Range[]> {
  const { rows } = await (q ?? (await db())).query<Range>(
    `select day, start_time, end_time, professional, slot_minutes, gap_minutes, published, notes from agenda_ranges
     where day between $1 and $2 ${publishedOnly ? "and published" : ""} order by day, start_time`,
    [from, to],
  )
  return rows
}

export async function listBlocks(from: string, to: string, q?: Queryable): Promise<Block[]> {
  const { rows } = await (q ?? (await db())).query<Block>(
    "select id, day, start_time, end_time, professional, reason from agenda_blocks where day between $1 and $2 order by day, start_time",
    [from, to],
  )
  return rows
}

export async function setDayRanges(day: string, ranges: RangeInput[], q?: Queryable): Promise<void> {
  const run = async (c: Queryable) => {
    await c.query("delete from agenda_ranges where day = $1", [day])
    for (const r of ranges) {
      await c.query(
        "insert into agenda_ranges (day, start_time, end_time, professional, slot_minutes, gap_minutes, published, notes) values ($1, $2, $3, $4, $5, $6, $7, $8)",
        [day, r.start, r.end, r.professional ?? "", r.slotMinutes ?? null, r.gapMinutes ?? 0, r.published !== false, r.notes ?? ""],
      )
    }
  }
  if (q) await run(q)
  else await transaction(run)
}

export function validRanges(input: unknown): RangeInput[] | null {
  if (!Array.isArray(input) || input.length > 24) return null
  const out: RangeInput[] = []
  for (const r of input) {
    const x = (r ?? {}) as Record<string, unknown>
    const { start, end } = x
    if (typeof start !== "string" || typeof end !== "string" || !TIME_RE.test(start) || !TIME_RE.test(end)) return null
    if (minutesOf(end) <= minutesOf(start)) return null
    const slot = x.slotMinutes === null || x.slotMinutes === undefined || x.slotMinutes === "" ? null : Math.round(Number(x.slotMinutes))
    const gap = Math.round(Number(x.gapMinutes ?? 0))
    if (slot !== null && (!Number.isFinite(slot) || slot < 5 || slot > 480)) return null
    if (!Number.isFinite(gap) || gap < 0 || gap > 240) return null
    out.push({
      start,
      end,
      professional: typeof x.professional === "string" ? x.professional.trim().slice(0, 120) : "",
      slotMinutes: slot,
      gapMinutes: gap,
      published: x.published !== false,
      notes: typeof x.notes === "string" ? x.notes.trim().slice(0, 500) : "",
    })
  }
  out.sort((a, b) => minutesOf(a.start) - minutesOf(b.start))
  // dos franjas solo pueden superponerse si son de profesionales distintos
  for (let i = 0; i < out.length; i++)
    for (let j = i + 1; j < out.length; j++)
      if ((out[i].professional || "") === (out[j].professional || "") && minutesOf(out[j].start) < minutesOf(out[i].end)) return null
  return out
}

async function blockingBookings(from: Date, to: Date, q: Queryable): Promise<Array<{ starts_at: Date; ends_at: Date; professional: string }>> {
  const { rows } = await q.query<{ starts_at: Date; ends_at: Date; professional: string }>(
    `select starts_at, ends_at, professional from bookings where ${BLOCKING} and starts_at < $2 and ends_at > $1`,
    [from, to],
  )
  return rows
}

export type Slot = { start: Date; end: Date; professional: string }

/**
 * Horarios libres: salen de las jornadas habilitadas, descontando turnos tomados y bloqueos.
 * Cada jornada con profesional es un carril propio; sin profesional se usa la capacidad general.
 * El chat y la web solo ven jornadas publicadas; la administración ve también las ocultas.
 */
export async function freeSlots(
  service: Pick<Service, "duration_min">,
  fromDay: string,
  toDay: string,
  booking: BookingSettings,
  opts: { limit?: number; q?: Queryable; now?: Date; includeHidden?: boolean; professional?: string } = {},
): Promise<Slot[]> {
  const q = opts.q ?? (await db())
  const now = opts.now ?? new Date()
  const earliest = now.getTime() + booking.minHoursAhead * 3600_000
  const ranges = (await listRanges(fromDay, toDay, q, !opts.includeHidden)).filter((r) => !opts.professional || !r.professional || r.professional === opts.professional)
  if (!ranges.length) return []
  const [taken, blocks] = await Promise.all([
    blockingBookings(toInstant(fromDay, "00:00"), toInstant(addDays(toDay, 1), "00:00"), q),
    listBlocks(fromDay, toDay, q),
  ])
  const durMs = service.duration_min * 60_000
  const seen = new Set<number>()
  const out: Slot[] = []
  for (const r of ranges) {
    const lane = r.professional
    const stepMs = ((r.slot_minutes ?? booking.slotMinutes) + r.gap_minutes) * 60_000
    const capacity = lane ? 1 : booking.capacity
    const rangeEnd = toInstant(r.day, r.end_time).getTime()
    const dayBlocks = blocks.filter((b) => b.day === r.day && (!b.professional || !lane || b.professional === lane))
    for (let t = toInstant(r.day, r.start_time).getTime(); t + durMs <= rangeEnd; t += stepMs) {
      if (t < earliest || seen.has(t)) continue
      if (dayBlocks.some((b) => toInstant(b.day, b.start_time).getTime() < t + durMs && toInstant(b.day, b.end_time).getTime() > t)) continue
      const overlapping = taken.filter((b) => b.starts_at.getTime() < t + durMs && b.ends_at.getTime() > t && (!lane || !b.professional || b.professional === lane)).length
      if (overlapping >= capacity) continue
      seen.add(t)
      out.push({ start: new Date(t), end: new Date(t + durMs), professional: lane })
    }
  }
  out.sort((a, b) => a.start.getTime() - b.start.getTime())
  return opts.limit ? out.slice(0, opts.limit) : out
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
  promo?: Promo
  source?: "web" | "chat"
}

export async function createBooking(input: CreateBookingInput, booking: BookingSettings): Promise<{ ok: true; booking: Booking } | { ok: false; error: "slot_unavailable" }> {
  return transaction(async (c) => {
    await c.query("select pg_advisory_xact_lock(424242)")
    const day = todayAR(input.start)
    const slots = await freeSlots(input.service, day, day, booking, { q: c })
    const slot = slots.find((s) => s.start.getTime() === input.start.getTime())
    if (!slot) return { ok: false, error: "slot_unavailable" } as const
    const end = new Date(input.start.getTime() + input.service.duration_min * 60_000)
    const needsPayment = input.service.deposit > 0
    const known = await findPatientByPhone(input.phone, c)
    const { discount, final } = priceWithPromo(input.service.price, input.promo)
    const { rows } = await c.query<Booking>(
      `insert into bookings (service_id, service_name, starts_at, ends_at, name, phone, email, notes, status, price, deposit, expires_at,
         patient_id, source, zones, promo_id, promo_title, discount, final_price, professional)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20) returning *`,
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
        known?.id ?? null,
        input.source ?? "web",
        input.service.detail || "",
        input.promo?.id ?? null,
        input.promo?.title ?? "",
        discount,
        final,
        slot.professional,
      ],
    )
    await c.query("insert into booking_events (booking_id, kind, detail) values ($1, 'creado', $2)", [rows[0].id, JSON.stringify({ origen: input.source ?? "web" })])
    if (!needsPayment) await linkBookingPatient(c, rows[0].id)
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
    await recordAutomaticPayment(c, id, amount, "Mercado Pago", "mercadopago", paymentId)
    return updated[0]
  })
}

export type ReceiptResult = "ok" | "not_found" | "expired" | "already_sent"

/** Keeps the latest attempt. A failed reading leaves the payment timer running so the person can retry. */
export async function saveReceipt(
  id: string,
  receipt: { name: string; mime: string; data: Buffer; sha256: string; verdict: Verdict | null },
  status: "confirmed" | "pending_review" | "pending_payment",
): Promise<ReceiptResult> {
  return transaction(async (c) => {
    const { rows } = await c.query<Booking>("select * from bookings where id = $1 for update", [id])
    const b = rows[0]
    if (!b) return "not_found"
    if (b.status === "pending_review" || b.status === "confirmed") return "already_sent"
    if (bookingState(b) !== "pending_payment") return "expired"
    await c.query(
      `insert into booking_receipts (booking_id, name, mime, data, sha256, ai_result, ai_reason, ai_reading, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, now())
       on conflict (booking_id) do update set name = excluded.name, mime = excluded.mime, data = excluded.data, sha256 = excluded.sha256,
         ai_result = excluded.ai_result, ai_reason = excluded.ai_reason, ai_reading = excluded.ai_reading, created_at = now()`,
      [id, receipt.name, receipt.mime, receipt.data, receipt.sha256, receipt.verdict?.result ?? "sin_lectura", receipt.verdict?.reason ?? "", receipt.verdict?.reading ? JSON.stringify(receipt.verdict.reading) : null],
    )
    if (status !== "pending_payment") await c.query("update bookings set status = $2, expires_at = null where id = $1", [id, status])
    if (status === "confirmed") await recordAutomaticPayment(c, id, b.deposit, "Transferencia", "comprobante", id)
    if (status === "pending_review") await linkBookingPatient(c, id)
    return "ok"
  })
}

export async function receiptAlreadyUsed(sha256: string, bookingId: string): Promise<boolean> {
  const { rows } = await (await db()).query(
    "select 1 from booking_receipts r join bookings b on b.id = r.booking_id where r.sha256 = $1 and r.booking_id <> $2 and b.status <> 'cancelled' limit 1",
    [sha256, bookingId],
  )
  return rows.length > 0
}

export async function listTransfers() {
  const { rows } = await (await db()).query<Booking & { file_name: string; mime: string; uploaded_at: Date; ai_result: string; ai_reason: string; ai_reading: unknown; verified_at: Date | null }>(
    `select b.*, r.name as file_name, r.mime, r.created_at as uploaded_at, r.ai_result, r.ai_reason, r.ai_reading, r.verified_at
     from booking_receipts r join bookings b on b.id = r.booking_id order by r.created_at desc limit 300`,
  )
  return rows.map((b) => ({ ...b, state: bookingState(b) }))
}

/** A person's decision after checking the bank: verify confirms the booking, reject frees the slot. */
export async function reviewTransfer(id: string, action: "verify" | "reject"): Promise<boolean> {
  return transaction(async (c) => {
    const { rows } = await c.query("select 1 from booking_receipts where booking_id = $1", [id])
    if (!rows.length) return false
    if (action === "verify") {
      await c.query("update booking_receipts set verified_at = now() where booking_id = $1", [id])
      await c.query("update bookings set status = 'confirmed', expires_at = null where id = $1", [id])
      const { rows: b } = await c.query<{ deposit: number }>("select deposit from bookings where id = $1", [id])
      await recordAutomaticPayment(c, id, b[0]?.deposit ?? 0, "Transferencia", "comprobante", id)
    } else {
      await c.query("update booking_receipts set verified_at = null where booking_id = $1", [id])
      await c.query("update bookings set status = 'cancelled' where id = $1", [id])
      // la IA había dado el comprobante por bueno y el equipo lo rechazó: ese cobro no existió
      await c.query("delete from payments where booking_id = $1 and origin = 'comprobante'", [id])
    }
    return true
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
