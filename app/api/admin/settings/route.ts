import { NextResponse, type NextRequest } from "next/server"
import {badRequest, can, deny } from "@/lib/server/http"
import { mercadoPagoEnabled } from "@/lib/server/mercadopago"
import { getSettings, sanitizeSettings, saveSettings } from "@/lib/server/settings"

export const dynamic = "force-dynamic"

export async function GET() {
  const session = await can("agenda") ?? (await can("tasks"))
  if (!session) return deny()
  const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN ?? process.env.MERCADO_PAGO_ACCESS_TOKEN ?? ""
  return NextResponse.json({
    settings: await getSettings(),
    status: {
      openai: !!process.env.OPENAI_API_KEY,
      mercadoPago: mercadoPagoEnabled() ? (mpToken.startsWith("TEST-") ? "test" : "produccion") : "off",
      webhookSecret: !!(process.env.MERCADOPAGO_WEBHOOK_SECRET ?? process.env.MERCADO_PAGO_WEBHOOK_SECRET),
    },
  })
}

export async function PUT(req: NextRequest) {
  const session = await can("settings")
  if (!session) return deny()
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object") return badRequest()
  const next = sanitizeSettings(body, await getSettings())
  await saveSettings(next)
  return NextResponse.json({ settings: next })
}
