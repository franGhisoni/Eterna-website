/**
 * Tablas administrativas simples (profesionales, equipos, preguntas frecuentes, tareas, bloqueos, usuarios)
 * con un mismo circuito: validar, guardar, dejar registro en la auditoría.
 */
import type { Permission } from "./auth-server"
import { hashPassword, ROLES } from "./auth-server"
import { db, transaction } from "./db"
import { audit } from "./ledger"
import { DAY_RE, TIME_RE } from "../time"

type FieldType = "text" | "longtext" | "bool" | "int" | "day" | "time" | "role" | "password" | "uuid" | "ref"
type Field = { type: FieldType; required?: boolean; max?: number }

type Entity = {
  table: string
  label: string
  fields: Record<string, Field>
  order: string
  read: Permission
  write: Permission
  /** columnas que nunca se devuelven */
  hidden?: string[]
}

export const ENTITIES: Record<string, Entity> = {
  profesionales: {
    table: "professionals",
    label: "profesional",
    fields: {
      name: { type: "text", required: true, max: 120 },
      phone: { type: "text", max: 40 },
      email: { type: "text", max: 160 },
      specialty: { type: "text", max: 160 },
      treatments: { type: "text", max: 500 },
      active: { type: "bool" },
      notes: { type: "longtext" },
    },
    order: "active desc, name",
    read: "agenda",
    write: "catalog_edit",
  },
  equipos: {
    table: "equipment",
    label: "equipo",
    fields: {
      name: { type: "text", required: true, max: 120 },
      model: { type: "text", max: 120 },
      treatments: { type: "text", max: 500 },
      status: { type: "text", max: 60 },
      notes: { type: "longtext" },
    },
    order: "name",
    read: "catalog",
    write: "catalog_edit",
  },
  faqs: {
    table: "faqs",
    label: "pregunta frecuente",
    fields: {
      question: { type: "text", required: true, max: 400 },
      answer: { type: "longtext" },
      category: { type: "text", max: 80 },
      active: { type: "bool" },
      sort: { type: "int" },
    },
    order: "active desc, category, sort, id",
    read: "inbox",
    write: "inbox",
  },
  tareas: {
    table: "tasks",
    label: "tarea",
    fields: {
      title: { type: "text", required: true, max: 200 },
      description: { type: "longtext" },
      kind: { type: "text", max: 60 },
      patient_id: { type: "ref" },
      booking_id: { type: "uuid" },
      conversation_id: { type: "uuid" },
      assignee: { type: "text", max: 120 },
      due_on: { type: "day" },
      done: { type: "bool" },
    },
    order: "done, due_on nulls last, id desc",
    read: "tasks",
    write: "tasks",
  },
  bloqueos: {
    table: "agenda_blocks",
    label: "bloqueo de agenda",
    fields: {
      day: { type: "day", required: true },
      start_time: { type: "time", required: true },
      end_time: { type: "time", required: true },
      professional: { type: "text", max: 120 },
      reason: { type: "text", max: 300 },
    },
    order: "day, start_time",
    read: "agenda",
    write: "agenda_edit",
  },
  usuarios: {
    table: "users",
    label: "usuario",
    fields: {
      username: { type: "text", required: true, max: 60 },
      name: { type: "text", max: 120 },
      role: { type: "role", required: true },
      password_hash: { type: "password" },
      professional: { type: "text", max: 120 },
      active: { type: "bool" },
    },
    order: "active desc, username",
    read: "users",
    write: "users",
    hidden: ["password_hash"],
  },
}

export class InvalidRecord extends Error {}

async function clean(entity: Entity, body: Record<string, unknown>, creating: boolean): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  for (const [key, f] of Object.entries(entity.fields)) {
    const raw = f.type === "password" ? body.password : body[key]
    if (raw === undefined) {
      if (creating && f.required) throw new InvalidRecord(`falta ${key}`)
      if (creating && f.type === "password") throw new InvalidRecord("falta la contraseña")
      continue
    }
    let v: unknown
    switch (f.type) {
      case "text":
      case "longtext":
        v = typeof raw === "string" ? raw.trim().slice(0, f.max ?? 5000) : ""
        if (f.required && !v) throw new InvalidRecord(`falta ${key}`)
        break
      case "bool":
        v = raw === true
        break
      case "int":
        v = Math.round(Number(raw)) || 0
        break
      case "ref":
        v = Number(raw) || null
        break
      case "uuid":
        v = typeof raw === "string" && /^[0-9a-f-]{36}$/i.test(raw) ? raw : null
        break
      case "day":
        v = typeof raw === "string" && DAY_RE.test(raw) ? raw : null
        if (f.required && !v) throw new InvalidRecord(`fecha inválida`)
        break
      case "time":
        if (typeof raw !== "string" || !TIME_RE.test(raw)) throw new InvalidRecord(`hora inválida`)
        v = raw
        break
      case "role":
        if (!ROLES.includes(raw as never)) throw new InvalidRecord("rol inválido")
        v = raw
        break
      case "password":
        if (typeof raw !== "string" || raw === "") continue
        if (raw.length < 8) throw new InvalidRecord("la contraseña debe tener al menos 8 caracteres")
        v = await hashPassword(raw)
        break
    }
    out[key] = v
  }
  if ("start_time" in out && "end_time" in out && String(out.end_time) <= String(out.start_time)) throw new InvalidRecord("el fin debe ser posterior al inicio")
  return out
}

const strip = (entity: Entity, row: Record<string, unknown>) => {
  const r = { ...row }
  for (const h of entity.hidden ?? []) delete r[h]
  return r
}

export async function listRecords(name: string, filters: Record<string, string> = {}) {
  const entity = ENTITIES[name]
  const where: string[] = []
  const params: unknown[] = []
  for (const [k, v] of Object.entries(filters)) {
    if (!(k in entity.fields) || v === "") continue
    params.push(entity.fields[k].type === "bool" ? v === "true" : v)
    where.push(`${k} = $${params.length}`)
  }
  const { rows } = await (await db()).query(`select * from ${entity.table} ${where.length ? `where ${where.join(" and ")}` : ""} order by ${entity.order} limit 1000`, params)
  return rows.map((r) => strip(entity, r))
}

export async function saveRecord(name: string, body: Record<string, unknown>, actor: string) {
  const entity = ENTITIES[name]
  const id = Number(body.id) || null
  const data = await clean(entity, body, !id)
  return transaction(async (c) => {
    if (id) {
      const { rows: before } = await c.query(`select * from ${entity.table} where id = $1`, [id])
      if (!before[0]) return null
      const keys = Object.keys(data)
      if (name === "tareas" && "done" in data) keys.push("done_at")
      const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(", ")
      const vals = keys.map((k) => (k === "done_at" ? (data.done ? new Date() : null) : data[k]))
      const { rows } = keys.length ? await c.query(`update ${entity.table} set ${sets} where id = $1 returning *`, [id, ...vals]) : { rows: before }
      await audit(c, entity.label, id, "modificar", strip(entity, before[0]), strip(entity, rows[0]), actor)
      return strip(entity, rows[0])
    }
    const keys = Object.keys(data)
    if (name === "tareas") {
      keys.push("created_by")
      data.created_by = actor
    }
    const { rows } = await c.query(`insert into ${entity.table} (${keys.join(", ")}) values (${keys.map((_, i) => `$${i + 1}`).join(", ")}) returning *`, keys.map((k) => data[k]))
    await audit(c, entity.label, rows[0].id, "crear", null, strip(entity, rows[0]), actor)
    return strip(entity, rows[0])
  })
}

export async function deleteRecord(name: string, id: number, actor: string) {
  const entity = ENTITIES[name]
  return transaction(async (c) => {
    // profesionales y usuarios no se borran: se dan de baja, para conservar quién hizo qué
    if (name === "profesionales" || name === "usuarios") {
      const { rows } = await c.query(`update ${entity.table} set active = false where id = $1 returning *`, [id])
      if (rows[0]) await audit(c, entity.label, id, "baja", null, strip(entity, rows[0]), actor)
      return rows.length > 0
    }
    const { rows } = await c.query(`delete from ${entity.table} where id = $1 returning *`, [id])
    if (rows[0]) await audit(c, entity.label, id, "eliminar", strip(entity, rows[0]), null, actor)
    return rows.length > 0
  })
}

export async function addTaskComment(id: number, text: string, actor: string) {
  const { rows } = await (await db()).query(
    `update tasks set comments = comments || $2::jsonb where id = $1 returning *`,
    [id, JSON.stringify([{ text: text.slice(0, 1000), by: actor, at: new Date().toISOString() }])],
  )
  return rows[0] ?? null
}
