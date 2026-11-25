import { NextResponse, type NextRequest } from "next/server"
import { db } from "@/lib/server/db"
import { badRequest, can, deny } from "@/lib/server/http"
import { createPromo, deletePromo, listPromos, parsePromo, updatePromo } from "@/lib/server/promos"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const session = await can("catalog")
  if (!session) return deny()
  const usedBy = Number(req.nextUrl.searchParams.get("usos"))
  if (usedBy) {
    // quién usó la promo y con qué turno
    const { rows } = await (await db()).query(
      `select b.id, b.name, b.patient_id, b.service_name, b.starts_at, b.status, coalesce(b.final_price, b.price) as final_price
       from bookings b where b.promo_id = $1 order by b.starts_at desc limit 300`,
      [usedBy],
    )
    return NextResponse.json({ uses: rows })
  }
  return NextResponse.json({ promos: await listPromos() })
}

export async function POST(req: NextRequest) {
  const session = await can("catalog_edit")
  if (!session) return deny()
  const p = parsePromo((await req.json().catch(() => ({}))) as Record<string, unknown>)
  if (!p) return badRequest()
  const created = await createPromo(p, session.username)
  return NextResponse.json({ promo: (await listPromos()).find((x) => x.id === created.id) })
}

export async function PUT(req: NextRequest) {
  const session = await can("catalog_edit")
  if (!session) return deny()
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const id = Number(body.id)
  const p = parsePromo(body)
  if (!Number.isInteger(id) || !p) return badRequest()
  const updated = await updatePromo(id, p, session.username)
  if (!updated) return badRequest("no_encontrado")
  return NextResponse.json({ promo: (await listPromos()).find((x) => x.id === id) })
}

export async function DELETE(req: NextRequest) {
  const session = await can("catalog_edit")
  if (!session) return deny()
  const id = Number(req.nextUrl.searchParams.get("id"))
  if (!Number.isInteger(id)) return badRequest()
  return NextResponse.json({ ok: true, result: await deletePromo(id, session.username) })
}
