import { NextResponse, type NextRequest } from "next/server"
import { ChatError, runChat } from "@/lib/server/chat"
import { conversationMessages, getConversation, logMessages, openConversation } from "@/lib/server/conversations"
import { clientIp, publicBaseUrl, rateLimit } from "@/lib/server/http"
import { getSettings } from "@/lib/server/settings"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const STATUS: Record<ChatError["code"], number> = { sin_modelo: 503, modelo_no_disponible: 502, sin_respuesta: 504 }
const UUID = /^[0-9a-f-]{36}$/i

/** Mensajes nuevos del equipo cuando una persona del centro tomó la conversación. */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("conversacion") ?? ""
  const after = Number(req.nextUrl.searchParams.get("desde")) || 0
  if (!UUID.test(id)) return NextResponse.json({ ok: false }, { status: 400 })
  if (!rateLimit(`chatpoll:${clientIp()}`, 400, 10 * 60_000)) return NextResponse.json({ ok: false }, { status: 429 })
  const conv = await getConversation(id)
  if (!conv) return NextResponse.json({ ok: false }, { status: 404 })
  // a la persona solo le llegan las respuestas del equipo de su propia conversación
  const messages = (await conversationMessages(id, after)).filter((m) => m.role === "staff").map((m) => ({ id: m.id, text: m.text }))
  return NextResponse.json({ ok: true, human: conv.human, messages, last: Math.max(after, ...messages.map((m) => m.id)) }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { message?: unknown; previousResponseId?: unknown; conversationId?: unknown }
  const message = typeof body.message === "string" ? body.message.trim() : ""
  if (!message || message.length > 2000) return NextResponse.json({ ok: false, error: "mensaje_invalido" }, { status: 400 })
  const prev = typeof body.previousResponseId === "string" && /^resp_[A-Za-z0-9_-]{1,200}$/.test(body.previousResponseId) ? body.previousResponseId : undefined
  if (!rateLimit(`chat:${clientIp()}`, 40, 10 * 60_000)) return NextResponse.json({ ok: false, error: "demasiados_mensajes" }, { status: 429 })
  let conversationId: string | undefined
  try {
    const conv = await openConversation(typeof body.conversationId === "string" ? body.conversationId : undefined)
    conversationId = conv.id
    await logMessages(conv.id, [{ role: "user", text: message }])
    // con una persona del equipo a cargo, el asistente no responde: el mensaje queda en la bandeja
    if (conv.human) return NextResponse.json({ ok: true, conversationId: conv.id, human: true, responseId: prev ?? conv.response_id ?? "", outputs: [] }, { headers: { "Cache-Control": "no-store" } })
    const settings = await getSettings()
    const r = await runChat(message, prev, settings, publicBaseUrl(), conv.id)
    await logMessages(conv.id, r.outputs.map((o) => ("card" in o ? { role: "assistant" as const, card: o.card } : { role: "assistant" as const, text: o.text })), r.responseId)
    return NextResponse.json({ ok: true, conversationId: conv.id, ...r }, { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    if (e instanceof ChatError) return NextResponse.json({ ok: false, conversationId, error: e.code }, { status: STATUS[e.code] })
    console.error("chat:", e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false, conversationId, error: "error_interno" }, { status: 500 })
  }
}
