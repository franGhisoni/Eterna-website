/** Usuarios, roles y permisos del panel (solo servidor). */
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto"
import { promisify } from "node:util"
import { cookies } from "next/headers"
import { checkCredentials, readSessionToken, SESSION_COOKIE, type Role, type SessionInfo } from "../auth"
import { db } from "./db"

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>

export const ROLES: Role[] = ["owner", "recepcion", "profesional"]
export const ROLE_LABEL: Record<Role, string> = { owner: "Administración principal", recepcion: "Administración / recepción", profesional: "Profesional" }

/** Qué puede hacer cada rol. Un profesional ve su agenda y carga observaciones, pero no toca precios, promos ni caja. */
export const PERMISSIONS = {
  agenda: ["owner", "recepcion", "profesional"],
  agenda_edit: ["owner", "recepcion"],
  patients: ["owner", "recepcion", "profesional"],
  patients_edit: ["owner", "recepcion"],
  payments: ["owner", "recepcion"],
  catalog: ["owner", "recepcion"],
  catalog_edit: ["owner"],
  inbox: ["owner", "recepcion"],
  tasks: ["owner", "recepcion", "profesional"],
  reports: ["owner"],
  settings: ["owner"],
  users: ["owner"],
  audit: ["owner"],
} satisfies Record<string, Role[]>
export type Permission = keyof typeof PERMISSIONS

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const hash = await scrypt(password, salt, 32)
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, saltHex, hashHex] = stored.split("$")
  if (kind !== "scrypt" || !saltHex || !hashHex) return false
  const hash = await scrypt(password, Buffer.from(saltHex, "hex"), 32)
  const expected = Buffer.from(hashHex, "hex")
  return expected.length === hash.length && timingSafeEqual(expected, hash)
}

/**
 * Inicio de sesión: primero los usuarios del panel; el usuario de las variables de entorno
 * (ADMIN_USER / ADMIN_PASSWORD) siempre funciona como administración principal, para no quedar afuera.
 */
export async function login(username: string, password: string): Promise<SessionInfo | null> {
  if (await checkCredentials(username, password)) return { uid: 0, username, role: "owner", professional: "" }
  const { rows } = await (await db()).query<{ id: number; username: string; role: Role; password_hash: string; professional: string; active: boolean }>(
    "select id, username, role, password_hash, professional, active from users where lower(username) = lower($1)",
    [username],
  )
  const u = rows[0]
  if (!u || !u.active || !(await verifyPassword(password, u.password_hash))) return null
  await (await db()).query("update users set last_login = now() where id = $1", [u.id])
  return { uid: u.id, username: u.username, role: u.role, professional: u.professional }
}

export async function currentSession(): Promise<SessionInfo | null> {
  const s = await readSessionToken(cookies().get(SESSION_COOKIE)?.value)
  if (!s) return null
  if (s.uid === 0) return s
  // un usuario dado de baja pierde el acceso en el momento
  const { rows } = await (await db()).query<{ role: Role; active: boolean; professional: string }>("select role, active, professional from users where id = $1", [s.uid])
  if (!rows[0]?.active) return null
  return { ...s, role: rows[0].role, professional: rows[0].professional }
}

export async function allowed(permission: Permission): Promise<SessionInfo | null> {
  const s = await currentSession()
  return s && (PERMISSIONS[permission] as Role[]).includes(s.role) ? s : null
}
