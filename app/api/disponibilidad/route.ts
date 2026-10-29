import { NextResponse, type NextRequest } from "next/server"
import { availableDays } from "@/lib/server/agenda"
import { getSettings } from "@/lib/server/settings"
import { todayAR } from "@/lib/time"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const month = req.nextUrl.searchParams.get("mes") ?? todayAR().slice(0, 7)
  try {
    const days = await availableDays(month, (await getSettings()).booking)
    return NextResponse.json({ month, days }, { headers: { "Cache-Control": "no-store" } })
  } catch (e) {
    console.error("disponibilidad:", e instanceof Error ? e.message : e)
    return NextResponse.json({ month, days: [] })
  }
}
