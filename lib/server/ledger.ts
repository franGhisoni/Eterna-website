/**
 * Núcleo integrado: pacientes, turnos y pagos viven en las mismas tablas.
 * Un turno se crea igual desde la web, el chat, la agenda o la ficha del paciente,
 * y el saldo siempre se calcula como precio final − pagos registrados (nunca se escribe a mano).
 */
import type { PoolClient } from "pg"
import { BLOCKING, type Booking } from "./agenda"
import { db, transaction } from "./db"
import type { Promo } from "./promos"
import { getSettings } from "./settings"
import { todayAR } from "../time"

type Queryable = Pick<PoolClient, "query">

export const phoneKey = (phone: string) => phone.replace(/\D/g, "").slice(-8)

export const ADMIN_STATUSES = ["reserved", "pending_payment", "confirmed", "done", "no_show", "cancelled"] as const
export type AdminStatus = (typeof ADMIN_STATUSES)[number]

export type PayStatus = "sin_cargo" | "sin_sena" | "sena_pendiente" | "sena_abonada" | "pago_parcial" | "pagado"

export type AgendaItem = Booking & {
  patient_id: number | null
  source: string
  zones: string
  professional: string
  promo_id: number | null
  promo_title: string
  discount: number
  final_price: number
  paid: number
  balance: number
  pay_status: PayStatus
  /** seña que figura como PENDIENTE hasta que se registre cuánto se pagó y cuándo */
  deposit_pending: number
  rescheduled: number
  has_receipt: boolean
  state: string
}

export function payStatus(final: number, deposit: number, paid: number): PayStatus {
  if (final <= 0) return paid > 0 ? "pagado" : "sin_cargo"
  if (paid >= final) return "pagado"
  if (paid <= 0) return deposit > 0 ? "sena_pendiente" : "sin_sena"
  if (deposit > 0 && paid >= deposit) return "sena_abonada"
  return "pago_parcial"
}

/** Precio final de un turno según la promoción: se calcula una vez y queda congelado en el turno. */
export function priceWithPromo(price: number, promo: Pick<Promo, "kind" | "percent"> | null | undefined): { discount: number; final: number } {
  if (!promo || price <= 0) return { discount: 0, final: price }
  if (promo.kind === "percent" && promo.percent > 0) {
    const discount = Math.round((price * promo.percent) / 100)
    return { discount, final: price - discount }
  }
  return { discount: 0, final: price }
}

export async function audit(q: Queryable, entity: string, entityId: string | number, action: string, before: unknown, after: unknown, actor = "admin") {
  await q.query("insert into audit_log (entity, entity_id, action, before, after, actor) values ($1, $2, $3, $4, $5, $6)", [
    entity,
    String(entityId),
    action,
    before === undefined || before === null ? null : JSON.stringify(before),
    after === undefined || after === null ? null : JSON.stringify(after),
    actor,
  ])
}

async function event(q: Queryable, bookingId: string, kind: string, detail: Record<string, unknown>, actor: string) {
  await q.query("insert into booking_events (booking_id, kind, detail, actor) values ($1, $2, $3, $4)", [bookingId, kind, JSON.stringify(detail), actor])
}

/* ───────────── Pacientes ───────────── */

export async function findPatientByPhone(phone: string, q?: Queryable): Promise<{ id: number; name: string } | null> {
  const key = phoneKey(phone)
  if (key.length < 6) return null
  const { rows } = await (q ?? (await db())).query<{ id: number; name: string }>("select id, name from patients where phone_key = $1 order by id limit 1", [key])
  return rows[0] ?? null
}

/** Devuelve la ficha de la persona (por teléfono) o la crea. Nunca duplica a alguien que ya existe. */
export async function ensurePatient(q: Queryable, p: { name: string; phone: string; email?: string; source: string }): Promise<number> {
  const existing = await findPatientByPhone(p.phone, q)
  if (existing) return existing.id
  const { rows } = await q.query<{ id: number }>(
    "insert into patients (name, phone, email, phone_key, source, status) values ($1, $2, $3, $4, $5, 'Activa') returning id",
    [p.name, p.phone, p.email ?? "", phoneKey(p.phone), p.source],
  )
  return rows[0].id
}

/** Vincula un turno con su paciente (creándolo si hace falta). Se llama cuando el turno queda firme. */
export async function linkBookingPatient(q: Queryable, bookingId: string): Promise<number | null> {
  const { rows } = await q.query<{ patient_id: number | null; name: string; phone: string; email: string; source: string }>(
    "select patient_id, name, phone, email, source from bookings where id = $1",
    [bookingId],
  )
  const b = rows[0]
  if (!b) return null
  if (b.patient_id) return b.patient_id
  if (phoneKey(b.phone).length < 6) return null
  const id = await ensurePatient(q, { name: b.name, phone: b.phone, email: b.email, source: b.source === "chat" ? "Chat" : "Web" })
  await q.query("update bookings set patient_id = $2 where id = $1", [bookingId, id])
  await q.query("update payments set patient_id = $2 where booking_id = $1 and patient_id is null", [bookingId, id])
  return id
}

/* ───────────── Agenda ───────────── */

const AGENDA_SELECT = `
  select b.*,
    coalesce(b.final_price, b.price) as final_price,
    coalesce((select sum(amount) from payments p where p.booking_id = b.id), 0)::int as paid,
    (select count(*) from booking_events e where e.booking_id = b.id and e.kind = 'reprogramado')::int as rescheduled,
    exists (select 1 from booking_receipts r where r.booking_id = b.id) as has_receipt
  from bookings b`

/** Estados en los que la seña se espera: figura pendiente hasta que se registre el pago (monto, medio y fecha). */
export const DEPOSIT_TRACKED_STATUSES = ["reserved", "confirmed", "done", "conflict"]

function decorate(b: AgendaItem): AgendaItem {
  const final = b.final_price ?? b.price
  const expired = b.status === "pending_payment" && (!b.expires_at || new Date(b.expires_at) <= new Date())
  const pending = DEPOSIT_TRACKED_STATUSES.includes(b.status) && b.deposit > 0 && b.paid < b.deposit ? b.deposit - b.paid : 0
  return {
    ...b,
    final_price: final,
    // el saldo se calcula SOLO con pagos registrados: la seña no se descuenta hasta que se carga
    balance: Math.max(0, final - b.paid),
    pay_status: payStatus(final, b.deposit, b.paid),
    deposit_pending: pending,
    state: expired ? "expired" : b.status,
  }
}

export async function listAgenda(opts: { from?: string; to?: string; patientId?: number; limit?: number }): Promise<AgendaItem[]> {
  const where: string[] = []
  const params: unknown[] = []
  if (opts.from) {
    params.push(`${opts.from}T00:00:00-03:00`)
    where.push(`b.starts_at >= $${params.length}`)
  }
  if (opts.to) {
    params.push(`${opts.to}T23:59:59-03:00`)
    where.push(`b.starts_at <= $${params.length}`)
  }
  if (opts.patientId) {
    params.push(opts.patientId)
    where.push(`b.patient_id = $${params.length}`)
  }
  const order = opts.patientId ? "b.starts_at desc" : "b.starts_at"
  const { rows } = await (await db()).query<AgendaItem>(
    `${AGENDA_SELECT} ${where.length ? `where ${where.join(" and ")}` : ""} order by ${order} limit ${Math.min(opts.limit ?? 1000, 2000)}`,
    params,
  )
  return rows.map(decorate)
}

export async function getAgendaItem(id: string, q?: Queryable): Promise<AgendaItem | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const { rows } = await (q ?? (await db())).query<AgendaItem>(`${AGENDA_SELECT} where b.id = $1`, [id])
  return rows[0] ? decorate(rows[0]) : null
}

/** Turnos que ocupan el mismo horario (descontando el propio). */
async function overlapping(q: Queryable, start: Date, end: Date, exceptId: string | null, professional: string) {
  const { rows } = await q.query<{ id: string; name: string; professional: string }>(
    `select id, name, professional from bookings where ${BLOCKING} and starts_at < $2 and ends_at > $1 and ($3::uuid is null or id <> $3::uuid)`,
    [start, end, exceptId],
  )
  // con profesional asignado, solo choca con turnos del mismo profesional o sin profesional
  return professional ? rows.filter((r) => !r.professional || r.professional === professional) : rows
}

export type AppointmentInput = {
  patientId: number | null
  patient?: { name: string; phone: string; email: string }
  serviceId: number | null
  serviceName: string
  start: Date
  durationMin: number
  zones: string
  professional: string
  promoId: number | null
  price: number
  finalPrice: number | null
  deposit: number
  notes: string
  status: AdminStatus
  source: "admin" | "paciente" | "web" | "chat"
  allowOverlap: boolean
}

export type AppointmentResult = { ok: true; booking: AgendaItem } | { ok: false; error: "horario_ocupado"; with: string[] } | { ok: false; error: "paciente_invalido" }

/** Crea un turno: es el mismo camino para la agenda y para "Agregar sesión" desde el paciente. */
export async function createAppointment(input: AppointmentInput, actor = "admin"): Promise<AppointmentResult> {
  const { booking: rules } = await getSettings()
  return transaction(async (c) => {
    await c.query("select pg_advisory_xact_lock(424242)")
    let patientId = input.patientId
    if (!patientId && input.patient && input.patient.name.trim()) {
      patientId = input.patient.phone && phoneKey(input.patient.phone).length >= 6
        ? await ensurePatient(c, { ...input.patient, source: "Administración" })
        : (await c.query<{ id: number }>("insert into patients (name, phone, email, source, status) values ($1, $2, $3, 'Administración', 'Activa') returning id", [input.patient.name, input.patient.phone, input.patient.email])).rows[0].id
    }
    if (!patientId) return { ok: false, error: "paciente_invalido" } as const
    const { rows: pr } = await c.query<{ name: string; phone: string; email: string }>("select name, phone, email from patients where id = $1", [patientId])
    if (!pr[0]) return { ok: false, error: "paciente_invalido" } as const

    const end = new Date(input.start.getTime() + input.durationMin * 60_000)
    if (!input.allowOverlap && input.status !== "cancelled") {
      const clash = await overlapping(c, input.start, end, null, input.professional)
      if (clash.length >= rules.capacity) return { ok: false, error: "horario_ocupado", with: clash.map((x) => x.name) } as const
    }

    const promo = input.promoId ? (await c.query<Promo>("select * from promos where id = $1", [input.promoId])).rows[0] : undefined
    const computed = priceWithPromo(input.price, promo)
    const final = input.finalPrice ?? computed.final
    const { rows } = await c.query<{ id: string }>(
      `insert into bookings (service_id, service_name, starts_at, ends_at, name, phone, email, notes, status, price, deposit,
         patient_id, source, zones, professional, promo_id, promo_title, discount, final_price, expires_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,null) returning id`,
      [
        input.serviceId,
        input.serviceName,
        input.start,
        end,
        pr[0].name,
        pr[0].phone,
        pr[0].email,
        input.notes,
        input.status === "pending_payment" ? "reserved" : input.status,
        input.price,
        input.deposit,
        patientId,
        input.source,
        input.zones,
        input.professional,
        promo?.id ?? null,
        promo?.title ?? "",
        Math.max(0, input.price - final),
        final,
      ],
    )
    const id = rows[0].id
    await event(c, id, "creado", { origen: input.source }, actor)
    await audit(c, "turno", id, "crear", null, { ...input, finalPrice: final }, actor)
    return { ok: true, booking: (await getAgendaItem(id, c))! } as const
  })
}

export type AppointmentPatch = Partial<{
  start: Date
  durationMin: number
  serviceId: number | null
  serviceName: string
  zones: string
  professional: string
  notes: string
  finalPrice: number
  price: number
  deposit: number
  promoId: number | null
  status: AdminStatus
  allowOverlap: boolean
}>

export async function updateAppointment(id: string, patch: AppointmentPatch, actor = "admin"): Promise<AppointmentResult | { ok: false; error: "no_encontrado" }> {
  const { booking: rules } = await getSettings()
  return transaction(async (c) => {
    await c.query("select pg_advisory_xact_lock(424242)")
    const before = await getAgendaItem(id, c)
    if (!before) return { ok: false, error: "no_encontrado" } as const

    const start = patch.start ?? new Date(before.starts_at)
    const duration = patch.durationMin ?? Math.round((new Date(before.ends_at).getTime() - new Date(before.starts_at).getTime()) / 60_000)
    const end = new Date(start.getTime() + duration * 60_000)
    const professional = patch.professional ?? before.professional
    const status = patch.status ?? (before.status as AdminStatus)
    const moved = start.getTime() !== new Date(before.starts_at).getTime() || end.getTime() !== new Date(before.ends_at).getTime()
    const reopening = before.status === "cancelled" && status !== "cancelled"

    if ((moved || reopening || professional !== before.professional) && status !== "cancelled" && !patch.allowOverlap) {
      const clash = await overlapping(c, start, end, id, professional)
      if (clash.length >= rules.capacity) return { ok: false, error: "horario_ocupado", with: clash.map((x) => x.name) } as const
    }

    let promoId = before.promo_id
    let promoTitle = before.promo_title
    let price = patch.price ?? before.price
    let finalPrice = patch.finalPrice ?? before.final_price
    if (patch.promoId !== undefined && patch.promoId !== before.promo_id) {
      const promo = patch.promoId ? (await c.query<Promo>("select * from promos where id = $1", [patch.promoId])).rows[0] : undefined
      promoId = promo?.id ?? null
      promoTitle = promo?.title ?? ""
      if (patch.finalPrice === undefined) finalPrice = priceWithPromo(price, promo).final
    } else if (patch.price !== undefined && patch.finalPrice === undefined && patch.price !== before.price) {
      finalPrice = price - before.discount
    }
    price = Math.max(0, price)
    finalPrice = Math.max(0, finalPrice)

    await c.query(
      `update bookings set starts_at=$2, ends_at=$3, service_id=$4, service_name=$5, zones=$6, professional=$7, notes=$8,
         price=$9, final_price=$10, discount=$11, deposit=$12, promo_id=$13, promo_title=$14, status=$15,
         expires_at = case when $15 = 'pending_payment' then expires_at else null end, updated_at = now()
       where id = $1`,
      [
        id,
        start,
        end,
        patch.serviceId !== undefined ? patch.serviceId : before.service_id,
        patch.serviceName ?? before.service_name,
        patch.zones ?? before.zones,
        professional,
        patch.notes ?? before.notes,
        price,
        finalPrice,
        Math.max(0, price - finalPrice),
        patch.deposit ?? before.deposit,
        promoId,
        promoTitle,
        status,
      ],
    )
    if (moved) await event(c, id, "reprogramado", { antes: before.starts_at, despues: start.toISOString() }, actor)
    if (status !== before.status) await event(c, id, "estado", { antes: before.status, despues: status }, actor)
    if (status === "confirmed" || status === "done") await linkBookingPatient(c, id)
    const after = (await getAgendaItem(id, c))!
    await audit(c, "turno", id, "modificar", pick(before), pick(after), actor)
    return { ok: true, booking: after } as const
  })
}

const pick = (b: AgendaItem) => ({
  starts_at: b.starts_at,
  ends_at: b.ends_at,
  service_name: b.service_name,
  zones: b.zones,
  professional: b.professional,
  status: b.status,
  price: b.price,
  final_price: b.final_price,
  deposit: b.deposit,
  promo_title: b.promo_title,
  notes: b.notes,
})

export async function bookingHistory(id: string) {
  const { rows } = await (await db()).query<{ kind: string; detail: Record<string, unknown>; actor: string; created_at: Date }>(
    "select kind, detail, actor, created_at from booking_events where booking_id = $1 order by created_at",
    [id],
  )
  return rows
}

/* ───────────── Pagos ───────────── */

export type Payment = {
  id: number
  booking_id: string | null
  patient_id: number | null
  amount: number
  method: string
  concept: string
  origin: string
  notes: string
  paid_at: Date
  created_by: string
  created_at: Date
}

export const PAYMENT_CONCEPTS = ["Seña", "Pago parcial", "Pago total", "Saldo", "Otro"]

export async function addPayment(
  input: { bookingId: string | null; patientId: number | null; amount: number; method: string; concept: string; notes: string; paidAt: Date | null },
  actor = "admin",
): Promise<Payment | null> {
  return transaction(async (c) => {
    let patientId = input.patientId
    if (input.bookingId) {
      const { rows } = await c.query<{ patient_id: number | null; status: string }>("select patient_id, status from bookings where id = $1 for update", [input.bookingId])
      if (!rows[0]) return null
      patientId = rows[0].patient_id ?? (await linkBookingPatient(c, input.bookingId))
      // una seña cobrada a mano asegura el turno: deja de vencer
      if (rows[0].status === "pending_payment") await c.query("update bookings set status = 'confirmed', expires_at = null where id = $1", [input.bookingId])
    }
    if (!patientId && !input.bookingId) return null
    const { rows } = await c.query<Payment>(
      `insert into payments (booking_id, patient_id, amount, method, concept, notes, paid_at, created_by, origin)
       values ($1, $2, $3, $4, $5, $6, coalesce($7, now()), $8, 'manual') returning *`,
      [input.bookingId, patientId, input.amount, input.method, input.concept, input.notes, input.paidAt, actor],
    )
    if (input.bookingId) await event(c, input.bookingId, "pago", { importe: input.amount, medio: input.method, concepto: input.concept }, actor)
    await audit(c, "pago", rows[0].id, "registrar", null, rows[0], actor)
    return rows[0]
  })
}

export async function deletePayment(id: number, actor = "admin"): Promise<boolean> {
  return transaction(async (c) => {
    const { rows } = await c.query<Payment>("delete from payments where id = $1 returning *", [id])
    if (!rows[0]) return false
    if (rows[0].booking_id) await event(c, rows[0].booking_id, "pago_anulado", { importe: rows[0].amount, medio: rows[0].method }, actor)
    await audit(c, "pago", id, "anular", rows[0], null, actor)
    return true
  })
}

/** Corrige un pago cargado a mano (importe, medio, concepto, fecha o notas). Queda en la auditoría con el valor anterior. */
export async function updatePayment(
  id: number,
  patch: Partial<{ amount: number; method: string; concept: string; notes: string; paidAt: Date }>,
  actor = "admin",
): Promise<Payment | null> {
  return transaction(async (c) => {
    const { rows: before } = await c.query<Payment>("select * from payments where id = $1 for update", [id])
    if (!before[0]) return null
    const b = before[0]
    const { rows } = await c.query<Payment>(
      "update payments set amount = $2, method = $3, concept = $4, notes = $5, paid_at = $6 where id = $1 returning *",
      [id, patch.amount ?? b.amount, patch.method ?? b.method, patch.concept ?? b.concept, patch.notes ?? b.notes, patch.paidAt ?? b.paid_at],
    )
    if (b.booking_id) await event(c, b.booking_id, "pago_corregido", { antes: b.amount, despues: rows[0].amount, medio: rows[0].method }, actor)
    await audit(c, "pago", id, "corregir", b, rows[0], actor)
    return rows[0]
  })
}

/** Registra un cobro que llegó por un canal automático (Mercado Pago o comprobante). Idempotente. */
export async function recordAutomaticPayment(q: Queryable, bookingId: string, amount: number, method: string, origin: "mercadopago" | "comprobante", ref: string) {
  const patientId = await linkBookingPatient(q, bookingId)
  await q.query(
    `insert into payments (booking_id, patient_id, amount, method, concept, origin, external_ref, created_by)
     values ($1, $2, $3, $4, 'Seña', $5, $6, 'sistema') on conflict do nothing`,
    [bookingId, patientId, Math.round(amount), method, origin, ref],
  )
}

export async function listPayments(opts: { from?: string; to?: string; patientId?: number }) {
  const where: string[] = []
  const params: unknown[] = []
  if (opts.from) {
    params.push(`${opts.from}T00:00:00-03:00`)
    where.push(`p.paid_at >= $${params.length}`)
  }
  if (opts.to) {
    params.push(`${opts.to}T23:59:59-03:00`)
    where.push(`p.paid_at <= $${params.length}`)
  }
  if (opts.patientId) {
    params.push(opts.patientId)
    where.push(`p.patient_id = $${params.length}`)
  }
  const { rows } = await (await db()).query<Payment & { patient_name: string | null; service_name: string | null; starts_at: Date | null }>(
    `select p.*, pa.name as patient_name, b.service_name, b.starts_at
     from payments p left join patients pa on pa.id = p.patient_id left join bookings b on b.id = p.booking_id
     ${where.length ? `where ${where.join(" and ")}` : ""} order by p.paid_at desc limit 2000`,
    params,
  )
  return rows
}

/* ───────────── Ficha del paciente ───────────── */

export type PatientSummary = {
  id: number
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
  created_at: Date
  /** datos cargados a mano antes del sistema integrado: se suman, no se pisan */
  legacy_sessions: number
  legacy_balance: number
  sessions_done: number
  upcoming: number
  next_appointment: Date | null
  last_session: Date | null
  billed: number
  deposits_pending: number
  paid: number
  balance: number
}

const PATIENT_SELECT = `
  select p.id, p.name, p.phone, p.email, p.gender, p.treatments, p.status, p.source, p.birth_date, p.notes, p.marketing_consent, p.created_at,
    p.sessions_done as legacy_sessions, p.balance as legacy_balance,
    p.sessions_done + (select count(*) from bookings b where b.patient_id = p.id and b.status = 'done')::int as sessions_done,
    (select count(*) from bookings b where b.patient_id = p.id and b.starts_at > now() and b.status in ('reserved','pending_payment','pending_review','confirmed','conflict'))::int as upcoming,
    (select min(b.starts_at) from bookings b where b.patient_id = p.id and b.starts_at > now() and b.status in ('reserved','pending_payment','pending_review','confirmed','conflict')) as next_appointment,
    coalesce((select max(b.starts_at) from bookings b where b.patient_id = p.id and b.status = 'done'), p.last_session::timestamptz) as last_session,
    coalesce((select sum(coalesce(b.final_price, b.price)) from bookings b where b.patient_id = p.id and b.status not in ('cancelled','pending_payment','no_show')), 0)::int as billed,
    coalesce((select sum(amount) from payments x where x.patient_id = p.id), 0)::int as paid,
    coalesce((select sum(greatest(b.deposit - coalesce((select sum(amount) from payments y where y.booking_id = b.id), 0), 0))
              from bookings b where b.patient_id = p.id and b.status in ('reserved','confirmed','done','conflict')), 0)::int as deposits_pending
  from patients p`

const withBalance = (p: PatientSummary): PatientSummary => ({ ...p, balance: Math.max(0, p.legacy_balance + p.billed - p.paid) })

export async function listPatientSummaries(): Promise<PatientSummary[]> {
  const { rows } = await (await db()).query<PatientSummary>(`${PATIENT_SELECT} order by (p.status = 'Activa') desc, p.name`)
  return rows.map(withBalance)
}

export async function getPatientSummary(id: number): Promise<PatientSummary | null> {
  const { rows } = await (await db()).query<PatientSummary>(`${PATIENT_SELECT} where p.id = $1`, [id])
  return rows[0] ? withBalance(rows[0]) : null
}

export type TreatmentSummary = {
  category: string
  status: string
  notes: string
  sessions_done: number
  first_session: Date | null
  last_session: Date | null
  next_session: Date | null
  zones: string
  professionals: string
}

/** Un historial por tratamiento (depilación, HIFU, …), armado con los turnos del paciente. */
export async function patientTreatments(id: number): Promise<TreatmentSummary[]> {
  const { rows } = await (await db()).query<TreatmentSummary>(
    `with t as (
       select coalesce(nullif(s.category, ''), b.service_name) as category, b.*
       from bookings b left join services s on s.id = b.service_id
       where b.patient_id = $1 and b.status not in ('cancelled')
     )
     select c.category,
       coalesce(pt.status, 'Activo') as status, coalesce(pt.notes, '') as notes,
       (select count(*) from t where t.category = c.category and t.status = 'done')::int as sessions_done,
       (select min(starts_at) from t where t.category = c.category and t.status = 'done') as first_session,
       (select max(starts_at) from t where t.category = c.category and t.status = 'done') as last_session,
       (select min(starts_at) from t where t.category = c.category and t.starts_at > now() and t.status in ('reserved','pending_payment','pending_review','confirmed','conflict')) as next_session,
       (select string_agg(distinct nullif(zones, ''), ' · ') from t where t.category = c.category) as zones,
       (select string_agg(distinct nullif(professional, ''), ', ') from t where t.category = c.category) as professionals
     from (select distinct category from t union select category from patient_treatments where patient_id = $1) c
     left join patient_treatments pt on pt.patient_id = $1 and pt.category = c.category
     order by c.category`,
    [id],
  )
  return rows.map((r) => ({ ...r, zones: r.zones ?? "", professionals: r.professionals ?? "" }))
}

export const TREATMENT_STATUSES = ["Activo", "Pausado", "Finalizado", "Abandonado"]

export async function setTreatmentStatus(patientId: number, category: string, status: string, notes: string, actor: string) {
  await transaction(async (c) => {
    await c.query(
      `insert into patient_treatments (patient_id, category, status, notes, updated_at) values ($1, $2, $3, $4, now())
       on conflict (patient_id, category) do update set status = excluded.status, notes = excluded.notes, updated_at = now()`,
      [patientId, category, status, notes],
    )
    await audit(c, "tratamiento", `${patientId}:${category}`, "estado", null, { status, notes }, actor)
  })
}

export async function patientProfile(id: number) {
  const patient = await getPatientSummary(id)
  if (!patient) return null
  const [bookings, payments, treatments] = await Promise.all([listAgenda({ patientId: id, limit: 500 }), listPayments({ patientId: id }), patientTreatments(id)])
  return { patient, bookings, payments, treatments }
}

/** Verifica que la profesional esté activa y habilitada para el tratamiento. Devuelve el motivo si no lo está. */
export async function professionalBlocker(name: string, serviceId: number | null): Promise<string | null> {
  if (!name) return null
  const pool = await db()
  const { rows } = await pool.query<{ active: boolean; treatments: string }>("select active, treatments from professionals where name = $1", [name])
  if (!rows[0]) return null // nombre libre (por ejemplo, alguien externo): no se bloquea
  if (!rows[0].active) return `${name} está dada de baja`
  if (!serviceId || !rows[0].treatments.trim()) return null
  const { rows: s } = await pool.query<{ category: string; name: string }>("select category, name from services where id = $1", [serviceId])
  if (!s[0]) return null
  const allowedList = rows[0].treatments.toLowerCase().split(/[,;\n]/).map((x) => x.trim()).filter(Boolean)
  const ok = allowedList.some((t) => s[0].category.toLowerCase().includes(t) || s[0].name.toLowerCase().includes(t) || t.includes(s[0].category.toLowerCase()))
  return ok ? null : `${name} no está habilitada para ${s[0].category || s[0].name}`
}

/* ───────────── Resumen para el panel ───────────── */

export async function dashboard() {
  const today = todayAR()
  const pool = await db()
  const [todays, upcoming, money, alerts] = await Promise.all([
    listAgenda({ from: today, to: today }),
    pool.query<{ n: number }>(`select count(*)::int as n from bookings where starts_at > now() and status in ('reserved','pending_payment','pending_review','confirmed','conflict')`),
    pool.query<{ month: number; day: number }>(
      `select coalesce(sum(amount) filter (where paid_at >= date_trunc('month', now() at time zone 'America/Argentina/Buenos_Aires') at time zone 'America/Argentina/Buenos_Aires'), 0)::int as month,
              coalesce(sum(amount) filter (where paid_at >= $1::timestamptz), 0)::int as day
       from payments`,
      [`${today}T00:00:00-03:00`],
    ),
    listAgenda({ from: today, limit: 500 }),
  ])
  const active = alerts.filter((b) => ["reserved", "pending_payment", "pending_review", "confirmed", "conflict"].includes(b.state))
  return {
    today: todays.filter((b) => b.state !== "cancelled" && b.state !== "expired"),
    upcomingCount: upcoming.rows[0].n,
    collectedMonth: money.rows[0].month,
    collectedToday: money.rows[0].day,
    withoutDeposit: active.filter((b) => b.deposit_pending > 0),
    toReview: active.filter((b) => b.state === "pending_review" || b.state === "conflict"),
    pendingBalance: active.reduce((n, b) => n + b.balance, 0),
  }
}
