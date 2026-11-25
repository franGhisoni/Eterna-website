import { NextResponse } from "next/server"
import { getReceipt } from "@/lib/server/agenda"
import {can, deny } from "@/lib/server/http"

export const dynamic = "force-dynamic"

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await can("payments")
  if (!session) return deny()
  const receipt = await getReceipt(params.id)
  if (!receipt) return NextResponse.json({ error: "no_encontrado" }, { status: 404 })
  return new NextResponse(new Uint8Array(receipt.data), {
    headers: {
      "Content-Type": receipt.mime,
      "Content-Disposition": `inline; filename="comprobante.${EXT[receipt.mime] ?? "bin"}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  })
}
