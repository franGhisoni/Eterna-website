import { NextResponse, type NextRequest } from "next/server"
import {
  CONVERSATION_STATUSES,
  conversationMessages,
  correctMessage,
  getConversation,
  listConversations,
  noteConversation,
  patientFromConversation,
  staffReply,
  type ConversationStatus,
} from "@/lib/server/conversations"
import { db } from "@/lib/server/db"
import { badRequest, can, deny } from "@/lib/server/http"
import { audit } from "@/lib/server/ledger"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const session = await can("inbox")
  if (!session) return deny()
  const sp = req.nextUrl.searchParams
  const id = sp.get("id")
  if (id) {
    const conversation = await getConversation(id)
    if (!conversation) return badRequest("no_encontrado")
    return NextResponse.json({ conversation, messages: await conversationMessages(id) })
  }
  return NextResponse.json({
    conversations: await listConversations({ status: sp.get("estado") ?? undefined, q: sp.get("q") ?? undefined, followup: sp.get("seguimiento") === "1" }),
  })
}

/**
 * Acciones: { id, reply } responde a mano · { id, human } toma o devuelve el control ·
 * { id, status, notes, needs_followup } · { id, correct: { messageId, text } } · { id, patient: { name, phone } }
 */
export async function PATCH(req: NextRequest) {
  const session = await can("inbox")
  if (!session) return deny()
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const id = typeof b.id === "string" ? b.id : ""
  const conv = await getConversation(id)
  if (!conv) return badRequest("no_encontrado")

  if (typeof b.reply === "string" && b.reply.trim()) {
    if (!conv.human) await noteConversation(id, { status: "en_conversacion" })
    await (await db()).query("update conversations set human = true where id = $1", [id])
    await staffReply(id, b.reply.trim().slice(0, 2000), session.username)
  }
  if (typeof b.human === "boolean") {
    await (await db()).query("update conversations set human = $2 where id = $1", [id, b.human])
    await audit(await db(), "conversacion", id, b.human ? "tomar_control" : "devolver_al_asistente", null, null, session.username)
  }
  if (b.correct && typeof b.correct === "object") {
    const c = b.correct as Record<string, unknown>
    if (typeof c.text !== "string" || !c.text.trim()) return badRequest()
    const faq = await correctMessage(id, Number(c.messageId), c.text.trim().slice(0, 3000), session.username)
    if (!faq) return badRequest("mensaje_invalido")
  }
  if (b.patient && typeof b.patient === "object") {
    const p = b.patient as Record<string, unknown>
    const name = typeof p.name === "string" ? p.name.trim().slice(0, 160) : ""
    const phone = typeof p.phone === "string" ? p.phone.trim().slice(0, 40) : ""
    if (!name || phone.replace(/\D/g, "").length < 6) return badRequest("faltan_datos")
    await patientFromConversation(id, name, phone, session.username)
  }
  const patch: Parameters<typeof noteConversation>[1] = {}
  if (typeof b.status === "string") {
    if (!CONVERSATION_STATUSES.includes(b.status as ConversationStatus)) return badRequest()
    patch.status = b.status as ConversationStatus
  }
  if (typeof b.needs_followup === "boolean") patch.needs_followup = b.needs_followup
  await noteConversation(id, patch)
  if (typeof b.notes === "string") await (await db()).query("update conversations set notes = $2 where id = $1", [id, b.notes.slice(0, 4000)])
  return NextResponse.json({ conversation: await getConversation(id), messages: await conversationMessages(id) })
}
