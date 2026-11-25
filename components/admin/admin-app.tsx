"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { BadgePercent, Bot, CalendarDays, Search, ClipboardList, Copy, ExternalLink, History, Landmark, LayoutDashboard, LineChart, ListTodo, LogOut, Menu, MessagesSquare, Send, ShieldCheck, Stethoscope, Plus, Save, Settings2, Sparkles, Trash2, Users, Wallet, X } from "lucide-react"
import { AgendaView, CashView, DashboardView, PatientsView } from "./operations"
import { MessagesView } from "./messages"
import { AssistantPreview, InboxView, JornadasView, RecordList, ReportsView, SecurityView, TasksView, TeamView } from "./management"
import { ActionMenu, api, Badge, btnDanger, btnGhost, btnIcon, btnLink, btnPrimary, btnSmall, Card, Empty, Field, field, fieldInline, lbl, Loading, PageHeader, panel, SaveBar, Segmented } from "./ui"
import type { Settings, ReasoningEffort } from "@/lib/server/settings"
import { DEFAULT_DIALOGUE } from "@/lib/chat-defaults"
import { formatARS, TIME_ZONE, todayAR } from "@/lib/time"

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
const NL = String.fromCharCode(10)

function useFlash() {
  const [msg, setMsg] = useState<{ text: string; error?: boolean; key: number } | null>(null)
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), msg.error ? 6000 : 3500)
    return () => clearTimeout(t)
  }, [msg])
  const show = useCallback((text: string, error = false) => setMsg({ text, error, key: Date.now() }), [])
  return [msg, show, () => setMsg(null)] as const
}

type Role = "owner" | "recepcion" | "profesional"
const ALL: Role[] = ["owner", "recepcion", "profesional"]
const STAFF: Role[] = ["owner", "recepcion"]
const OWNER: Role[] = ["owner"]
const ROLE_LABEL: Record<Role, string> = { owner: "Administración", recepcion: "Recepción", profesional: "Profesional" }

/** Navegación agrupada por tarea: lo diario arriba, la configuración abajo. */
const NAV = [
  {
    group: "Operación diaria",
    items: [
      { id: "inicio", label: "Inicio", icon: LayoutDashboard, roles: ALL },
      { id: "turnos", label: "Agenda", icon: ClipboardList, roles: ALL },
      { id: "pacientes", label: "Pacientes", icon: Users, roles: ALL },
      { id: "caja", label: "Caja", icon: Wallet, roles: STAFF },
      { id: "transferencias", label: "Transferencias", icon: Landmark, roles: STAFF },
    ],
  },
  {
    group: "Organización",
    items: [
      { id: "mensajes", label: "Mensajes", icon: Send, roles: STAFF },
      { id: "agenda", label: "Jornadas", icon: CalendarDays, roles: STAFF },
      { id: "tareas", label: "Tareas", icon: ListTodo, roles: ALL },
      { id: "conversaciones", label: "Conversaciones", icon: MessagesSquare, roles: STAFF },
    ],
  },
  {
    group: "Catálogo",
    items: [
      { id: "servicios", label: "Servicios y precios", icon: Sparkles, roles: STAFF },
      { id: "promos", label: "Promociones", icon: BadgePercent, roles: STAFF },
      { id: "equipo", label: "Equipo", icon: Stethoscope, roles: STAFF },
    ],
  },
  {
    group: "Administración",
    items: [
      { id: "reportes", label: "Reportes", icon: LineChart, roles: OWNER },
      { id: "asistente", label: "Asistente IA", icon: Bot, roles: OWNER },
      { id: "config", label: "Configuración", icon: Settings2, roles: OWNER },
      { id: "seguridad", label: "Usuarios y seguridad", icon: ShieldCheck, roles: OWNER },
    ],
  },
] as const
type TabId = (typeof NAV)[number]["items"][number]["id"]
const ALL_TABS = NAV.flatMap((g) => [...g.items] as unknown[]) as ReadonlyArray<{ id: TabId; label: string; icon: typeof Users; roles: Role[] }>
const isTab = (v: string): v is TabId => ALL_TABS.some((t) => t.id === v)

function NavList({ tab, role, onPick, badges }: { tab: TabId; role: Role | null; onPick: (t: TabId) => void; badges?: Partial<Record<TabId, number>> }) {
  return (
    <nav aria-label="Secciones del panel" className="space-y-4">
      {NAV.map((g) => {
        const items = g.items.filter((t) => !role || (t.roles as readonly Role[]).includes(role))
        if (!items.length) return null
        return (
          <div key={g.group}>
            <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-3">{g.group}</p>
            <ul className="space-y-0.5">
              {items.map((t) => {
                const active = tab === t.id
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => onPick(t.id)}
                      aria-current={active ? "page" : undefined}
                      className={[
                        "relative flex h-[34px] w-full items-center gap-2.5 rounded-lg px-3 text-left text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45",
                        active ? "bg-primary-soft font-medium text-primary" : "text-ink-2 hover:bg-surface hover:text-ink",
                      ].join(" ")}
                    >
                      {active && <span aria-hidden className="absolute left-0 top-1.5 h-6 w-[3px] rounded-r-full bg-primary" />}
                      <t.icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="truncate">{t.label}</span>
                      {!!badges?.[t.id] && (
                        <span className="ml-auto rounded-full bg-primary px-1.5 py-px text-[11px] font-semibold leading-4 text-white" aria-label={`${badges[t.id]} pendientes`}>{badges[t.id]}</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}

export function AdminApp() {
  const router = useRouter()
  const [tab, setTabState] = useState<TabId>("inicio")
  const [menuOpen, setMenuOpen] = useState(false)
  const [openPatient, setOpenPatient] = useState<number | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [status, setStatus] = useState<Status | null>(null)
  const [flash, setFlash, closeFlash] = useFlash()
  const [session, setSession] = useState<{ username: string; role: Role; professional: string } | null>(null)
  const [msgDue, setMsgDue] = useState(0)

  // mensajes para enviar hoy (aviso en el menú): se actualiza al cambiar de sección y cada minuto
  useEffect(() => {
    if (!session || session.role === "profesional") return
    const load = () => api<{ due: number }>("/api/admin/messages?resumen=1").then((d) => setMsgDue(d.due)).catch(() => {})
    load()
    const t = setInterval(load, 60_000)
    return () => clearInterval(t)
  }, [session, tab])

  // la sección actual vive en la URL (#agenda): se puede recargar, compartir y usar "atrás"
  const setTab = useCallback((t: TabId) => {
    setTabState(t)
    setMenuOpen(false)
    if (window.location.hash !== `#${t}`) window.history.pushState(null, "", `#${t}`)
    window.scrollTo({ top: 0 })
  }, [])
  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1)
      if (isTab(h)) setTabState(h)
    }
    read()
    window.addEventListener("popstate", read)
    return () => window.removeEventListener("popstate", read)
  }, [])
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false)
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [menuOpen])

  const showPatient = useCallback(
    (id: number) => {
      setOpenPatient(id)
      setTab("pacientes")
    },
    [setTab],
  )
  const patientOpened = useCallback(() => setOpenPatient(null), [])

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

  // si el rol no tiene acceso a la sección pedida, vuelve a Inicio
  useEffect(() => {
    if (!session) return
    const t = ALL_TABS.find((x) => x.id === tab)
    if (t && !t.roles.includes(session.role)) setTab("inicio")
  }, [session, tab, setTab])

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

  const current = ALL_TABS.find((t) => t.id === tab)
  const userBox = (
    <div className="flex items-center gap-2.5 rounded-lg border border-line bg-white p-2.5">
      <div aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold uppercase text-primary">
        {(session?.username ?? "·").slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink">{session?.username ?? "…"}</p>
        <p className="text-xs text-ink-3">{session ? ROLE_LABEL[session.role] : ""}</p>
      </div>
      <button onClick={logout} className={`${btnIcon} h-8 w-8`} aria-label="Cerrar sesión" title="Cerrar sesión">
        <LogOut />
      </button>
    </div>
  )
  const brand = (
    <div className="flex items-center gap-2">
      <img src="/eterna-logo.webp" alt="" className="h-7 w-auto" />
      <span className="font-berlys text-xl leading-none text-ink">eterna</span>
      <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary">Panel</span>
    </div>
  )

  return (
    <div className="admin-ui min-h-screen bg-canvas text-ink">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow-pop">
        Saltar al contenido
      </a>

      {/* Escritorio: barra lateral fija */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-[248px] flex-col border-r border-line bg-white lg:flex">
        <div className="flex h-14 shrink-0 items-center px-5">{brand}</div>
        <div className="flex-1 overflow-y-auto px-3 pb-3 pt-3 [scrollbar-width:thin]">
          <NavList tab={tab} role={session?.role ?? null} onPick={setTab} badges={{ mensajes: msgDue }} />
        </div>
        <div className="space-y-2 border-t border-line p-3">
          <a href="/chat" target="_blank" rel="noreferrer" className="flex h-[34px] items-center gap-2.5 rounded-lg px-3 text-sm text-ink-2 hover:bg-surface hover:text-ink">
            <ExternalLink className="h-4 w-4" aria-hidden /> Ver el chat de la web
          </a>
          {userBox}
        </div>
      </aside>

      {/* Tablet y celular: barra superior + menú desplegable */}
      <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-line bg-white/95 px-3 backdrop-blur lg:hidden">
        <button onClick={() => setMenuOpen(true)} className={btnIcon} aria-label="Abrir menú" aria-expanded={menuOpen}>
          <Menu />
        </button>
        <img src="/eterna-logo.webp" alt="" className="h-6 w-auto" />
        <p className="min-w-0 flex-1 truncate text-[0.9375rem] font-semibold text-ink">{current?.label}</p>
      </header>
      {menuOpen && (
        <div className="fixed inset-0 z-40 bg-[rgba(40,28,28,0.32)] lg:hidden" onMouseDown={(e) => e.target === e.currentTarget && setMenuOpen(false)}>
          <div role="dialog" aria-modal="true" aria-label="Menú" className="flex h-full w-[min(300px,86vw)] flex-col bg-white shadow-pop animate-in slide-in-from-left-4 duration-200">
            <div className="flex h-14 items-center justify-between border-b border-line px-3">
              {brand}
              <button onClick={() => setMenuOpen(false)} className={btnIcon} aria-label="Cerrar menú" autoFocus><X /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-4"><NavList tab={tab} role={session?.role ?? null} onPick={setTab} badges={{ mensajes: msgDue }} /></div>
            <div className="space-y-2 border-t border-line p-3">
              <a href="/chat" target="_blank" rel="noreferrer" className="flex h-10 items-center gap-2.5 rounded-lg px-3 text-sm text-ink-2 hover:bg-surface">
                <ExternalLink className="h-4 w-4" aria-hidden /> Ver el chat de la web
              </a>
              {userBox}
            </div>
          </div>
        </div>
      )}

      <main id="contenido" className="lg:pl-[248px]">
        <div className="mx-auto max-w-[1320px] px-4 pb-24 pt-5 sm:px-6 sm:pt-6 lg:px-8 lg:pt-8">
          {tab === "inicio" && <DashboardView flash={setFlash} onPatient={showPatient} go={(t) => isTab(t) && setTab(t)} />}
          {tab === "turnos" && <AgendaView flash={setFlash} onPatient={showPatient} />}
          {tab === "pacientes" && <PatientsView flash={setFlash} openId={openPatient} onOpened={patientOpened} />}
          {tab === "caja" && <CashView flash={setFlash} />}
          {tab === "agenda" && <JornadasView flash={setFlash} />}
          {tab === "conversaciones" && <InboxView flash={setFlash} onPatient={showPatient} />}
          {tab === "mensajes" && <MessagesView flash={setFlash} onPatient={showPatient} />}
          {tab === "tareas" && <TasksView flash={setFlash} onPatient={showPatient} />}
          {tab === "equipo" && <TeamView flash={setFlash} />}
          {tab === "reportes" && <ReportsView flash={setFlash} />}
          {tab === "seguridad" && <SecurityView flash={setFlash} />}
          {tab === "transferencias" && <TransfersTab flash={setFlash} />}
          {tab === "servicios" && <ServicesTab flash={setFlash} canEdit={session?.role === "owner"} />}
          {tab === "promos" && <PromosTab flash={setFlash} canEdit={session?.role === "owner"} />}
          {tab === "asistente" && (settings ? <AiTab settings={settings} status={status} save={saveSettings} flash={setFlash} /> : <Loading />)}
          {tab === "config" && (settings ? <ConfigTab settings={settings} status={status} save={saveSettings} /> : <Loading />)}
        </div>
      </main>

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 lg:pl-[248px]">
        {flash && (
          <div key={flash.key} role={flash.error ? "alert" : "status"} className={`pointer-events-auto flex max-w-lg items-center gap-3 rounded-xl px-4 py-3 text-sm text-white shadow-pop animate-in fade-in slide-in-from-bottom-2 duration-200 ${flash.error ? "bg-red-700" : "bg-ink"}`}>
            <span>{flash.text}</span>
            <button onClick={closeFlash} className="rounded p-0.5 text-white/80 hover:text-white" aria-label="Cerrar aviso"><X className="h-4 w-4" /></button>
          </div>
        )}
      </div>
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
const cell = `${field} h-9 px-2.5`
const SERVICE_GRID = "md:grid-cols-[minmax(0,1.6fr)_112px_112px_84px_112px_104px_88px_auto]"

function PriceHistory({ id }: { id: number }) {
  const [rows, setRows] = useState<Array<{ created_at: string; actor: string; before_price: string | null; after_price: string | null; before_promo: string | null; after_promo: string | null }> | null>(null)
  useEffect(() => {
    api<{ history: NonNullable<typeof rows> }>(`/api/admin/services?historial=${id}`).then((d) => setRows(d.history)).catch(() => setRows([]))
  }, [id])
  if (!rows) return <p className="text-xs text-ink-3">Cargando historial…</p>
  if (!rows.length) return <p className="text-xs text-ink-3">Sin cambios de precio registrados.</p>
  const money = (v: string | null) => (v === null ? "—" : formatARS(Number(v)))
  return (
    <ul className="space-y-0.5 text-xs text-ink-2">
      {rows.map((r, i) => (
        <li key={i}>
          {shortDate(r.created_at)} · {r.actor}: {money(r.before_price)} → {money(r.after_price)}
          {r.before_promo !== r.after_promo && ` · promo ${money(r.before_promo)} → ${money(r.after_promo)}`}
        </li>
      ))}
    </ul>
  )
}

function ServiceRow({ s, dirty, update, save, discard, remove, canEdit }: { s: Service; dirty: boolean; update: (p: Partial<Service>) => void; save: () => void; discard: () => void; remove: () => void; canEdit: boolean }) {
  const [open, setOpen] = useState(s.id < 0)
  const [history, setHistory] = useState(false)
  const ro = !canEdit
  return (
    <li className={`py-3 ${dirty ? "bg-primary-soft/40 -mx-4 px-4 sm:-mx-5 sm:px-5" : ""}`}>
      <div className={`grid grid-cols-2 items-center gap-2 ${SERVICE_GRID}`}>
        <input disabled={ro} value={s.name} onChange={(e) => update({ name: e.target.value })} className={`${cell} col-span-2 font-medium md:col-span-1`} aria-label="Nombre del servicio" placeholder="Nombre del servicio" />
        <select disabled={ro} value={s.gender} onChange={(e) => update({ gender: e.target.value })} className={cell} aria-label="Género">
          {GENDERS.map((g) => <option key={g} value={g}>{g || "Sin género"}</option>)}
        </select>
        <select disabled={ro} value={s.kind} onChange={(e) => update({ kind: e.target.value })} className={cell} aria-label="Tipo">
          {KINDS.map((k) => <option key={k} value={k}>{k || "Sin tipo"}</option>)}
        </select>
        <input disabled={ro} type="number" min={5} step={5} value={s.duration_min} onChange={(e) => update({ duration_min: Number(e.target.value) })} className={`${cell} tabular-nums`} aria-label="Duración en minutos" />
        <input disabled={ro} type="number" min={0} value={s.price} onChange={(e) => update({ price: Number(e.target.value) })} className={`${cell} tabular-nums`} aria-label="Precio" />
        <input disabled={ro} type="number" min={0} value={s.deposit} onChange={(e) => update({ deposit: Number(e.target.value) })} className={`${cell} tabular-nums`} aria-label="Seña" />
        <label className="flex items-center gap-2 text-sm text-ink-2" title="Se realiza actualmente">
          <input disabled={ro} type="checkbox" checked={s.active} onChange={(e) => update({ active: e.target.checked })} className="h-4 w-4 accent-[#882626]" /> Activo
        </label>
        <div className="col-span-2 flex items-center justify-end gap-1.5 md:col-span-1">
          {dirty && canEdit ? (
            <>
              <button onClick={discard} className={btnSmall}>Descartar</button>
              <button onClick={save} className={`${btnSmall} border-primary bg-primary text-white hover:bg-primary-hover`}><Save /> Guardar</button>
            </>
          ) : (
            <button onClick={() => setOpen(!open)} aria-expanded={open} className={btnSmall}>{open ? "Cerrar" : "Detalles"}</button>
          )}
        </div>
      </div>
      {open && (
        <div className="mt-3 grid gap-3 rounded-lg border border-line bg-surface/50 p-3 md:grid-cols-3">
          <Field label="Tratamiento (categoría)"><input disabled={ro} value={s.category} onChange={(e) => update({ category: e.target.value })} className={cell} /></Field>
          <Field label="Zonas incluidas"><input disabled={ro} value={s.detail} onChange={(e) => update({ detail: e.target.value })} className={cell} /></Field>
          <Field label="Precio promocional de referencia"><input disabled={ro} type="number" min={0} value={s.promo_price ?? ""} onChange={(e) => update({ promo_price: e.target.value === "" ? null : Number(e.target.value) })} className={cell} /></Field>
          <Field label="Descripción para el cliente" className="md:col-span-3"><input disabled={ro} value={s.description} onChange={(e) => update({ description: e.target.value })} className={cell} /></Field>
          <Field label="Equipo utilizado"><input disabled={ro} value={s.equipment} onChange={(e) => update({ equipment: e.target.value })} className={cell} placeholder="Alma Láser Soprano Ice Platinum" /></Field>
          <Field label="Público"><input disabled={ro} value={s.audience} onChange={(e) => update({ audience: e.target.value })} className={cell} placeholder="Mujeres, hombres…" /></Field>
          <div className="flex flex-col justify-end gap-2 pb-1">
            <label className="flex items-center gap-2 text-sm text-ink-2"><input disabled={ro} type="checkbox" checked={s.online} onChange={(e) => update({ online: e.target.checked })} className="h-4 w-4 accent-[#882626]" /> Reservable online (chat)</label>
            <label className="flex items-center gap-2 text-sm text-ink-2"><input disabled={ro} type="checkbox" checked={s.visible_web} onChange={(e) => update({ visible_web: e.target.checked })} className="h-4 w-4 accent-[#882626]" /> Visible en la web</label>
          </div>
          <Field label="Indicaciones y cuidados" className="md:col-span-3"><textarea disabled={ro} rows={2} value={s.indications} onChange={(e) => update({ indications: e.target.value })} className={`${field} h-auto py-2`} /></Field>
          <Field label="Contraindicaciones" className="md:col-span-3"><textarea disabled={ro} rows={2} value={s.contraindications} onChange={(e) => update({ contraindications: e.target.value })} className={`${field} h-auto py-2`} /></Field>
          <div className="flex flex-wrap items-center justify-between gap-2 md:col-span-3">
            {s.id > 0 ? (
              <button onClick={() => setHistory(!history)} aria-expanded={history} className={`${btnLink} inline-flex items-center gap-1 text-sm`}><History className="h-4 w-4" /> Historial de precios</button>
            ) : <span />}
            {canEdit && <button onClick={remove} className={`${btnDanger} h-9`}><Trash2 /> {s.id < 0 ? "Descartar" : "Eliminar servicio"}</button>}
          </div>
          {history && <div className="md:col-span-3"><PriceHistory id={s.id} /></div>}
        </div>
      )}
    </li>
  )
}

function ServicesTab({ flash, canEdit }: { flash: (t: string, e?: boolean) => void; canEdit: boolean }) {
  const [services, setServices] = useState<Service[] | null>(null)
  const [original, setOriginal] = useState<Record<number, string>>({})
  const [query, setQuery] = useState("")
  const [showInactive, setShowInactive] = useState(true)

  const load = useCallback(() => {
    api<{ services: Service[] }>("/api/admin/services")
      .then((d) => {
        setServices(d.services)
        setOriginal(Object.fromEntries(d.services.map((s) => [s.id, JSON.stringify(s)])))
      })
      .catch(() => flash("No se pudieron cargar los servicios", true))
  }, [flash])
  useEffect(load, [load])

  const update = (id: number, patch: Partial<Service>) => setServices((v) => v?.map((s) => (s.id === id ? { ...s, ...patch } : s)) ?? v)
  const isDirty = (s: Service) => s.id < 0 || original[s.id] !== JSON.stringify(s)

  // guardar actualiza solo ese servicio: los cambios sin guardar de otros quedan intactos
  const save = async (s: Service) => {
    try {
      const r = await api<{ service: Service }>("/api/admin/services", { method: s.id > 0 ? "PUT" : "POST", body: JSON.stringify(s) })
      setServices((v) => v?.map((x) => (x.id === s.id ? r.service : x)) ?? v)
      setOriginal((o) => ({ ...o, [r.service.id]: JSON.stringify(r.service) }))
      flash(`«${r.service.name}» guardado`)
    } catch {
      flash("Revisá los datos del servicio: el nombre es obligatorio y la duración va de 5 a 600 minutos", true)
    }
  }
  const discard = (s: Service) => {
    if (s.id < 0) return setServices((v) => v?.filter((x) => x.id !== s.id) ?? v)
    setServices((v) => v?.map((x) => (x.id === s.id ? (JSON.parse(original[s.id]) as Service) : x)) ?? v)
  }
  const remove = async (s: Service) => {
    if (s.id < 0) return discard(s)
    if (!confirm(`¿Eliminar «${s.name}»? Si tiene turnos, se desactiva en lugar de borrarse.`)) return
    try {
      const r = await api<{ result: string }>(`/api/admin/services?id=${s.id}`, { method: "DELETE" })
      flash(r.result === "desactivado" ? "Tenía turnos: quedó desactivado" : "Servicio eliminado")
      load()
    } catch {
      flash("No se pudo eliminar", true)
    }
  }

  const add = (category: string) =>
    setServices((v) => [{ id: -Date.now(), name: "", description: "", duration_min: 30, price: 0, deposit: 0, active: true, sort: (v?.length ?? 0) * 10, category, kind: "", gender: "", detail: "", online: true, visible_web: true, audience: "", equipment: "", indications: "", contraindications: "", promo_price: null }, ...(v ?? [])])

  const q = query.trim().toLowerCase()
  const groups = useMemo(() => {
    const m = new Map<string, Service[]>()
    for (const s of services ?? []) {
      if (!showInactive && !s.active && s.id > 0) continue
      if (q && !`${s.name} ${s.category} ${s.detail} ${s.gender}`.toLowerCase().includes(q)) continue
      const k = s.category || "Sin categoría"
      m.set(k, [...(m.get(k) ?? []), s])
    }
    return Array.from(m)
  }, [services, q, showInactive])
  const pendingChanges = (services ?? []).filter(isDirty).length

  return (
    <section className="space-y-5">
      <PageHeader
        title="Servicios y precios"
        description={<>Lista única de precios: la usan la agenda, el chat y los reportes. Un servicio inactivo o no reservable online no se ofrece en el chat. Cambiar un precio no modifica los turnos ya tomados y queda en el historial.{!canEdit && <strong className="font-medium"> Solo lectura: los precios los modifica administración principal.</strong>}</>}
        actions={canEdit && <button onClick={() => add("")} className={btnPrimary}><Plus /> Nuevo servicio</button>}
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar servicio o zona" className={`${field} h-9 pl-9`} aria-label="Buscar servicio" />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-2"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="h-4 w-4 accent-[#882626]" /> Mostrar inactivos</label>
        {pendingChanges > 0 && <Badge tone="warning">{pendingChanges} {pendingChanges === 1 ? "cambio sin guardar" : "cambios sin guardar"}</Badge>}
      </div>
      {services === null ? (
        <Loading rows={4} />
      ) : groups.length === 0 ? (
        <Card><Empty title="No hay servicios que coincidan" /></Card>
      ) : (
        groups.map(([category, list]) => (
          <Card
            key={category}
            title={<>{category} <span className="font-normal text-ink-3">· {list.length}</span></>}
            actions={canEdit && <button onClick={() => add(category === "Sin categoría" ? "" : category)} className={btnSmall}><Plus /> Agregar</button>}
          >
            <div className={`hidden gap-2 border-b border-line pb-2 text-xs font-medium text-ink-3 md:grid ${SERVICE_GRID}`} aria-hidden>
              <span className="px-2.5">Servicio</span><span className="px-2.5">Género</span><span className="px-2.5">Tipo</span><span className="px-2.5">Minutos</span><span className="px-2.5">Precio</span><span className="px-2.5">Seña</span><span>Estado</span><span />
            </div>
            <ul className="divide-y divide-line">
              {list.map((s) => (
                <ServiceRow key={s.id} s={s} dirty={isDirty(s)} canEdit={canEdit} update={(p) => update(s.id, p)} save={() => save(s)} discard={() => discard(s)} remove={() => remove(s)} />
              ))}
            </ul>
          </Card>
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
      <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-line bg-canvas" aria-label={`Abrir comprobante de ${t.name}`}>
        {t.mime === "application/pdf" ? (
          <div className="flex h-64 items-center justify-center text-sm text-primary">Abrir PDF</div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={`Comprobante de ${t.name}`} loading="lazy" className="max-h-96 w-full object-contain" />
        )}
      </a>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-ink">{t.name}</p>
          <span className={`rounded-full border px-2.5 py-0.5 text-xs ${AI_LABEL[t.ai_result].cls}`}>{AI_LABEL[t.ai_result].label}</span>
          <span className={`rounded-full border px-2.5 py-0.5 text-xs ${STATE_LABEL[t.state].cls}`}>{STATE_LABEL[t.state].label}</span>
          {t.verified_at && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs text-emerald-700">Verificada en el banco</span>}
        </div>
        <p className="mt-1 text-sm text-ink-2">{t.service_name} · {shortDate(t.starts_at)} · {t.phone}</p>
        <p className="mt-1 text-sm text-ink">Seña esperada: <strong className="font-semibold">{formatARS(t.deposit)}</strong></p>
        {t.ai_reason && <p className="mt-2 text-sm text-red-700">{t.ai_reason}</p>}
        <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-border py-1">
              <dt className="text-ink-3">{k}</dt>
              <dd className="break-all text-right text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-ink-3">Enviado {shortDate(t.uploaded_at)}. La lectura de la IA no prueba el ingreso: un comprobante puede estar falsificado.</p>
        {needsReview(t) && (
          <div className="mt-3 space-y-3">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="accent-[#882626]" />
              Verifiqué en el banco que el dinero ingresó a la cuenta.
            </label>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => act("verify")} disabled={!checked || busy} className={btnPrimary}>Confirmar transferencia</button>
              <button onClick={() => act("reject")} disabled={busy} className={`${btnGhost} text-red-700`}>Rechazar y liberar turno</button>
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
          <h1 className="font-serif text-[1.625rem] font-semibold leading-tight text-ink">Transferencias</h1>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-2">La IA lee cada comprobante y, si importe, cuenta y fecha coinciden, confirma el turno. Mirá la imagen y verificá el ingreso en el banco.</p>
          <p className="mt-1 text-sm font-medium text-ink">{pending.length} por verificar · {formatARS(pending.reduce((n, t) => n + t.deposit, 0))}</p>
        </div>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className={`${fieldInline} w-48`} aria-label="Filtrar transferencias">
          <option value="pendientes">Por verificar</option>
          <option value="verificadas">Verificadas</option>
          <option value="fallidas">No aprobadas o vencidas</option>
          <option value="todas">Todas</option>
        </select>
      </div>
      {transfers === null ? (
        <p className="mt-1 text-sm text-ink-2">Cargando…</p>
      ) : visible.length === 0 ? (
        <div className={panel}><p className="mt-1 text-sm text-ink-2">No hay transferencias para este filtro.</p></div>
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
  if (!rows) return <p className="text-xs text-ink-3">Cargando…</p>
  if (!rows.length) return <p className="text-xs text-ink-3">Todavía nadie la usó.</p>
  return (
    <ul className="space-y-0.5 text-xs text-ink-2">
      {rows.map((r) => <li key={r.id}>{shortDate(r.starts_at)} · {r.name} · {r.service_name} · {formatARS(r.final_price)}{r.status === "cancelled" ? " (cancelado)" : ""}</li>)}
    </ul>
  )
}

function PromosTab({ flash, canEdit }: { flash: (t: string, e?: boolean) => void; canEdit: boolean }) {
  const [showUses, setShowUses] = useState<number | null>(null)
  const [promos, setPromos] = useState<Promo[] | null>(null)
  const [open, setOpen] = useState<Set<number>>(new Set())
  const [filter, setFilter] = useState<"todas" | "activas" | "inactivas">("todas")

  const load = useCallback(() => {
    api<{ promos: Promo[] }>("/api/admin/promos").then((d) => setPromos(d.promos)).catch(() => flash("No se pudieron cargar las promociones", true))
  }, [flash])
  useEffect(load, [load])

  const toggle = (id: number, on?: boolean) => setOpen((s) => {
    const n = new Set(s)
    if (on ?? !n.has(id)) n.add(id)
    else n.delete(id)
    return n
  })
  const update = (id: number, patch: Partial<Promo>) => setPromos((v) => v?.map((p) => (p.id === id ? { ...p, ...patch } : p)) ?? v)
  const add = () => {
    const id = -Date.now()
    setPromos((v) => [{ id, title: "", description: "", kind: "percent", percent: 20, sessions: 0, category: "", starts_on: null, ends_on: null, active: true, chat_visible: true, audience: "todos", max_uses: 0, per_patient: 0, stackable: false, priority: 0, weekdays: "", conditions: "" }, ...(v ?? [])])
    toggle(id, true)
  }

  // guardar una promo actualiza solo esa tarjeta: las demás (incluidas las que todavía no se guardaron) quedan intactas
  const save = async (p: Promo) => {
    try {
      const r = await api<{ promo: Promo }>("/api/admin/promos", { method: p.id > 0 ? "PUT" : "POST", body: JSON.stringify(p) })
      setPromos((v) => v?.map((x) => (x.id === p.id ? r.promo : x)) ?? v)
      toggle(p.id, false)
      flash(`Promoción «${r.promo.title}» guardada`)
    } catch {
      flash("Revisá la promoción: falta el título, el porcentaje (1 a 100) o la fecha de fin es anterior a la de inicio", true)
    }
  }

  const duplicate = (p: Promo) => {
    const id = -Date.now()
    setPromos((v) => [{ ...p, id, title: `${p.title} (copia)`, active: false, uses: 0, patients: 0, revenue: 0 }, ...(v ?? [])])
    toggle(id, true)
  }

  const remove = async (p: Promo) => {
    if (p.id < 0) return setPromos((v) => v?.filter((x) => x.id !== p.id) ?? v)
    if (!confirm(`¿Eliminar «${p.title}»? Si ya se usó, se pausa en lugar de borrarse (los turnos conservan su precio).`)) return
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
  const promoState = (p: Promo): { label: string; tone: "success" | "warning" | "info" | "neutral"; live: boolean } =>
    p.id < 0 ? { label: "Sin guardar", tone: "warning", live: false }
    : !p.active ? { label: "Pausada", tone: "neutral", live: false }
    : p.ends_on && p.ends_on < today ? { label: "Vencida", tone: "neutral", live: false }
    : p.starts_on && p.starts_on > today ? { label: "Programada", tone: "info", live: false }
    : { label: "Activa", tone: "success", live: true }
  const live = (promos ?? []).filter((p) => promoState(p).live).length
  const visible = (promos ?? []).filter((p) => filter === "todas" || (filter === "activas" ? promoState(p).live || p.id < 0 : !promoState(p).live))
  const fmtDay = (d: string | null) => (d ? `${d.slice(8)}/${d.slice(5, 7)}` : "")
  const summary = (p: Promo) =>
    [
      p.kind === "percent" ? `−${p.percent}%` : p.kind === "2x1" ? "2x1" : "Especial",
      p.category || "Todos los servicios",
      p.audience === "nuevos" ? "Pacientes nuevos" : p.audience === "existentes" ? "Pacientes actuales" : "",
      p.starts_on || p.ends_on ? `${p.starts_on ? `desde ${fmtDay(p.starts_on)}` : ""}${p.starts_on && p.ends_on ? " " : ""}${p.ends_on ? `hasta ${fmtDay(p.ends_on)}` : ""}` : "Sin vencimiento",
    ]
      .filter(Boolean)
      .join(" · ")

  return (
    <section className="space-y-5">
      <PageHeader
        title="Promociones"
        description="Podés tener todas las promociones que quieras al mismo tiempo. El chat ofrece las activas y vigentes, y el precio con descuento queda congelado en cada turno: si después cambiás una promo, los turnos ya tomados no se modifican."
        actions={canEdit && <button onClick={add} className={btnPrimary}><Plus /> Nueva promoción</button>}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented label="Mostrar" value={filter} onChange={setFilter} options={[["todas", `Todas (${promos?.length ?? 0})`], ["activas", `Activas (${live})`], ["inactivas", "Pausadas y vencidas"]]} />
      </div>
      {promos === null ? (
        <Loading rows={3} />
      ) : visible.length === 0 ? (
        <Card><Empty title="No hay promociones para mostrar" action={canEdit ? <button onClick={add} className={btnGhost}>Crear una promoción</button> : undefined} /></Card>
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-line">
            {visible.map((p) => {
              const st = promoState(p)
              const expanded = open.has(p.id)
              return (
                <li key={p.id} className="px-4 py-3.5 sm:px-5">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-[0.9375rem] font-semibold text-ink">{p.title || "Promoción sin título"}</p>
                        <Badge tone={st.tone}>{st.label}</Badge>
                        {!p.chat_visible && <Badge tone="neutral">No la ofrece el chat</Badge>}
                      </div>
                      <p className="mt-0.5 text-sm text-ink-2">{summary(p)}</p>
                    </div>
                    {p.id > 0 && (
                      <p className="text-xs tabular-nums text-ink-3">
                        {p.uses ?? 0} usos · {formatARS(p.revenue ?? 0)}
                      </p>
                    )}
                    <div className="flex items-center gap-1.5">
                      {canEdit && (
                        <label className="mr-1 flex items-center gap-2 text-sm text-ink-2" title="Activar o pausar sin borrar">
                          <input
                            type="checkbox"
                            role="switch"
                            checked={p.active}
                            onChange={(e) => (p.id > 0 ? save({ ...p, active: e.target.checked }) : update(p.id, { active: e.target.checked }))}
                            className="h-4 w-4 accent-[#882626]"
                            aria-label={`${p.active ? "Pausar" : "Activar"} ${p.title}`}
                          />
                          Activa
                        </label>
                      )}
                      <button onClick={() => toggle(p.id)} aria-expanded={expanded} className={btnSmall}>{expanded ? "Cerrar" : canEdit ? "Editar" : "Ver"}</button>
                      {canEdit && (
                        <ActionMenu
                          label={`Más acciones para ${p.title}`}
                          items={[
                            { label: "Duplicar", icon: <Copy />, onSelect: () => duplicate(p) },
                            { label: showUses === p.id ? "Ocultar quiénes la usaron" : "Ver quiénes la usaron", hidden: p.id < 0, onSelect: () => setShowUses(showUses === p.id ? null : p.id) },
                            { label: p.id < 0 ? "Descartar" : "Eliminar", danger: true, icon: <Trash2 />, onSelect: () => remove(p) },
                          ]}
                        />
                      )}
                    </div>
                  </div>
                  {showUses === p.id && <div className="mt-2 rounded-lg bg-surface/60 p-3"><PromoUses id={p.id} /></div>}
                  {expanded && (
                    <fieldset disabled={!canEdit} className="mt-4 space-y-4 rounded-lg border border-line bg-surface/40 p-4">
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Field label="Título" className="sm:col-span-2"><input value={p.title} onChange={(e) => update(p.id, { title: e.target.value })} placeholder="Bienvenida" className={field} /></Field>
                        <Field label="Tipo">
                          <select value={p.kind} onChange={(e) => update(p.id, { kind: e.target.value as Promo["kind"] })} className={field}>
                            <option value="percent">Porcentaje de descuento</option>
                            <option value="2x1">2x1</option>
                            <option value="other">Otra (la explica el texto)</option>
                          </select>
                        </Field>
                        {p.kind === "percent" ? (
                          <Field label="Descuento (%)"><input type="number" min={1} max={100} value={p.percent} onChange={(e) => update(p.id, { percent: Number(e.target.value) })} className={field} /></Field>
                        ) : <div className="hidden lg:block" />}
                        <Field label="Aplica a"><input list="promo-categories" value={p.category} onChange={(e) => update(p.id, { category: e.target.value })} placeholder="Todos los servicios" className={field} /></Field>
                        <Field label="Para">
                          <select value={p.audience} onChange={(e) => update(p.id, { audience: e.target.value as Promo["audience"] })} className={field}>
                            <option value="todos">Todas las personas</option>
                            <option value="nuevos">Pacientes nuevos (primeros 3 meses)</option>
                            <option value="existentes">Pacientes que ya se atienden</option>
                          </select>
                        </Field>
                        <Field label="Desde (opcional)"><input type="date" value={p.starts_on ?? ""} onChange={(e) => update(p.id, { starts_on: e.target.value || null })} className={field} /></Field>
                        <Field label="Hasta (opcional)"><input type="date" value={p.ends_on ?? ""} onChange={(e) => update(p.id, { ends_on: e.target.value || null })} className={field} /></Field>
                      </div>
                      <Field label="Descripción (la explica el asistente)"><textarea rows={2} value={p.description} onChange={(e) => update(p.id, { description: e.target.value })} placeholder="Ej.: 2x1 en la primera sesión viniendo acompañada." className={`${field} h-auto py-2`} /></Field>
                      <details className="group rounded-lg border border-line bg-white" open={!!(p.max_uses || p.per_patient || p.weekdays || p.conditions || p.sessions || p.priority)}>
                        <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-medium text-ink">
                          Reglas y límites
                          <span className="text-xs font-normal text-ink-3 group-open:hidden">Sesiones, cupos, días y condiciones</span>
                        </summary>
                        <div className="grid gap-3 border-t border-line p-3 sm:grid-cols-2 lg:grid-cols-4">
                          <Field label="Primeras N sesiones" hint="0 = todas"><input type="number" min={0} value={p.sessions} onChange={(e) => update(p.id, { sessions: Number(e.target.value) })} className={field} /></Field>
                          <Field label="Cupo total" hint="0 = sin límite"><input type="number" min={0} value={p.max_uses} onChange={(e) => update(p.id, { max_uses: Number(e.target.value) })} className={field} /></Field>
                          <Field label="Usos por paciente" hint="0 = sin límite"><input type="number" min={0} value={p.per_patient} onChange={(e) => update(p.id, { per_patient: Number(e.target.value) })} className={field} /></Field>
                          <Field label="Prioridad" hint="Mayor número = se ofrece primero"><input type="number" value={p.priority} onChange={(e) => update(p.id, { priority: Number(e.target.value) })} className={field} /></Field>
                          <div className="sm:col-span-2">
                            <p className={lbl}>Días en que aplica <span className="font-normal text-ink-3">(ninguno = todos)</span></p>
                            <div className="mt-1.5 flex flex-wrap gap-1" role="group" aria-label="Días en que aplica">
                              {PROMO_WEEKDAYS.map(([n, label]) => {
                                const days = p.weekdays ? p.weekdays.split(",").map(Number) : []
                                const on = days.includes(n)
                                return (
                                  <button key={n} type="button" aria-pressed={on} onClick={() => update(p.id, { weekdays: (on ? days.filter((d) => d !== n) : [...days, n]).sort().join(",") })} className={`h-8 min-w-[2.75rem] rounded-full border px-3 text-xs font-medium transition-colors ${on ? "border-primary bg-primary text-white" : "border-line bg-white text-ink-2 hover:bg-surface"}`}>
                                    {label}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                          <Field label="Condiciones y restricciones" className="sm:col-span-2"><textarea rows={2} value={p.conditions} onChange={(e) => update(p.id, { conditions: e.target.value })} placeholder="Ej.: no aplica a cuerpo completo." className={`${field} h-auto py-2`} /></Field>
                        </div>
                      </details>
                      <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-2">
                        <label className="flex items-center gap-2"><input type="checkbox" checked={p.chat_visible} onChange={(e) => update(p.id, { chat_visible: e.target.checked })} className="h-4 w-4 accent-[#882626]" /> El chat la puede comunicar</label>
                        <label className="flex items-center gap-2"><input type="checkbox" checked={p.stackable} onChange={(e) => update(p.id, { stackable: e.target.checked })} className="h-4 w-4 accent-[#882626]" /> Acumulable con otras</label>
                      </div>
                      {canEdit && (
                        <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
                          <button type="button" onClick={() => (p.id < 0 ? remove(p) : (toggle(p.id, false), load()))} className={btnGhost}>Cancelar</button>
                          <button type="button" onClick={() => save(p)} className={btnPrimary}><Save /> Guardar promoción</button>
                        </div>
                      )}
                    </fieldset>
                  )}
                </li>
              )
            })}
          </ul>
        </Card>
      )}
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
          <h1 className="font-serif text-[1.625rem] font-semibold leading-tight text-ink">Asistente IA</h1>
          <p className="mt-1 text-sm text-ink-2">Lo que sabe el chat sobre Eterna y los procedimientos, y qué modelo usa.</p>
        </div>
        <button onClick={() => save({ ...settings, ai })} disabled={!dirty} className={btnPrimary}><Save /> Guardar</button>
      </div>
      {status && !status.openai && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Falta OPENAI_API_KEY en el servidor: el chat no va a responder hasta configurarla.</p>}
      <div className={`${panel} grid gap-4 sm:grid-cols-2`}>
        <label className="text-sm font-medium text-ink">Modelo de OpenAI
          <input list="models" value={ai.model} onChange={(e) => setAi({ ...ai, model: e.target.value.trim() })} className={`${field} mt-1.5 font-normal`} />
          <datalist id="models">{MODELS.map((m) => <option key={m} value={m} />)}</datalist>
          <span className="mt-1 block text-xs font-normal text-ink-3">Escribí cualquier modelo disponible en tu cuenta de OpenAI.</span>
        </label>
        <label className="text-sm font-medium text-ink">Nivel de razonamiento
          <select value={ai.reasoning} onChange={(e) => setAi({ ...ai, reasoning: e.target.value as ReasoningEffort })} className={`${field} mt-1.5 font-normal`}>
            {EFFORTS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
          <span className="mt-1 block text-xs font-normal text-ink-3">Más razonamiento mejora respuestas complejas pero tarda más.</span>
        </label>
      </div>
      <div className={panel}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <label htmlFor="dialogue" className="text-sm font-medium text-ink">Forma de conversar y de gestionar
            <span className="mt-1 block max-w-3xl text-xs font-normal text-ink-3">
              Cómo habla el asistente y qué responde en cada situación: tono, pasos para reservar, qué decir cuando no hay turnos. Las reglas de seguridad (no inventar precios ni horarios, no dar un turno por pagado, no dar indicaciones médicas) quedan fijas y no se pueden anular desde acá.
            </span>
          </label>
          <button type="button" onClick={() => setAi({ ...ai, dialogue: DEFAULT_DIALOGUE })} disabled={ai.dialogue === DEFAULT_DIALOGUE} className={`${btnGhost} h-8 text-xs`}>Restaurar texto inicial</button>
        </div>
        <textarea id="dialogue" value={ai.dialogue} onChange={(e) => setAi({ ...ai, dialogue: e.target.value })} rows={18} className={`${field} mt-2 h-auto py-3 font-normal leading-relaxed`} />
        <p className="mt-2 text-right text-xs text-ink-3">{ai.dialogue.length.toLocaleString("es-AR")} / 15.000 caracteres</p>
      </div>
      <div className={panel}>
        <label className="text-sm font-medium text-ink">Conocimiento sobre la empresa y los procedimientos
          <span className="mt-1 block text-xs font-normal text-ink-3">
            Escribí acá todo lo que el asistente debe saber: tratamientos, cuidados previos y posteriores, contraindicaciones generales, preguntas frecuentes, promociones, políticas de cancelación. Los precios, duraciones, dirección y horarios se toman de las otras secciones.
          </span>
          <textarea value={ai.knowledge} onChange={(e) => setAi({ ...ai, knowledge: e.target.value })} rows={22} className={`${field} mt-2 h-auto py-3 font-normal leading-relaxed`} />
        </label>
        <p className="mt-2 text-right text-xs text-ink-3">{ai.knowledge.length.toLocaleString("es-AR")} / 30.000 caracteres</p>
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
      <SaveBar dirty={dirty} onSave={() => save({ ...settings, ai })} onDiscard={() => setAi(settings.ai)} />
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
          <h1 className="font-serif text-[1.625rem] font-semibold leading-tight text-ink">Configuración</h1>
          <p className="mt-1 text-sm text-ink-2">Datos del centro, reglas de reserva e integraciones.</p>
        </div>
        <button onClick={() => save({ ...settings, business, booking, transfer, payments, policies, followup })} disabled={!dirty} className={btnPrimary}><Save /> Guardar</button>
      </div>

      <div className={`${panel} grid gap-4 sm:grid-cols-2`}>
        <p className="font-medium text-ink sm:col-span-2">Datos del centro</p>
        <label className="text-xs text-ink-3">Nombre<input value={business.name} onChange={(e) => setBusiness({ ...business, name: e.target.value })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-ink-3">WhatsApp (con código de país, sin +)<input value={business.whatsapp} onChange={(e) => setBusiness({ ...business, whatsapp: e.target.value })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-ink-3 sm:col-span-2">Dirección (se usa para el mapa)<input value={business.address} onChange={(e) => setBusiness({ ...business, address: e.target.value })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-ink-3 sm:col-span-2">Horario de atención (texto)<input value={business.hours} onChange={(e) => setBusiness({ ...business, hours: e.target.value })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-ink-3">Email<input value={business.email} onChange={(e) => setBusiness({ ...business, email: e.target.value })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-ink-3">Instagram<input value={business.instagram} onChange={(e) => setBusiness({ ...business, instagram: e.target.value })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-ink-3">Enlace de reservas<input value={business.bookingUrl} onChange={(e) => setBusiness({ ...business, bookingUrl: e.target.value })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-ink-3">Cómo llegar<input value={business.directions} onChange={(e) => setBusiness({ ...business, directions: e.target.value })} className={`${field} mt-1`} /></label>
      </div>

      <div className={`${panel} grid gap-4 sm:grid-cols-2`}>
        <p className="font-medium text-ink sm:col-span-2">Políticas (las comunica el asistente)</p>
        <label className="text-xs text-ink-3 sm:col-span-2">Política de seña<textarea rows={2} value={policies.deposit} onChange={(e) => setPolicies({ ...policies, deposit: e.target.value })} className={`${field} mt-1 h-auto py-2`} /></label>
        <label className="text-xs text-ink-3">Política de cancelación<textarea rows={3} value={policies.cancellation} onChange={(e) => setPolicies({ ...policies, cancellation: e.target.value })} className={`${field} mt-1 h-auto py-2`} /></label>
        <label className="text-xs text-ink-3">Política de reprogramación<textarea rows={3} value={policies.reschedule} onChange={(e) => setPolicies({ ...policies, reschedule: e.target.value })} className={`${field} mt-1 h-auto py-2`} /></label>
        <label className="text-xs text-ink-3">Tiempo mínimo para cancelar (horas)<input type="number" min={0} value={policies.minCancelHours} onChange={(e) => setPolicies({ ...policies, minCancelHours: num(e.target.value) })} className={`${field} mt-1`} /></label>
      </div>

      <div className={`${panel} grid gap-4 sm:grid-cols-3`}>
        <p className="font-medium text-ink sm:col-span-3">Reglas de seguimiento (crean tareas, no envían mensajes)</p>
        <label className="text-xs text-ink-3">Pedir seña a turnos dentro de (horas)<input type="number" min={1} value={followup.depositHours} onChange={(e) => setFollowup({ ...followup, depositHours: num(e.target.value) })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-ink-3">Pedir la seña con (días de anticipación a la sesión)<input type="number" min={0} value={followup.remindDaysBefore} onChange={(e) => setFollowup({ ...followup, remindDaysBefore: num(e.target.value) })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-ink-3">«Recordarme escribirle»: cuántos días después de la sesión (menos los de anticipación)<input type="number" min={7} value={followup.nextSessionDays} onChange={(e) => setFollowup({ ...followup, nextSessionDays: num(e.target.value) })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-ink-3">Paciente inactivo tras (días)<input type="number" min={7} value={followup.inactiveAfterDays} onChange={(e) => setFollowup({ ...followup, inactiveAfterDays: num(e.target.value) })} className={`${field} mt-1`} /></label>
      </div>

      <div className={`${panel} grid gap-4 sm:grid-cols-2 lg:grid-cols-4`}>
        <p className="font-medium text-ink sm:col-span-2 lg:col-span-4">Reglas de reserva</p>
        <label className="text-xs text-ink-3">Intervalo entre turnos (min)<input type="number" min={5} value={booking.slotMinutes} onChange={(e) => setBooking({ ...booking, slotMinutes: num(e.target.value) })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-ink-3">Anticipación mínima (horas)<input type="number" min={0} value={booking.minHoursAhead} onChange={(e) => setBooking({ ...booking, minHoursAhead: num(e.target.value) })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-ink-3">Tiempo para pagar la seña (min)<input type="number" min={10} value={booking.holdMinutes} onChange={(e) => setBooking({ ...booking, holdMinutes: num(e.target.value) })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-ink-3">Turnos simultáneos<input type="number" min={1} value={booking.capacity} onChange={(e) => setBooking({ ...booking, capacity: num(e.target.value) })} className={`${field} mt-1`} /></label>
      </div>

      <div className={`${panel} grid gap-4 sm:grid-cols-2`}>
        <div className="sm:col-span-2">
          <p className="font-medium text-ink">Textos de los mensajes</p>
          <p className="text-xs text-ink-3">Es lo que aparece ya redactado en «Mensajes». Podés usar {"{nombre}"}, {"{tratamiento}"}, {"{fecha}"}, {"{hora}"}, {"{saldo}"}, {"{interes}"}, {"{sena}"}, {"{link}"}, {"{direccion}"} y {"{centro}"}; cada mensaje se puede retocar antes de enviarlo.</p>
        </div>
        <label className="text-xs text-ink-3 sm:col-span-2">1) Después de la sesión (cómo le fue y agendar la próxima)<textarea rows={3} value={followup.afterSessionTemplate} onChange={(e) => setFollowup({ ...followup, afterSessionTemplate: e.target.value })} className={`${field} mt-1 h-auto py-2`} /></label>
        <label className="text-xs text-ink-3 sm:col-span-2">2) Pedir la seña (10 días antes; usa {"{sena}"} y {"{datos_pago}"})<textarea rows={3} value={followup.depositTemplate} onChange={(e) => setFollowup({ ...followup, depositTemplate: e.target.value })} className={`${field} mt-1 h-auto py-2`} /></label>
        <label className="text-xs text-ink-3 sm:col-span-2">3) Recordatorio de turno (un día antes)<textarea rows={3} value={followup.appointmentTemplate} onChange={(e) => setFollowup({ ...followup, appointmentTemplate: e.target.value })} className={`${field} mt-1 h-auto py-2`} /></label>
        <label className="text-xs text-ink-3 sm:col-span-2">«Recordarme escribirle» (agendar la próxima más adelante)<textarea rows={3} value={followup.nextSessionTemplate} onChange={(e) => setFollowup({ ...followup, nextSessionTemplate: e.target.value })} className={`${field} mt-1 h-auto py-2`} /></label>
        <label className="text-xs text-ink-3">Saldo pendiente<textarea rows={3} value={followup.balanceTemplate} onChange={(e) => setFollowup({ ...followup, balanceTemplate: e.target.value })} className={`${field} mt-1 h-auto py-2`} /></label>
        <label className="text-xs text-ink-3 sm:col-span-2">Seguimiento de una consulta que no reservó<textarea rows={3} value={followup.inquiryTemplate} onChange={(e) => setFollowup({ ...followup, inquiryTemplate: e.target.value })} className={`${field} mt-1 h-auto py-2`} /></label>
      </div>

      <div className={`${panel} grid gap-4 sm:grid-cols-2`}>
        <p className="font-medium text-ink sm:col-span-2">Pagos</p>
        <label className="text-xs text-ink-3">Seña sugerida (% del precio, para servicios sin seña fija)<input type="number" min={0} max={100} value={payments.depositPercent} onChange={(e) => setPayments({ ...payments, depositPercent: num(e.target.value) })} className={`${field} mt-1`} /></label>
        <div />
        <label className="text-xs text-ink-3">Medios de pago (uno por línea)
          <textarea rows={5} value={payments.methods.join(NL)} onChange={(e) => setPayments({ ...payments, methods: e.target.value.split(NL) })} className={`${field} mt-1 h-auto py-2`} />
        </label>
        <p className="self-center text-xs text-ink-3">Las profesionales y los equipos se administran en la pestaña «Equipo».</p>
      </div>

      <div className={`${panel} grid gap-4 sm:grid-cols-2`}>
        <div className="sm:col-span-2">
          <p className="font-medium text-ink">Transferencia</p>
          <p className="text-xs text-ink-3">Se ofrece cuando Mercado Pago no está configurado. El cliente transfiere la seña y sube el comprobante, que revisás en Turnos.</p>
        </div>
        <label className="text-xs text-ink-3">Alias<input value={transfer.alias} onChange={(e) => setTransfer({ ...transfer, alias: e.target.value })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-ink-3">CBU/CVU (opcional)<input inputMode="numeric" value={transfer.cbu} onChange={(e) => setTransfer({ ...transfer, cbu: e.target.value })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-ink-3">Titular (opcional)<input value={transfer.holder} onChange={(e) => setTransfer({ ...transfer, holder: e.target.value })} className={`${field} mt-1`} /></label>
        <label className="text-xs text-ink-3">Banco o billetera (opcional)<input value={transfer.bank} onChange={(e) => setTransfer({ ...transfer, bank: e.target.value })} className={`${field} mt-1`} /></label>
      </div>

      {status && (
        <div className={`${panel} space-y-3 text-sm`}>
          <p className="font-medium text-ink">Integraciones</p>
          <p className="text-ink-2">OpenAI: {status.openai ? "conectado" : "falta OPENAI_API_KEY"}</p>
          <p className="text-ink-2">
            Mercado Pago:{" "}
            {status.mercadoPago === "off" ? transfer.alias ? "falta MERCADOPAGO_ACCESS_TOKEN (la seña se paga por transferencia)" : "falta MERCADOPAGO_ACCESS_TOKEN y no hay alias cargado (la seña se coordina por WhatsApp)" : status.mercadoPago === "test" ? "modo prueba (credenciales TEST)" : "producción — los cobros son reales"}
          </p>
          {status.mercadoPago !== "off" && (
            <p className="text-ink-2">
              Webhook: configurá <code className="rounded bg-surface px-1.5 py-0.5 text-xs">{webhookUrl}</code> en Tus integraciones → Webhooks (evento Pagos).
              {!status.webhookSecret && " Opcional: agregá MERCADOPAGO_WEBHOOK_SECRET para validar la firma."}
            </p>
          )}
        </div>
      )}
      <SaveBar
        dirty={dirty}
        onSave={() => save({ ...settings, business, booking, transfer, payments, policies, followup })}
        onDiscard={() => (setBusiness(settings.business), setBooking(settings.booking), setTransfer(settings.transfer), setPayments(settings.payments), setPolicies(settings.policies), setFollowup(settings.followup))}
      />
    </section>
  )
}
