/**
 * Mensajes para enviar: a quién escribirle, cuándo y sobre qué.
 * El sistema deja cada mensaje redactado y listo para abrir en WhatsApp; nunca envía nada por su cuenta.
 * Se apoya en la tabla de tareas (kind = 'mensaje').
 */
import { db, transaction } from "./db"
import { audit } from "./ledger"
import { getSettings, type Settings } from "./settings"
import { addDays, formatARS, formatDay, TIME_ZONE, todayAR } from "../time"

const AR = "America/Argentina/Buenos_Aires"

export type MessageItem = {
  id: number
  title: string
  description: string
  message: string
  due_on: string | null
  done: boolean
  done_at: Date | null
  auto_key: string | null
  patient_id: number | null
  booking_id: string | null
  conversation_id: string | null
  name: string
  phone: string
  last_service: string | null
  last_session: Date | null
  created_by: string
}

export const REMINDER_TYPES = ["despues", "sena", "recordatorio", "saldo", "consulta", "manual"] as const

const first = (name: string) => name.trim().split(/\s+/)[0] || ""
const hhmm = (d: Date | string) => new Intl.DateTimeFormat("es-AR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(d))

/** Reemplaza {marcadores} del texto; los que no tengan valor quedan vacíos. */
export function renderTemplate(tpl: string, vars: Record<string, string>): string {
  return tpl
    .replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "")
    .replace(/[ \t]+([,.!?;:])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim()
}

function baseVars(settings: Settings, name: string): Record<string, string> {
  return { nombre: first(name), link: settings.business.bookingUrl, direccion: settings.business.address, centro: settings.business.name }
}

export function afterSessionMessage(settings: Settings, name: string, service: string): string {
  return renderTemplate(settings.followup.afterSessionTemplate, { ...baseVars(settings, name), tratamiento: service })
}
export function depositMessage(settings: Settings, name: string, service: string, startsAt: Date | string, deposit: number): string {
  const t = settings.transfer
  const pay = t.alias ? `Podés transferir al alias ${t.alias}${t.holder ? ` (a nombre de ${t.holder})` : ""}.` : "Coordinamos el medio de pago por este chat."
  const day = todayAR(new Date(startsAt))
  return renderTemplate(settings.followup.depositTemplate, {
    ...baseVars(settings, name),
    tratamiento: service,
    fecha: formatDay(day).toLowerCase(),
    hora: hhmm(startsAt),
    sena: formatARS(deposit),
    datos_pago: pay,
  })
}
export function nextSessionMessage(settings: Settings, name: string, service: string): string {
  return renderTemplate(settings.followup.nextSessionTemplate, { ...baseVars(settings, name), tratamiento: service })
}
export function appointmentMessage(settings: Settings, name: string, service: string, startsAt: Date | string): string {
  const day = todayAR(new Date(startsAt))
  return renderTemplate(settings.followup.appointmentTemplate, { ...baseVars(settings, name), tratamiento: service, fecha: formatDay(day).toLowerCase(), hora: hhmm(startsAt) })
}
export function balanceMessage(settings: Settings, name: string, service: string, balance: number): string {
  return renderTemplate(settings.followup.balanceTemplate, { ...baseVars(settings, name), tratamiento: service, saldo: formatARS(balance) })
}
export function inquiryMessage(settings: Settings, name: string, interest: string): string {
  return renderTemplate(settings.followup.inquiryTemplate, { ...baseVars(settings, name), interes: interest })
}

/** Día en que conviene escribirle a quien tuvo su sesión en `sessionDay`: (plazo entre sesiones − días de anticipación). */
export function nextReminderDay(settings: Settings, sessionDay: string): string {
  return addDays(sessionDay, Math.max(0, settings.followup.nextSessionDays - settings.followup.remindDaysBefore))
}

/** Crea los recordatorios que correspondan hoy. Es idempotente (clave única por situación). */
export async function generateMessageReminders(): Promise<number> {
  const settings = await getSettings()
  const pool = await db()
  let created = 0

  // 1) limpiar los que ya no corresponden
  // los avisos viejos de «próxima sesión» automáticos se reemplazan por los tres mensajes nuevos
  await pool.query("delete from tasks where kind = 'mensaje' and not done and auto_key like 'proxima:%'")
  // (si ya tiene turno, el mensaje de «después de la sesión» se quita; si ese turno se cancela, vuelve a crearse)
  await pool.query(
    `delete from tasks t
     where t.kind = 'mensaje' and not t.done and t.auto_key like 'despues:%'
       and exists (select 1 from bookings x where x.patient_id = t.patient_id and x.starts_at > now() and x.status in ('reserved','pending_payment','pending_review','confirmed','conflict'))`,
  )
  await pool.query(
    `delete from tasks t where t.kind = 'mensaje' and not t.done and t.auto_key like 'pedirsena:%'
       and (not exists (select 1 from bookings b where b.id = t.booking_id and b.status in ('reserved','confirmed') and b.starts_at > now())
            or coalesce((select sum(amount) from payments p where p.booking_id = t.booking_id), 0) >= coalesce((select deposit from bookings b where b.id = t.booking_id), 0))`,
  )
  await pool.query(
    `delete from tasks t where t.kind = 'mensaje' and not t.done and t.auto_key like 'recordatorio:%'
       and not exists (select 1 from bookings b where b.id = t.booking_id and b.status in ('reserved','confirmed')
                       and (b.starts_at at time zone '${AR}')::date - 1 = t.due_on)`,
  )

  // 2) DESPUÉS DE LA SESIÓN: cómo le fue y si quiere agendar la del mes que viene (el mismo día en que se marca como realizada)
  const after = await pool.query<{ id: string; patient_id: number; starts_at: Date; service_name: string; name: string }>(
    `select distinct on (b.patient_id) b.id, b.patient_id, b.starts_at, b.service_name, p.name
     from bookings b join patients p on p.id = b.patient_id
     where b.status = 'done' and b.starts_at > now() - interval '5 days' and p.status not in ('Archivada','Finalizó','Dejó') and p.phone <> ''
       and not exists (select 1 from bookings x where x.patient_id = b.patient_id and x.starts_at > now() and x.status in ('reserved','pending_payment','pending_review','confirmed','conflict'))
     order by b.patient_id, b.starts_at desc`,
  )
  for (const b of after.rows) {
    const day = todayAR(new Date(b.starts_at))
    const r = await pool.query(
      `insert into tasks (title, description, kind, patient_id, booking_id, due_on, message, auto_key, created_by)
       values ('Después de la sesión', $1, 'mensaje', $2, $3, $4, $5, $6, 'sistema') on conflict (auto_key) do nothing`,
      [`Sesión de ${b.service_name} del ${formatDay(day).toLowerCase()}: preguntarle cómo le fue y si quiere agendar la próxima`, b.patient_id, b.id, day, afterSessionMessage(settings, b.name, b.service_name), `despues:${b.id}`],
    )
    created += r.rowCount ?? 0
  }

  // 2 bis) SEÑA: a los N días de la sesión (10 por defecto), si todavía no está pagada y el turno se sacó con anticipación
  const lead = settings.followup.remindDaysBefore
  const dep = await pool.query<{ id: string; patient_id: number | null; starts_at: Date; service_name: string; name: string; deposit: number }>(
    `select b.id, b.patient_id, b.starts_at, b.service_name, b.name, b.deposit from bookings b
     where b.status in ('reserved','confirmed') and b.deposit > 0 and b.phone <> ''
       and b.starts_at > now() and (b.starts_at at time zone '${AR}')::date - $1::int <= (now() at time zone '${AR}')::date
       and b.created_at < b.starts_at - make_interval(days => greatest($1::int - 2, 1))
       and coalesce((select sum(amount) from payments p where p.booking_id = b.id), 0) < b.deposit`,
    [lead],
  )
  for (const b of dep.rows) {
    const day = todayAR(new Date(b.starts_at))
    const due = addDays(day, -lead) > todayAR() ? addDays(day, -lead) : todayAR()
    const r = await pool.query(
      `insert into tasks (title, description, kind, patient_id, booking_id, due_on, message, auto_key, created_by)
       values ('Pedir la seña', $1, 'mensaje', $2, $3, $4, $5, $6, 'sistema') on conflict (auto_key) do nothing`,
      [`Turno ${formatDay(day).toLowerCase()} ${hhmm(b.starts_at)} hs · ${b.service_name}: seña de ${formatARS(b.deposit)}`, b.patient_id, b.id, due, depositMessage(settings, b.name, b.service_name, b.starts_at, b.deposit), `pedirsena:${b.id}`],
    )
    created += r.rowCount ?? 0
  }

  // 3) recordatorio de turno: el día anterior
  const soon = await pool.query<{ id: string; patient_id: number | null; starts_at: Date; service_name: string; name: string }>(
    `select id, patient_id, starts_at, service_name, name from bookings
     where status in ('reserved','confirmed') and starts_at between now() and now() + interval '3 days' and phone <> ''`,
  )
  for (const b of soon.rows) {
    const day = todayAR(new Date(b.starts_at))
    const r = await pool.query(
      `insert into tasks (title, description, kind, patient_id, booking_id, due_on, message, auto_key, created_by)
       values ('Recordatorio de turno', $1, 'mensaje', $2, $3, $4, $5, $6, 'sistema') on conflict (auto_key) do nothing`,
      [`Turno ${formatDay(day).toLowerCase()} ${hhmm(b.starts_at)} hs · ${b.service_name}`, b.patient_id, b.id, addDays(day, -1), appointmentMessage(settings, b.name, b.service_name, b.starts_at), `recordatorio:${b.id}`],
    )
    created += r.rowCount ?? 0
  }

  // 4) saldo pendiente de sesiones realizadas
  const debt = await pool.query<{ id: string; patient_id: number | null; service_name: string; name: string; balance: number; starts_at: Date }>(
    `select b.id, b.patient_id, b.service_name, b.name, b.starts_at,
            (coalesce(b.final_price, b.price) - greatest(coalesce((select sum(amount) from payments p where p.booking_id = b.id), 0), b.deposit))::int as balance
     from bookings b where b.status = 'done' and b.phone <> '' and b.starts_at > now() - interval '90 days'
       and coalesce(b.final_price, b.price) - greatest(coalesce((select sum(amount) from payments p where p.booking_id = b.id), 0), b.deposit) > 0`,
  )
  for (const b of debt.rows) {
    const r = await pool.query(
      `insert into tasks (title, description, kind, patient_id, booking_id, due_on, message, auto_key, created_by)
       values ('Recordar saldo pendiente', $1, 'mensaje', $2, $3, $4, $5, $6, 'sistema') on conflict (auto_key) do nothing`,
      [`Sesión del ${formatDay(todayAR(new Date(b.starts_at))).toLowerCase()}: resta ${formatARS(b.balance)}`, b.patient_id, b.id, todayAR(), balanceMessage(settings, b.name, b.service_name, b.balance), `saldo:${b.id}`],
    )
    created += r.rowCount ?? 0
  }

  // 5) consultas del chat que no terminaron en reserva
  const inquiries = await pool.query<{ id: string; patient_id: number | null; interest: string; name: string }>(
    `select c.id, c.patient_id, c.interest, coalesce(nullif(c.contact_name, ''), p.name, '') as name
     from conversations c left join patients p on p.id = c.patient_id
     where not c.booked and c.interest <> '' and c.status <> 'cerrada' and coalesce(nullif(c.phone, ''), p.phone, '') <> ''
       and c.last_at < now() - interval '1 day' and c.last_at > now() - interval '30 days'`,
  )
  for (const c of inquiries.rows) {
    const r = await pool.query(
      `insert into tasks (title, description, kind, patient_id, conversation_id, due_on, message, auto_key, created_by)
       values ('Seguimiento de consulta', $1, 'mensaje', $2, $3, $4, $5, $6, 'sistema') on conflict (auto_key) do nothing`,
      [`Consultó por ${c.interest} y no reservó`, c.patient_id, c.id, todayAR(), inquiryMessage(settings, c.name, c.interest), `consulta:${c.id}`],
    )
    created += r.rowCount ?? 0
  }
  return created
}

const SELECT = `
  select t.id, t.title, t.description, t.message, t.due_on, t.done, t.done_at, t.auto_key, t.patient_id, t.booking_id, t.conversation_id, t.created_by,
    coalesce(p.name, nullif(c.contact_name, ''), b.name, '') as name,
    coalesce(nullif(p.phone, ''), nullif(c.phone, ''), b.phone, '') as phone,
    (select x.service_name from bookings x where x.patient_id = t.patient_id and x.status = 'done' order by x.starts_at desc limit 1) as last_service,
    (select max(x.starts_at) from bookings x where x.patient_id = t.patient_id and x.status = 'done') as last_session
  from tasks t
  left join patients p on p.id = t.patient_id
  left join conversations c on c.id = t.conversation_id
  left join bookings b on b.id = t.booking_id
  where t.kind = 'mensaje'`

export async function listMessages(state: "pendientes" | "enviados" | "todos"): Promise<MessageItem[]> {
  await generateMessageReminders().catch((e) => console.error("mensajes:", e instanceof Error ? e.message : e))
  const where = state === "pendientes" ? "and not t.done" : state === "enviados" ? "and t.done" : ""
  const order = state === "enviados" ? "t.done_at desc nulls last" : "t.due_on nulls last, t.id"
  const { rows } = await (await db()).query<MessageItem>(`${SELECT} ${where} order by ${order} limit 400`)
  return rows
}

export async function messageCounts() {
  const today = todayAR()
  const { rows } = await (await db()).query<{ due: number; upcoming: number }>(
    `select count(*) filter (where due_on <= $1)::int as due, count(*) filter (where due_on > $1 and due_on <= $2)::int as upcoming
     from tasks where kind = 'mensaje' and not done`,
    [today, addDays(today, 7)],
  )
  return rows[0]
}

export type ManualReminder = { patientId: number | null; bookingId?: string | null; title: string; message: string; dueOn: string | null; description?: string }

export async function createReminder(input: ManualReminder, actor: string): Promise<number> {
  return transaction(async (c) => {
    const { rows } = await c.query<{ id: number }>(
      `insert into tasks (title, description, kind, patient_id, booking_id, due_on, message, created_by) values ($1, $2, 'mensaje', $3, $4, $5, $6, $7) returning id`,
      [input.title, input.description ?? "", input.patientId, input.bookingId ?? null, input.dueOn, input.message, actor],
    )
    await audit(c, "mensaje", rows[0].id, "crear", null, input, actor)
    return rows[0].id
  })
}

/** «Recordarme avisarle»: deja el aviso de la próxima sesión para el día que corresponde. */
export async function remindNextSession(bookingId: string, actor: string): Promise<{ id: number; dueOn: string } | null> {
  const settings = await getSettings()
  const { rows } = await (await db()).query<{ id: string; patient_id: number | null; name: string; service_name: string; starts_at: Date }>(
    "select id, patient_id, name, service_name, starts_at from bookings where id = $1",
    [bookingId],
  )
  const b = rows[0]
  if (!b || !b.patient_id) return null
  const day = todayAR(new Date(b.starts_at))
  const dueOn = nextReminderDay(settings, day) < todayAR() ? todayAR() : nextReminderDay(settings, day)
  const id = await createReminder(
    { patientId: b.patient_id, bookingId: b.id, title: "Agendar la próxima sesión", description: `Última sesión: ${b.service_name} el ${formatDay(day).toLowerCase()}`, message: nextSessionMessage(settings, b.name, b.service_name), dueOn },
    actor,
  )
  return { id, dueOn }
}

export async function updateReminder(
  id: number,
  action: "sent" | "reopen" | "snooze" | "edit" | "dismiss",
  data: { days?: number; dueOn?: string; message?: string; title?: string },
  actor: string,
): Promise<boolean> {
  return transaction(async (c) => {
    const { rows } = await c.query<{ id: number; due_on: string | null }>("select id, due_on from tasks where id = $1 and kind = 'mensaje' for update", [id])
    if (!rows[0]) return false
    if (action === "sent") await c.query("update tasks set done = true, done_at = now(), comments = comments || $2::jsonb where id = $1", [id, JSON.stringify([{ text: "Mensaje enviado", by: actor, at: new Date().toISOString() }])])
    else if (action === "dismiss") await c.query("update tasks set done = true, done_at = now(), comments = comments || $2::jsonb where id = $1", [id, JSON.stringify([{ text: "Descartado, no hace falta enviarlo", by: actor, at: new Date().toISOString() }])])
    else if (action === "reopen") await c.query("update tasks set done = false, done_at = null where id = $1", [id])
    else if (action === "snooze") {
      const base = rows[0].due_on && rows[0].due_on > todayAR() ? rows[0].due_on : todayAR()
      await c.query("update tasks set due_on = $2 where id = $1", [id, data.dueOn ?? addDays(base, Math.max(1, Math.min(120, data.days ?? 3)))])
    } else {
      await c.query("update tasks set message = coalesce($2, message), title = coalesce($3, title), due_on = coalesce($4, due_on) where id = $1", [id, data.message ?? null, data.title ?? null, data.dueOn ?? null])
    }
    await audit(c, "mensaje", id, action, null, data, actor)
    return true
  })
}

/** Texto y enlace de WhatsApp (se abre con el mensaje escrito; la persona del equipo lo envía). */
export const whatsappLink = (phone: string, text: string) => {
  const digits = phone.replace(/\D/g, "")
  const full = digits.startsWith("54") ? digits : `549${digits.replace(/^0+/, "").replace(/^15/, "")}`
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`
}

