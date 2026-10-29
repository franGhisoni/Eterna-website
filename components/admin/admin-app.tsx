"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Bot, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, ExternalLink, LogOut, Plus, Save, Settings2, Sparkles, Trash2 } from "lucide-react"
import type { Settings, ReasoningEffort } from "@/lib/server/settings"
import { addDays, formatARS, formatDay, TIME_ZONE, todayAR, weekdayOf } from "@/lib/time"

type Status = { openai: boolean; mercadoPago: "off" | "test" | "produccion"; webhookSecret: boolean }
type Service = { id: number; name: string; description: string; duration_min: number; price: number; deposit: number; active: boolean; sort: number }
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
const btn = "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-premium disabled:opacity-50"
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

function ServicesTab({ flash }: { flash: (t: string, e?: boolean) => void }) {
  const [services, setServices] = useState<Service[] | null>(null)

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

  const add = () => setServices((v) => [...(v ?? []), { id: -Date.now(), name: "", description: "", duration_min: 30, price: 0, deposit: 0, active: true, sort: (v?.length ?? 0) }])

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-premium">Servicios</h1>
          <p className="text-sm text-premium/60">Lo que se puede reservar desde el chat. Con seña mayor a 0 se cobra por Mercado Pago; con 0 el turno se confirma directo.</p>
        </div>
        <button onClick={add} className={btnPrimary}><Plus className="h-4 w-4" /> Nuevo servicio</button>
      </div>
      {services?.map((s) => (
        <div key={s.id} className={panel}>
          <div className="grid gap-3 sm:grid-cols-[1fr_110px_140px_140px]">
            <label className="text-xs text-premium/60">Nombre<input value={s.name} onChange={(e) => update(s.id, { name: e.target.value })} className={`${field} mt-1`} /></label>
            <label className="text-xs text-premium/60">Duración (min)<input type="number" min={5} step={5} value={s.duration_min} onChange={(e) => update(s.id, { duration_min: Number(e.target.value) })} className={`${field} mt-1`} /></label>
            <label className="text-xs text-premium/60">Precio (ARS)<input type="number" min={0} value={s.price} onChange={(e) => update(s.id, { price: Number(e.target.value) })} className={`${field} mt-1`} /></label>
            <label className="text-xs text-premium/60">Seña (ARS)<input type="number" min={0} value={s.deposit} onChange={(e) => update(s.id, { deposit: Number(e.target.value) })} className={`${field} mt-1`} /></label>
          </div>
          <label className="mt-3 block text-xs text-premium/60">Descripción (la ve el cliente y la usa el asistente)
            <textarea value={s.description} onChange={(e) => update(s.id, { description: e.target.value })} rows={2} className={`${field} mt-1 h-auto py-2`} />
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-premium/70">
              <input type="checkbox" checked={s.active} onChange={(e) => update(s.id, { active: e.target.checked })} className="accent-[#882626]" /> Visible y reservable
            </label>
            {s.price === 0 && <span className="text-xs text-amber-700">Sin precio: el asistente dirá "a evaluar".</span>}
            <div className="ml-auto flex gap-2">
              <button onClick={() => remove(s)} className={`${btnIcon} text-destructive`} aria-label="Eliminar servicio"><Trash2 className="h-4 w-4" /></button>
              <button onClick={() => save(s)} className={btnPrimary}><Save className="h-4 w-4" /> Guardar</button>
            </div>
          </div>
        </div>
      ))}
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
