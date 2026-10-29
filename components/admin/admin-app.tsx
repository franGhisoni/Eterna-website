"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Bot, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, ExternalLink, LogOut, Plus, Save, Settings2, Sparkles, Trash2, Users } from "lucide-react"
import type { Settings, ReasoningEffort } from "@/lib/server/settings"
import { addDays, formatARS, formatDay, TIME_ZONE, todayAR, weekdayOf } from "@/lib/time"

type Status = { openai: boolean; mercadoPago: "off" | "test" | "produccion"; webhookSecret: boolean }
type Service = {
  id: number
  name: string
  description: string
  duration_min: number
  price: number
  deposit: number
  active: boolean
  sort: number
  category: string
  kind: string
  gender: string
  detail: string
}
type Booking = {
  id: string
  service_name: string
  starts_at: string
  name: string
  phone: string
  email: string
  deposit: number
  price: number
  mp_payment_id: string | null
  state: "pending_payment" | "confirmed" | "cancelled" | "conflict" | "expired"
}
type RangeRow = { start: string; end: string }

const field = "h-10 w-full rounded-lg border border-premium bg-white px-3 text-sm text-premium outline-none focus:border-primary/40 focus:ring-[3px] focus:ring-primary/10"
const fieldInline = "h-10 rounded-lg border border-premium bg-white px-3 text-sm text-premium outline-none focus:border-primary/40 focus:ring-[3px] focus:ring-primary/10"
const btn ="inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-premium disabled:opacity-50"
const btnPrimary = `${btn} bg-primary text-primary-foreground hover:bg-primary/90`
const btnGhost = `${btn} border border-premium bg-white text-premium hover:bg-secondary`
const btnIcon = "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-premium bg-white text-premium transition-premium hover:bg-secondary"
const panel ="rounded-2xl border border-premium bg-white p-5 shadow-premium sm:p-6"

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } })
  if (res.status === 401) {
    window.location.href = "/admin/login"
    throw new Error("no_autorizado")
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "error")
  return data as T
}

function useFlash() {
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null)
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 3500)
    return () => clearTimeout(t)
  }, [msg])
  const show = useCallback((text: string, error = false) => setMsg({ text, error }), [])
  return [msg, show] as const
}

const TABS = [
  { id: "turnos", label: "Turnos", icon: ClipboardList },
  { id: "agenda", label: "Agenda", icon: CalendarDays },
  { id: "pacientes", label: "Pacientes", icon: Users },
  { id: "servicios", label: "Servicios", icon: Sparkles },
  { id: "asistente", label: "Asistente IA", icon: Bot },
  { id: "config", label: "Configuración", icon: Settings2 },
] as const
type TabId = (typeof TABS)[number]["id"]

export function AdminApp() {
  const router = useRouter()
  const [tab, setTab] = useState<TabId>("turnos")
  const [settings, setSettings] = useState<Settings | null>(null)
  const [status, setStatus] = useState<Status | null>(null)
  const [flash, setFlash] = useFlash()

  useEffect(() => {
    api<{ settings: Settings; status: Status }>("/api/admin/settings")
      .then((d) => {
        setSettings(d.settings)
        setStatus(d.status)
      })
      .catch(() => setFlash("No se pudo cargar la configuración. ¿Está DATABASE_URL?", true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const saveSettings = async (next: Settings) => {
    try {
      const d = await api<{ settings: Settings }>("/api/admin/settings", { method: "PUT", body: JSON.stringify(next) })
      setSettings(d.settings)
      setFlash("Cambios guardados")
    } catch {
      setFlash("No se pudo guardar", true)
    }
  }

  const logout = async () => {
    await fetch("/api/admin/login", { method: "DELETE" })
    router.replace("/admin/login")
  }

  return (
    <div className="min-h-screen bg-premium-light">
      <header className="sticky top-0 z-20 border-b border-premium bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <img src="/eterna-logo.webp" alt="" className="h-7 w-auto" />
          <p className="font-berlys text-xl leading-none text-premium">eterna</p>
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs text-primary">Panel</span>
          <div className="ml-auto flex items-center gap-2">
            <a href="/chat" target="_blank" className={`${btnGhost} hidden sm:inline-flex`}>
              <ExternalLink className="h-4 w-4" /> Ver chat
            </a>
            <button onClick={logout} className={btnGhost} aria-label="Cerrar sesión">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4" aria-label="Secciones">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={[
                "flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-premium",
                tab === t.id ? "border-primary font-medium text-primary" : "border-transparent text-premium/60 hover:text-premium",
              ].join(" ")}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {tab === "turnos" && <BookingsTab flash={setFlash} />}
        {tab === "agenda" && <AgendaTab flash={setFlash} />}
        {tab === "pacientes" && <PatientsTab flash={setFlash} />}
        {tab === "servicios" && <ServicesTab flash={setFlash} />}
        {tab === "asistente" && settings && <AiTab settings={settings} status={status} save={saveSettings} />}
        {tab === "config" && settings && <ConfigTab settings={settings} status={status} save={saveSettings} />}
      </main>

      {flash && (
        <div role="status" className={`fixed bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm shadow-premium-lg ${flash.error ? "bg-destructive text-white" : "bg-[#3c2f2f] text-white"}`}>
          {flash.text}
        </div>
      )}
    </div>
  )
}

/* ───────────── Turnos ───────────── */

const STATE_LABEL: Record<Booking["state"], { label: string; cls: string }> = {
  confirmed: { label: "Confirmado", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  pending_payment: { label: "Esperando seña", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  expired: { label: "Seña vencida", cls: "bg-stone-100 text-stone-500 border-stone-200" },
  cancelled: { label: "Cancelado", cls: "bg-stone-100 text-stone-500 border-stone-200" },
  conflict: { label: "Pagado · revisar", cls: "bg-red-50 text-red-700 border-red-200" },
}

function BookingsTab({ flash }: { flash: (t: string, e?: boolean) => void }) {
  const [bookings, setBookings] = useState<Booking[] | null>(null)
  const [showInactive, setShowInactive] = useState(false)

  const load = useCallback(() => {
    api<{ bookings: Booking[] }>(`/api/admin/bookings?desde=${addDays(todayAR(), -7)}`)
      .then((d) => setBookings(d.bookings))
      .catch(() => flash("No se pudieron cargar los turnos", true))
  }, [flash])
  useEffect(load, [load])

  const change = async (b: Booking, status: "confirmed" | "cancelled") => {
    if (status === "cancelled" && !confirm(`¿Cancelar el turno de ${b.name}? El horario queda libre.`)) return
    try {
      await api("/api/admin/bookings", { method: "PATCH", body: JSON.stringify({ id: b.id, status }) })
      flash(status === "confirmed" ? "Turno confirmado" : "Turno cancelado")
      load()
    } catch {
      flash("No se pudo actualizar", true)
    }
  }

  const visible = (bookings ?? []).filter((b) => showInactive || (b.state !== "cancelled" && b.state !== "expired"))
  const byDay = useMemo(() => {
    const map = new Map<string, Booking[]>()
    for (const b of visible) {
      const d = todayAR(new Date(b.starts_at))
      map.set(d, [...(map.get(d) ?? []), b])
    }
    return Array.from(map)
  }, [visible])

  const time = (iso: string) => new Intl.DateTimeFormat("es-AR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso))

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-premium">Turnos</h1>
          <p className="text-sm text-premium/60">Desde hace 7 días en adelante.</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-premium/70">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="accent-[#882626]" />
          Mostrar cancelados y vencidos
        </label>
      </div>
      {bookings === null ? (
        <p className="text-sm text-premium/60">Cargando…</p>
      ) : byDay.length === 0 ? (
        <div className={panel}><p className="text-sm text-premium/60">No hay turnos todavía.</p></div>
      ) : (
        byDay.map(([day, list]) => (
          <div key={day} className={panel}>
            <p className="font-medium text-premium">{formatDay(day)}</p>
            <ul className="mt-3 divide-y divide-border">
              {list.map((b) => (
                <li key={b.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
                  <p className="w-14 shrink-0 font-serif text-lg font-semibold text-premium">{time(b.starts_at)}</p>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-premium">{b.name} <span className="font-normal text-premium/55">· {b.service_name}</span></p>
                    <p className="text-sm text-premium/60">
                      <a className="hover:text-primary" href={`https://wa.me/${b.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">{b.phone}</a>
                      {b.email && <> · {b.email}</>}
                      {b.deposit > 0 && <> · Seña {formatARS(b.deposit)}{b.mp_payment_id ? ` (MP ${b.mp_payment_id})` : ""}</>}
                    </p>
                  </div>
                  <span className={`w-fit shrink-0 rounded-full border px-2.5 py-0.5 text-xs ${STATE_LABEL[b.state].cls}`}>{STATE_LABEL[b.state].label}</span>
                  <div className="flex shrink-0 gap-2">
                    {b.state !== "confirmed" && b.state !== "cancelled" && (
                      <button onClick={() => change(b, "confirmed")} className={`${btnGhost} h-8 px-3 text-xs`}>Confirmar</button>
                    )}
                    {b.state !== "cancelled" && (
                      <button onClick={() => change(b, "cancelled")} className={`${btnGhost} h-8 px-3 text-xs text-destructive`}>Cancelar</button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  )
}

/* ───────────── Agenda ───────────── */

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
const WEEKDAY_NUM = [1, 2, 3, 4, 5, 6, 0]

function RangesEditor({ ranges, onChange }: { ranges: RangeRow[]; onChange: (r: RangeRow[]) => void }) {
  return (
    <div className="space-y-2">
      {ranges.map((r, i) => (
        <div key={i} className="flex items-center gap-2">
          <input type="time" value={r.start} onChange={(e) => onChange(ranges.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} className={field} aria-label="Desde" />
          <span className="text-premium/50">a</span>
          <input type="time" value={r.end} onChange={(e) => onChange(ranges.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} className={field} aria-label="Hasta" />
          <button onClick={() => onChange(ranges.filter((_, j) => j !== i))} className={btnIcon} aria-label="Quitar franja">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button onClick={() => onChange([...ranges, ranges.length ? { start: "15:00", end: "19:00" } : { start: "10:00", end: "13:00" }])} className={`${btnGhost} h-9 text-xs`}>
        <Plus className="h-3.5 w-3.5" /> Agregar franja
      </button>
    </div>
  )
}

function AgendaTab({ flash }: { flash: (t: string, e?: boolean) => void }) {
  const [month, setMonth] = useState(() => todayAR().slice(0, 7))
  const [ranges, setRanges] = useState<Array<{ day: string; start_time: string; end_time: string }>>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<RangeRow[]>([])
  const [bulk, setBulk] = useState({ from: todayAR(), to: addDays(todayAR(), 27), weekdays: [1, 2, 3, 4, 5], ranges: [{ start: "10:00", end: "19:00" }] as RangeRow[] })

  const first = `${month}-01`
  const last = addDays(addDays(first, 32).slice(0, 8) + "01", -1)

  const load = useCallback(() => {
    api<{ ranges: typeof ranges }>(`/api/admin/agenda?desde=${first}&hasta=${last}`)
      .then((d) => setRanges(d.ranges))
      .catch(() => flash("No se pudo cargar la agenda", true))
  }, [first, last, flash])
  useEffect(load, [load])

  const byDay = useMemo(() => {
    const m = new Map<string, RangeRow[]>()
    for (const r of ranges) m.set(r.day, [...(m.get(r.day) ?? []), { start: r.start_time, end: r.end_time }])
    return m
  }, [ranges])

  const select = (day: string) => {
    setSelected(day)
    setEditing(byDay.get(day) ?? [])
  }

  const saveDay = async (rows: RangeRow[]) => {
    if (!selected) return
    try {
      await api("/api/admin/agenda", { method: "PUT", body: JSON.stringify({ day: selected, ranges: rows }) })
      flash(rows.length ? "Día guardado" : "Día sin atención")
      setEditing(rows)
      load()
    } catch (e) {
      flash(e instanceof Error && e.message === "horarios_invalidos" ? "Revisá las franjas: el fin debe ser posterior al inicio y no pueden superponerse" : "No se pudo guardar", true)
    }
  }

  const applyBulk = async () => {
    try {
      const r = await api<{ days: number }>("/api/admin/agenda", { method: "PUT", body: JSON.stringify(bulk) })
      flash(`Aplicado a ${r.days} días`)
      load()
    } catch (e) {
      flash(e instanceof Error && e.message === "horarios_invalidos" ? "Revisá las franjas horarias" : "No se pudo aplicar", true)
    }
  }

  const lead = (weekdayOf(first) + 6) % 7
  const cells: Array<string | null> = [...Array(lead).fill(null)]
  for (let d = first; d <= last; d = addDays(d, 1)) cells.push(d)
  const today = todayAR()
  const monthLabel = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${first}T12:00:00Z`))
  const shift = (n: number) => {
    const [y, m] = month.split("-").map(Number)
    const d = new Date(Date.UTC(y, m - 1 + n, 1))
    setMonth(d.toISOString().slice(0, 7))
    setSelected(null)
  }

  return (
    <section className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold text-premium">Agenda disponible</h1>
        <p className="text-sm text-premium/60">Definí qué días y en qué franjas se pueden reservar turnos. El chat ofrece solo estos horarios.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className={panel}>
          <div className="flex items-center justify-between">
            <button onClick={() => shift(-1)} className={btnIcon} aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" /></button>
            <p className="font-medium text-premium first-letter:uppercase">{monthLabel}</p>
            <button onClick={() => shift(1)} className={btnIcon} aria-label="Mes siguiente"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-xs text-premium/55">
            {WEEKDAYS.map((w) => <div key={w}>{w}</div>)}
          </div>
          <div className="mt-2 grid grid-cols-7 gap-1.5">
            {cells.map((d, i) =>
              d === null ? (
                <div key={`e${i}`} />
              ) : (
                <button
                  key={d}
                  onClick={() => select(d)}
                  className={[
                    "flex min-h-[64px] flex-col items-start rounded-lg border p-1.5 text-left transition-premium sm:min-h-[76px] sm:p-2",
                    selected === d ? "border-primary ring-2 ring-primary/15" : "border-premium hover:border-primary/40",
                    byDay.has(d) ? "bg-secondary/60" : "bg-white",
                    d < today ? "opacity-50" : "",
                  ].join(" ")}
                >
                  <span className={`text-sm font-medium ${d === today ? "text-primary" : "text-premium"}`}>{Number(d.slice(8))}</span>
                  {(byDay.get(d) ?? []).map((r) => (
                    <span key={r.start} className="mt-0.5 hidden text-[10px] leading-tight text-primary sm:block">{r.start}–{r.end}</span>
                  ))}
                  {byDay.has(d) && <span className="mt-auto h-1.5 w-1.5 rounded-full bg-primary sm:hidden" />}
                </button>
              ),
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className={panel}>
            {selected ? (
              <>
                <p className="font-medium text-premium">{formatDay(selected)}</p>
                <p className="mb-3 text-xs text-premium/55">Franjas en las que se puede reservar.</p>
                <RangesEditor ranges={editing} onChange={setEditing} />
                <div className="mt-4 flex gap-2">
                  <button onClick={() => saveDay(editing)} className={btnPrimary}><Save className="h-4 w-4" /> Guardar</button>
                  <button onClick={() => saveDay([])} className={btnGhost}>Sin atención</button>
                </div>
              </>
            ) : (
              <p className="text-sm text-premium/60">Elegí un día del calendario para editar sus horarios.</p>
            )}
          </div>

          <div className={panel}>
            <p className="font-medium text-premium">Carga rápida</p>
            <p className="mb-3 text-xs text-premium/55">Aplica las mismas franjas a varios días. Reemplaza lo que ya haya en esos días.</p>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-premium/60">Desde<input type="date" value={bulk.from} onChange={(e) => setBulk({ ...bulk, from: e.target.value })} className={`${field} mt-1`} /></label>
              <label className="text-xs text-premium/60">Hasta<input type="date" value={bulk.to} onChange={(e) => setBulk({ ...bulk, to: e.target.value })} className={`${field} mt-1`} /></label>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {WEEKDAYS.map((w, i) => {
                const n = WEEKDAY_NUM[i]
                const on = bulk.weekdays.includes(n)
                return (
                  <button key={w} onClick={() => setBulk({ ...bulk, weekdays: on ? bulk.weekdays.filter((x) => x !== n) : [...bulk.weekdays, n] })} className={`h-8 rounded-full border px-3 text-xs transition-premium ${on ? "border-primary bg-primary text-primary-foreground" : "border-premium bg-white text-premium/70"}`}>
                    {w}
                  </button>
                )
              })}
            </div>
            <div className="mt-3"><RangesEditor ranges={bulk.ranges} onChange={(r) => setBulk({ ...bulk, ranges: r })} /></div>
            <button onClick={applyBulk} disabled={!bulk.weekdays.length} className={`${btnPrimary} mt-4 w-full`}>Aplicar</button>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ───────────── Servicios ───────────── */

const GENDERS = ["", "Femenina", "Masculino", "Unisex"]
const KINDS = ["", "Zona suelta", "Combo", "Consulta"]

function ServiceRow({ s, update, save, remove }: { s: Service; update: (p: Partial<Service>) => void; save: () => void; remove: () => void }) {
  const [open, setOpen] = useState(s.id < 0)
  const small = "h-9 w-full rounded-md border border-premium bg-white px-2 text-sm text-premium outline-none focus:border-primary/40"
  return (
    <li className="py-2.5">
      <div className="grid grid-cols-2 items-center gap-2 md:grid-cols-[minmax(0,1.6fr)_110px_110px_80px_100px_100px_auto]">
        <input value={s.name} onChange={(e) => update({ name: e.target.value })} className={`${small} col-span-2 font-medium md:col-span-1`} aria-label="Nombre" placeholder="Nombre" />
        <select value={s.gender} onChange={(e) => update({ gender: e.target.value })} className={small} aria-label="Género">
          {GENDERS.map((g) => <option key={g} value={g}>{g || "Género"}</option>)}
        </select>
        <select value={s.kind} onChange={(e) => update({ kind: e.target.value })} className={small} aria-label="Tipo">
          {KINDS.map((k) => <option key={k} value={k}>{k || "Tipo"}</option>)}
        </select>
        <label className="flex items-center gap-1 text-xs text-premium/55"><input type="number" min={5} step={5} value={s.duration_min} onChange={(e) => update({ duration_min: Number(e.target.value) })} className={small} aria-label="Duración en minutos" />min</label>
        <label className="flex items-center gap-1 text-xs text-premium/55">$<input type="number" min={0} value={s.price} onChange={(e) => update({ price: Number(e.target.value) })} className={small} aria-label="Precio" /></label>
        <label className="flex items-center gap-1 text-xs text-premium/55" title="Seña">S<input type="number" min={0} value={s.deposit} onChange={(e) => update({ deposit: Number(e.target.value) })} className={small} aria-label="Seña" /></label>
        <div className="col-span-2 flex items-center justify-end gap-1.5 md:col-span-1">
          <label className="mr-1 flex items-center gap-1.5 text-xs text-premium/60" title="Visible y reservable">
            <input type="checkbox" checked={s.active} onChange={(e) => update({ active: e.target.checked })} className="accent-[#882626]" /> Activo
          </label>
          <button onClick={() => setOpen(!open)} className={`${btnGhost} h-9 px-2.5 text-xs`}>{open ? "Menos" : "Más"}</button>
          <button onClick={remove} className={`${btnIcon} h-9 w-9 text-destructive`} aria-label="Eliminar servicio"><Trash2 className="h-4 w-4" /></button>
          <button onClick={save} className={`${btnPrimary} h-9 px-3`} aria-label="Guardar servicio"><Save className="h-4 w-4" /></button>
        </div>
      </div>
      {open && (
        <div className="mt-2 grid gap-2 md:grid-cols-[200px_1fr_1fr]">
          <label className="text-xs text-premium/60">Tratamiento<input value={s.category} onChange={(e) => update({ category: e.target.value })} className={`${small} mt-1`} /></label>
          <label className="text-xs text-premium/60">Zonas incluidas<input value={s.detail} onChange={(e) => update({ detail: e.target.value })} className={`${small} mt-1`} /></label>
          <label className="text-xs text-premium/60">Descripción para el cliente<input value={s.description} onChange={(e) => update({ description: e.target.value })} className={`${small} mt-1`} /></label>
        </div>
      )}
    </li>
  )
}

function ServicesTab({ flash }: { flash: (t: string, e?: boolean) => void }) {
  const [services, setServices] = useState<Service[] | null>(null)
  const [query, setQuery] = useState("")

  const load = useCallback(() => {
    api<{ services: Service[] }>("/api/admin/services").then((d) => setServices(d.services)).catch(() => flash("No se pudieron cargar los servicios", true))
  }, [flash])
  useEffect(load, [load])

  const update = (id: number, patch: Partial<Service>) => setServices((v) => v?.map((s) => (s.id === id ? { ...s, ...patch } : s)) ?? v)

  const save = async (s: Service) => {
    try {
      await api("/api/admin/services", { method: s.id > 0 ? "PUT" : "POST", body: JSON.stringify(s) })
      flash("Servicio guardado")
      load()
    } catch {
      flash("Revisá los datos del servicio", true)
    }
  }

  const remove = async (s: Service) => {
    if (s.id < 0) return setServices((v) => v?.filter((x) => x.id !== s.id) ?? v)
    if (!confirm(`¿Eliminar "${s.name}"? Los turnos ya tomados se conservan.`)) return
    await api(`/api/admin/services?id=${s.id}`, { method: "DELETE" }).catch(() => flash("No se pudo eliminar", true))
    load()
  }

  const add = (category: string) =>
    setServices((v) => [...(v ?? []), { id: -Date.now(), name: "", description: "", duration_min: 30, price: 0, deposit: 0, active: true, sort: (v?.length ?? 0) * 10, category, kind: "", gender: "", detail: "" }])

  const q = query.trim().toLowerCase()
  const groups = useMemo(() => {
    const m = new Map<string, Service[]>()
    for (const s of services ?? []) {
      if (q && !`${s.name} ${s.category} ${s.detail} ${s.gender}`.toLowerCase().includes(q)) continue
      const k = s.category || "Otros"
      m.set(k, [...(m.get(k) ?? []), s])
    }
    return Array.from(m)
  }, [services, q])

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-premium">Servicios y precios</h1>
          <p className="text-sm text-premium/60">Lo que se puede reservar desde el chat. Con seña (S) mayor a 0 se cobra por Mercado Pago; con 0 el turno se confirma directo.</p>
        </div>
        <div className="flex gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar…" className={`${fieldInline} w-44`} aria-label="Buscar servicio" />
          <button onClick={() => add("")} className={btnPrimary}><Plus className="h-4 w-4" /> Nuevo</button>
        </div>
      </div>
      {services === null ? (
        <p className="text-sm text-premium/60">Cargando…</p>
      ) : (
        groups.map(([category, list]) => (
          <div key={category} className={panel}>
            <div className="flex items-center justify-between">
              <p className="font-serif text-lg font-semibold text-premium">{category} <span className="text-sm font-normal text-premium/50">· {list.length}</span></p>
              <button onClick={() => add(category === "Otros" ? "" : category)} className={`${btnGhost} h-8 text-xs`}><Plus className="h-3.5 w-3.5" /> Agregar</button>
            </div>
            <ul className="mt-2 divide-y divide-border">
              {list.map((s) => (
                <ServiceRow key={s.id} s={s} update={(p) => update(s.id, p)} save={() => save(s)} remove={() => remove(s)} />
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  )
}

/* ───────────── Pacientes ───────────── */

type Patient = {
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
  next_appointment: string | null
  notes: string
}

const PATIENT_STATUSES = ["Activa", "Pausada", "Dejó", "Finalizó"]
const STATUS_CLS: Record<string, string> = {
  Activa: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Pausada: "bg-amber-50 text-amber-700 border-amber-200",
  Dejó: "bg-stone-100 text-stone-500 border-stone-200",
  Finalizó: "bg-sky-50 text-sky-700 border-sky-200",
}

const toLocalInput = (iso: string | null) => {
  if (!iso) return ""
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000)
  return d.toISOString().slice(0, 16)
}
const fromLocalInput = (v: string) => (v ? `${v}:00-03:00` : null)
const shortDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("es-AR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)) : "—"

function PatientForm({ p, onClose, onSaved, flash }: { p: Patient; onClose: () => void; onSaved: () => void; flash: (t: string, e?: boolean) => void }) {
  const [f, setF] = useState(p)
  const set = (patch: Partial<Patient>) => setF((v) => ({ ...v, ...patch }))
  const save = async () => {
    try {
      await api("/api/admin/patients", { method: f.id > 0 ? "PUT" : "POST", body: JSON.stringify(f) })
      flash("Paciente guardado")
      onSaved()
    } catch {
      flash("Revisá los datos (el nombre es obligatorio)", true)
    }
  }
  const remove = async () => {
    if (!confirm(`¿Eliminar a ${f.name}?`)) return
    await api(`/api/admin/patients?id=${f.id}`, { method: "DELETE" }).catch(() => flash("No se pudo eliminar", true))
    onSaved()
  }
  const lbl = "text-xs text-premium/60"
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/20" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-premium-lg" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Paciente">
        <div className="flex items-center justify-between">
          <p className="font-serif text-xl font-bold text-premium">{f.id > 0 ? "Editar paciente" : "Nuevo paciente"}</p>
          <button onClick={onClose} className={`${btnGhost} h-9`}>Cerrar</button>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <label className={`${lbl} col-span-2`}>Nombre<input value={f.name} onChange={(e) => set({ name: e.target.value })} className={`${field} mt-1`} /></label>
          <label className={lbl}>Teléfono<input value={f.phone} onChange={(e) => set({ phone: e.target.value })} className={`${field} mt-1`} /></label>
          <label className={lbl}>Género<select value={f.gender} onChange={(e) => set({ gender: e.target.value })} className={`${field} mt-1`}>{["", "Mujer", "Hombre", "Otro"].map((g) => <option key={g} value={g}>{g || "—"}</option>)}</select></label>
          <label className={`${lbl} col-span-2`}>Tratamiento / zonas<input value={f.treatments} onChange={(e) => set({ treatments: e.target.value })} className={`${field} mt-1`} /></label>
          <label className={lbl}>Estado<select value={f.status} onChange={(e) => set({ status: e.target.value })} className={`${field} mt-1`}>{PATIENT_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
          <label className={lbl}>Sesiones realizadas<input type="number" min={0} value={f.sessions_done} onChange={(e) => set({ sessions_done: Number(e.target.value) })} className={`${field} mt-1`} /></label>
          <label className={lbl}>Seña (ARS)<input type="number" min={0} value={f.deposit} onChange={(e) => set({ deposit: Number(e.target.value) })} className={`${field} mt-1`} /></label>
          <label className={lbl}>Resta abonar (ARS)<input type="number" min={0} value={f.balance} onChange={(e) => set({ balance: Number(e.target.value) })} className={`${field} mt-1`} /></label>
          <label className={lbl}>Primera sesión<input type="date" value={f.first_session ?? ""} onChange={(e) => set({ first_session: e.target.value || null })} className={`${field} mt-1`} /></label>
          <label className={lbl}>Última sesión<input type="date" value={f.last_session ?? ""} onChange={(e) => set({ last_session: e.target.value || null })} className={`${field} mt-1`} /></label>
          <label className={`${lbl} col-span-2`}>Próximo turno<input type="datetime-local" value={toLocalInput(f.next_appointment)} onChange={(e) => set({ next_appointment: fromLocalInput(e.target.value) })} className={`${field} mt-1`} /></label>
          <label className={`${lbl} col-span-2`}>Notas<textarea rows={4} value={f.notes} onChange={(e) => set({ notes: e.target.value })} className={`${field} mt-1 h-auto py-2`} /></label>
        </div>
        <div className="mt-5 flex gap-2">
          <button onClick={save} className={btnPrimary}><Save className="h-4 w-4" /> Guardar</button>
          {f.phone && <a href={`https://wa.me/${f.phone.replace(/\D/g, "").replace(/^(?!54)/, "549")}`} target="_blank" rel="noreferrer" className={btnGhost}>WhatsApp</a>}
          {f.id > 0 && <button onClick={remove} className={`${btnIcon} ml-auto text-destructive`} aria-label="Eliminar paciente"><Trash2 className="h-4 w-4" /></button>}
        </div>
      </div>
    </div>
  )
}

function PatientsTab({ flash }: { flash: (t: string, e?: boolean) => void }) {
  const [patients, setPatients] = useState<Patient[] | null>(null)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("Activa")
  const [editing, setEditing] = useState<Patient | null>(null)

  const load = useCallback(() => {
    api<{ patients: Patient[] }>("/api/admin/patients").then((d) => setPatients(d.patients)).catch(() => flash("No se pudieron cargar los pacientes", true))
  }, [flash])
  useEffect(load, [load])

  const q = query.trim().toLowerCase()
  const visible = (patients ?? []).filter((p) => (!status || p.status === status) && (!q || `${p.name} ${p.phone} ${p.treatments}`.toLowerCase().includes(q)))
  const totals = visible.reduce((a, p) => ({ balance: a.balance + p.balance, sessions: a.sessions + p.sessions_done }), { balance: 0, sessions: 0 })
  const blank: Patient = { id: -1, name: "", phone: "", gender: "", treatments: "", sessions_done: 0, deposit: 0, balance: 0, status: "Activa", first_session: null, last_session: null, next_appointment: null, notes: "" }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-premium">Pacientes</h1>
          <p className="text-sm text-premium/60">{visible.length} pacientes · {totals.sessions} sesiones realizadas · {formatARS(totals.balance)} por cobrar</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar nombre, teléfono, zona…" className={`${fieldInline} w-56`} aria-label="Buscar paciente" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${fieldInline} w-32`} aria-label="Estado">
            <option value="">Todos</option>
            {PATIENT_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <button onClick={() => setEditing(blank)} className={btnPrimary}><Plus className="h-4 w-4" /> Nuevo</button>
        </div>
      </div>
      <div className={`${panel} overflow-x-auto p-0 sm:p-0`}>
        {patients === null ? (
          <p className="p-5 text-sm text-premium/60">Cargando…</p>
        ) : (
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-premium text-left text-xs text-premium/55">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-3 py-3 font-medium">Tratamiento</th>
                <th className="px-3 py-3 text-right font-medium">Sesiones</th>
                <th className="px-3 py-3 text-right font-medium">Resta</th>
                <th className="px-3 py-3 font-medium">Próximo turno</th>
                <th className="px-3 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((p) => (
                <tr key={p.id} onClick={() => setEditing(p)} className="cursor-pointer transition-premium hover:bg-secondary/40">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-premium">{p.name}</p>
                    <p className="text-xs text-premium/50">{p.phone || "sin teléfono"}</p>
                  </td>
                  <td className="max-w-[240px] px-3 py-2.5 text-premium/75">{p.treatments || "—"}</td>
                  <td className="px-3 py-2.5 text-right text-premium">{p.sessions_done}</td>
                  <td className={`px-3 py-2.5 text-right ${p.balance > 0 ? "font-medium text-primary" : "text-premium/50"}`}>{p.balance > 0 ? formatARS(p.balance) : "—"}</td>
                  <td className="px-3 py-2.5 text-premium/75">{shortDate(p.next_appointment)}</td>
                  <td className="px-3 py-2.5"><span className={`rounded-full border px-2.5 py-0.5 text-xs ${STATUS_CLS[p.status] ?? STATUS_CLS.Dejó}`}>{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {editing && <PatientForm p={editing} flash={flash} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load() }} />}
    </section>
  )
}

/* ───────────── Asistente IA ───────────── */

const MODELS = ["gpt-5.6-luna", "gpt-5.6-sol", "gpt-5.1", "gpt-5-mini", "gpt-5-nano", "gpt-4.1-mini"]
const EFFORTS: Array<{ value: ReasoningEffort; label: string }> = [
  { value: "none", label: "Sin razonamiento (modelos no razonadores)" },
  { value: "minimal", label: "Mínimo — más rápido" },
  { value: "low", label: "Bajo — recomendado para atención" },
  { value: "medium", label: "Medio" },
  { value: "high", label: "Alto — más lento y costoso" },
]

function AiTab({ settings, status, save }: { settings: Settings; status: Status | null; save: (s: Settings) => Promise<void> }) {
  const [ai, setAi] = useState(settings.ai)
  const dirty = JSON.stringify(ai) !== JSON.stringify(settings.ai)
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-premium">Asistente IA</h1>
          <p className="text-sm text-premium/60">Lo que sabe el chat sobre Eterna y los procedimientos, y qué modelo usa.</p>
        </div>
        <button onClick={() => save({ ...settings, ai })} disabled={!dirty} className={btnPrimary}><Save className="h-4 w-4" /> Guardar</button>
      </div>
      {status && !status.openai && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Falta OPENAI_API_KEY en el servidor: el chat no va a responder hasta configurarla.</p>}
      <div className={`${panel} grid gap-4 sm:grid-cols-2`}>
        <label className="text-sm font-medium text-premium">Modelo de OpenAI
          <input list="models" value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value.trim() })} className={`${field} mt-1.5 font-normal`} />
          <datalist id="models">{MODELS.map((m) => <option key={m} value={m} />)}</datalist>
          <span className="mt-1 block text-xs font-normal text-premium/55">Escribí cualquier modelo disponible en tu cuenta de OpenAI.</span>
        </label>
        <label className="text-sm font-medium text-premium">Nivel de razonamiento
          <select value={ai.reasoning} onChange={(e) => setAi({ ...ai, reasoning: e.target.value as ReasoningEffort })} className={`${field} mt-1.5 font-normal`}>
            {EFFORTS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
          <span className="mt-1 block text-xs font-normal text-premium/55">Más razonamiento mejora respuestas complejas pero tarda más.</span>
        </label>
      </div>
      <div className={panel}>
        <label className="text-sm font-medium text-premium">Conocimiento sobre la empresa y los procedimientos
          <span className="mt-1 block text-xs font-normal text-premium/55">
            Escribí acá todo lo que el asistente debe saber: tratamientos, cuidados previos y posteriores, contraindicaciones generales, preguntas frecuentes, promociones, políticas de cancelación. Los precios, duraciones, dirección y horarios se toman de las otras secciones.
          </span>
          <textarea value={ai.knowledge} onChange={(e) => setAi({ ...ai, knowledge: e.target.value })} rows={22} className={`${field} mt-2 h-auto py-3 font-normal leading-relaxed`} />
        </label>
        <p className="mt-2 text-right text-xs text-premium/50">{ai.knowledge.length.toLocaleString("es-AR")} / 30.000 caracteres</p>
      </div>
    </section>
  )
}

/* ───────────── Configuración ───────────── */

function ConfigTab({ settings, status, save }: { settings: Settings; status: Status | null; save: (s: Settings) => Promise<void> }) {
  const [business, setBusiness] = useState(settings.business)
  const [booking, setBooking] = useState(settings.booking)
  const dirty = JSON.stringify({ business, booking }) !== JSON.stringify({ business: settings.business, booking: settings.booking })
  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/mp/webhook` : ""
  const num = (v: string) => Number(v)

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-premium">Configuración</h1>
          <p className="text-sm text-premium/60">Datos del centro, reglas de reserva e integraciones.</p>
        </div>
        <button onClick={() => save({ ...settings, business, booking })} disabled={!dirty} className={btnPrimary}><Save className="h-4 w-4" /> Guardar</button>
      </div>

      <div className={`${panel} grid gap-4 sm:grid-cols-2`}>
        <p className="font-medium text-premium sm:col-span-2">Datos del centro</p>
        <label className="text-xs text-premium/60">Nombre<input value={business.name} onChange={(e) => setBusiness({ ...business, name: e.target.value })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-premium/60">WhatsApp (con código de país, sin +)<input value={business.whatsapp} onChange={(e) => setBusiness({ ...business, whatsapp: e.target.value })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-premium/60 sm:col-span-2">Dirección (se usa para el mapa)<input value={business.address} onChange={(e) => setBusiness({ ...business, address: e.target.value })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-premium/60 sm:col-span-2">Horario de atención (texto)<input value={business.hours} onChange={(e) => setBusiness({ ...business, hours: e.target.value })} className={`${field} mt-1`} /></label>
      </div>

      <div className={`${panel} grid gap-4 sm:grid-cols-2 lg:grid-cols-4`}>
        <p className="font-medium text-premium sm:col-span-2 lg:col-span-4">Reglas de reserva</p>
        <label className="text-xs text-premium/60">Intervalo entre turnos (min)<input type="number" min={5} value={booking.slotMinutes} onChange={(e) => setBooking({ ...booking, slotMinutes: num(e.target.value) })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-premium/60">Anticipación mínima (horas)<input type="number" min={0} value={booking.minHoursAhead} onChange={(e) => setBooking({ ...booking, minHoursAhead: num(e.target.value) })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-premium/60">Tiempo para pagar la seña (min)<input type="number" min={10} value={booking.holdMinutes} onChange={(e) => setBooking({ ...booking, holdMinutes: num(e.target.value) })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-premium/60">Turnos simultáneos<input type="number" min={1} value={booking.capacity} onChange={(e) => setBooking({ ...booking, capacity: num(e.target.value) })} className={`${field} mt-1`} /></label>
      </div>

      {status && (
        <div className={`${panel} space-y-3 text-sm`}>
          <p className="font-medium text-premium">Integraciones</p>
          <p className="text-premium/75">OpenAI: {status.openai ? "conectado" : "falta OPENAI_API_KEY"}</p>
          <p className="text-premium/75">
            Mercado Pago:{" "}
            {status.mercadoPago === "off" ? "falta MERCADOPAGO_ACCESS_TOKEN (la seña se coordina por WhatsApp)" : status.mercadoPago === "test" ? "modo prueba (credenciales TEST)" : "producción — los cobros son reales"}
          </p>
          {status.mercadoPago !== "off" && (
            <p className="text-premium/75">
              Webhook: configurá <code className="rounded bg-secondary px-1.5 py-0.5 text-xs">{webhookUrl}</code> en Tus integraciones → Webhooks (evento Pagos).
              {!status.webhookSecret && " Opcional: agregá MERCADOPAGO_WEBHOOK_SECRET para validar la firma."}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
