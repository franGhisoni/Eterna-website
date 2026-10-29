import { db } from "./db"
import { DAY_RE } from "../time"

export type Patient = {
  id: number
  name: string
  phone: string
  gender: string
  treatments: string
  sessions_done: number
  deposit: number
  balance: number
  status: string
  first_session: string | null
  last_session: string | null
  next_appointment: Date | null
  notes: string
  created_at: Date
}

export type PatientInput = Omit<Patient, "id" | "created_at">

export const PATIENT_STATUSES = ["Activa", "Pausada", "Dejó", "Finalizó"]

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "")
const int = (v: unknown) => {
  const n = Math.round(Number(v))
  return Number.isFinite(n) && n >= 0 && n <= 100_000_000 ? n : 0
}
const day = (v: unknown) => (typeof v === "string" && DAY_RE.test(v) ? v : null)

export function parsePatient(body: Record<string, unknown>): PatientInput | null {
  const name = text(body.name, 160)
  if (!name) return null
  const next = typeof body.next_appointment === "string" && body.next_appointment ? new Date(body.next_appointment) : null
  return {
    name,
    phone: text(body.phone, 40),
    gender: text(body.gender, 20),
    treatments: text(body.treatments, 500),
    sessions_done: int(body.sessions_done),
    deposit: int(body.deposit),
    balance: int(body.balance),
    status: PATIENT_STATUSES.includes(body.status as string) ? (body.status as string) : "Activa",
    first_session: day(body.first_session),
    last_session: day(body.last_session),
    next_appointment: next && !Number.isNaN(next.getTime()) ? next : null,
    notes: text(body.notes, 4000),
  }
}

const COLS = "name, phone, gender, treatments, sessions_done, deposit, balance, status, first_session, last_session, next_appointment, notes"
const values = (p: PatientInput) => [p.name, p.phone, p.gender, p.treatments, p.sessions_done, p.deposit, p.balance, p.status, p.first_session, p.last_session, p.next_appointment, p.notes]

export async function listPatients(): Promise<Patient[]> {
  const { rows } = await (await db()).query<Patient>("select * from patients order by (status = 'Activa') desc, name")
  return rows
}

export async function createPatient(p: PatientInput): Promise<Patient> {
  const { rows } = await (await db()).query<Patient>(`insert into patients (${COLS}) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`, values(p))
  return rows[0]
}

export async function updatePatient(id: number, p: PatientInput): Promise<Patient | null> {
  const { rows } = await (await db()).query<Patient>(
    `update patients set name=$2, phone=$3, gender=$4, treatments=$5, sessions_done=$6, deposit=$7, balance=$8, status=$9, first_session=$10, last_session=$11, next_appointment=$12, notes=$13 where id=$1 returning *`,
    [id, ...values(p)],
  )
  return rows[0] ?? null
}

export async function deletePatient(id: number): Promise<void> {
  await (await db()).query("delete from patients where id = $1", [id])
}
