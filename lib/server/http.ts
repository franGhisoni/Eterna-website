import { cookies, headers } from "next/headers"
import { NextResponse } from "next/server"
import { SESSION_COOKIE, verifySessionToken } from "../auth"

export async function isAdmin(): Promise<boolean> {
  return verifySessionToken(cookies().get(SESSION_COOKIE)?.value)
}

export const unauthorized = () => NextResponse.json({ error: "no_autorizado" }, { status: 401 })
export const badRequest = (error = "datos_invalidos") => NextResponse.json({ error }, { status: 400 })

export function publicBaseUrl(): string {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "")
  if (configured) return configured
  const railway = process.env.RAILWAY_PUBLIC_DOMAIN?.trim()
  if (railway) return `https://${railway}`
  const h = headers()
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000"
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  return `${proto}://${host}`
}

export function clientIp(): string {
  const h = headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local"
}

const buckets = new Map<string, { count: number; reset: number }>()

/** In-memory, per-process limiter: enough to stop casual abuse of the paid endpoints. */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs })
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k)
    return true
  }
  b.count++
  return b.count <= max
}
