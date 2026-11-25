import { NextResponse, type NextRequest } from "next/server"
import { getService } from "@/lib/server/agenda"
import { badRequest, isAdmin, unauthorized } from "@/lib/server/http"
import { ADMIN_STATUSES, bookingHistory, createAppointment, getAgendaItem, listAgenda, updateAppointment, type AdminStatus, type AppointmentPatch } from "@/lib/server/ledger"
import { addDays, DAY_RE, todayAR } from "@/lib/time"

export const dynamic = "force-dynamic"

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")
const money = (v: unknown) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 0 && n <= 100_000_000 ? n : null
}
const date = (v: unknown) => {
  if (typeof v !== "string") return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}
const status = (v: unknown): AdminStatus | null => (ADMIN_STATUSES.includes(v as AdminStatus) ? (v as AdminStatus) : null)
const blank = (v: unknown) => v === undefined || v === null || v === ""

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return unauthorized()
  const sp = req.nextUrl.searchParams
  const id = sp.get("id")
  if (id) {
    const booking = await getAgendaItem(id)
    return booking ? NextResponse.json({ booking, history: await bookingHistory(id) }) : badRequest("no_encontrado")
  }
  const from = sp.get("desde")
  const to = sp.get("hasta")
  const bookings = await listAgenda({ from: from && DAY_RE.test(from) ? from : addDays(todayAR(), -7), to: to && DAY_RE.test(to) ? to : undefined })
  return NextResponse.json({ bookings })
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return unauthorized()
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const start = date(b.start)
  const duration = Math.round(Number(b.durationMin))
  const service = b.serviceId ? await getService(Number(b.serviceId)) : null
  const serviceName = text(b.serviceName, 160) || service?.name || ""
  const price = money(blank(b.price) ? service?.price ?? 0 : b.price)
  const deposit = money(blank(b.deposit) ? service?.deposit ?? 0 : b.deposit)
  const finalPrice = blank(b.finalPrice) ? null : money(b.finalPrice)
  const st = status(b.status ?? "confirmed")
  const patient = b.patient && typeof b.patient === "object" ? (b.patient as Record<string, unknown>) : null
  if (!start || !Number.isFinite(duration) || duration < 5 || duration > 600 || !serviceName || price === null || deposit === null || !st) return badRequest()
  if (!blank(b.finalPrice) && finalPrice === null) return badRequest()
  const r = await createAppointment({
    patientId: Number(b.patientId) || null,
    patient: patient ? { name: text(patient.name, 160), phone: text(patient.phone, 40), email: text(patient.email, 160) } : undefined,
    serviceId: service?.id ?? null,
    serviceName,
    start,
    durationMin: duration,
    zones: text(b.zones, 500),
    professional: text(b.professional, 120),
    promoId: Number(b.promoId) || null,
    price,
    finalPrice,
    deposit,
    notes: text(b.notes, 2000),
    status: st,
    source: b.source === "paciente" ? "paciente" : "admin",
    allowOverlap: b.allowOverlap === true,
  })
  return r.ok ? NextResponse.json({ booking: r.booking }) : NextResponse.json(r, { status: 409 })
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) return unauthorized()
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (typeof b.id !== "string") return badRequest()
  const patch: AppointmentPatch = {}
  if (b.start !== undefined) {
    const d = date(b.start)
    if (!d) return badRequest()
    patch.start = d
  }
  if (b.durationMin !== undefined) {
    const n = Math.round(Number(b.durationMin))
    if (!Number.isFinite(n) || n < 5 || n > 600) return badRequest()
    patch.durationMin = n
  }
  if (b.serviceId !== undefined) {
    const s = b.serviceId ? await getService(Number(b.serviceId)) : null
    patch.serviceId = s?.id ?? null
    if (s && b.serviceName === undefined) patch.serviceName = s.name
  }
  if (b.serviceName !== undefined) patch.serviceName = text(b.serviceName, 160)
  if (b.zones !== undefined) patch.zones = text(b.zones, 500)
  if (b.professional !== undefined) patch.professional = text(b.professional, 120)
  if (b.notes !== undefined) patch.notes = text(b.notes, 2000)
  for (const k of ["price", "finalPrice", "deposit"] as const) {
    if (b[k] === undefined) continue
    const n = money(b[k])
    if (n === null) return badRequest()
    patch[k] = n
  }
  if (b.promoId !== undefined) patch.promoId = Number(b.promoId) || null
  if (b.status !== undefined) {
    const s = status(b.status)
    if (!s) return badRequest()
    patch.status = s
  }
  patch.allowOverlap = b.allowOverlap === true
  const r = await updateAppointment(b.id, patch)
  return r.ok ? NextResponse.json({ booking: r.booking }) : NextResponse.json(r, { status: r.error === "no_encontrado" ? 404 : 409 })
}
