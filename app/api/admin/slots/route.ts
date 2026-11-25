import { NextResponse, type NextRequest } from "next/server"
import { freeSlots } from "@/lib/server/agenda"
import { badRequest, isAdmin, unauthorized } from "@/lib/server/http"
import { getSettings } from "@/lib/server/settings"
import { DAY_RE } from "@/lib/time"

export const dynamic = "force-dynamic"

/** Horarios libres de un día según las jornadas cargadas y los turnos ya tomados (la misma regla que usa el chat). */
export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return unauthorized()
  const day = req.nextUrl.searchParams.get("dia") ?? ""
  const duration = Math.round(Number(req.nextUrl.searchParams.get("duracion") ?? 30))
  if (!DAY_RE.test(day) || !Number.isFinite(duration) || duration < 5 || duration > 600) return badRequest()
  const { booking } = await getSettings()
  const slots = await freeSlots({ duration_min: duration }, day, day, { ...booking, minHoursAhead: 0 })
  return NextResponse.json({ slots: slots.map((s) => s.start.toISOString()) })
}
