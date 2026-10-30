import { db } from "./db"
import { DAY_RE, todayAR } from "../time"

export type PromoKind = "percent" | "2x1" | "other"

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
}

export type PromoInput = Omit<Promo, "id">

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")
const day = (v: unknown) => (typeof v === "string" && DAY_RE.test(v) ? v : null)

export function parsePromo(body: Record<string, unknown>): PromoInput | null {
  const title = text(body.title, 120)
  const kind = (["percent", "2x1", "other"] as const).find((k) => k === body.kind)
  const percent = Math.round(Number(body.percent ?? 0))
  const sessions = Math.round(Number(body.sessions ?? 0))
  if (!title || !kind || !Number.isFinite(percent) || !Number.isFinite(sessions) || sessions < 0 || sessions > 1000) return null
  if (kind === "percent" && (percent < 1 || percent > 100)) return null
  const starts_on = day(body.starts_on)
  const ends_on = day(body.ends_on)
  if (starts_on && ends_on && ends_on < starts_on) return null
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
  }
}

const COLS = "title, description, kind, percent, sessions, category, starts_on, ends_on, active"
const values = (p: PromoInput) => [p.title, p.description, p.kind, p.percent, p.sessions, p.category, p.starts_on, p.ends_on, p.active]

export async function listPromos(): Promise<Promo[]> {
  const { rows } = await (await db()).query<Promo>("select * from promos order by active desc, id")
  return rows
}

export async function currentPromos(): Promise<Promo[]> {
  const today = todayAR()
  return (await listPromos()).filter((p) => p.active && (!p.starts_on || p.starts_on <= today) && (!p.ends_on || p.ends_on >= today))
}

export async function createPromo(p: PromoInput): Promise<Promo> {
  const { rows } = await (await db()).query<Promo>(`insert into promos (${COLS}) values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`, values(p))
  return rows[0]
}

export async function updatePromo(id: number, p: PromoInput): Promise<Promo | null> {
  const { rows } = await (await db()).query<Promo>(
    "update promos set title=$2, description=$3, kind=$4, percent=$5, sessions=$6, category=$7, starts_on=$8, ends_on=$9, active=$10 where id=$1 returning *",
    [id, ...values(p)],
  )
  return rows[0] ?? null
}

export async function deletePromo(id: number): Promise<void> {
  await (await db()).query("delete from promos where id = $1", [id])
}

export function promoSummary(p: Pick<Promo, "kind" | "percent" | "sessions">): string {
  const scope = p.sessions === 1 ? " en la primera sesión" : p.sessions > 1 ? ` en las primeras ${p.sessions} sesiones` : ""
  if (p.kind === "percent") return `${p.percent} % de descuento${scope}`
  if (p.kind === "2x1") return `2x1${scope}`
  return ""
}
