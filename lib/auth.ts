export const SESSION_COOKIE = "eterna_admin"
export const SESSION_TTL_S = 7 * 24 * 3600

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

export async function createSessionToken(): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_S
  return `${exp}.${await hmac(`admin:${exp}`)}`
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false
  const [expRaw, sig] = token.split(".")
  const exp = Number(expRaw)
  if (!Number.isInteger(exp) || exp < Date.now() / 1000 || !sig) return false
  try {
    return safeEqual(sig, await hmac(`admin:${exp}`))
  } catch {
    return false
  }
}

export async function checkCredentials(user: string, password: string): Promise<boolean> {
  const u = process.env.ADMIN_USER
  const p = process.env.ADMIN_PASSWORD
  if (!u || !p) return false
  // compare digests so the comparison length doesn't leak the real lengths
  const [a, b, c, d] = await Promise.all([hmac(user), hmac(u), hmac(password), hmac(p)])
  return safeEqual(a, b) && safeEqual(c, d)
}
