import { NextResponse, type NextRequest } from "next/server"
import { submitReceipt } from "@/lib/server/agenda"
import { clientIp, rateLimit } from "@/lib/server/http"

export const dynamic = "force-dynamic"

const MAX_BYTES = 5 * 1024 * 1024

// the type comes from the file's own bytes, never from what the browser declares
function detectMime(b: Buffer): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg"
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png"
  if (b.length > 12 && b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "image/webp"
  if (b.length > 5 && b.toString("latin1", 0, 5) === "%PDF-") return "application/pdf"
  return null
}

const STATUS = { not_found: 404, expired: 409, already_sent: 409 } as const

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (!rateLimit(`receipt:${clientIp()}`, 10, 10 * 60_000)) return NextResponse.json({ error: "demasiados_intentos" }, { status: 429 })
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES + 64 * 1024) return NextResponse.json({ error: "archivo_grande" }, { status: 413 })
  const form = await req.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "archivo_invalido" }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "archivo_grande" }, { status: 413 })
  const data = Buffer.from(await file.arrayBuffer())
  const mime = detectMime(data)
  if (!mime) return NextResponse.json({ error: "archivo_invalido" }, { status: 400 })
  const result = await submitReceipt(params.id, { name: file.name.slice(0, 160), mime, data })
  if (result !== "ok") return NextResponse.json({ error: result }, { status: STATUS[result] })
  return NextResponse.json({ ok: true })
}
