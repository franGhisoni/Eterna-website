import { NextResponse, type NextRequest } from "next/server"
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_S } from "@/lib/auth"
import { currentSession, login } from "@/lib/server/auth-server"
import { clientIp, rateLimit } from "@/lib/server/http"
import { audit } from "@/lib/server/ledger"
import { db } from "@/lib/server/db"

export const dynamic = "force-dynamic"

export async function GET() {
  const s = await currentSession()
  return s ? NextResponse.json({ session: s }) : NextResponse.json({ error: "no_autorizado" }, { status: 401 })
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`login:${clientIp()}`, 8, 15 * 60_000)) return NextResponse.json({ error: "demasiados_intentos" }, { status: 429 })
  if (!process.env.SESSION_SECRET) return NextResponse.json({ error: "sin_configurar" }, { status: 503 })
  const body = (await req.json().catch(() => ({}))) as { user?: unknown; password?: unknown }
  const user = typeof body.user === "string" ? body.user.trim().slice(0, 200) : ""
  const password = typeof body.password === "string" ? body.password.slice(0, 200) : ""
  const session = user && password ? await login(user, password) : null
  if (!session) return NextResponse.json({ error: "credenciales_invalidas" }, { status: 401 })
  await audit(await db(), "acceso", session.username, "ingreso", null, { ip: clientIp() }, session.username).catch(() => {})
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, await createSessionToken(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_S,
  })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 })
  return res
}
