import { NextResponse, type NextRequest } from "next/server"
import { badRequest, isAdmin, unauthorized } from "@/lib/server/http"
import { listPatientSummaries, patientProfile } from "@/lib/server/ledger"
import { createPatient, deletePatient, parsePatient, searchPatients, updatePatient } from "@/lib/server/patients"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) return unauthorized()
  const id = Number(req.nextUrl.searchParams.get("id"))
  if (id) {
    const profile = await patientProfile(id)
    return profile ? NextResponse.json(profile) : badRequest("no_encontrado")
  }
  const q = req.nextUrl.searchParams.get("q")
  if (q !== null) return NextResponse.json({ patients: await searchPatients(q) })
  return NextResponse.json({ patients: await listPatientSummaries() })
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return unauthorized()
  const p = parsePatient((await req.json().catch(() => ({}))) as Record<string, unknown>)
  if (!p) return badRequest()
  const r = await createPatient(p)
  if ("error" in r) return NextResponse.json(r, { status: 409 })
  return NextResponse.json({ id: r.id })
}

export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) return unauthorized()
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const id = Number(body.id)
  const p = parsePatient(body)
  if (!Number.isInteger(id) || !p) return badRequest()
  return (await updatePatient(id, p)) ? NextResponse.json({ ok: true }) : badRequest("no_encontrado")
}

export async function DELETE(req: NextRequest) {
  if (!(await isAdmin())) return unauthorized()
  const id = Number(req.nextUrl.searchParams.get("id"))
  if (!Number.isInteger(id)) return badRequest()
  const r = await deletePatient(id)
  return r === "ok" ? NextResponse.json({ ok: true }) : badRequest(r)
}
