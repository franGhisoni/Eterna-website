import { NextResponse } from "next/server"
import { isAdmin, unauthorized } from "@/lib/server/http"
import { dashboard } from "@/lib/server/ledger"

export const dynamic = "force-dynamic"

export async function GET() {
  if (!(await isAdmin())) return unauthorized()
  return NextResponse.json(await dashboard())
}
