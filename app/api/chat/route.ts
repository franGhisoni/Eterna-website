import { NextResponse, type NextRequest } from "next/server"
import { ChatError, runChat } from "@/lib/server/chat"
import { clientIp, publicBaseUrl, rateLimit } from "@/lib/server/http"
import { getSettings } from "@/lib/server/settings"

export const dynamic = "force-dynamic"
export const maxDuration = 120

const STATUS: Record<ChatError["code"], number> = { sin_modelo: 503, modelo_no_disponible: 502, sin_respuesta: 504 }

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { message?: unknown; previousResponseId?: unknown }
  const message = typeof body.message === "string" ? body.message.trim() : ""
  if (!message || message.length > 2000) return NextResponse.json({ ok: false, error: "mensaje_invalido" }, { status: 400 })
  const prev = typeof body.previousResponseId === "string" && /^resp_[A-Za-z0-9_-]{1,200}$/.test(body.previousResponseId) ? body.previousResponseId : undefined
  if (!rateLimit(`chat:${clientIp()}`, 40, 10 * 60_000)) return NextResponse.json({ ok: false, error: "demasiados_mensajes" }, { status: 429 })
  try {
    const settings = await getSettings()
    const r = await runChat(message, prev, settings, publicBaseUrl())
    return NextResponse.json({ ok: true, ...r }, { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    if (e instanceof ChatError) return NextResponse.json({ ok: false, error: e.code }, { status: STATUS[e.code] })
    console.error("chat:", e instanceof Error ? e.message : e)
    return NextResponse.json({ ok: false, error: "error_interno" }, { status: 500 })
  }
}
