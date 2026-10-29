import { NextResponse, type NextRequest } from "next/server"
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth"

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (pathname === "/admin/login" || pathname === "/api/admin/login") return NextResponse.next()
  if (await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next()
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "no_autorizado" }, { status: 401 })
  const url = req.nextUrl.clone()
  url.pathname = "/admin/login"
  url.search = ""
  return NextResponse.redirect(url)
}

export const config = { matcher: ["/admin/:path*", "/api/admin/:path*"] }
