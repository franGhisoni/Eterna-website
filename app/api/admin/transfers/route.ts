import { NextResponse, type NextRequest } from "next/server"
import { listTransfers, reviewTransfer } from "@/lib/server/agenda"
import { badRequest, isAdmin, unauthorized } from "@/lib/server/http"

export const dynamic = "force-dynamic"

export async function GET() {
  if (!(await isAdmin())) return unauthorized()
  return NextResponse.json({ transfers: await listTransfers() })
}

export async function PATCH(req: NextRequest) {
  if (!(await isAdmin())) return unauthorized()
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; action?: unknown }
  if (typeof body.id !== "string" || (body.action !== "verify" && body.action !== "reject")) return badRequest()
  return (await reviewTransfer(body.id, body.action)) ? NextResponse.json({ ok: true }) : badRequest("no_encontrado")
}
