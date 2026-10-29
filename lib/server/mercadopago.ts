import { createHmac, timingSafeEqual } from "node:crypto"
import { markBookingPaid, type Booking } from "./agenda"
import { formatSlot } from "../time"

const API = "https://api.mercadopago.com"

const token = () => (process.env.MERCADOPAGO_ACCESS_TOKEN ?? process.env.MERCADO_PAGO_ACCESS_TOKEN)?.trim() || undefined

export const mercadoPagoEnabled = () => !!token()

async function mp<T>(path: string, init: RequestInit & { idempotencyKey?: string } = {}): Promise<T> {
  const t = token()
  if (!t) throw new Error("Mercado Pago no está configurado")
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${t}`,
      ...(init.idempotencyKey ? { "X-Idempotency-Key": init.idempotencyKey } : {}),
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Mercado Pago ${res.status}: ${(body as { message?: string }).message ?? "error"}`)
  return body as T
}

/** Checkout Pro preference for the booking's deposit. The amount always comes from the booking row, never from the client. */
export async function createDepositCheckout(booking: Booking, baseUrl: string): Promise<string> {
  const back = `${baseUrl}/reserva/${booking.id}`
  const https = baseUrl.startsWith("https://")
  const pref = await mp<{ init_point: string }>("/checkout/preferences", {
    method: "POST",
    idempotencyKey: `pref-${booking.id}`,
    body: JSON.stringify({
      items: [
        {
          id: String(booking.service_id ?? "servicio"),
          title: `Seña · ${booking.service_name} · ${formatSlot(booking.starts_at)}`,
          quantity: 1,
          unit_price: booking.deposit,
          currency_id: "ARS",
        },
      ],
      payer: { name: booking.name, ...(booking.email ? { email: booking.email } : {}) },
      external_reference: booking.id,
      back_urls: { success: back, failure: back, pending: back },
      ...(https ? { auto_return: "approved", notification_url: `${baseUrl}/api/mp/webhook` } : {}),
      statement_descriptor: "ETERNA",
      expires: !!booking.expires_at,
      ...(booking.expires_at ? { expiration_date_to: booking.expires_at.toISOString() } : {}),
    }),
  })
  return pref.init_point
}

type Payment = { id: number; status: string; external_reference?: string; transaction_amount: number }

/** Looks the payment up at Mercado Pago (never trusting the caller) and confirms its booking when approved. */
export async function applyPayment(paymentId: string): Promise<Booking | null> {
  if (!/^\d{1,20}$/.test(paymentId)) return null
  const p = await mp<Payment>(`/v1/payments/${paymentId}`)
  if (p.status !== "approved" || !p.external_reference) return null
  return markBookingPaid(p.external_reference, String(p.id), p.transaction_amount)
}

/** Validates the `x-signature` header. Without a configured secret it passes: the API lookup is what decides. */
export function validWebhookSignature(signature: string | null, requestId: string | null, dataId: string | null): boolean {
  const secret = (process.env.MERCADOPAGO_WEBHOOK_SECRET ?? process.env.MERCADO_PAGO_WEBHOOK_SECRET)?.trim()
  if (!secret) return true
  if (!signature || !dataId) return false
  const parts: Record<string, string> = {}
  for (const p of signature.split(",")) {
    const i = p.indexOf("=")
    if (i > 0) parts[p.slice(0, i).trim()] = p.slice(i + 1).trim()
  }
  if (!parts.ts || !parts.v1) return false
  const expected = createHmac("sha256", secret).update(`id:${dataId.toLowerCase()};request-id:${requestId ?? ""};ts:${parts.ts};`).digest("hex")
  const a = Buffer.from(expected)
  const b = Buffer.from(parts.v1)
  return a.length === b.length && timingSafeEqual(a, b)
}
