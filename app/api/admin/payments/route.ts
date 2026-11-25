import { NextResponse, type NextRequest } from "next/server"
import {badRequest, can, deny } from "@/lib/server/http"
import { addPayment, deletePayment, listPayments } from "@/lib/server/ledger"
import { getSettings } from "@/lib/server/settings"
import { DAY_RE } from "@/lib/time"

export const dynamic = "force-dynamic"

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")

export async function GET(req: NextRequest) {
  const session = await can("payments")
  if (!session) return deny()
  const sp = req.nextUrl.searchParams
  const from = sp.get("desde")
  const to = sp.get("hasta")
  const payments = await listPayments({
    from: from && DAY_RE.test(from) ? from : undefined,
    to: to && DAY_RE.test(to) ? to : undefined,
    patientId: Number(sp.get("paciente")) || undefined,
  })
  if (sp.get("formato") === "csv") {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`
    const lines = [
      ["Fecha", "Paciente", "Servicio", "Turno", "Concepto", "Medio", "Importe", "Registró", "Notas"].join(","),
      ...payments.map((p) =>
        [new Date(p.paid_at).toISOString(), p.patient_name, p.service_name, p.starts_at ? new Date(p.starts_at).toISOString() : "", p.concept, p.method, p.amount, p.created_by, p.notes]
          .map(esc)
          .join(","),
      ),
    ]
    return new NextResponse("﻿" + lines.join("\n"), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="movimientos-eterna.csv"` },
    })
  }
  return NextResponse.json({ payments })
}

export async function POST(req: NextRequest) {
  const session = await can("payments")
  if (!session) return deny()
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const amount = Math.round(Number(b.amount))
  const { payments } = await getSettings()
  const method = text(b.method, 60)
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000 || !method || !payments.methods.includes(method)) return badRequest()
  const bookingId = typeof b.bookingId === "string" && /^[0-9a-f-]{36}$/i.test(b.bookingId) ? b.bookingId : null
  const paidAt = typeof b.paidAt === "string" && b.paidAt ? new Date(b.paidAt) : null
  const p = await addPayment(
    {
    bookingId,
    patientId: Number(b.patientId) || null,
    amount,
    method,
    concept: text(b.concept, 60) || "Pago",
    notes: text(b.notes, 500),
    paidAt: paidAt && !Number.isNaN(paidAt.getTime()) ? paidAt : null,
  },
    session.username,
  )
  return p ? NextResponse.json({ payment: p }) : badRequest("no_encontrado")
}

export async function DELETE(req: NextRequest) {
  const session = await can("payments")
  if (!session) return deny()
  const id = Number(req.nextUrl.searchParams.get("id"))
  if (!Number.isInteger(id)) return badRequest()
  return (await deletePayment(id, session.username)) ? NextResponse.json({ ok: true }) : badRequest("no_encontrado")
}
