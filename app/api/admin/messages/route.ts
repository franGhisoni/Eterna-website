import { NextResponse, type NextRequest } from "next/server"
import { badRequest, can, deny } from "@/lib/server/http"
import { createReminder, listMessages, messageCounts, remindNextSession, updateReminder, whatsappLink } from "@/lib/server/reminders"
import { DAY_RE } from "@/lib/time"

export const dynamic = "force-dynamic"

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")

export async function GET(req: NextRequest) {
  const session = await can("inbox")
  if (!session) return deny()
  if (req.nextUrl.searchParams.get("resumen") === "1") return NextResponse.json(await messageCounts())
  const state = req.nextUrl.searchParams.get("estado")
  const items = await listMessages(state === "enviados" ? "enviados" : state === "todos" ? "todos" : "pendientes")
  return NextResponse.json({ items: items.map((m) => ({ ...m, whatsapp: m.phone && m.message ? whatsappLink(m.phone, m.message) : null })) })
}

/** { bookingId, accion: "proxima" } deja el aviso de próxima sesión · { patientId, title, message, dueOn } crea uno manual */
export async function POST(req: NextRequest) {
  const session = await can("inbox")
  if (!session) return deny()
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  if (b.accion === "proxima" && typeof b.bookingId === "string") {
    const r = await remindNextSession(b.bookingId, session.username)
    return r ? NextResponse.json(r) : badRequest("sin_paciente")
  }
  const title = text(b.title, 200)
  const message = text(b.message, 2000)
  const dueOn = typeof b.dueOn === "string" && DAY_RE.test(b.dueOn) ? b.dueOn : null
  const patientId = Number(b.patientId) || null
  if (!title || (!patientId && !text(b.description, 200))) return badRequest()
  const id = await createReminder({ patientId, title, message, dueOn, description: text(b.description, 500) }, session.username)
  return NextResponse.json({ id })
}

export async function PATCH(req: NextRequest) {
  const session = await can("inbox")
  if (!session) return deny()
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const id = Number(b.id)
  const action = b.action
  if (!Number.isInteger(id) || !["sent", "reopen", "snooze", "edit", "dismiss"].includes(action as string)) return badRequest()
  const days = b.days === undefined ? undefined : Math.round(Number(b.days))
  const dueOn = typeof b.dueOn === "string" && DAY_RE.test(b.dueOn) ? b.dueOn : undefined
  const ok = await updateReminder(id, action as "sent", { days, dueOn, message: typeof b.message === "string" ? b.message.slice(0, 2000) : undefined, title: typeof b.title === "string" ? b.title.slice(0, 200) : undefined }, session.username)
  return ok ? NextResponse.json({ ok: true }) : badRequest("no_encontrado")
}
