import { NextResponse, type NextRequest } from "next/server"
import { allowed } from "@/lib/server/auth-server"
import { badRequest, deny } from "@/lib/server/http"
import { addTaskComment, deleteRecord, ENTITIES, InvalidRecord, listRecords, saveRecord } from "@/lib/server/records"

export const dynamic = "force-dynamic"

type Ctx = { params: { entity: string } }

export async function GET(req: NextRequest, { params }: Ctx) {
  const entity = ENTITIES[params.entity]
  if (!entity) return badRequest("no_encontrado")
  const session = await allowed(entity.read)
  if (!session) return deny()
  const filters = Object.fromEntries(req.nextUrl.searchParams)
  // las tareas de una profesional: solo las suyas
  if (params.entity === "tareas" && session.role === "profesional") filters.assignee = session.professional || session.username
  return NextResponse.json({ items: await listRecords(params.entity, filters) })
}

async function save(req: NextRequest, { params }: Ctx) {
  const entity = ENTITIES[params.entity]
  if (!entity) return badRequest("no_encontrado")
  const session = await allowed(entity.write)
  if (!session) return deny()
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  try {
    if (params.entity === "tareas" && typeof body.comment === "string" && body.id) {
      const t = await addTaskComment(Number(body.id), body.comment, session.username)
      return t ? NextResponse.json({ item: t }) : badRequest("no_encontrado")
    }
    const item = await saveRecord(params.entity, body, session.username)
    return item ? NextResponse.json({ item }) : badRequest("no_encontrado")
  } catch (e) {
    if (e instanceof InvalidRecord) return badRequest(e.message)
    if (e instanceof Error && /duplicate key/.test(e.message)) return badRequest("ya_existe")
    throw e
  }
}

export const POST = save
export const PUT = save

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const entity = ENTITIES[params.entity]
  if (!entity) return badRequest("no_encontrado")
  const session = await allowed(entity.write)
  if (!session) return deny()
  const id = Number(req.nextUrl.searchParams.get("id"))
  if (!Number.isInteger(id)) return badRequest()
  return (await deleteRecord(params.entity, id, session.username)) ? NextResponse.json({ ok: true }) : badRequest("no_encontrado")
}
