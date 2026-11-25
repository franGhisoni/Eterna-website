import { Pool, types, type PoolClient } from "pg"

// "date" columns as plain YYYY-MM-DD strings, never shifted by the server timezone
types.setTypeParser(1082, (v) => v)

const SCHEMA = `
create table if not exists settings (
  key text primary key,
  value jsonb not null
);
create table if not exists services (
  id serial primary key,
  name text not null,
  description text not null default '',
  duration_min int not null default 30,
  price int not null default 0,
  deposit int not null default 0,
  active boolean not null default true,
  sort int not null default 0
);
create table if not exists agenda_ranges (
  id serial primary key,
  day date not null,
  start_time text not null,
  end_time text not null
);
create index if not exists agenda_ranges_day on agenda_ranges(day);
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  service_id int references services(id) on delete set null,
  service_name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  name text not null,
  phone text not null default '',
  email text not null default '',
  notes text not null default '',
  status text not null,
  price int not null default 0,
  deposit int not null default 0,
  mp_payment_id text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists bookings_starts on bookings(starts_at);
alter table services add column if not exists category text not null default '';
alter table services add column if not exists kind text not null default '';
alter table services add column if not exists gender text not null default '';
alter table services add column if not exists detail text not null default '';
create table if not exists booking_receipts (
  booking_id uuid primary key references bookings(id) on delete cascade,
  name text not null,
  mime text not null,
  data bytea not null,
  created_at timestamptz not null default now()
);
alter table booking_receipts add column if not exists sha256 text;
alter table booking_receipts add column if not exists ai_result text;
alter table booking_receipts add column if not exists ai_reason text;
alter table booking_receipts add column if not exists ai_reading jsonb;
alter table booking_receipts add column if not exists verified_at timestamptz;
create index if not exists booking_receipts_sha256 on booking_receipts(sha256);
create table if not exists promos (
  id serial primary key,
  title text not null,
  description text not null default '',
  kind text not null default 'percent',
  percent int not null default 0,
  sessions int not null default 0,
  category text not null default '',
  starts_on date,
  ends_on date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists patients (
  id serial primary key,
  name text not null,
  phone text not null default '',
  gender text not null default '',
  treatments text not null default '',
  sessions_done int not null default 0,
  deposit int not null default 0,
  balance int not null default 0,
  status text not null default 'Activa',
  first_session date,
  last_session date,
  next_appointment timestamptz,
  notes text not null default '',
  created_at timestamptz not null default now()
);

-- ── Sistema integral: una sola fuente de verdad para pacientes, turnos y pagos ──
alter table patients add column if not exists email text not null default '';
alter table patients add column if not exists birth_date date;
alter table patients add column if not exists source text not null default '';
alter table patients add column if not exists phone_key text not null default '';
create index if not exists patients_phone_key on patients(phone_key);

alter table bookings add column if not exists patient_id int references patients(id) on delete set null;
alter table bookings add column if not exists source text not null default 'web';
alter table bookings add column if not exists zones text not null default '';
alter table bookings add column if not exists professional text not null default '';
alter table bookings add column if not exists promo_id int references promos(id) on delete set null;
alter table bookings add column if not exists promo_title text not null default '';
alter table bookings add column if not exists discount int not null default 0;
alter table bookings add column if not exists final_price int;
alter table bookings add column if not exists updated_at timestamptz not null default now();
create index if not exists bookings_patient on bookings(patient_id);

create table if not exists payments (
  id serial primary key,
  booking_id uuid references bookings(id) on delete set null,
  patient_id int references patients(id) on delete set null,
  amount int not null,
  method text not null default 'Efectivo',
  concept text not null default 'Pago',
  origin text not null default 'manual',
  external_ref text,
  notes text not null default '',
  paid_at timestamptz not null default now(),
  created_by text not null default 'admin',
  created_at timestamptz not null default now()
);
create index if not exists payments_booking on payments(booking_id);
create index if not exists payments_patient on payments(patient_id);
create unique index if not exists payments_external on payments(origin, external_ref) where external_ref is not null;

create table if not exists booking_events (
  id serial primary key,
  booking_id uuid not null references bookings(id) on delete cascade,
  kind text not null,
  detail jsonb not null default '{}',
  actor text not null default 'sistema',
  created_at timestamptz not null default now()
);
create index if not exists booking_events_booking on booking_events(booking_id);

create table if not exists audit_log (
  id serial primary key,
  entity text not null,
  entity_id text not null,
  action text not null,
  before jsonb,
  after jsonb,
  actor text not null default 'admin',
  created_at timestamptz not null default now()
);
create index if not exists audit_log_entity on audit_log(entity, entity_id);

create table if not exists migrations (
  name text primary key,
  ran_at timestamptz not null default now()
);

-- ── Prioridad 2: jornadas, profesionales, equipos, servicios ampliados, tratamientos ──
alter table agenda_ranges add column if not exists professional text not null default '';
alter table agenda_ranges add column if not exists slot_minutes int;
alter table agenda_ranges add column if not exists gap_minutes int not null default 0;
alter table agenda_ranges add column if not exists published boolean not null default true;
alter table agenda_ranges add column if not exists notes text not null default '';

create table if not exists agenda_blocks (
  id serial primary key,
  day date not null,
  start_time text not null,
  end_time text not null,
  professional text not null default '',
  reason text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists agenda_blocks_day on agenda_blocks(day);

create table if not exists professionals (
  id serial primary key,
  name text not null unique,
  phone text not null default '',
  email text not null default '',
  specialty text not null default '',
  treatments text not null default '',
  active boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists equipment (
  id serial primary key,
  name text not null,
  model text not null default '',
  treatments text not null default '',
  status text not null default 'Operativo',
  notes text not null default '',
  created_at timestamptz not null default now()
);

alter table services add column if not exists online boolean not null default true;
alter table services add column if not exists visible_web boolean not null default true;
alter table services add column if not exists audience text not null default '';
alter table services add column if not exists equipment text not null default '';
alter table services add column if not exists indications text not null default '';
alter table services add column if not exists contraindications text not null default '';
alter table services add column if not exists promo_price int;

create table if not exists patient_treatments (
  patient_id int not null references patients(id) on delete cascade,
  category text not null,
  status text not null default 'Activo',
  notes text not null default '',
  updated_at timestamptz not null default now(),
  primary key (patient_id, category)
);

alter table patients add column if not exists marketing_consent boolean not null default false;

-- ── Prioridad 3: promos con reglas, conocimiento del asistente, conversaciones ──
alter table promos add column if not exists chat_visible boolean not null default true;
alter table promos add column if not exists audience text not null default 'todos';
alter table promos add column if not exists max_uses int not null default 0;
alter table promos add column if not exists per_patient int not null default 0;
alter table promos add column if not exists stackable boolean not null default false;
alter table promos add column if not exists priority int not null default 0;
alter table promos add column if not exists weekdays text not null default '';
alter table promos add column if not exists conditions text not null default '';

create table if not exists faqs (
  id serial primary key,
  question text not null,
  answer text not null default '',
  category text not null default 'General',
  active boolean not null default true,
  source text not null default 'admin',
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  response_id text,
  contact_name text not null default '',
  phone text not null default '',
  patient_id int references patients(id) on delete set null,
  status text not null default 'nueva',
  topic text not null default '',
  interest text not null default '',
  booked boolean not null default false,
  needs_followup boolean not null default false,
  human boolean not null default false,
  notes text not null default '',
  last_message text not null default '',
  last_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists conversations_last on conversations(last_at desc);

create table if not exists conversation_messages (
  id serial primary key,
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null,
  text text not null default '',
  card jsonb,
  author text not null default '',
  flagged boolean not null default false,
  correction text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists conversation_messages_conv on conversation_messages(conversation_id, id);

-- ── Prioridad 4: tareas, usuarios ──
create table if not exists tasks (
  id serial primary key,
  title text not null,
  description text not null default '',
  kind text not null default 'general',
  patient_id int references patients(id) on delete set null,
  booking_id uuid references bookings(id) on delete set null,
  conversation_id uuid references conversations(id) on delete set null,
  assignee text not null default '',
  due_on date,
  done boolean not null default false,
  auto_key text unique,
  comments jsonb not null default '[]',
  created_by text not null default 'admin',
  created_at timestamptz not null default now(),
  done_at timestamptz
);

alter table tasks add column if not exists message text not null default '';

create table if not exists users (
  id serial primary key,
  username text not null unique,
  name text not null default '',
  role text not null default 'recepcion',
  password_hash text not null,
  professional text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login timestamptz
);
`

const PHONE_KEY = (col: string) => `right(regexp_replace(${col}, '\\D', '', 'g'), 8)`

/** Data migrations: each runs once, in a transaction, and only adds or links data (never deletes or overwrites). */
const DATA_MIGRATIONS: Array<[string, string]> = [
  [
    "2026-11-unificar-pacientes-turnos-pagos",
    `
-- clave de teléfono (últimos 8 dígitos) para reconocer a la misma persona aunque escriba el número distinto
update patients set phone_key = ${PHONE_KEY("phone")} where phone_key = '' and phone <> '';

-- el precio de cada turno existente queda congelado como precio final
update bookings set final_price = price where final_price is null;

-- turnos del chat que tenían la promo anotada en las notas
update bookings set promo_title = trim(substring(notes from 'Promo: ([^(]+)')) where promo_title = '' and notes like 'Promo: %';

-- vincular cada turno con su paciente por teléfono, creando la ficha si la persona no existía
insert into patients (name, phone, email, phone_key, source, status, created_at)
select distinct on (${PHONE_KEY("b.phone")}) b.name, b.phone, b.email, ${PHONE_KEY("b.phone")}, 'Web / chat', 'Activa', b.created_at
from bookings b
where length(regexp_replace(b.phone, '\\D', '', 'g')) >= 6
  and b.status in ('confirmed', 'pending_review', 'conflict')
  and not exists (select 1 from patients p where p.phone_key <> '' and p.phone_key = ${PHONE_KEY("b.phone")})
order by ${PHONE_KEY("b.phone")}, b.created_at;

update bookings b set patient_id = p.id
from patients p
where b.patient_id is null and p.phone_key <> '' and p.phone_key = ${PHONE_KEY("b.phone")};

-- señas ya cobradas por Mercado Pago o por transferencia pasan a ser pagos registrados
insert into payments (booking_id, patient_id, amount, method, concept, origin, external_ref, paid_at, created_by)
select b.id, b.patient_id, b.deposit, 'Mercado Pago', 'Seña', 'mercadopago', b.mp_payment_id, b.created_at, 'sistema'
from bookings b where b.mp_payment_id is not null and b.deposit > 0
on conflict do nothing;

insert into payments (booking_id, patient_id, amount, method, concept, origin, external_ref, paid_at, created_by)
select b.id, b.patient_id, b.deposit, 'Transferencia', 'Seña', 'comprobante', b.id::text, coalesce(r.verified_at, r.created_at), 'sistema'
from bookings b join booking_receipts r on r.booking_id = b.id
where b.deposit > 0 and b.status = 'confirmed' and b.mp_payment_id is null
on conflict do nothing;

-- el "próximo turno" escrito a mano en la ficha del paciente pasa a ser un turno real de la agenda
insert into bookings (service_name, starts_at, ends_at, name, phone, email, notes, status, price, deposit, final_price, patient_id, source, created_at)
select coalesce(nullif(p.treatments, ''), 'Sesión'), p.next_appointment, p.next_appointment + interval '30 minutes', p.name, p.phone, '',
       'Turno migrado desde la ficha del paciente', 'reserved', 0, 0, 0, p.id, 'admin', now()
from patients p
where p.next_appointment is not null and p.next_appointment > now()
  and not exists (select 1 from bookings b where b.patient_id = p.id and b.starts_at = p.next_appointment);
`,
  ],
  [
    "2026-11-equipos-profesionales-conocimiento",
    `
-- profesionales que estaban como lista de texto en la configuración
insert into professionals (name)
select distinct trim(x) from settings s, jsonb_array_elements_text(coalesce(s.value->'professionals', '[]'::jsonb)) x
where s.key = 'team' and trim(x) <> ''
on conflict (name) do nothing;
insert into professionals (name)
select distinct professional from bookings where professional <> ''
on conflict (name) do nothing;

-- equipos conocidos del centro
insert into equipment (name, model, treatments, status)
select 'Alma Láser Soprano Ice Platinum', 'Soprano Ice Platinum', 'Depilación Definitiva', 'Operativo'
where not exists (select 1 from equipment where name ilike '%soprano%');
insert into equipment (name, model, treatments, status)
select 'HIFU 25D 360 MAX', '25D 360 MAX', 'HIFU', 'Operativo'
where not exists (select 1 from equipment where name ilike '%hifu%');

-- precios de referencia: se cargan INACTIVOS para que administración los revise antes de publicarlos
insert into services (name, category, gender, kind, duration_min, price, promo_price, deposit, active, online, sort, description)
select v.name, 'Depilación Definitiva', v.gender, 'Combo', 30, v.price, v.promo, 0, false, false, 900 + v.ord, 'Precio de referencia a revisar antes de activar'
from (values
  ('Básico', 'Femenina', 38000, 30400, 1),
  ('Cavado + tira', 'Femenina', 30000, 24000, 2),
  ('Cuerpo completo', 'Femenina', 54000, 43000, 3),
  ('Barba', 'Masculino', 24000, null, 4),
  ('Pecho', 'Masculino', 35000, null, 5),
  ('Abdomen', 'Masculino', 27000, null, 6),
  ('Espalda baja', 'Masculino', 30000, null, 7),
  ('Cuerpo completo', 'Masculino', 63999, null, 8)
) as v(name, gender, price, promo, ord)
where not exists (select 1 from services s where lower(s.name) = lower(v.name) and s.gender = v.gender);

-- preguntas frecuentes: con respuesta solo lo que está confirmado; el resto queda para completar (inactivo)
insert into faqs (question, answer, category, active, sort)
select q, a, c, a <> '', o from (values
  ('¿Dónde están ubicados?', 'Estamos dentro del Instituto Ghisoni, en José Pereyra Lucena 575, Lomas de Zamora.', 'Institucional', 1),
  ('¿Qué equipo utilizan para la depilación definitiva?', 'Trabajamos con Alma Láser Soprano Ice Platinum.', 'Depilación definitiva', 2),
  ('¿Qué equipo utilizan para HIFU?', 'Usamos el equipo HIFU 25D 360 MAX, para aplicaciones faciales y corporales. Antes de hacerlo se evalúa si es adecuado para cada persona.', 'HIFU', 3),
  ('¿Cómo reservo un turno?', 'Podés reservar por este chat (https://eterna.ghisoni.com.ar/chat) o escribiendo por WhatsApp al +54 11 4042-0769.', 'Reservas', 4),
  ('¿La depilación definitiva elimina el 100% del vello?', 'Los resultados son progresivos y varían según la persona, el tipo de vello, la piel, la zona y la constancia. No se puede garantizar la eliminación total del vello.', 'Depilación definitiva', 5),
  ('¿Cuánto tengo que dejar de seña?', '', 'Reservas', 6),
  ('¿Qué medios de pago aceptan?', '', 'Pagos', 7),
  ('¿Duele la depilación?', '', 'Depilación definitiva', 8),
  ('¿Cuántas sesiones necesito?', '', 'Depilación definitiva', 9),
  ('¿Qué pasa si falto a una sesión?', '', 'Reservas', 10),
  ('¿Cómo tengo que prepararme?', '', 'Depilación definitiva', 11),
  ('¿Se utiliza gel? ¿Es descartable?', '', 'Depilación definitiva', 12),
  ('¿Puedo hacerme el tratamiento si tengo tatuajes?', '', 'Depilación definitiva', 13),
  ('¿Puedo hacerme el tratamiento si tengo implantes dentales?', '', 'Depilación definitiva', 14),
  ('¿Cuánto duran los resultados?', '', 'General', 15),
  ('¿Cómo llego?', '', 'Institucional', 16)
) as v(q, a, c, o)
where not exists (select 1 from faqs);
`,
  ],
  [
    "2026-11-mensajes-para-enviar",
    `
-- los avisos de saldo, consultas y continuidad ahora viven en «Mensajes» (con el texto ya redactado):
-- se retiran los pendientes generados por el sistema con el formato anterior para que se vuelvan a crear ahí
delete from tasks where not done and created_by = 'sistema' and (auto_key like 'saldo:%' or auto_key like 'consulta:%' or auto_key like 'continuar:%');
`,
  ],
  [
    "2026-11-vincular-promos-anotadas",
    `
-- turnos que tenían la promo solo escrita: se vinculan con la promo de igual nombre para poder editarlos bien
update bookings b set promo_id = p.id
from promos p
where b.promo_id is null and b.promo_title <> '' and lower(trim(p.title)) = lower(trim(b.promo_title));
`,
  ],
]

async function runDataMigrations(pool: Pool) {
  for (const [name, sql] of DATA_MIGRATIONS) {
    const client = await pool.connect()
    try {
      await client.query("begin")
      await client.query("select pg_advisory_xact_lock(515151)")
      const { rows } = await client.query("select 1 from migrations where name = $1", [name])
      if (!rows.length) {
        await client.query(sql)
        await client.query("insert into migrations (name) values ($1)", [name])
        console.log(`db: migración aplicada · ${name}`)
      }
      await client.query("commit")
    } catch (e) {
      await client.query("rollback")
      throw e
    } finally {
      client.release()
    }
  }
}

const SEED_SERVICES: Array<[string, string, number]> = [
  ["Depilación láser", "Láser diodo de alta potencia, con un plan adaptado a tu tipo de piel, zona y objetivos. Rostro y cuerpo completo.", 30],
  ["Consulta de medicina estética", "Evaluación personalizada para definir tratamientos con resultados naturales y armónicos.", 30],
  ["HIFU", "Ultrasonido focalizado de alta intensidad para un lifting no invasivo. Requiere evaluación previa.", 60],
]

const globalForDb = globalThis as unknown as { eternaPool?: Pool; eternaReady?: Promise<void> }

function createPool(): Pool {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error("Falta DATABASE_URL")
  const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url) || url.includes(".railway.internal")
  return new Pool({ connectionString: url, max: 5, ssl: local ? undefined : { rejectUnauthorized: false } })
}

async function init(pool: Pool) {
  await pool.query(SCHEMA)
  await runDataMigrations(pool)
  const { rows } = await pool.query("select count(*)::int as n from services")
  if (rows[0].n === 0) {
    for (const [i, [name, description, duration]] of SEED_SERVICES.entries()) {
      await pool.query("insert into services (name, description, duration_min, sort) values ($1, $2, $3, $4)", [name, description, duration, i])
    }
  }
}

export async function db(): Promise<Pool> {
  if (!globalForDb.eternaPool) globalForDb.eternaPool = createPool()
  const pool = globalForDb.eternaPool
  if (!globalForDb.eternaReady) {
    globalForDb.eternaReady = init(pool).catch((e) => {
      globalForDb.eternaReady = undefined
      throw e
    })
  }
  await globalForDb.eternaReady
  return pool
}

export async function transaction<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await (await db()).connect()
  try {
    await client.query("begin")
    const result = await fn(client)
    await client.query("commit")
    return result
  } catch (e) {
    await client.query("rollback")
    throw e
  } finally {
    client.release()
  }
}
