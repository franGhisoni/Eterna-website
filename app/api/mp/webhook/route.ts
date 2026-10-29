import { NextResponse, type NextRequest } from "next/server"
import { applyPayment, validWebhookSignature } from "@/lib/server/mercadopago"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { type?: string; topic?: string; data?: { id?: string | number } }
  const type = body.type ?? body.topic ?? req.nextUrl.searchParams.get("type") ?? req.nextUrl.searchParams.get("topic")
  const id = String(body.data?.id ?? req.nextUrl.searchParams.get("data.id") ?? req.nextUrl.searchParams.get("id") ?? "")
  if (type !== "payment" || !id) return NextResponse.json({ ok: true })
  if (!validWebhookSignature(req.headers.get("x-signature"), req.headers.get("x-request-id"), id)) {
    return NextResponse.json({ error: "firma_invalida" }, { status: 401 })
  }
  try {
    await applyPayment(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error("mp webhook:", e instanceof Error ? e.message : e)
    return NextResponse.json({ error: "reintentar" }, { status: 500 })
  }
}
