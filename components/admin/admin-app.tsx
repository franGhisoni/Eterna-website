"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { BadgePercent, Bot, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Copy, ExternalLink, History, Landmark, LayoutDashboard, LineChart, ListTodo, LogOut, MessagesSquare, ShieldCheck, Stethoscope, Plus, Save, Settings2, Sparkles, Trash2, Users, Wallet } from "lucide-react"
import { AgendaView, CashView, DashboardView, PatientsView } from "./operations"
import { AssistantPreview, InboxView, JornadasView, RecordList, ReportsView, SecurityView, TasksView, TeamView } from "./management"
import type { Settings, ReasoningEffort } from "@/lib/server/settings"
import { DEFAULT_DIALOGUE } from "@/lib/chat-defaults"
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
  online: boolean
  visible_web: boolean
  audience: string
  equipment: string
  indications: string
  contraindications: string
  promo_price: number | null
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
  notes: string
  has_receipt: boolean
  state: "pending_payment" | "pending_review" | "confirmed" | "cancelled" | "conflict" | "expired" | "reserved" | "done" | "no_show"
}
type RangeRow = { start: string; end: string }
const NL = String.fromCharCode(10)

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

type Role = "owner" | "recepcion" | "profesional"
const ALL: Role[] = ["owner", "recepcion", "profesional"]
const STAFF: Role[] = ["owner", "recepcion"]
const OWNER: Role[] = ["owner"]

const TABS = [
  { id: "inicio", label: "Inicio", icon: LayoutDashboard, roles: ALL },
  { id: "turnos", label: "Agenda", icon: ClipboardList, roles: ALL },
  { id: "pacientes", label: "Pacientes", icon: Users, roles: ALL },
  { id: "caja", label: "Caja", icon: Wallet, roles: STAFF },
  { id: "agenda", label: "Jornadas", icon: CalendarDays, roles: STAFF },
  { id: "conversaciones", label: "Conversaciones", icon: MessagesSquare, roles: STAFF },
  { id: "tareas", label: "Tareas", icon: ListTodo, roles: ALL },
  { id: "transferencias", label: "Transferencias", icon: Landmark, roles: STAFF },
  { id: "servicios", label: "Servicios", icon: Sparkles, roles: STAFF },
  { id: "promos", label: "Promociones", icon: BadgePercent, roles: STAFF },
  { id: "equipo", label: "Equipo", icon: Stethoscope, roles: STAFF },
  { id: "reportes", label: "Reportes", icon: LineChart, roles: OWNER },
  { id: "asistente", label: "Asistente IA", icon: Bot, roles: OWNER },
  { id: "config", label: "Configuración", icon: Settings2, roles: OWNER },
  { id: "seguridad", label: "Usuarios", icon: ShieldCheck, roles: OWNER },
] as const
type TabId = (typeof TABS)[number]["id"]

export function AdminApp() {
  const router = useRouter()
  const [tab, setTab] = useState<TabId>("inicio")
  const [openPatient, setOpenPatient] = useState<number | null>(null)
  const showPatient = useCallback((id: number) => {
    setOpenPatient(id)
    setTab("pacientes")
  }, [])
  const patientOpened = useCallback(() => setOpenPatient(null), [])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [status, setStatus] = useState<Status | null>(null)
  const [flash, setFlash] = useFlash()
  const [session, setSession] = useState<{ username: string; role: Role; professional: string } | null>(null)

  useEffect(() => {
    api<{ session: { username: string; role: Role; professional: string } }>("/api/admin/login").then((d) => setSession(d.session)).catch(() => {})
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
            {session && <span className="hidden text-xs text-premium/55 md:inline">{session.username}</span>}
            <button onClick={logout} className={btnGhost} aria-label="Cerrar sesión">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4" aria-label="Secciones">
          {TABS.filter((t) => !session || (t.roles as readonly Role[]).includes(session.role)).map((t) => (
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

      <main className="mx-auto max-w-6xl px-4 py-6 pb-24">
        {tab === "inicio" && <DashboardView flash={setFlash} onPatient={showPatient} go={(t) => setTab(t as TabId)} />}
        {tab === "turnos" && <AgendaView flash={setFlash} onPatient={showPatient} />}
        {tab === "pacientes" && <PatientsView flash={setFlash} openId={openPatient} onOpened={patientOpened} />}
        {tab === "caja" && <CashView flash={setFlash} />}
        {tab === "agenda" && <JornadasView flash={setFlash} />}
        {tab === "conversaciones" && <InboxView flash={setFlash} onPatient={showPatient} />}
        {tab === "tareas" && <TasksView flash={setFlash} onPatient={showPatient} />}
        {tab === "equipo" && <TeamView flash={setFlash} />}
        {tab === "reportes" && <ReportsView flash={setFlash} />}
        {tab === "seguridad" && <SecurityView flash={setFlash} />}
        {tab === "transferencias" && <TransfersTab flash={setFlash} />}
        {tab === "servicios" && <ServicesTab flash={setFlash} canEdit={session?.role === "owner"} />}
        {tab === "promos" && <PromosTab flash={setFlash} canEdit={session?.role === "owner"} />}
        {tab === "asistente" && settings && <AiTab settings={settings} status={status} save={saveSettings} flash={setFlash} />}
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

/* ───────────── Estados (para Transferencias) ───────────── */

const STATE_LABEL: Record<Booking["state"], { label: string; cls: string }> = {
  confirmed: { label: "Confirmado", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  pending_payment: { label: "Esperando seña", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  pending_review: { label: "Comprobante a revisar", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  expired: { label: "Seña vencida", cls: "bg-stone-100 text-stone-500 border-stone-200" },
  cancelled: { label: "Cancelado", cls: "bg-stone-100 text-stone-500 border-stone-200" },
  conflict: { label: "Pagado · revisar", cls: "bg-red-50 text-red-700 border-red-200" },
  reserved: { label: "Reservado", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  done: { label: "Realizado", cls: "bg-teal-50 text-teal-700 border-teal-200" },
  no_show: { label: "Ausente", cls: "bg-orange-50 text-orange-700 border-orange-200" },
}

/* ───────────── Servicios ───────────── */

const GENDERS = ["", "Femenina", "Masculino", "Unisex"]
const KINDS = ["", "Zona suelta", "Combo", "Consulta"]

function PriceHistory({ id }: { id: number }) {
  const [rows, setRows] = useState<Array<{ created_at: string; actor: string; before_price: string | null; after_price: string | null; before_promo: string | null; after_promo: string | null }> | null>(null)
  useEffect(() => {
    api<{ history: NonNullable<typeof rows> }>(`/api/admin/services?historial=${id}`).then((d) => setRows(d.history)).catch(() => setRows([]))
  }, [id])
  if (!rows) return <p className="text-xs text-premium/50">Cargando historial…</p>
  if (!rows.length) return <p className="text-xs text-premium/50">Sin cambios de precio registrados.</p>
  const money = (v: string | null) => (v === null ? "—" : formatARS(Number(v)))
  return (
    <ul className="space-y-0.5 text-xs text-premium/70">
      {rows.map((r, i) => (
        <li key={i}>
          {shortDate(r.created_at)} · {r.actor}: {money(r.before_price)} → {money(r.after_price)}
          {r.before_promo !== r.after_promo && ` · promo ${money(r.before_promo)} → ${money(r.after_promo)}`}
        </li>
      ))}
    </ul>
  )
}

function ServiceRow({ s, update, save, remove, canEdit }: { s: Service; update: (p: Partial<Service>) => void; save: () => void; remove: () => void; canEdit: boolean }) {
  const [open, setOpen] = useState(s.id < 0)
  const [history, setHistory] = useState(false)
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
          <label className="mr-1 flex items-center gap-1.5 text-xs text-premium/60" title="Se realiza actualmente">
            <input type="checkbox" checked={s.active} onChange={(e) => update({ active: e.target.checked })} className="accent-[#882626]" /> Activo
          </label>
          <button onClick={() => setOpen(!open)} className={`${btnGhost} h-9 px-2.5 text-xs`}>{open ? "Menos" : "Más"}</button>
          {canEdit && <button onClick={remove} className={`${btnIcon} h-9 w-9 text-destructive`} aria-label="Eliminar servicio"><Trash2 className="h-4 w-4" /></button>}
          {canEdit && <button onClick={save} className={`${btnPrimary} h-9 px-3`} aria-label="Guardar servicio"><Save className="h-4 w-4" /></button>}
        </div>
      </div>
      {open && (
        <div className="mt-2 grid gap-2 md:grid-cols-[200px_1fr_1fr]">
          <label className="text-xs text-premium/60">Tratamiento<input value={s.category} onChange={(e) => update({ category: e.target.value })} className={`${small} mt-1`} /></label>
          <label className="text-xs text-premium/60">Zonas incluidas<input value={s.detail} onChange={(e) => update({ detail: e.target.value })} className={`${small} mt-1`} /></label>
          <label className="text-xs text-premium/60">Descripción para el cliente<input value={s.description} onChange={(e) => update({ description: e.target.value })} className={`${small} mt-1`} /></label>
          <label className="text-xs text-premium/60">Precio promocional (referencia)<input type="number" min={0} value={s.promo_price ?? ""} onChange={(e) => update({ promo_price: e.target.value === "" ? null : Number(e.target.value) })} className={`${small} mt-1`} /></label>
          <label className="text-xs text-premium/60">Equipo utilizado<input value={s.equipment} onChange={(e) => update({ equipment: e.target.value })} className={`${small} mt-1`} placeholder="Alma Láser Soprano Ice Platinum" /></label>
          <label className="text-xs text-premium/60">Público<input value={s.audience} onChange={(e) => update({ audience: e.target.value })} className={`${small} mt-1`} placeholder="Mujeres, hombres…" /></label>
          <label className="text-xs text-premium/60 md:col-span-3">Indicaciones y cuidados<textarea rows={2} value={s.indications} onChange={(e) => update({ indications: e.target.value })} className={`${small} mt-1 h-auto py-1.5`} /></label>
          <label className="text-xs text-premium/60 md:col-span-3">Contraindicaciones<textarea rows={2} value={s.contraindications} onChange={(e) => update({ contraindications: e.target.value })} className={`${small} mt-1 h-auto py-1.5`} /></label>
          <div className="flex flex-wrap gap-4 md:col-span-3">
            <label className="flex items-center gap-1.5 text-xs text-premium/70"><input type="checkbox" checked={s.online} onChange={(e) => update({ online: e.target.checked })} className="accent-[#882626]" /> Reservable online (chat)</label>
            <label className="flex items-center gap-1.5 text-xs text-premium/70"><input type="checkbox" checked={s.visible_web} onChange={(e) => update({ visible_web: e.target.checked })} className="accent-[#882626]" /> Visible en la web</label>
            {s.id > 0 && <button onClick={() => setHistory(!history)} className="flex items-center gap-1 text-xs text-primary hover:underline"><History className="h-3.5 w-3.5" /> Historial de precios</button>}
          </div>
          {history && <div className="md:col-span-3"><PriceHistory id={s.id} /></div>}
        </div>
      )}
    </li>
  )
}

function ServicesTab({ flash, canEdit }: { flash: (t: string, e?: boolean) => void; canEdit: boolean }) {
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
    if (!confirm(`¿Eliminar "${s.name}"? Si tiene turnos, se desactiva en lugar de borrarse.`)) return
    await api(`/api/admin/services?id=${s.id}`, { method: "DELETE" }).catch(() => flash("No se pudo eliminar", true))
    load()
  }

  const add = (category: string) =>
    setServices((v) => [...(v ?? []), { id: -Date.now(), name: "", description: "", duration_min: 30, price: 0, deposit: 0, active: true, sort: (v?.length ?? 0) * 10, category, kind: "", gender: "", detail: "", online: true, visible_web: true, audience: "", equipment: "", indications: "", contraindications: "", promo_price: null }])

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
          <p className="max-w-3xl text-sm text-premium/60">Lista única de precios: la usan la agenda, el chat y los reportes. Un servicio inactivo o no reservable online no se ofrece en el chat. Cambiar un precio no modifica los turnos ya tomados y queda en el historial.{!canEdit && " (Solo lectura: los precios los modifica administración principal.)"}</p>
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
                <ServiceRow key={s.id} s={s} canEdit={canEdit} update={(p) => update(s.id, p)} save={() => save(s)} remove={() => remove(s)} />
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  )
}

const shortDate = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("es-AR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)) : "—"

/* ───────────── Transferencias ───────────── */

type Transfer = {
  id: string
  service_name: string
  starts_at: string
  name: string
  phone: string
  deposit: number
  state: Booking["state"]
  file_name: string
  mime: string
  uploaded_at: string
  ai_result: "coincide" | "no_coincide" | "ilegible" | "sin_lectura"
  ai_reason: string
  ai_reading: { monto?: unknown; fecha?: unknown; estado?: unknown; destinatario?: { titular?: unknown; alias?: unknown; cbu?: unknown }; banco_destino?: unknown } | null
  verified_at: string | null
}

const AI_LABEL: Record<Transfer["ai_result"], { label: string; cls: string }> = {
  coincide: { label: "IA: coincide", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  no_coincide: { label: "IA: no coincide", cls: "bg-red-50 text-red-700 border-red-200" },
  ilegible: { label: "IA: no se pudo leer", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  sin_lectura: { label: "Sin lectura de IA", cls: "bg-stone-100 text-stone-500 border-stone-200" },
}

const needsReview = (t: Transfer) => !t.verified_at && (t.state === "pending_review" || t.state === "confirmed")

function TransferCard({ t, onDone, flash }: { t: Transfer; onDone: () => void; flash: (m: string, e?: boolean) => void }) {
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const url = `/api/admin/bookings/${t.id}/comprobante`
  const act = async (action: "verify" | "reject") => {
    if (action === "reject" && !confirm(`¿Rechazar el comprobante de ${t.name}? El turno se cancela y el horario queda libre.`)) return
    setBusy(true)
    try {
      await api("/api/admin/transfers", { method: "PATCH", body: JSON.stringify({ id: t.id, action }) })
      flash(action === "verify" ? "Transferencia verificada" : "Comprobante rechazado")
      onDone()
    } catch {
      flash("No se pudo actualizar", true)
    }
    setBusy(false)
  }
  const r = t.ai_reading
  const shown = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "—")
  const rows: Array<[string, string]> = [
    ["Importe leído", typeof r?.monto === "number" ? formatARS(r.monto) : "—"],
    ["Fecha", shown(r?.fecha)],
    ["Estado", shown(r?.estado)],
    ["Titular destino", shown(r?.destinatario?.titular)],
    ["Alias destino", shown(r?.destinatario?.alias)],
    ["CBU/CVU destino", shown(r?.destinatario?.cbu)],
  ]
  return (
    <div className={`${panel} grid gap-5 md:grid-cols-[280px_1fr]`}>
      <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-premium bg-premium-light" aria-label={`Abrir comprobante de ${t.name}`}>
        {t.mime === "application/pdf" ? (
          <div className="flex h-64 items-center justify-center text-sm text-primary">Abrir PDF</div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`Comprobante de ${t.name}`} loading="lazy" className="max-h-96 w-full object-contain" />
        )}
      </a>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-premium">{t.name}</p>
          <span className={`rounded-full border px-2.5 py-0.5 text-xs ${AI_LABEL[t.ai_result].cls}`}>{AI_LABEL[t.ai_result].label}</span>
          <span className={`rounded-full border px-2.5 py-0.5 text-xs ${STATE_LABEL[t.state].cls}`}>{STATE_LABEL[t.state].label}</span>
          {t.verified_at && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-700">Verificada en el banco</span>}
        </div>
        <p className="mt-1 text-sm text-premium/65">{t.service_name} · {shortDate(t.starts_at)} · {t.phone}</p>
        <p className="mt-1 text-sm text-premium">Seña esperada: <strong className="font-semibold">{formatARS(t.deposit)}</strong></p>
        {t.ai_reason && <p className="mt-2 text-sm text-destructive">{t.ai_reason}</p>}
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-border py-1">
              <dt className="text-premium/55">{k}</dt>
              <dd className="break-all text-right text-premium">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-premium/50">Enviado {shortDate(t.uploaded_at)}. La lectura de la IA no prueba el ingreso: un comprobante puede estar falsificado.</p>
        {needsReview(t) && (
          <div className="mt-3 space-y-3">
            <label className="flex items-center gap-2 text-sm text-premium">
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="accent-[#882626]" />
              Verifiqué en el banco que el dinero ingresó a la cuenta.
            </label>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => act("verify")} disabled={!checked || busy} className={btnPrimary}>Confirmar transferencia</button>
              <button onClick={() => act("reject")} disabled={busy} className={`${btnGhost} text-destructive`}>Rechazar y liberar turno</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function TransfersTab({ flash }: { flash: (t: string, e?: boolean) => void }) {
  const [transfers, setTransfers] = useState<Transfer[] | null>(null)
  const [filter, setFilter] = useState("pendientes")

  const load = useCallback(() => {
    api<{ transfers: Transfer[] }>("/api/admin/transfers").then((d) => setTransfers(d.transfers)).catch(() => flash("No se pudieron cargar las transferencias", true))
  }, [flash])
  useEffect(load, [load])

  const list = transfers ?? []
  const pending = list.filter(needsReview)
  const visible =
    filter === "pendientes" ? pending
    : filter === "verificadas" ? list.filter((t) => t.verified_at)
    : filter === "fallidas" ? list.filter((t) => t.state === "pending_payment" || t.state === "expired" || t.state === "cancelled")
    : list

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-premium">Transferencias</h1>
          <p className="max-w-3xl text-sm text-premium/60">La IA lee cada comprobante y, si importe, cuenta y fecha coinciden, confirma el turno. Mirá la imagen y verificá el ingreso en el banco.</p>
          <p className="mt-1 text-sm font-medium text-premium">{pending.length} por verificar · {formatARS(pending.reduce((n, t) => n + t.deposit, 0))}</p>
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className={`${fieldInline} w-48`} aria-label="Filtrar transferencias">
          <option value="pendientes">Por verificar</option>
          <option value="verificadas">Verificadas</option>
          <option value="fallidas">No aprobadas o vencidas</option>
          <option value="todas">Todas</option>
        </select>
      </div>
      {transfers === null ? (
        <p className="text-sm text-premium/60">Cargando…</p>
      ) : visible.length === 0 ? (
        <div className={panel}><p className="text-sm text-premium/60">No hay transferencias para este filtro.</p></div>
      ) : (
        visible.map((t) => <TransferCard key={t.id} t={t} onDone={load} flash={flash} />)
      )}
    </section>
  )
}

/* ───────────── Promociones ───────────── */

type Promo = {
  id: number
  title: string
  description: string
  kind: "percent" | "2x1" | "other"
  percent: number
  sessions: number
  category: string
  starts_on: string | null
  ends_on: string | null
  active: boolean
  chat_visible: boolean
  audience: "todos" | "nuevos" | "existentes"
  max_uses: number
  per_patient: number
  stackable: boolean
  priority: number
  weekdays: string
  conditions: string
  uses?: number
  patients?: number
  revenue?: number
}

const PROMO_WEEKDAYS = [[1, "Lun"], [2, "Mar"], [3, "Mié"], [4, "Jue"], [5, "Vie"], [6, "Sáb"], [0, "Dom"]] as const

function PromoUses({ id }: { id: number }) {
  const [rows, setRows] = useState<Array<{ id: string; name: string; service_name: string; starts_at: string; status: string; final_price: number }> | null>(null)
  useEffect(() => {
    api<{ uses: NonNullable<typeof rows> }>(`/api/admin/promos?usos=${id}`).then((d) => setRows(d.uses)).catch(() => setRows([]))
  }, [id])
  if (!rows) return <p className="text-xs text-premium/50">Cargando…</p>
  if (!rows.length) return <p className="text-xs text-premium/50">Todavía nadie la usó.</p>
  return (
    <ul className="space-y-0.5 text-xs text-premium/70">
      {rows.map((r) => <li key={r.id}>{shortDate(r.starts_at)} · {r.name} · {r.service_name} · {formatARS(r.final_price)}{r.status === "cancelled" ? " (cancelado)" : ""}</li>)}
    </ul>
  )
}

function PromosTab({ flash, canEdit }: { flash: (t: string, e?: boolean) => void; canEdit: boolean }) {
  const [showUses, setShowUses] = useState<number | null>(null)
  const [promos, setPromos] = useState<Promo[] | null>(null)

  const load = useCallback(() => {
    api<{ promos: Promo[] }>("/api/admin/promos").then((d) => setPromos(d.promos)).catch(() => flash("No se pudieron cargar las promociones", true))
  }, [flash])
  useEffect(load, [load])

  const update = (id: number, patch: Partial<Promo>) => setPromos((v) => v?.map((p) => (p.id === id ? { ...p, ...patch } : p)) ?? v)
  const add = () => setPromos((v) => [{ id: -Date.now(), title: "", description: "", kind: "percent", percent: 20, sessions: 0, category: "", starts_on: null, ends_on: null, active: true, chat_visible: true, audience: "todos", max_uses: 0, per_patient: 0, stackable: false, priority: 0, weekdays: "", conditions: "" }, ...(v ?? [])])

  // guardar una promo actualiza solo esa tarjeta: las demás (incluidas las que todavía no se guardaron) quedan intactas
  const save = async (p: Promo) => {
    try {
      const r = await api<{ promo: Promo }>("/api/admin/promos", { method: p.id > 0 ? "PUT" : "POST", body: JSON.stringify(p) })
      setPromos((v) => v?.map((x) => (x.id === p.id ? r.promo : x)) ?? v)
      flash("Promoción guardada")
    } catch {
      flash("Revisá el título, el porcentaje y las fechas", true)
    }
  }

  const duplicate = (p: Promo) => setPromos((v) => [{ ...p, id: -Date.now(), title: `${p.title} (copia)`, active: false }, ...(v ?? [])])

  const remove = async (p: Promo) => {
    if (p.id < 0) return setPromos((v) => v?.filter((x) => x.id !== p.id) ?? v)
    if (!confirm(`¿Eliminar "${p.title}"? Si ya se usó, se pausa en lugar de borrarse (los turnos conservan su precio).`)) return
    try {
      const r = await api<{ result: string }>(`/api/admin/promos?id=${p.id}`, { method: "DELETE" })
      if (r.result === "pausada") {
        setPromos((v) => v?.map((x) => (x.id === p.id ? { ...x, active: false } : x)) ?? v)
        flash("Ya tenía turnos: quedó pausada")
      } else setPromos((v) => v?.filter((x) => x.id !== p.id) ?? v)
    } catch {
      flash("No se pudo eliminar", true)
    }
  }

  const today = todayAR()
  const promoState = (p: Promo) =>
    p.id < 0 ? { label: "Sin guardar", cls: "bg-amber-50 text-amber-700 border-amber-200" }
    : !p.active ? { label: "Pausada", cls: "bg-stone-100 text-stone-500 border-stone-200" }
    : p.ends_on && p.ends_on < today ? { label: "Vencida", cls: "bg-stone-100 text-stone-500 border-stone-200" }
    : p.starts_on && p.starts_on > today ? { label: "Programada", cls: "bg-sky-50 text-sky-700 border-sky-200" }
    : { label: "Activa · la ofrece el chat", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" }
  const live = (promos ?? []).filter((p) => promoState(p).label.startsWith("Activa")).length

  const lbl = "text-xs text-premium/60"
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-premium">Promociones</h1>
          <p className="max-w-3xl text-sm text-premium/60">Podés tener todas las promociones que quieras al mismo tiempo. El chat ofrece las activas y vigentes, y el precio con descuento queda congelado en cada turno: si después cambiás una promo, los turnos ya tomados no se modifican.</p>
          <p className="mt-1 text-sm font-medium text-premium">{live} activas ahora</p>
        </div>
        {canEdit && <button onClick={add} className={btnPrimary}><Plus className="h-4 w-4" /> Nueva promoción</button>}
      </div>
      {promos?.length === 0 && <div className={panel}><p className="text-sm text-premium/60">No hay promociones cargadas.</p></div>}
      {promos?.map((p) => (
        <div key={p.id} className={panel}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className={`${lbl} sm:col-span-2`}>Título<input value={p.title} onChange={(e) => update(p.id, { title: e.target.value })} placeholder="Bienvenida" className={`${field} mt-1`} /></label>
            <label className={lbl}>Tipo
              <select value={p.kind} onChange={(e) => update(p.id, { kind: e.target.value as Promo["kind"] })} className={`${field} mt-1`}>
                <option value="percent">Porcentaje de descuento</option>
                <option value="2x1">2x1</option>
                <option value="other">Otra (la explica el texto)</option>
              </select>
            </label>
            {p.kind === "percent" ? (
              <label className={lbl}>Descuento (%)<input type="number" min={1} max={100} value={p.percent} onChange={(e) => update(p.id, { percent: Number(e.target.value) })} className={`${field} mt-1`} /></label>
            ) : <div className="hidden lg:block" />}
            <label className={lbl}>Primeras N sesiones (0 = todas)<input type="number" min={0} value={p.sessions} onChange={(e) => update(p.id, { sessions: Number(e.target.value) })} className={`${field} mt-1`} /></label>
            <label className={lbl}>Aplica a
              <input list="promo-categories" value={p.category} onChange={(e) => update(p.id, { category: e.target.value })} placeholder="Todos los servicios" className={`${field} mt-1`} />
            </label>
            <label className={lbl}>Desde (opcional)<input type="date" value={p.starts_on ?? ""} onChange={(e) => update(p.id, { starts_on: e.target.value || null })} className={`${field} mt-1`} /></label>
            <label className={lbl}>Hasta (opcional)<input type="date" value={p.ends_on ?? ""} onChange={(e) => update(p.id, { ends_on: e.target.value || null })} className={`${field} mt-1`} /></label>
            <label className={`${lbl} sm:col-span-2 lg:col-span-4`}>Descripción (la explica el asistente)
              <textarea rows={2} value={p.description} onChange={(e) => update(p.id, { description: e.target.value })} placeholder="Ej.: 2x1 en la primera sesión viniendo acompañada." className={`${field} mt-1 h-auto py-2`} />
            </label>
            <label className={lbl}>Para
              <select value={p.audience} onChange={(e) => update(p.id, { audience: e.target.value as Promo["audience"] })} className={`${field} mt-1`}>
                <option value="todos">Todas las personas</option>
                <option value="nuevos">Pacientes nuevos (primeros 3 meses)</option>
                <option value="existentes">Pacientes que ya se atienden</option>
              </select>
            </label>
            <label className={lbl}>Cupo total (0 = sin límite)<input type="number" min={0} value={p.max_uses} onChange={(e) => update(p.id, { max_uses: Number(e.target.value) })} className={`${field} mt-1`} /></label>
            <label className={lbl}>Usos por paciente (0 = sin límite)<input type="number" min={0} value={p.per_patient} onChange={(e) => update(p.id, { per_patient: Number(e.target.value) })} className={`${field} mt-1`} /></label>
            <label className={lbl}>Prioridad<input type="number" value={p.priority} onChange={(e) => update(p.id, { priority: Number(e.target.value) })} className={`${field} mt-1`} /></label>
            <div className="sm:col-span-2">
              <p className={lbl}>Días en que aplica (ninguno = todos)</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {PROMO_WEEKDAYS.map(([n, label]) => {
                  const days = p.weekdays ? p.weekdays.split(",").map(Number) : []
                  const on = days.includes(n)
                  return (
                    <button key={n} onClick={() => update(p.id, { weekdays: (on ? days.filter((d) => d !== n) : [...days, n]).sort().join(",") })} className={`h-8 rounded-full border px-3 text-xs ${on ? "border-primary bg-primary text-primary-foreground" : "border-premium bg-white text-premium/70"}`}>{label}</button>
                  )
                })}
              </div>
            </div>
            <label className={`${lbl} sm:col-span-2`}>Condiciones y restricciones
              <textarea rows={2} value={p.conditions} onChange={(e) => update(p.id, { conditions: e.target.value })} placeholder="Ej.: no aplica a cuerpo completo." className={`${field} mt-1 h-auto py-2`} />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm text-premium/70">
            <label className="flex items-center gap-2"><input type="checkbox" checked={p.chat_visible} onChange={(e) => update(p.id, { chat_visible: e.target.checked })} className="accent-[#882626]" /> El chat la puede comunicar</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={p.stackable} onChange={(e) => update(p.id, { stackable: e.target.checked })} className="accent-[#882626]" /> Acumulable con otras</label>
          </div>
          {p.id > 0 && (
            <p className="mt-2 text-xs text-premium/60">
              Usada {p.uses ?? 0} veces · {p.patients ?? 0} pacientes · {formatARS(p.revenue ?? 0)} en turnos{" "}
              <button onClick={() => setShowUses(showUses === p.id ? null : p.id)} className="text-primary hover:underline">{showUses === p.id ? "ocultar" : "ver quiénes"}</button>
            </p>
          )}
          {showUses === p.id && <div className="mt-1"><PromoUses id={p.id} /></div>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-premium/70">
              <input type="checkbox" checked={p.active} onChange={(e) => update(p.id, { active: e.target.checked })} className="accent-[#882626]" /> Activa
            </label>
            <span className={`rounded-full border px-2.5 py-0.5 text-xs ${promoState(p).cls}`}>{promoState(p).label}</span>
            <button onClick={() => duplicate(p)} className={`${btnIcon} ml-auto`} aria-label="Duplicar promoción" title="Duplicar"><Copy className="h-4 w-4" /></button>
            {canEdit && <button onClick={() => remove(p)} className={`${btnIcon} text-destructive`} aria-label="Eliminar promoción"><Trash2 className="h-4 w-4" /></button>}
            {canEdit && <button onClick={() => save(p)} className={btnPrimary}><Save className="h-4 w-4" /> Guardar</button>}
          </div>
        </div>
      ))}
      <datalist id="promo-categories">
        <option value="Depilación Definitiva" />
        <option value="HIFU" />
        <option value="Medicina Estética" />
      </datalist>
    </section>
  )
}

/* ───────────── Asistente IA ───────────── */

const MODELS = ["gpt-6-luna", "gpt-6-sol", "gpt-6-astra", "gpt-6.1-sol", "gpt-6.1-terra", "gpt-5.6-luna", "gpt-5.6-sol", "gpt-5.6-terra"]
const EFFORTS: Array<{ value: ReasoningEffort; label: string }> = [
  { value: "none", label: "Sin razonamiento (modelos no razonadores)" },
  { value: "minimal", label: "Mínimo — más rápido" },
  { value: "low", label: "Bajo — recomendado para atención" },
  { value: "medium", label: "Medio" },
  { value: "high", label: "Alto — más lento y costoso" },
]

function AiTab({ settings, status, save, flash }: { settings: Settings; status: Status | null; save: (s: Settings) => Promise<void>; flash: (t: string, e?: boolean) => void }) {
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <label htmlFor="dialogue" className="text-sm font-medium text-premium">Forma de conversar y de gestionar
            <span className="mt-1 block max-w-3xl text-xs font-normal text-premium/55">
              Cómo habla el asistente y qué responde en cada situación: tono, pasos para reservar, qué decir cuando no hay turnos. Las reglas de seguridad (no inventar precios ni horarios, no dar un turno por pagado, no dar indicaciones médicas) quedan fijas y no se pueden anular desde acá.
            </span>
          </label>
          <button type="button" onClick={() => setAi({ ...ai, dialogue: DEFAULT_DIALOGUE })} disabled={ai.dialogue === DEFAULT_DIALOGUE} className={`${btnGhost} h-8 text-xs`}>Restaurar texto inicial</button>
        </div>
        <textarea id="dialogue" value={ai.dialogue} onChange={(e) => setAi({ ...ai, dialogue: e.target.value })} rows={18} className={`${field} mt-2 h-auto py-3 font-normal leading-relaxed`} />
        <p className="mt-2 text-right text-xs text-premium/50">{ai.dialogue.length.toLocaleString("es-AR")} / 15.000 caracteres</p>
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
      <AssistantPreview />
      <RecordList
        entity="faqs"
        title="Preguntas frecuentes"
        intro="Respuestas aprobadas por el equipo. El asistente usa solo las activas que tienen respuesta, y tienen prioridad sobre el texto general. Las correcciones hechas desde Conversaciones aparecen acá en la categoría «Correcciones»."
        flash={flash}
        blank={{ question: "", answer: "", category: "General", active: true, sort: 0 }}
        cols={[
          { key: "question", label: "Pregunta", wide: true },
          { key: "answer", label: "Respuesta", type: "longtext", wide: true, placeholder: "Dejala vacía si todavía no está definida: el asistente no la usa." },
          { key: "category", label: "Categoría" },
          { key: "sort", label: "Orden", type: "int" },
          { key: "active", label: "Activa", type: "bool" },
        ]}
      />
    </section>
  )
}

/* ───────────── Configuración ───────────── */

function ConfigTab({ settings, status, save }: { settings: Settings; status: Status | null; save: (s: Settings) => Promise<void> }) {
  const [business, setBusiness] = useState(settings.business)
  const [booking, setBooking] = useState(settings.booking)
  const [transfer, setTransfer] = useState(settings.transfer)
  const [payments, setPayments] = useState(settings.payments)
  const [policies, setPolicies] = useState(settings.policies)
  const [followup, setFollowup] = useState(settings.followup)
  const dirty =
    JSON.stringify({ business, booking, transfer, payments, policies, followup }) !==
    JSON.stringify({ business: settings.business, booking: settings.booking, transfer: settings.transfer, payments: settings.payments, policies: settings.policies, followup: settings.followup })
  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}/api/mp/webhook` : ""
  const num = (v: string) => Number(v)

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-premium">Configuración</h1>
          <p className="text-sm text-premium/60">Datos del centro, reglas de reserva e integraciones.</p>
        </div>
        <button onClick={() => save({ ...settings, business, booking, transfer, payments, policies, followup })} disabled={!dirty} className={btnPrimary}><Save className="h-4 w-4" /> Guardar</button>
      </div>

      <div className={`${panel} grid gap-4 sm:grid-cols-2`}>
        <p className="font-medium text-premium sm:col-span-2">Datos del centro</p>
        <label className="text-xs text-premium/60">Nombre<input value={business.name} onChange={(e) => setBusiness({ ...business, name: e.target.value })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-premium/60">WhatsApp (con código de país, sin +)<input value={business.whatsapp} onChange={(e) => setBusiness({ ...business, whatsapp: e.target.value })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-premium/60 sm:col-span-2">Dirección (se usa para el mapa)<input value={business.address} onChange={(e) => setBusiness({ ...business, address: e.target.value })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-premium/60 sm:col-span-2">Horario de atención (texto)<input value={business.hours} onChange={(e) => setBusiness({ ...business, hours: e.target.value })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-premium/60">Email<input value={business.email} onChange={(e) => setBusiness({ ...business, email: e.target.value })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-premium/60">Instagram<input value={business.instagram} onChange={(e) => setBusiness({ ...business, instagram: e.target.value })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-premium/60">Enlace de reservas<input value={business.bookingUrl} onChange={(e) => setBusiness({ ...business, bookingUrl: e.target.value })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-premium/60">Cómo llegar<input value={business.directions} onChange={(e) => setBusiness({ ...business, directions: e.target.value })} className={`${field} mt-1`} /></label>
      </div>

      <div className={`${panel} grid gap-4 sm:grid-cols-2`}>
        <p className="font-medium text-premium sm:col-span-2">Políticas (las comunica el asistente)</p>
        <label className="text-xs text-premium/60 sm:col-span-2">Política de seña<textarea rows={2} value={policies.deposit} onChange={(e) => setPolicies({ ...policies, deposit: e.target.value })} className={`${field} mt-1 h-auto py-2`} /></label>
        <label className="text-xs text-premium/60">Política de cancelación<textarea rows={3} value={policies.cancellation} onChange={(e) => setPolicies({ ...policies, cancellation: e.target.value })} className={`${field} mt-1 h-auto py-2`} /></label>
        <label className="text-xs text-premium/60">Política de reprogramación<textarea rows={3} value={policies.reschedule} onChange={(e) => setPolicies({ ...policies, reschedule: e.target.value })} className={`${field} mt-1 h-auto py-2`} /></label>
        <label className="text-xs text-premium/60">Tiempo mínimo para cancelar (horas)<input type="number" min={0} value={policies.minCancelHours} onChange={(e) => setPolicies({ ...policies, minCancelHours: num(e.target.value) })} className={`${field} mt-1`} /></label>
      </div>

      <div className={`${panel} grid gap-4 sm:grid-cols-3`}>
        <p className="font-medium text-premium sm:col-span-3">Reglas de seguimiento (crean tareas, no envían mensajes)</p>
        <label className="text-xs text-premium/60">Pedir seña a turnos dentro de (horas)<input type="number" min={1} value={followup.depositHours} onChange={(e) => setFollowup({ ...followup, depositHours: num(e.target.value) })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-premium/60">Consultar si continúa tras (días sin turno)<input type="number" min={1} value={followup.continueAfterDays} onChange={(e) => setFollowup({ ...followup, continueAfterDays: num(e.target.value) })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-premium/60">Paciente inactivo tras (días)<input type="number" min={7} value={followup.inactiveAfterDays} onChange={(e) => setFollowup({ ...followup, inactiveAfterDays: num(e.target.value) })} className={`${field} mt-1`} /></label>
      </div>

      <div className={`${panel} grid gap-4 sm:grid-cols-2 lg:grid-cols-4`}>
        <p className="font-medium text-premium sm:col-span-2 lg:col-span-4">Reglas de reserva</p>
        <label className="text-xs text-premium/60">Intervalo entre turnos (min)<input type="number" min={5} value={booking.slotMinutes} onChange={(e) => setBooking({ ...booking, slotMinutes: num(e.target.value) })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-premium/60">Anticipación mínima (horas)<input type="number" min={0} value={booking.minHoursAhead} onChange={(e) => setBooking({ ...booking, minHoursAhead: num(e.target.value) })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-premium/60">Tiempo para pagar la seña (min)<input type="number" min={10} value={booking.holdMinutes} onChange={(e) => setBooking({ ...booking, holdMinutes: num(e.target.value) })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-premium/60">Turnos simultáneos<input type="number" min={1} value={booking.capacity} onChange={(e) => setBooking({ ...booking, capacity: num(e.target.value) })} className={`${field} mt-1`} /></label>
      </div>

      <div className={`${panel} grid gap-4 sm:grid-cols-2`}>
        <p className="font-medium text-premium sm:col-span-2">Pagos</p>
        <label className="text-xs text-premium/60">Seña sugerida (% del precio, para servicios sin seña fija)<input type="number" min={0} max={100} value={payments.depositPercent} onChange={(e) => setPayments({ ...payments, depositPercent: num(e.target.value) })} className={`${field} mt-1`} /></label>
        <div />
        <label className="text-xs text-premium/60">Medios de pago (uno por línea)
          <textarea rows={5} value={payments.methods.join(NL)} onChange={(e) => setPayments({ ...payments, methods: e.target.value.split(NL) })} className={`${field} mt-1 h-auto py-2`} />
        </label>
        <p className="self-center text-xs text-premium/55">Las profesionales y los equipos se administran en la pestaña «Equipo».</p>
      </div>

      <div className={`${panel} grid gap-4 sm:grid-cols-2`}>
        <div className="sm:col-span-2">
          <p className="font-medium text-premium">Transferencia</p>
          <p className="text-xs text-premium/55">Se ofrece cuando Mercado Pago no está configurado. El cliente transfiere la seña y sube el comprobante, que revisás en Turnos.</p>
        </div>
        <label className="text-xs text-premium/60">Alias<input value={transfer.alias} onChange={(e) => setTransfer({ ...transfer, alias: e.target.value })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-premium/60">CBU/CVU (opcional)<input inputMode="numeric" value={transfer.cbu} onChange={(e) => setTransfer({ ...transfer, cbu: e.target.value })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-premium/60">Titular (opcional)<input value={transfer.holder} onChange={(e) => setTransfer({ ...transfer, holder: e.target.value })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-premium/60">Banco o billetera (opcional)<input value={transfer.bank} onChange={(e) => setTransfer({ ...transfer, bank: e.target.value })} className={`${field} mt-1`} /></label>
      </div>

      {status && (
        <div className={`${panel} space-y-3 text-sm`}>
          <p className="font-medium text-premium">Integraciones</p>
          <p className="text-premium/75">OpenAI: {status.openai ? "conectado" : "falta OPENAI_API_KEY"}</p>
          <p className="text-premium/75">
            Mercado Pago:{" "}
            {status.mercadoPago === "off" ? transfer.alias ? "falta MERCADOPAGO_ACCESS_TOKEN (la seña se paga por transferencia)" : "falta MERCADOPAGO_ACCESS_TOKEN y no hay alias cargado (la seña se coordina por WhatsApp)" : status.mercadoPago === "test" ? "modo prueba (credenciales TEST)" : "producción — los cobros son reales"}
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
