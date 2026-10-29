import { NextResponse } from "next/server"
import { bookingState, getBooking } from "@/lib/server/agenda"
import { publicBaseUrl } from "@/lib/server/http"
import { createDepositCheckout, mercadoPagoEnabled } from "@/lib/server/mercadopago"

export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const base = publicBaseUrl()
  const booking = await getBooking(params.id)
  if (!booking) return NextResponse.redirect(`${base}/chat`)
  if (bookingState(booking) !== "pending_payment" || !mercadoPagoEnabled()) return NextResponse.redirect(`${base}/reserva/${booking.id}`)
  try {
    return NextResponse.redirect(await createDepositCheckout(booking, base))
  } catch (e) {
    console.error("pagar:", e instanceof Error ? e.message : e)
    return NextResponse.redirect(`${base}/reserva/${booking.id}?error=pago`)
  }
}
