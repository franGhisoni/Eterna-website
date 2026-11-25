/** Seguimientos automáticos, alertas del panel y reportes. Todo se calcula con los datos reales de la base. */
import { freeSlots } from "./agenda"
import { db } from "./db"
import { generateMessageReminders } from "./reminders"
import { getSettings } from "./settings"
import { addDays, todayAR } from "../time"

const AR = "America/Argentina/Buenos_Aires"

/**
 * Crea tareas de seguimiento según reglas configurables. Cada situación genera una sola tarea
 * (clave única), así que se puede llamar las veces que haga falta sin duplicar.
 * No envía mensajes a nadie: deja la tarea para que el equipo decida.
 */
export async function generateFollowUps(): Promise<number> {
  const { followup } = await getSettings()
  const pool = await db()
  const r = await pool.query(
    `
    with active as (
      select b.*, coalesce(b.final_price, b.price) as fp, coalesce((select sum(amount) from payments p where p.booking_id = b.id), 0) as paid
      from bookings b
    ),
    candidates as (
      select 'sena:' || id as k, 'Solicitar seña' as title, 'Turno ' || to_char(starts_at at time zone '${AR}', 'DD/MM HH24:MI') || ' · ' || service_name || ' sin seña abonada' as d,
             'cobranza' as kind, patient_id, id as booking_id, null::uuid as conv, (starts_at at time zone '${AR}')::date - 1 as due
      from active where status = 'pending_payment' and expires_at > now() and deposit > 0 and paid = 0
        and starts_at between now() and now() + make_interval(hours => $1::int)
      union all
      select 'confirmar:' || id, 'Confirmar turno', 'Turno ' || to_char(starts_at at time zone '${AR}', 'DD/MM HH24:MI') || ' · ' || service_name || ' todavía sin confirmar',
             'turnos', patient_id, id, null, (starts_at at time zone '${AR}')::date - 1
      from active where status = 'reserved' and starts_at between now() and now() + interval '48 hours'
      union all
      select 'ficha:' || p.id, 'Completar ficha de paciente', 'Falta el teléfono o el email', 'datos', p.id, null, null, null
      from patients p
      where p.status not in ('Archivada') and (p.phone = '' or p.email = '') and exists (select 1 from bookings b where b.patient_id = p.id and b.status = 'done')
    )
    insert into tasks (title, description, kind, patient_id, booking_id, conversation_id, due_on, auto_key, created_by)
    select title, d, kind, patient_id, booking_id, conv, due, k, 'sistema' from candidates
    on conflict (auto_key) do nothing`,
    [followup.depositHours],
  )
  const messages = await generateMessageReminders().catch((e) => {
    console.error("mensajes:", e instanceof Error ? e.message : e)
    return 0
  })
  return (r.rowCount ?? 0) + messages
}

export async function alerts() {
  const { followup, booking } = await getSettings()
  const pool = await db()
  const today = todayAR()
  const [promos, inactive, noNext, partial, incomplete, free] = await Promise.all([
    pool.query<{ id: number; title: string; ends_on: string }>("select id, title, ends_on from promos where active and ends_on between $1 and $2 order by ends_on", [today, addDays(today, 7)]),
    pool.query<{ id: number; name: string; last: Date }>(
      `select p.id, p.name, max(b.starts_at) as last from patients p join bookings b on b.patient_id = p.id and b.status = 'done'
       where p.status not in ('Archivada','Finalizó','Dejó')
       group by p.id having max(b.starts_at) < now() - make_interval(days => $1::int)
         and not exists (select 1 from bookings x where x.patient_id = p.id and x.starts_at > now() and x.status <> 'cancelled')
       order by last limit 50`,
      [followup.inactiveAfterDays],
    ),
    pool.query<{ id: number; name: string }>(
      `select p.id, p.name from patients p where p.status in ('Activa','Nueva')
         and exists (select 1 from bookings b where b.patient_id = p.id and b.status = 'done')
         and not exists (select 1 from bookings b where b.patient_id = p.id and b.starts_at > now() and b.status in ('reserved','pending_payment','pending_review','confirmed'))
       order by p.name limit 50`,
    ),
    pool.query<{ id: string; name: string; balance: number }>(
      `select b.id, b.name, (coalesce(b.final_price, b.price) - x.paid)::int as balance from bookings b
       join lateral (select coalesce(sum(amount), 0) as paid from payments p where p.booking_id = b.id) x on true
       where b.status = 'done' and x.paid < coalesce(b.final_price, b.price)
       order by b.starts_at desc limit 50`,
    ),
    pool.query<{ id: number; name: string }>("select id, name from patients where status <> 'Archivada' and (phone = '' or (email = '' and source = '')) order by name limit 50"),
    freeSlots({ duration_min: booking.slotMinutes }, today, addDays(today, 7), booking),
  ])
  return {
    promosExpiring: promos.rows,
    inactivePatients: inactive.rows,
    withoutNextSession: noNext.rows,
    partialPayments: partial.rows,
    incompleteProfiles: incomplete.rows,
    freeSlotsNextWeek: free.length,
  }
}

/** Indicadores de un período (día, semana, mes o personalizado). */
export async function periodMetrics(from: string, to: string) {
  const pool = await db()
  const fromTs = `${from}T00:00:00-03:00`
  const toTs = `${to}T23:59:59-03:00`
  const { rows } = await pool.query(
    `select
       (select count(*) from bookings where starts_at between $1 and $2 and status not in ('cancelled','pending_payment'))::int as bookings,
       (select count(*) from bookings where starts_at between $1 and $2 and status = 'cancelled')::int as cancelled,
       (select count(*) from bookings where starts_at between $1 and $2 and status = 'no_show')::int as no_show,
       (select count(*) from bookings where starts_at between $1 and $2 and status = 'reserved')::int as pending_confirmation,
       (select count(distinct e.booking_id) from booking_events e join bookings b on b.id = e.booking_id where e.kind = 'reprogramado' and e.created_at between $1 and $2)::int as rescheduled,
       (select count(*) from patients where created_at between $1 and $2)::int as new_patients,
       (select count(distinct patient_id) from bookings where starts_at between $1 and $2 and status in ('done','confirmed','reserved'))::int as active_patients,
       coalesce((select sum(amount) from payments where paid_at between $1 and $2), 0)::int as collected,
       coalesce((select sum(coalesce(final_price, price)) from bookings where starts_at between $1 and $2 and status not in ('cancelled','pending_payment','no_show')), 0)::int as sold`,
    [fromTs, toTs],
  )
  return rows[0] as Record<string, number>
}

export async function reports(from: string, to: string) {
  const pool = await db()
  const fromTs = `${from}T00:00:00-03:00`
  const toTs = `${to}T23:59:59-03:00`
  const firm = `b.starts_at between $1 and $2 and b.status not in ('cancelled','pending_payment','no_show')`
  const paidOf = `coalesce((select sum(amount) from payments p where p.booking_id = b.id), 0)`
  const q = async <T extends Record<string, unknown>>(sql: string, params: unknown[] = [fromTs, toTs]) => (await pool.query<T>(sql, params)).rows
  const { booking } = await getSettings()

  const [summary, byDay, byTreatment, byProfessional, byPromo, monthly, byMethod, commercial, topServices, byHour, free] = await Promise.all([
    periodMetrics(from, to),
    q(`select to_char(b.starts_at at time zone '${AR}', 'YYYY-MM-DD') as dia, count(*)::int as turnos,
         sum(coalesce(b.final_price, b.price))::int as vendido, sum(${paidOf})::int as cobrado
       from bookings b where ${firm} group by 1 order by 1`),
    q(`select coalesce(nullif(s.category, ''), b.service_name) as tratamiento, count(*)::int as turnos,
         sum(coalesce(b.final_price, b.price))::int as vendido, sum(${paidOf})::int as cobrado
       from bookings b left join services s on s.id = b.service_id where ${firm} group by 1 order by vendido desc`),
    q(`select coalesce(nullif(b.professional, ''), 'Sin asignar') as profesional, count(*)::int as turnos,
         count(*) filter (where b.status = 'done')::int as realizados, sum(coalesce(b.final_price, b.price))::int as vendido
       from bookings b where ${firm} group by 1 order by turnos desc`),
    q(`select coalesce(nullif(b.promo_title, ''), 'Sin promoción') as promocion, count(*)::int as usos,
         sum(coalesce(b.final_price, b.price))::int as vendido, sum(b.discount)::int as descuento
       from bookings b where ${firm} group by 1 order by usos desc`),
    q(
      `select to_char(m, 'YYYY-MM') as mes,
         coalesce((select sum(amount) from payments where paid_at >= m and paid_at < m + interval '1 month'), 0)::int as cobrado,
         coalesce((select sum(coalesce(final_price, price)) from bookings where starts_at >= m and starts_at < m + interval '1 month' and status not in ('cancelled','pending_payment','no_show')), 0)::int as vendido
       from generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') m order by m`,
      [],
    ),
    q(`select method as medio, count(*)::int as pagos, sum(amount)::int as cobrado from payments where paid_at between $1 and $2 group by 1 order by cobrado desc`),
    q(`select
         (select count(*) from conversations c where c.created_at between $1 and $2 and exists (select 1 from conversation_messages m where m.conversation_id = c.id))::int as consultas,
         (select count(*) from conversations c where c.created_at between $1 and $2 and c.booked)::int as consultas_con_reserva,
         (select count(*) from bookings where created_at between $1 and $2 and source = 'chat')::int as reservas_chat,
         (select count(*) from bookings where created_at between $1 and $2 and source = 'web')::int as reservas_web,
         (select count(*) from bookings where created_at between $1 and $2 and source in ('admin','paciente'))::int as reservas_admin,
         (select count(*) from (select patient_id from bookings where status = 'done' and patient_id is not null group by patient_id having count(*) >= 2) x)::int as recurrentes`),
    q(`select b.service_name as servicio, count(*)::int as turnos from bookings b where b.created_at between $1 and $2 and b.status <> 'cancelled' group by 1 order by 2 desc limit 10`),
    q(`select to_char(b.starts_at at time zone '${AR}', 'HH24:MI') as hora, count(*)::int as turnos from bookings b where ${firm} group by 1 order by 1`),
    freeSlots({ duration_min: booking.slotMinutes }, from, to, { ...booking, minHoursAhead: 0 }, { includeHidden: true, now: new Date(0) }),
  ])

  const freeByDay = new Map<string, number>()
  for (const s of free) {
    const d = todayAR(s.start)
    freeByDay.set(d, (freeByDay.get(d) ?? 0) + 1)
  }
  const occupancy = Array.from(new Set([...byDay.map((d) => String(d.dia)), ...freeByDay.keys()]))
    .sort()
    .map((dia) => {
      const taken = Number(byDay.find((d) => d.dia === dia)?.turnos ?? 0)
      const libres = freeByDay.get(dia) ?? 0
      return { dia, turnos: taken, libres, ocupacion: taken + libres ? Math.round((taken * 100) / (taken + libres)) : 0 }
    })

  const c = commercial[0] as Record<string, number>
  return {
    summary: { ...summary, pending: Math.max(0, summary.sold - Number(byDay.reduce((n, d) => n + Number(d.cobrado), 0))) },
    byDay,
    byTreatment,
    byProfessional,
    byPromo,
    byMethod,
    monthly,
    commercial: { ...c, conversion: c.consultas ? Math.round((c.consultas_con_reserva * 100) / c.consultas) : 0 },
    topServices,
    byHour,
    occupancy,
  }
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "﻿"
  const cols = Object.keys(rows[0])
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`
  return "﻿" + [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n")
}

/** Copia de seguridad completa en JSON (sin los archivos de comprobantes, que se descargan aparte). */
export async function backup() {
  const pool = await db()
  const tables = [
    "settings", "services", "promos", "patients", "patient_treatments", "bookings", "booking_events", "payments",
    "agenda_ranges", "agenda_blocks", "professionals", "equipment", "faqs", "conversations", "conversation_messages", "tasks", "audit_log", "migrations",
  ]
  const out: Record<string, unknown[]> = {}
  for (const t of tables) out[t] = (await pool.query(`select * from ${t}`)).rows
  out.booking_receipts = (await pool.query("select booking_id, name, mime, sha256, ai_result, ai_reason, verified_at, created_at from booking_receipts")).rows
  out.users = (await pool.query("select id, username, name, role, professional, active, created_at, last_login from users")).rows
  return { generado: new Date().toISOString(), tablas: out }
}

export async function auditLog(filter: { entity?: string; q?: string; limit?: number }) {
  const where: string[] = []
  const params: unknown[] = []
  if (filter.entity) {
    params.push(filter.entity)
    where.push(`entity = $${params.length}`)
  }
  if (filter.q) {
    params.push(`%${filter.q.toLowerCase()}%`)
    where.push(`(lower(actor) like $${params.length} or lower(entity_id) like $${params.length} or lower(action) like $${params.length})`)
  }
  const { rows } = await (await db()).query(
    `select * from audit_log ${where.length ? `where ${where.join(" and ")}` : ""} order by created_at desc limit ${Math.min(filter.limit ?? 300, 2000)}`,
    params,
  )
  return rows
}
