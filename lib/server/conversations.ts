/** Bandeja de conversaciones del asistente: registro, intervención humana y correcciones. */
import { db, transaction } from "./db"
import { audit, ensurePatient } from "./ledger"
import type { ChatCard } from "../chat-types"

export const CONVERSATION_STATUSES = ["nueva", "en_conversacion", "pendiente", "interesada", "turno_reservado", "derivada", "cerrada"] as const
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number]

export type Conversation = {
  id: string
  response_id: string | null
  contact_name: string
  phone: string
  patient_id: number | null
  status: ConversationStatus
  topic: string
  interest: string
  booked: boolean
  needs_followup: boolean
  human: boolean
  notes: string
  last_message: string
  last_at: Date
  created_at: Date
  messages_count?: number
  flagged_count?: number
}

export type ConversationMessage = { id: number; role: "user" | "assistant" | "staff"; text: string; card: ChatCard | null; author: string; flagged: boolean; correction: string; created_at: Date }

const UUID = /^[0-9a-f-]{36}$/i

export async function getConversation(id: string | undefined): Promise<Conversation | null> {
  if (!id || !UUID.test(id)) return null
  const { rows } = await (await db()).query<Conversation>("select * from conversations where id = $1", [id])
  return rows[0] ?? null
}

export async function openConversation(id: string | undefined): Promise<Conversation> {
  const existing = await getConversation(id)
  if (existing) return existing
  const { rows } = await (await db()).query<Conversation>("insert into conversations default values returning *")
  return rows[0]
}

export async function logMessages(conversationId: string, items: Array<{ role: ConversationMessage["role"]; text?: string; card?: ChatCard; author?: string }>, responseId?: string) {
  if (!items.length && !responseId) return
  await transaction(async (c) => {
    for (const m of items) {
      await c.query("insert into conversation_messages (conversation_id, role, text, card, author) values ($1, $2, $3, $4, $5)", [
        conversationId,
        m.role,
        m.text ?? "",
        m.card ? JSON.stringify(m.card) : null,
        m.author ?? "",
      ])
    }
    const last = [...items].reverse().find((m) => m.text)
    await c.query(
      `update conversations set
         last_message = coalesce($2, last_message), last_at = now(),
         response_id = coalesce($3, response_id),
         status = case when status = 'nueva' and $4 then 'en_conversacion' else status end
       where id = $1`,
      [conversationId, last?.text?.slice(0, 300) ?? null, responseId ?? null, items.some((m) => m.role !== "user")],
    )
  })
}

/** Lo que el asistente aprende de la conversación (sin datos sensibles): interés, contacto y si reservó. */
export async function noteConversation(id: string, patch: Partial<Pick<Conversation, "contact_name" | "phone" | "interest" | "topic" | "booked" | "status" | "patient_id" | "needs_followup">>) {
  const keys = Object.keys(patch) as Array<keyof typeof patch>
  if (!keys.length) return
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ")
  await (await db()).query(`update conversations set ${sets} where id = $1`, [id, ...keys.map((k) => patch[k])])
}

export async function listConversations(filter: { status?: string; q?: string; followup?: boolean }) {
  const where: string[] = []
  const params: unknown[] = []
  if (filter.status) {
    params.push(filter.status)
    where.push(`c.status = $${params.length}`)
  }
  if (filter.followup) where.push("(c.needs_followup or (not c.booked and c.interest <> '' and c.status not in ('cerrada')))")
  if (filter.q) {
    params.push(`%${filter.q.toLowerCase()}%`)
    where.push(`(lower(c.contact_name) like $${params.length} or c.phone like $${params.length} or lower(c.last_message) like $${params.length} or lower(c.interest) like $${params.length})`)
  }
  const { rows } = await (await db()).query<Conversation>(
    `select c.*, (select count(*) from conversation_messages m where m.conversation_id = c.id)::int as messages_count,
            (select count(*) from conversation_messages m where m.conversation_id = c.id and m.flagged)::int as flagged_count
     from conversations c
     where exists (select 1 from conversation_messages m where m.conversation_id = c.id) ${where.length ? `and ${where.join(" and ")}` : ""}
     order by c.last_at desc limit 300`,
    params,
  )
  return rows
}

export async function conversationMessages(id: string, afterId = 0): Promise<ConversationMessage[]> {
  const { rows } = await (await db()).query<ConversationMessage>(
    "select id, role, text, card, author, flagged, correction, created_at from conversation_messages where conversation_id = $1 and id > $2 order by id",
    [id, afterId],
  )
  return rows
}

export async function staffReply(id: string, text: string, actor: string) {
  await logMessages(id, [{ role: "staff", text, author: actor }])
  await audit(await db(), "conversacion", id, "respuesta_manual", null, { text }, actor)
}

/**
 * Corrección de una respuesta del asistente: queda marcada y se guarda como pregunta frecuente
 * (la pregunta es el mensaje de la persona que la originó). No cambia precios ni políticas.
 */
export async function correctMessage(conversationId: string, messageId: number, correction: string, actor: string) {
  return transaction(async (c) => {
    const { rows } = await c.query<{ id: number; role: string }>("select id, role from conversation_messages where id = $1 and conversation_id = $2", [messageId, conversationId])
    if (!rows[0] || rows[0].role !== "assistant") return null
    await c.query("update conversation_messages set flagged = true, correction = $2 where id = $1", [messageId, correction])
    const { rows: q } = await c.query<{ text: string }>(
      "select text from conversation_messages where conversation_id = $1 and id < $2 and role = 'user' order by id desc limit 1",
      [conversationId, messageId],
    )
    const question = (q[0]?.text ?? "").replace(/^\[sistema:[^\]]*\]\s*/g, "").trim().slice(0, 400) || "Consulta corregida"
    const { rows: faq } = await c.query<{ id: number }>(
      "insert into faqs (question, answer, category, active, source) values ($1, $2, 'Correcciones', true, 'correccion') returning id",
      [question, correction],
    )
    await audit(c, "conversacion", conversationId, "correccion", null, { messageId, faq: faq[0].id, correction }, actor)
    return faq[0].id
  })
}

export async function patientFromConversation(id: string, name: string, phone: string, actor: string) {
  return transaction(async (c) => {
    const patientId = await ensurePatient(c, { name, phone, source: "Chat" })
    await c.query("update conversations set patient_id = $2, contact_name = $3, phone = $4 where id = $1", [id, patientId, name, phone])
    await audit(c, "conversacion", id, "crear_paciente", null, { patientId }, actor)
    return patientId
  })
}
