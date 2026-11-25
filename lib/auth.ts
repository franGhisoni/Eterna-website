export const SESSION_COOKIE = "eterna_admin"
export const SESSION_TTL_S = 7 * 24 * 3600

export type Role = "owner" | "recepcion" | "profesional"
export type SessionInfo = { uid: number; username: string; role: Role; professional: string }

const enc = new TextEncoder()

function secret(): string {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 16) throw new Error("SESSION_SECRET falta o es muy corto (mínimo 16 caracteres)")
  return s
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data))
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("")
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const toB64 = (s: string) => {
  const bytes = enc.encode(s)
  let bin = ""
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")
}
const fromB64 = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"))
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

/** Token: exp.datos.firma. El usuario y el rol van firmados, así que no se pueden alterar desde el navegador. */
export async function createSessionToken(s: SessionInfo): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_S
  const data = toB64(JSON.stringify([s.uid, s.username, s.role, s.professional]))
  return `${exp}.${data}.${await hmac(`admin:${exp}:${data}`)}`
}

export async function readSessionToken(token: string | undefined): Promise<SessionInfo | null> {
  if (!token) return null
  const [expRaw, data, sig] = token.split(".")
  const exp = Number(expRaw)
  if (!Number.isInteger(exp) || exp < Date.now() / 1000 || !data || !sig) return null
  try {
    if (!safeEqual(sig, await hmac(`admin:${exp}:${data}`))) return null
    const [uid, username, role, professional] = JSON.parse(fromB64(data)) as [number, string, Role, string]
    return { uid, username, role, professional }
  } catch {
    return null
  }
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  return (await readSessionToken(token)) !== null
}

export async function checkCredentials(user: string, password: string): Promise<boolean> {
  const u = process.env.ADMIN_USER
  const p = process.env.ADMIN_PASSWORD
  if (!u || !p) return false
  // compare digests so the comparison length doesn't leak the real lengths
  const [a, b, c, d] = await Promise.all([hmac(user), hmac(u), hmac(password), hmac(p)])
  return safeEqual(a, b) && safeEqual(c, d)
}
