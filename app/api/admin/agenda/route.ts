import { NextResponse, type NextRequest } from "next/server"
import { listRanges, setDayRanges, validRanges } from "@/lib/server/agenda"
import { transaction } from "@/lib/server/db"
import { badRequest, isAdmin, unauthorized } from "@/lib/server/http"
import { addDays, DAY_RE, weekdayOf } from "@/lib/time"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return unauthorized()
  const from = req.nextUrl.searchParams.get("desde") ?? ""
  const to = req.nextUrl.searchParams.get("hasta") ?? ""
  if (!DAY_RE.test(from) || !DAY_RE.test(to) || to < from || to > addDays(from, 62)) return badRequest()
  return NextResponse.json({ ranges: await listRanges(from, to) })
}

/** One day: { day, ranges }. Many days: { from, to, weekdays: [0..6], ranges } (empty ranges clears them). */
export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) return unauthorized()
  const body = (await req.json().catch(() => ({}))) as { day?: unknown; from?: unknown; to?: unknown; weekdays?: unknown; ranges?: unknown }
  const ranges = validRanges(body.ranges)
  if (!ranges) return badRequest("horarios_invalidos")

  if (typeof body.day === "string" && DAY_RE.test(body.day)) {
    await setDayRanges(body.day, ranges)
    return NextResponse.json({ ok: true, days: 1 })
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
  })
  return NextResponse.json({ ok: true, days: count })
}
