import { NextResponse, type NextRequest } from "next/server"
import { checkCredentials, createSessionToken, SESSION_COOKIE, SESSION_TTL_S } from "@/lib/auth"
import { clientIp, rateLimit } from "@/lib/server/http"

export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  if (!rateLimit(`login:${clientIp()}`, 8, 15 * 60_000)) return NextResponse.json({ error: "demasiados_intentos" }, { status: 429 })
  if (!process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET) {
    return NextResponse.json({ error: "sin_configurar" }, { status: 503 })
  }
  const body = (await req.json().catch(() => ({}))) as { user?: unknown; password?: unknown }
  const user = typeof body.user === "string" ? body.user.slice(0, 200) : ""
  const password = typeof body.password === "string" ? body.password.slice(0, 200) : ""
  if (!(await checkCredentials(user, password))) return NextResponse.json({ error: "credenciales_invalidas" }, { status: 401 })
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), {
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
