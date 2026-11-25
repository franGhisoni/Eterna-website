import { NextResponse, type NextRequest } from "next/server"
import { listServices } from "@/lib/server/agenda"
import { db, transaction } from "@/lib/server/db"
import { badRequest, can, deny } from "@/lib/server/http"
import { audit } from "@/lib/server/ledger"

export const dynamic = "force-dynamic"

type ServiceInput = {
  name: string
  description: string
  duration_min: number
  price: number
  deposit: number
  active: boolean
  sort: number
  category: string
  kind: string
  gender: string
  detail: string
  online: boolean
  visible_web: boolean
  audience: string
  equipment: string
  indications: string
  contraindications: string
  promo_price: number | null
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")

function parse(body: Record<string, unknown>): ServiceInput | null {
  const int = (v: unknown, min: number, max: number) => {
    const n = Math.round(Number(v))
    return Number.isFinite(n) && n >= min && n <= max ? n : null
  }
  const name = text(body.name, 120)
  const duration_min = int(body.duration_min, 5, 600)
  const price = int(body.price, 0, 100_000_000)
  const deposit = int(body.deposit, 0, 100_000_000)
  const sort = int(body.sort ?? 0, -10000, 10000)
  const promo = body.promo_price === null || body.promo_price === undefined || body.promo_price === "" ? null : int(body.promo_price, 0, 100_000_000)
  if (!name || duration_min === null || price === null || deposit === null || sort === null) return null
  return {
    name,
    description: text(body.description, 1000),
    duration_min,
    price,
    deposit,
    active: body.active !== false,
    sort,
    category: text(body.category, 80),
    kind: text(body.kind, 40),
    gender: text(body.gender, 40),
    detail: text(body.detail, 500),
    online: body.online !== false,
    visible_web: body.visible_web !== false,
    audience: text(body.audience, 200),
    equipment: text(body.equipment, 200),
    indications: text(body.indications, 3000),
    contraindications: text(body.contraindications, 3000),
    promo_price: promo,
  }
}

const COLS = "name, description, duration_min, price, deposit, active, sort, category, kind, gender, detail, online, visible_web, audience, equipment, indications, contraindications, promo_price"
const values = (s: ServiceInput) => [
  s.name, s.description, s.duration_min, s.price, s.deposit, s.active, s.sort, s.category, s.kind, s.gender, s.detail,
  s.online, s.visible_web, s.audience, s.equipment, s.indications, s.contraindications, s.promo_price,
]
const placeholders = (n: number, offset = 0) => Array.from({ length: n }, (_, i) => `$${i + 1 + offset}`).join(",")

export async function GET(req: NextRequest) {
  const session = await can("catalog")
  if (!session) return deny()
  const historyFor = Number(req.nextUrl.searchParams.get("historial"))
  if (historyFor) {
    // historial de precios: cada cambio de precio queda en la auditoría con quién y cuándo
    const { rows } = await (await db()).query(
      `select created_at, actor, before->>'price' as before_price, after->>'price' as after_price,
              before->>'promo_price' as before_promo, after->>'promo_price' as after_promo
       from audit_log where entity = 'servicio' and entity_id = $1 order by created_at desc limit 100`,
      [String(historyFor)],
    )
    return NextResponse.json({ history: rows.filter((r) => r.before_price !== r.after_price || r.before_promo !== r.after_promo) })
  }
  return NextResponse.json({ services: await listServices(false) })
}

export async function POST(req: NextRequest) {
  const session = await can("catalog_edit")
  if (!session) return deny()
  const s = parse((await req.json().catch(() => ({}))) as Record<string, unknown>)
  if (!s) return badRequest()
  const row = await transaction(async (c) => {
    const { rows } = await c.query(`insert into services (${COLS}) values (${placeholders(18)}) returning *`, values(s))
    await audit(c, "servicio", rows[0].id, "crear", null, rows[0], session.username)
    return rows[0]
  })
  return NextResponse.json({ service: row })
}

export async function PUT(req: NextRequest) {
  const session = await can("catalog_edit")
  if (!session) return deny()
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const id = Number(body.id)
  const s = parse(body)
  if (!Number.isInteger(id) || !s) return badRequest()
  const row = await transaction(async (c) => {
    const { rows: before } = await c.query("select * from services where id = $1 for update", [id])
    if (!before[0]) return null
    const sets = COLS.split(", ").map((col, i) => `${col}=$${i + 2}`).join(", ")
    const { rows } = await c.query(`update services set ${sets} where id=$1 returning *`, [id, ...values(s)])
    await audit(c, "servicio", id, "modificar", before[0], rows[0], session.username)
    return rows[0]
  })
  return row ? NextResponse.json({ service: row }) : badRequest("no_encontrado")
}

/** Un servicio con turnos no se borra: se desactiva, para conservar la historia. */
export async function DELETE(req: NextRequest) {
  const session = await can("catalog_edit")
  if (!session) return deny()
  const id = Number(req.nextUrl.searchParams.get("id"))
  if (!Number.isInteger(id)) return badRequest()
  const r = await transaction(async (c) => {
    const { rows } = await c.query("select count(*)::int as n from bookings where service_id = $1", [id])
    if (rows[0].n > 0) {
      await c.query("update services set active = false, online = false where id = $1", [id])
      await audit(c, "servicio", id, "desactivar", null, { motivo: "tenía turnos" }, session.username)
      return "desactivado"
    }
    const { rows: before } = await c.query("delete from services where id = $1 returning *", [id])
    if (before[0]) await audit(c, "servicio", id, "eliminar", before[0], null, session.username)
    return "eliminado"
  })
  return NextResponse.json({ ok: true, result: r })
}
