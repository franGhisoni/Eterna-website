import { NextResponse, type NextRequest } from "next/server"
import { listServices } from "@/lib/server/agenda"
import { db } from "@/lib/server/db"
import { badRequest, isAdmin, unauthorized } from "@/lib/server/http"

export const dynamic = "force-dynamic"

type ServiceInput = { name: string; description: string; duration_min: number; price: number; deposit: number; active: boolean; sort: number }

function parse(body: Record<string, unknown>): ServiceInput | null {
  const int = (v: unknown, min: number, max: number) => {
    const n = Math.round(Number(v))
    return Number.isFinite(n) && n >= min && n <= max ? n : null
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : ""
  const description = typeof body.description === "string" ? body.description.trim().slice(0, 1000) : ""
  const duration_min = int(body.duration_min, 5, 600)
  const price = int(body.price, 0, 100_000_000)
  const deposit = int(body.deposit, 0, 100_000_000)
  const sort = int(body.sort ?? 0, -1000, 1000)
  if (!name || duration_min === null || price === null || deposit === null || sort === null) return null
  return { name, description, duration_min, price, deposit, active: body.active !== false, sort }
}

export async function GET() {
  if (!(await isAdmin())) return unauthorized()
  return NextResponse.json({ services: await listServices(false) })
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return unauthorized()
  const s = parse((await req.json().catch(() => ({}))) as Record<string, unknown>)
  if (!s) return badRequest()
  const { rows } = await (await db()).query(
    "insert into services (name, description, duration_min, price, deposit, active, sort) values ($1,$2,$3,$4,$5,$6,$7) returning *",
    [s.name, s.description, s.duration_min, s.price, s.deposit, s.active, s.sort],
  )
  return NextResponse.json({ service: rows[0] })
}

export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) return unauthorized()
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const id = Number(body.id)
  const s = parse(body)
  if (!Number.isInteger(id) || !s) return badRequest()
  const { rows } = await (await db()).query(
    "update services set name=$2, description=$3, duration_min=$4, price=$5, deposit=$6, active=$7, sort=$8 where id=$1 returning *",
    [id, s.name, s.description, s.duration_min, s.price, s.deposit, s.active, s.sort],
  )
  return rows[0] ? NextResponse.json({ service: rows[0] }) : badRequest("no_encontrado")
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) return unauthorized()
  const id = Number(req.nextUrl.searchParams.get("id"))
  if (!Number.isInteger(id)) return badRequest()
  await (await db()).query("delete from services where id = $1", [id])
  return NextResponse.json({ ok: true })
}
