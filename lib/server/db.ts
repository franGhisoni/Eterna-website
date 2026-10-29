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
`

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
