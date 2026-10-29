import { NextResponse, type NextRequest } from "next/server"
import { badRequest, isAdmin, unauthorized } from "@/lib/server/http"
import { createPatient, deletePatient, listPatients, parsePatient, updatePatient } from "@/lib/server/patients"

export const dynamic = "force-dynamic"

export async function GET() {
  if (!(await isAdmin())) return unauthorized()
  return NextResponse.json({ patients: await listPatients() })
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return unauthorized()
  const p = parsePatient((await req.json().catch(() => ({}))) as Record<string, unknown>)
  if (!p) return badRequest()
  return NextResponse.json({ patient: await createPatient(p) })
}

export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) return unauthorized()
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const id = Number(body.id)
  const p = parsePatient(body)
  if (!Number.isInteger(id) || !p) return badRequest()
  const updated = await updatePatient(id, p)
  return updated ? NextResponse.json({ patient: updated }) : badRequest("no_encontrado")
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) return unauthorized()
  const id = Number(req.nextUrl.searchParams.get("id"))
  if (!Number.isInteger(id)) return badRequest()
  await deletePatient(id)
  return NextResponse.json({ ok: true })
}
