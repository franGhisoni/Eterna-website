import { NextResponse, type NextRequest } from "next/server"
import { badRequest, can, deny } from "@/lib/server/http"
import { alerts, auditLog, backup, generateFollowUps, periodMetrics, reports, toCsv } from "@/lib/server/insights"
import { previewInstructions } from "@/lib/server/chat"
import { getSettings } from "@/lib/server/settings"
import { addDays, DAY_RE, todayAR } from "@/lib/time"

export const dynamic = "force-dynamic"

/**
 * ?vista=panel&desde&hasta   → alertas + indicadores del período (genera seguimientos pendientes)
 * ?vista=reportes&desde&hasta[&seccion=x&formato=csv]
 * ?vista=auditoria[&entidad&q]
 * ?vista=respaldo            → copia de seguridad en JSON
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const view = sp.get("vista") ?? "panel"
  const from = DAY_RE.test(sp.get("desde") ?? "") ? sp.get("desde")! : `${todayAR().slice(0, 7)}-01`
  const to = DAY_RE.test(sp.get("hasta") ?? "") ? sp.get("hasta")! : todayAR()
  if (to < from || to > addDays(from, 800)) return badRequest()

  if (view === "panel") {
    const session = await can("agenda")
    if (!session) return deny()
    const created = await generateFollowUps().catch((e) => {
      console.error("seguimientos:", e instanceof Error ? e.message : e)
      return 0
    })
    return NextResponse.json({ alerts: await alerts(), metrics: await periodMetrics(from, to), followUpsCreated: created })
  }

  if (view === "reportes") {
    const session = await can("reports")
    if (!session) return deny()
    const r = await reports(from, to)
    const section = sp.get("seccion") as keyof typeof r | null
    if (sp.get("formato") === "csv" && section && section in r) {
      const data = r[section]
      const rows = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [data as Record<string, unknown>]
      return new NextResponse(toCsv(rows), {
        headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="eterna-${String(section)}-${from}-a-${to}.csv"` },
      })
    }
    return NextResponse.json(r)
  }

  if (view === "auditoria") {
    const session = await can("audit")
    if (!session) return deny()
    return NextResponse.json({ items: await auditLog({ entity: sp.get("entidad") ?? undefined, q: sp.get("q") ?? undefined }) })
  }

  if (view === "respaldo") {
    const session = await can("settings")
    if (!session) return deny()
    return new NextResponse(JSON.stringify(await backup(), null, 1), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="eterna-respaldo-${todayAR()}.json"` },
    })
  }

  if (view === "asistente") {
    // vista previa de lo que sabe el asistente ahora mismo (precios, promos, FAQ, equipos, políticas)
    const session = await can("settings")
    if (!session) return deny()
    return NextResponse.json({ instructions: await previewInstructions(await getSettings()) })
  }

  return badRequest()
}
