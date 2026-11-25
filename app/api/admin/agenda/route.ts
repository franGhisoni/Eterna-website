import { NextResponse, type NextRequest } from "next/server"
import { freeSlots, listBlocks, listRanges, setDayRanges, validRanges } from "@/lib/server/agenda"
import { transaction } from "@/lib/server/db"
import { badRequest, can, deny } from "@/lib/server/http"
import { audit, listAgenda } from "@/lib/server/ledger"
import { getSettings } from "@/lib/server/settings"
import { addDays, DAY_RE, weekdayOf } from "@/lib/time"

export const dynamic = "force-dynamic"

/** Jornadas de un período con su ocupación: franjas, bloqueos, turnos tomados y horarios libres. */
export async function GET(req: NextRequest) {
  const session = await can("agenda")
  if (!session) return deny()
  const from = req.nextUrl.searchParams.get("desde") ?? ""
  const to = req.nextUrl.searchParams.get("hasta") ?? ""
  if (!DAY_RE.test(from) || !DAY_RE.test(to) || to < from || to > addDays(from, 62)) return badRequest()
  const { booking } = await getSettings()
  const [ranges, blocks, bookings, free] = await Promise.all([
    listRanges(from, to),
    listBlocks(from, to),
    listAgenda({ from, to }),
    freeSlots({ duration_min: booking.slotMinutes }, from, to, { ...booking, minHoursAhead: 0 }, { includeHidden: true }),
  ])
  const occupancy: Record<string, { taken: number; free: number }> = {}
  for (const b of bookings) {
    if (["cancelled", "expired"].includes(b.state)) continue
    const d = new Date(new Date(b.starts_at).getTime() - 3 * 3600_000).toISOString().slice(0, 10)
    occupancy[d] = { taken: (occupancy[d]?.taken ?? 0) + 1, free: occupancy[d]?.free ?? 0 }
  }
  for (const s of free) {
    const d = new Date(s.start.getTime() - 3 * 3600_000).toISOString().slice(0, 10)
    occupancy[d] = { taken: occupancy[d]?.taken ?? 0, free: (occupancy[d]?.free ?? 0) + 1 }
  }
  return NextResponse.json({ ranges, blocks, occupancy })
}

/** Un día: { day, ranges }. Varios días: { from, to, weekdays: [0..6], ranges } (franjas vacías = sin atención). */
export async function PUT(req: NextRequest) {
  const session = await can("agenda_edit")
  if (!session) return deny()
  const body = (await req.json().catch(() => ({}))) as { day?: unknown; from?: unknown; to?: unknown; weekdays?: unknown; ranges?: unknown }
  const ranges = validRanges(body.ranges)
  if (!ranges) return badRequest("horarios_invalidos")

  if (typeof body.day === "string" && DAY_RE.test(body.day)) {
    const day = body.day
    await transaction(async (c) => {
      await setDayRanges(day, ranges, c)
      await audit(c, "jornada", day, "definir", null, ranges, session.username)
    })
    return NextResponse.json({ ok: true, days: 1, affected: await affectedBookings(day) })
  }

  const { from, to, weekdays } = body
  if (typeof from !== "string" || typeof to !== "string" || !DAY_RE.test(from) || !DAY_RE.test(to) || to < from || to > addDays(from, 366)) return badRequest()
  if (!Array.isArray(weekdays) || !weekdays.every((w) => Number.isInteger(w) && w >= 0 && w <= 6)) return badRequest()
  const set = new Set(weekdays as number[])
  let count = 0
  await transaction(async (c) => {
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (!set.has(weekdayOf(d))) continue
      await setDayRanges(d, ranges, c)
      count++
    }
    await audit(c, "jornada", `${from}..${to}`, "carga_masiva", null, { weekdays, ranges }, session.username)
  })
  return NextResponse.json({ ok: true, days: count })
}

/** Duplicar una jornada a otros días: { copyFrom, to: [días] }. */
export async function POST(req: NextRequest) {
  const session = await can("agenda_edit")
  if (!session) return deny()
  const body = (await req.json().catch(() => ({}))) as { copyFrom?: unknown; to?: unknown }
  if (typeof body.copyFrom !== "string" || !DAY_RE.test(body.copyFrom) || !Array.isArray(body.to) || body.to.length > 60) return badRequest()
  const targets = body.to.filter((d): d is string => typeof d === "string" && DAY_RE.test(d))
  const source = await listRanges(body.copyFrom, body.copyFrom)
  if (!source.length) return badRequest("jornada_vacia")
  const ranges = source.map((r) => ({ start: r.start_time, end: r.end_time, professional: r.professional, slotMinutes: r.slot_minutes, gapMinutes: r.gap_minutes, published: r.published, notes: r.notes }))
  await transaction(async (c) => {
    for (const d of targets) await setDayRanges(d, ranges, c)
    await audit(c, "jornada", body.copyFrom as string, "duplicar", null, { a: targets }, session.username)
  })
  return NextResponse.json({ ok: true, days: targets.length })
}

/** Turnos activos de un día que quedaron fuera de las franjas (por ejemplo, al cerrar la jornada) para reprogramarlos. */
async function affectedBookings(day: string) {
  const [ranges, bookings] = await Promise.all([listRanges(day, day), listAgenda({ from: day, to: day })])
  const hhmm = (d: Date | string) => new Date(new Date(d).getTime() - 3 * 3600_000).toISOString().slice(11, 16)
  return bookings
    .filter((b) => !["cancelled", "expired", "done", "no_show"].includes(b.state))
    .filter((b) => !ranges.some((r) => r.start_time <= hhmm(b.starts_at) && hhmm(b.ends_at) <= r.end_time && (!r.professional || !b.professional || r.professional === b.professional)))
    .map((b) => ({ id: b.id, name: b.name, starts_at: b.starts_at, service_name: b.service_name, phone: b.phone }))
}

