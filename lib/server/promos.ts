import type { PoolClient } from "pg"
import { db, transaction } from "./db"
import { DAY_RE, todayAR, weekdayOf } from "../time"

type Queryable = Pick<PoolClient, "query">

export type PromoKind = "percent" | "2x1" | "other"
export type PromoAudience = "todos" | "nuevos" | "existentes"

export type Promo = {
  id: number
  title: string
  description: string
  kind: PromoKind
  percent: number
  sessions: number
  category: string
  starts_on: string | null
  ends_on: string | null
  active: boolean
  chat_visible: boolean
  audience: PromoAudience
  max_uses: number
  per_patient: number
  stackable: boolean
  priority: number
  weekdays: string
  conditions: string
}

export type PromoInput = Omit<Promo, "id">

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")
const day = (v: unknown) => (typeof v === "string" && DAY_RE.test(v) ? v : null)
const int = (v: unknown, min: number, max: number) => {
  const n = Math.round(Number(v ?? 0))
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}

export function parsePromo(body: Record<string, unknown>): PromoInput | null {
  const title = text(body.title, 120)
  const kind = (["percent", "2x1", "other"] as const).find((k) => k === body.kind)
  const percent = int(body.percent, 0, 100)
  const sessions = int(body.sessions, 0, 1000)
  const maxUses = int(body.max_uses, 0, 100000)
  const perPatient = int(body.per_patient, 0, 1000)
  const priority = int(body.priority, -100, 100)
  if (!title || !kind || percent === null || sessions === null || maxUses === null || perPatient === null || priority === null) return null
  if (kind === "percent" && percent < 1) return null
  const starts_on = day(body.starts_on)
  const ends_on = day(body.ends_on)
  if (starts_on && ends_on && ends_on < starts_on) return null
  const weekdays = Array.isArray(body.weekdays) ? body.weekdays : typeof body.weekdays === "string" ? body.weekdays.split(",") : []
  return {
    title,
    description: text(body.description, 1000),
    kind,
    percent: kind === "percent" ? percent : 0,
    sessions,
    category: text(body.category, 80),
    starts_on,
    ends_on,
    active: body.active !== false,
    chat_visible: body.chat_visible !== false,
    audience: (["todos", "nuevos", "existentes"] as const).find((a) => a === body.audience) ?? "todos",
    max_uses: maxUses,
    per_patient: perPatient,
    stackable: body.stackable === true,
    priority,
    weekdays: Array.from(new Set(weekdays.map((w) => Number(w)).filter((w) => Number.isInteger(w) && w >= 0 && w <= 6))).sort().join(","),
    conditions: text(body.conditions, 2000),
  }
}

const COLS = "title, description, kind, percent, sessions, category, starts_on, ends_on, active, chat_visible, audience, max_uses, per_patient, stackable, priority, weekdays, conditions"
const values = (p: PromoInput) => [
  p.title, p.description, p.kind, p.percent, p.sessions, p.category, p.starts_on, p.ends_on, p.active,
  p.chat_visible, p.audience, p.max_uses, p.per_patient, p.stackable, p.priority, p.weekdays, p.conditions,
]

export type PromoWithStats = Promo & { uses: number; patients: number; revenue: number; state: "activa" | "pausada" | "programada" | "vencida" | "agotada" }

export function promoState(p: Promo & { uses?: number }, today = todayAR()): PromoWithStats["state"] {
  if (!p.active) return "pausada"
  if (p.ends_on && p.ends_on < today) return "vencida"
  if (p.starts_on && p.starts_on > today) return "programada"
  if (p.max_uses > 0 && (p.uses ?? 0) >= p.max_uses) return "agotada"
  return "activa"
}

export async function listPromos(): Promise<PromoWithStats[]> {
  const { rows } = await (await db()).query<PromoWithStats>(
    `select p.*,
       (select count(*) from bookings b where b.promo_id = p.id and b.status not in ('cancelled'))::int as uses,
       (select count(distinct b.patient_id) from bookings b where b.promo_id = p.id and b.status not in ('cancelled'))::int as patients,
       coalesce((select sum(coalesce(b.final_price, b.price)) from bookings b where b.promo_id = p.id and b.status not in ('cancelled','pending_payment','no_show')), 0)::int as revenue
     from promos p order by p.active desc, p.priority desc, p.id`,
  )
  return rows.map((p) => ({ ...p, state: promoState(p) }))
}

/** Promos vigentes hoy (activas, dentro de fechas y con cupo). */
export async function currentPromos(): Promise<PromoWithStats[]> {
  return (await listPromos()).filter((p) => p.state === "activa")
}

export type PromoContext = { phone: string; day: string; category: string }

/**
 * Verifica las reglas de una promo para una persona y un turno concretos.
 * Devuelve null si aplica, o el motivo por el que no aplica.
 */
export async function promoBlocker(p: PromoWithStats, ctx: PromoContext, q?: Queryable): Promise<string | null> {
  const c = q ?? (await db())
  if (promoState(p, ctx.day) !== "activa" && promoState(p) !== "activa") return "La promoción no está vigente"
  if (p.starts_on && ctx.day < p.starts_on) return `Rige desde el ${p.starts_on}`
  if (p.ends_on && ctx.day > p.ends_on) return `Venció el ${p.ends_on}`
  if (p.category && ctx.category && p.category !== ctx.category) return `Solo para ${p.category}`
  if (p.weekdays && !p.weekdays.split(",").map(Number).includes(weekdayOf(ctx.day))) return "No aplica ese día de la semana"
  if (p.max_uses > 0 && p.uses >= p.max_uses) return "Se agotaron los cupos"
  const key = ctx.phone.replace(/\D/g, "").slice(-8)
  const { rows } = key.length >= 6
    ? await c.query<{ id: number; created_at: Date; done: number; uses: number }>(
        `select p.id, p.created_at,
           (p.sessions_done + (select count(*) from bookings b where b.patient_id = p.id and b.status = 'done'))::int as done,
           (select count(*) from bookings b where b.patient_id = p.id and b.promo_id = $2 and b.status <> 'cancelled')::int as uses
         from patients p where p.phone_key = $1 limit 1`,
        [key, p.id],
      )
    : { rows: [] }
  const patient = rows[0]
  if (p.per_patient > 0 && patient && patient.uses >= p.per_patient) return "Ya usó esta promoción el máximo de veces"
  if (p.audience === "nuevos" && patient) {
    const months3 = Date.now() - new Date(patient.created_at).getTime() > 92 * 86400_000
    if (months3 && patient.done > 0) return "Es solo para pacientes nuevos (primeros tres meses)"
    if (p.sessions > 0 && patient.done >= p.sessions) return `Aplica a las primeras ${p.sessions} sesiones`
  }
  if (p.audience === "existentes" && (!patient || patient.done === 0)) return "Es solo para pacientes que ya se atienden en Eterna"
  return null
}

export async function createPromo(p: PromoInput, actor = "admin"): Promise<Promo> {
  return transaction(async (c) => {
    const { rows } = await c.query<Promo>(`insert into promos (${COLS}) values (${COLS.split(", ").map((_, i) => `$${i + 1}`).join(",")}) returning *`, values(p))
    await c.query("insert into audit_log (entity, entity_id, action, after, actor) values ('promocion', $1, 'crear', $2, $3)", [String(rows[0].id), JSON.stringify(rows[0]), actor])
    return rows[0]
  })
}

export async function updatePromo(id: number, p: PromoInput, actor = "admin"): Promise<Promo | null> {
  return transaction(async (c) => {
    const { rows: before } = await c.query("select * from promos where id = $1", [id])
    if (!before[0]) return null
    const sets = COLS.split(", ").map((col, i) => `${col}=$${i + 2}`).join(", ")
    const { rows } = await c.query<Promo>(`update promos set ${sets} where id=$1 returning *`, [id, ...values(p)])
    await c.query("insert into audit_log (entity, entity_id, action, before, after, actor) values ('promocion', $1, 'modificar', $2, $3, $4)", [String(id), JSON.stringify(before[0]), JSON.stringify(rows[0]), actor])
    return rows[0]
  })
}

/** Una promo que ya se usó no se borra (se pausa), para no perder de dónde salió cada precio. */
export async function deletePromo(id: number, actor = "admin"): Promise<"eliminada" | "pausada"> {
  return transaction(async (c) => {
    const { rows } = await c.query("select count(*)::int as n from bookings where promo_id = $1", [id])
    if (rows[0].n > 0) {
      await c.query("update promos set active = false where id = $1", [id])
      await c.query("insert into audit_log (entity, entity_id, action, actor) values ('promocion', $1, 'pausar', $2)", [String(id), actor])
      return "pausada"
    }
    const { rows: before } = await c.query("delete from promos where id = $1 returning *", [id])
    if (before[0]) await c.query("insert into audit_log (entity, entity_id, action, before, actor) values ('promocion', $1, 'eliminar', $2, $3)", [String(id), JSON.stringify(before[0]), actor])
    return "eliminada"
  })
}

export function promoSummary(p: Pick<Promo, "kind" | "percent" | "sessions">): string {
  const scope = p.sessions === 1 ? " en la primera sesión" : p.sessions > 1 ? ` en las primeras ${p.sessions} sesiones` : ""
  if (p.kind === "percent") return `${p.percent} % de descuento${scope}`
  if (p.kind === "2x1") return `2x1${scope}`
  return ""
}

const WEEKDAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"]

/** Texto de reglas para el asistente. */
export function promoRules(p: Promo): string {
  return [
    p.audience === "nuevos" ? "solo pacientes nuevos" : p.audience === "existentes" ? "solo pacientes que ya se atienden" : "",
    p.weekdays ? `solo los ${p.weekdays.split(",").map((d) => WEEKDAY_NAMES[Number(d)]).join(", ")}` : "",
    p.per_patient ? `máximo ${p.per_patient} por persona` : "",
    p.stackable ? "acumulable" : "no acumulable con otras promociones",
    p.conditions,
  ]
    .filter(Boolean)
    .join("; ")
}
