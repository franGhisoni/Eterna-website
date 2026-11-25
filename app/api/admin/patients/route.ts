import { NextResponse, type NextRequest } from "next/server"
import {badRequest, can, deny } from "@/lib/server/http"
import { listPatientSummaries, patientProfile, setTreatmentStatus, TREATMENT_STATUSES } from "@/lib/server/ledger"
import { createPatient, deletePatient, parsePatient, searchPatients, updatePatient } from "@/lib/server/patients"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const session = await can("patients")
  if (!session) return deny()
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
  const session = await can("patients_edit")
  if (!session) return deny()
  const p = parsePatient((await req.json().catch(() => ({}))) as Record<string, unknown>)
  if (!p) return badRequest()
  const r = await createPatient(p)
  if ("error" in r) return NextResponse.json(r, { status: 409 })
  return NextResponse.json({ id: r.id })
}

export async function PUT(req: NextRequest) {
  const session = await can("patients_edit")
  if (!session) return deny()
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const id = Number(body.id)
  // estado de un tratamiento puntual del paciente (activo, pausado, finalizado, abandonado)
  if (body.treatment && typeof body.treatment === "object") {
    const t = body.treatment as Record<string, unknown>
    if (!Number.isInteger(id) || typeof t.category !== "string" || !t.category.trim() || !TREATMENT_STATUSES.includes(t.status as string)) return badRequest()
    await setTreatmentStatus(id, t.category.trim().slice(0, 120), t.status as string, typeof t.notes === "string" ? t.notes.slice(0, 4000) : "", session.username)
    return NextResponse.json({ ok: true })
  }
  const p = parsePatient(body)
  if (!Number.isInteger(id) || !p) return badRequest()
  return (await updatePatient(id, p)) ? NextResponse.json({ ok: true }) : badRequest("no_encontrado")
}

export async function DELETE(req: NextRequest) {
  const session = await can("patients_edit")
  if (!session) return deny()
  const id = Number(req.nextUrl.searchParams.get("id"))
  if (!Number.isInteger(id)) return badRequest()
  const r = await deletePatient(id)
  return r === "ok" ? NextResponse.json({ ok: true }) : badRequest(r)
}
