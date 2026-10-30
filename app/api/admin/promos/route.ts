import { NextResponse, type NextRequest } from "next/server"
import { badRequest, isAdmin, unauthorized } from "@/lib/server/http"
import { createPromo, deletePromo, listPromos, parsePromo, updatePromo } from "@/lib/server/promos"

export const dynamic = "force-dynamic"

export async function GET() {
  if (!(await isAdmin())) return unauthorized()
  return NextResponse.json({ promos: await listPromos() })
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return unauthorized()
  const p = parsePromo((await req.json().catch(() => ({}))) as Record<string, unknown>)
  if (!p) return badRequest()
  return NextResponse.json({ promo: await createPromo(p) })
}

export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) return unauthorized()
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const id = Number(body.id)
  const p = parsePromo(body)
  if (!Number.isInteger(id) || !p) return badRequest()
  const updated = await updatePromo(id, p)
  return updated ? NextResponse.json({ promo: updated }) : badRequest("no_encontrado")
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) return unauthorized()
  const id = Number(req.nextUrl.searchParams.get("id"))
  if (!Number.isInteger(id)) return badRequest()
  await deletePromo(id)
  return NextResponse.json({ ok: true })
}
