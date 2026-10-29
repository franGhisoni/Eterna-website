import { NextResponse, type NextRequest } from "next/server"
import { bookingState, listBookings, setBookingStatus } from "@/lib/server/agenda"
import { badRequest, isAdmin, unauthorized } from "@/lib/server/http"
import { addDays, DAY_RE, todayAR } from "@/lib/time"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return unauthorized()
  const from = req.nextUrl.searchParams.get("desde")
  const bookings = await listBookings(from && DAY_RE.test(from) ? from : addDays(todayAR(), -7))
  return NextResponse.json({ bookings: bookings.map((b) => ({ ...b, state: bookingState(b) })) })
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) return unauthorized()
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; status?: unknown }
  if (typeof body.id !== "string" || (body.status !== "confirmed" && body.status !== "cancelled")) return badRequest()
  const b = await setBookingStatus(body.id, body.status)
  return b ? NextResponse.json({ booking: { ...b, state: bookingState(b) } }) : badRequest("no_encontrado")
}
