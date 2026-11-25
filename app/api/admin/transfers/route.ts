import { NextResponse, type NextRequest } from "next/server"
import { listTransfers, reviewTransfer } from "@/lib/server/agenda"
import {badRequest, can, deny } from "@/lib/server/http"

export const dynamic = "force-dynamic"

export async function GET() {
  const session = await can("payments")
  if (!session) return deny()
  return NextResponse.json({ transfers: await listTransfers() })
}

export async function PATCH(req: NextRequest) {
  const session = await can("payments")
  if (!session) return deny()
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; action?: unknown }
  if (typeof body.id !== "string" || (body.action !== "verify" && body.action !== "reject")) return badRequest()
  return (await reviewTransfer(body.id, body.action)) ? NextResponse.json({ ok: true }) : badRequest("no_encontrado")
}
