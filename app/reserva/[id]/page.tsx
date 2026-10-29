import Link from "next/link"
import { notFound } from "next/navigation"
import { CalendarCheck, Clock, MapPin, MessageCircle, TriangleAlert } from "lucide-react"
import { applyPayment, mercadoPagoEnabled } from "@/lib/server/mercadopago"
import { bookingState, getBooking } from "@/lib/server/agenda"
import { getSettings, mapsDirectionsUrl, whatsappUrl } from "@/lib/server/settings"
import { formatARS, formatSlot } from "@/lib/time"

export const dynamic = "force-dynamic"
export const metadata = { title: "Tu reserva | Eterna", robots: { index: false } }

const COPY = {
  confirmed: { title: "Tu turno está confirmado", text: "Recibimos la seña. Te esperamos.", icon: CalendarCheck },
  pending_payment: { title: "Falta pagar la seña", text: "Tu turno está guardado por unos minutos. Pagá la seña para confirmarlo.", icon: Clock },
  expired: { title: "La reserva venció", text: "No recibimos la seña a tiempo y el horario se liberó. Podés buscar otro turno.", icon: TriangleAlert },
  cancelled: { title: "Reserva cancelada", text: "Este turno fue cancelado. Si es un error, escribinos.", icon: TriangleAlert },
  conflict: { title: "Recibimos tu pago", text: "El horario se ocupó mientras pagabas. Te vamos a contactar para reprogramar o devolverte la seña.", icon: TriangleAlert },
} as const

export default async function ReservaPage({ params, searchParams }: { params: { id: string }; searchParams: Record<string, string | undefined> }) {
  let booking = await getBooking(params.id)
  if (!booking) notFound()
  const paymentId = searchParams.payment_id ?? searchParams.collection_id
  if (paymentId && mercadoPagoEnabled() && booking.status === "pending_payment") {
    try {
      booking = (await applyPayment(paymentId)) ?? booking
    } catch (e) {
      console.error("reserva: no se pudo verificar el pago", e instanceof Error ? e.message : e)
    }
  }
  const settings = await getSettings()
  const state = bookingState(booking)
  const copy = COPY[state]
  const Icon = copy.icon
  const rejected = searchParams.status === "rejected" || searchParams.collection_status === "rejected"
  const wa = whatsappUrl(settings.business.whatsapp, `Hola! Tengo una consulta sobre mi reserva de ${booking.service_name} del ${formatSlot(booking.starts_at)} (${booking.name}).`)

  return (
    <main className="min-h-screen bg-premium-light px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-lg rounded-[1.75rem] border border-premium bg-white p-7 shadow-premium-lg sm:p-9">
        <Link href="/" className="inline-flex items-center gap-2">
          <img src="/eterna-logo.webp" alt="" className="h-7 w-auto" />
          <span className="font-berlys text-xl text-premium">eterna</span>
        </Link>
        <div className="mt-8 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="font-serif text-2xl font-bold text-premium sm:text-3xl">{copy.title}</h1>
            <p className="mt-2 text-premium/75">{rejected && state === "pending_payment" ? "El pago no se aprobó. Podés intentar de nuevo con otro medio." : copy.text}</p>
          </div>
        </div>
        <dl className="mt-7 divide-y divide-border rounded-2xl border border-premium px-5">
          {[
            ["Servicio", booking.service_name],
            ["Día y hora", formatSlot(booking.starts_at)],
            ["A nombre de", booking.name],
            ...(booking.deposit > 0 ? [["Seña", formatARS(booking.deposit)]] : []),
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-3 text-sm">
              <dt className="text-premium/60">{k}</dt>
              <dd className="text-right font-medium text-premium">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-7 flex flex-col gap-3">
          {state === "pending_payment" && mercadoPagoEnabled() && (
            <a href={`/api/reserva/${booking.id}/pagar`} className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground shadow-[0_10px_26px_rgba(136,38,38,0.22)] transition-premium hover:bg-primary/90">
              Pagar seña con Mercado Pago
            </a>
          )}
          {state === "confirmed" && (
            <a href={mapsDirectionsUrl(settings.business.address)} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-premium hover:bg-primary/90">
              <MapPin className="h-4 w-4" /> Cómo llegar
            </a>
          )}
          {(state === "expired" || state === "cancelled") && (
            <Link href="/chat" className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-premium hover:bg-primary/90">
              Buscar otro turno
            </Link>
          )}
          <a href={wa} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-premium px-5 text-sm font-medium text-premium transition-premium hover:bg-secondary">
            <MessageCircle className="h-4 w-4" /> Escribirnos por WhatsApp
          </a>
        </div>
        <p className="mt-6 text-center text-xs text-premium/55">{settings.business.address}</p>
      </div>
    </main>
  )
}
