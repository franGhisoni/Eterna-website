import { db, transaction } from "./db"
import { audit, phoneKey } from "./ledger"
import { DAY_RE } from "../time"

export const PATIENT_STATUSES = ["Nueva", "Activa", "Pausada", "Inactiva", "Finalizó", "Dejó", "Archivada"]

/** Solo los datos personales se editan a mano: sesiones, saldo y próximo turno salen de la agenda y los pagos. */
export type PatientInput = {
  name: string
  phone: string
  email: string
  gender: string
  treatments: string
  status: string
  source: string
  birth_date: string | null
  notes: string
  marketing_consent: boolean
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")
const day = (v: unknown) => (typeof v === "string" && DAY_RE.test(v) ? v : null)

export function parsePatient(body: Record<string, unknown>): PatientInput | null {
  const name = text(body.name, 160)
  if (!name) return null
  return {
    name,
    phone: text(body.phone, 40),
    email: text(body.email, 160),
    gender: text(body.gender, 20),
    treatments: text(body.treatments, 500),
    status: PATIENT_STATUSES.includes(body.status as string) ? (body.status as string) : "Activa",
    source: text(body.source, 80),
    birth_date: day(body.birth_date),
    notes: text(body.notes, 4000),
    marketing_consent: body.marketing_consent === true,
  }
}

const values = (p: PatientInput) => [p.name, p.phone, phoneKey(p.phone), p.email, p.gender, p.treatments, p.status, p.source, p.birth_date, p.notes, p.marketing_consent]

export async function createPatient(p: PatientInput): Promise<{ id: number } | { error: "telefono_existente"; id: number; name: string }> {
  return transaction(async (c) => {
    const key = phoneKey(p.phone)
    if (key.length >= 6) {
      const { rows } = await c.query<{ id: number; name: string }>("select id, name from patients where phone_key = $1 limit 1", [key])
      if (rows[0]) return { error: "telefono_existente", id: rows[0].id, name: rows[0].name } as const
    }
    const { rows } = await c.query<{ id: number }>(
      "insert into patients (name, phone, phone_key, email, gender, treatments, status, source, birth_date, notes, marketing_consent) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id",
      values(p),
    )
    await audit(c, "paciente", rows[0].id, "crear", null, p)
    return { id: rows[0].id }
  })
}

export async function updatePatient(id: number, p: PatientInput): Promise<boolean> {
  return transaction(async (c) => {
    const { rows: before } = await c.query("select name, phone, email, gender, treatments, status, source, birth_date, notes, marketing_consent from patients where id = $1", [id])
    if (!before[0]) return false
    await c.query(
      "update patients set name=$2, phone=$3, phone_key=$4, email=$5, gender=$6, treatments=$7, status=$8, source=$9, birth_date=$10, notes=$11, marketing_consent=$12 where id=$1",
      [id, ...values(p)],
    )
    // los datos de contacto del paciente se reflejan en sus turnos
    await c.query("update bookings set name = $2, phone = $3, email = $4 where patient_id = $1", [id, p.name, p.phone, p.email])
    await audit(c, "paciente", id, "modificar", before[0], p)
    return true
  })
}

/** Un paciente con turnos o pagos no se borra (se archiva), para no perder historial. */
export async function deletePatient(id: number): Promise<"ok" | "tiene_historial"> {
  return transaction(async (c) => {
    const { rows } = await c.query(
      "select (select count(*) from bookings where patient_id = $1)::int + (select count(*) from payments where patient_id = $1)::int as n",
      [id],
    )
    if (rows[0].n > 0) return "tiene_historial"
    const { rows: before } = await c.query("delete from patients where id = $1 returning *", [id])
    if (before[0]) await audit(c, "paciente", id, "eliminar", before[0], null)
    return "ok"
  })
}

export async function searchPatients(q: string) {
  const term = `%${q.trim().toLowerCase()}%`
  const digits = q.replace(/\D/g, "")
  const { rows } = await (await db()).query<{ id: number; name: string; phone: string }>(
    `select id, name, phone from patients where lower(name) like $1 ${digits.length >= 3 ? "or regexp_replace(phone, '[^0-9]', '', 'g') like $2" : ""} order by name limit 20`,
    digits.length >= 3 ? [term, `%${digits}%`] : [term],
  )
  return rows
}
