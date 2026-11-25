import { NextResponse } from "next/server"
import { bookingState, getBooking } from "@/lib/server/agenda"
import { clientIp, rateLimit } from "@/lib/server/http"

export const dynamic = "force-dynamic"

/**
 * Estado público de una reserva, para que el chat retome una seña pendiente.
 * Solo devuelve el estado y el vencimiento (nunca datos personales); el id es un UUID imposible de adivinar.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (!rateLimit(`estado:${clientIp()}`, 60, 10 * 60_000)) return NextResponse.json({ error: "demasiados_intentos" }, { status: 429 })
  const booking = await getBooking(params.id)
  if (!booking) return NextResponse.json({ error: "not_found" }, { status: 404 })
  return NextResponse.json(
    { state: bookingState(booking), expiresAt: booking.expires_at ? booking.expires_at.toISOString() : null },
    { headers: { "Cache-Control": "no-store" } },
  )
}
