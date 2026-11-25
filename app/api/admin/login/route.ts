import { NextResponse, type NextRequest } from "next/server"
import { checkCredentials, createSessionToken, SESSION_COOKIE, SESSION_TTL_S, type SessionInfo } from "@/lib/auth"
import { currentSession, login } from "@/lib/server/auth-server"
import { clientIp, rateLimit } from "@/lib/server/http"
import { audit } from "@/lib/server/ledger"
import { db } from "@/lib/server/db"

export const dynamic = "force-dynamic"

export async function GET() {
  const s = await currentSession().catch(() => null)
  return s ? NextResponse.json({ session: s }) : NextResponse.json({ error: "no_autorizado" }, { status: 401 })
}

export async function POST(req: NextRequest) {
  if (!rateLimit(`login:${clientIp()}`, 8, 15 * 60_000)) return NextResponse.json({ error: "demasiados_intentos" }, { status: 429 })
  const secret = process.env.SESSION_SECRET ?? ""
  if (!secret) return NextResponse.json({ error: "sin_configurar" }, { status: 503 })
  if (secret.length < 16) return NextResponse.json({ error: "secreto_corto" }, { status: 503 })
  const body = (await req.json().catch(() => ({}))) as { user?: unknown; password?: unknown }
  const user = typeof body.user === "string" ? body.user.trim().slice(0, 200) : ""
  const password = typeof body.password === "string" ? body.password.slice(0, 200) : ""
  if (!user || !password) return NextResponse.json({ error: "credenciales_invalidas" }, { status: 401 })

  // el usuario del servidor entra aunque la base no responda; los usuarios del panel necesitan la base
  let session: SessionInfo | null = null
  if (await checkCredentials(user, password)) session = { uid: 0, username: user, role: "owner", professional: "" }
  else {
    try {
      session = await login(user, password)
    } catch (e) {
      console.error("login: la base no respondió", e instanceof Error ? e.message : e)
      return NextResponse.json({ error: process.env.DATABASE_URL ? "base_no_disponible" : "sin_base" }, { status: 503 })
    }
  }
  if (!session) return NextResponse.json({ error: "credenciales_invalidas" }, { status: 401 })

  try {
    await audit(await db(), "acceso", session.username, "ingreso", null, { ip: clientIp() }, session.username)
  } catch (e) {
    console.error("login: no se pudo registrar el acceso", e instanceof Error ? e.message : e)
  }
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
