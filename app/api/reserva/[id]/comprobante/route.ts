import { createHash } from "node:crypto"
import { NextResponse, type NextRequest } from "next/server"
import { bookingState, getBooking, receiptAlreadyUsed, saveReceipt } from "@/lib/server/agenda"
import { clientIp, rateLimit } from "@/lib/server/http"
import { readReceipt } from "@/lib/server/receipts"
import { getSettings } from "@/lib/server/settings"

export const dynamic = "force-dynamic"
export const maxDuration = 90

const MAX_BYTES = 5 * 1024 * 1024

// the type comes from the file's own bytes, never from what the browser declares
function detectMime(b: Buffer): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg"
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png"
  if (b.length > 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "image/webp"
  if (b.length > 5 && b.toString("latin1", 0, 5) === "%PDF-") return "application/pdf"
  return null
}

const fail = (error: string, status: number) => NextResponse.json({ error }, { status })

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return fail("not_found", 404)
  if (!rateLimit(`receipt:${clientIp()}`, 10, 10 * 60_000)) return fail("demasiados_intentos", 429)
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES + 64 * 1024) return fail("archivo_grande", 413)
  const form = await req.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File) || file.size === 0) return fail("archivo_invalido", 400)
  if (file.size > MAX_BYTES) return fail("archivo_grande", 413)
  const data = Buffer.from(await file.arrayBuffer())
  const mime = detectMime(data)
  if (!mime) return fail("archivo_invalido", 400)

  const booking = await getBooking(params.id)
  if (!booking) return fail("not_found", 404)
  if (booking.status === "pending_review" || booking.status === "confirmed") return fail("already_sent", 409)
  if (bookingState(booking) !== "pending_payment") return fail("expired", 409)

  const sha256 = createHash("sha256").update(data).digest("hex")
  if (await receiptAlreadyUsed(sha256, booking.id)) return fail("comprobante_usado", 409)

  const { ai, transfer } = await getSettings()
  const verdict = transfer.alias || transfer.cbu ? await readReceipt({ name: file.name, mime, data }, { amount: booking.deposit, account: transfer }, ai.model) : null
  const askedForReview = form?.get("revision") === "1"
  const status = verdict?.result === "coincide" ? "confirmed" : !verdict || askedForReview ? "pending_review" : "pending_payment"

  const saved = await saveReceipt(booking.id, { name: file.name.slice(0, 160), mime, data, sha256, verdict }, status)
  if (saved === "already_sent") return fail("already_sent", 409)
  if (saved !== "ok") return fail("expired", 409)
  return NextResponse.json({ ok: true, result: verdict?.result ?? "sin_lectura", reason: verdict?.reason ?? "", status })
}
