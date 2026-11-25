import { NextResponse } from "next/server"
import {can, deny } from "@/lib/server/http"
import { dashboard } from "@/lib/server/ledger"

export const dynamic = "force-dynamic"

export async function GET() {
  const session = await can("agenda")
  if (!session) return deny()
  return NextResponse.json(await dashboard())
}
