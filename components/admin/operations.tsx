"use client"

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, CalendarPlus, Users, CheckCircle2, ChevronLeft, ChevronRight, Download, History, MessageCircle, Pencil, Plus, Save, Search, Trash2, UserPlus, UserRound, Wallet, X, XCircle } from "lucide-react"
import { addDays, formatARS, formatDay, todayAR, weekdayOf } from "@/lib/time"
import { AlertItems, PeriodPanel, useAdminAlerts } from "./management"
import { ActionMenu, api, ApiError, Badge, btnGhost, btnIcon, btnPrimary, btnSmall, Card, chip, Drawer, Empty, field, fieldInline, fromLocalInput, hhmm, lbl, Loading, PageHeader, panel, Segmented, shortDate, Spinner, shortDateTime, Stat, tableHead, toLocalInput, TONE, type Flash, type MenuItem, type Tone } from "./ui"

/* ───────────── Tipos compartidos ───────────── */

export type AgendaItem = {
  id: string
  patient_id: number | null
  service_id: number | null
  service_name: string
  starts_at: string
  ends_at: string
  name: string
  phone: string
  email: string
  notes: string
  status: string
  state: string
  price: number
  deposit: number
  final_price: number
  discount: number
  promo_id: number | null
  promo_title: string
  paid: number
  balance: number
  pay_status: "sin_cargo" | "sin_sena" | "sena_pendiente" | "sena_abonada" | "pago_parcial" | "pagado"
  deposit_unrecorded: number
  source: string
  zones: string
  professional: string
  rescheduled: number
  has_receipt: boolean
  mp_payment_id: string | null
}

type Service = { id: number; name: string; category: string; gender: string; detail: string; duration_min: number; price: number; deposit: number; active: boolean }
type Promo = { id: number; title: string; kind: "percent" | "2x1" | "other"; percent: number; category: string; starts_on: string | null; ends_on: string | null; active: boolean }
type Catalog = { services: Service[]; promos: Promo[]; methods: string[]; professionals: string[]; depositPercent: number }

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
  created_at: string
  marketing_consent: boolean
  legacy_sessions: number
  legacy_balance: number
  sessions_done: number
  upcoming: number
  next_appointment: string | null
  last_session: string | null
  billed: number
  paid: number
  deposits_unrecorded?: number
  balance: number
}

type Payment = { id: number; booking_id: string | null; patient_id: number | null; amount: number; method: string; concept: string; origin: string; notes: string; paid_at: string; created_by: string; patient_name?: string | null; service_name?: string | null; starts_at?: string | null }

/* ───────────── Etiquetas ───────────── */

export const STATUS: Record<string, { label: string; tone: Tone; cls: string }> = {
  reserved: { label: "Reservado", tone: "accent", cls: TONE.accent },
  pending_payment: { label: "Pendiente de seña", tone: "warning", cls: TONE.warning },
  pending_review: { label: "Comprobante a revisar", tone: "info", cls: TONE.info },
  confirmed: { label: "Confirmado", tone: "success", cls: TONE.success },
  done: { label: "Realizado", tone: "neutral", cls: TONE.neutral },
  no_show: { label: "Ausente", tone: "warning", cls: TONE.warning },
  cancelled: { label: "Cancelado", tone: "neutral", cls: TONE.neutral },
  expired: { label: "Seña vencida", tone: "neutral", cls: TONE.neutral },
  conflict: { label: "Pagado · revisar", tone: "danger", cls: TONE.danger },
}

export const PAY: Record<AgendaItem["pay_status"], { label: string; tone: Tone; cls: string }> = {
  sin_cargo: { label: "Sin precio", tone: "neutral", cls: TONE.neutral },
  sin_sena: { label: "Sin pagos", tone: "neutral", cls: TONE.neutral },
  sena_pendiente: { label: "Seña pendiente", tone: "warning", cls: TONE.warning },
  sena_abonada: { label: "Seña abonada", tone: "info", cls: TONE.info },
  pago_parcial: { label: "Pago parcial", tone: "info", cls: TONE.info },
  pagado: { label: "Pagado", tone: "success", cls: TONE.success },
}

const SOURCE: Record<string, string> = { web: "Web", chat: "Chatbot", admin: "Administración", paciente: "Ficha del paciente" }
const ACTIVE = ["reserved", "pending_payment", "pending_review", "confirmed", "conflict"]

/* ───────────── Catálogo (servicios, promos, medios de pago) ───────────── */

export function useCatalog(flash: Flash) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  useEffect(() => {
    Promise.all([
      api<{ services: Service[] }>("/api/admin/services"),
      api<{ promos: Promo[] }>("/api/admin/promos"),
      api<{ settings: { payments: { methods: string[]; depositPercent: number }; team: { professionals: string[] } } }>("/api/admin/settings"),
      api<{ items: Array<{ name: string; active: boolean }> }>("/api/admin/data/profesionales").catch(() => ({ items: [] })),
    ])
      .then(([s, p, c, pros]) =>
        setCatalog({
          services: s.services,
          promos: p.promos,
          methods: c.settings.payments.methods,
          professionals: Array.from(new Set([...pros.items.filter((x) => x.active).map((x) => x.name), ...c.settings.team.professionals])),
          depositPercent: c.settings.payments.depositPercent,
        }),
      )
      .catch(() => setCatalog({ services: [], promos: [], methods: [], professionals: [], depositPercent: 0 }))
  }, [flash])
  return catalog
}

const promoActiveOn = (p: Promo, day: string) => p.active && (!p.starts_on || p.starts_on <= day) && (!p.ends_on || p.ends_on >= day)

/* ───────────── Tarjeta de turno ───────────── */

const DURATIONS = [15, 20, 30, 40, 45, 60, 75, 90, 120]

/** Importe editable en el lugar: se toca, se escribe y se guarda con Enter o al salir (Escape cancela). */
function QuickMoney({ label, value, onSave, empty, emphasis }: { label: string; value: number; onSave?: (n: number) => void; empty?: string; emphasis?: "strong" | "due" }) {
  const [editing, setEditing] = useState(false)
  const [v, setV] = useState(String(value))
  useEffect(() => setV(String(value)), [value])
  const commit = () => {
    setEditing(false)
    const n = Math.round(Number(v))
    if (onSave && Number.isFinite(n) && n >= 0 && n !== value) onSave(n)
    else setV(String(value))
  }
  const valueCls = `text-sm tabular-nums ${emphasis === "strong" ? "font-semibold text-ink" : emphasis === "due" ? (value > 0 ? "font-semibold text-primary" : "font-medium text-ink-2") : "text-ink"}`
  return (
    <div className="min-w-0" onClick={(e) => onSave && e.stopPropagation()}>
      <p className="text-[11px] font-medium text-ink-3">{label}</p>
      {editing ? (
        <input
          autoFocus
          type="number"
          min={0}
          inputMode="numeric"
          aria-label={label}
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit()
            if (e.key === "Escape") (setEditing(false), setV(String(value)))
          }}
          className="mt-0.5 h-7 w-full max-w-[7rem] rounded-md border border-primary bg-white px-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/15"
        />
      ) : onSave ? (
        <button
          onClick={() => setEditing(true)}
          title={`Cambiar ${label.toLowerCase()}`}
          aria-label={`${label}: ${value > 0 ? formatARS(value) : empty ?? formatARS(0)}. Tocá para cambiarlo`}
          className={`-mx-1 mt-0.5 rounded px-1 text-left decoration-line-strong decoration-dashed underline-offset-4 hover:bg-surface hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 ${valueCls}`}
        >
          {value > 0 || !empty ? formatARS(value) : <span className="font-medium text-primary">{empty}</span>}
        </button>
      ) : (
        <p className={`mt-0.5 ${valueCls}`}>{value > 0 || !empty ? formatARS(value) : empty}</p>
      )}
    </div>
  )
}

const waNumber = (phone: string) => phone.replace(/\D/g, "").replace(/^(?!54)/, "549")

/**
 * Un turno en la agenda. Jerarquía: horario → paciente y servicio → dinero → estado → acciones.
 * La acción más probable queda a la vista; el resto va en el menú «Más acciones».
 */
export function AppointmentRow({ b, onEdit, onPay, onStatus, onPatient, onQuick, compact }: {
  b: AgendaItem
  onEdit: (b: AgendaItem) => void
  onPay: (b: AgendaItem) => void
  onStatus: (b: AgendaItem, status: string) => void
  onPatient?: (id: number) => void
  onQuick?: (b: AgendaItem, patch: Record<string, unknown>) => void
  compact?: boolean
}) {
  const st = STATUS[b.state] ?? STATUS.confirmed
  const active = ACTIVE.includes(b.state)
  const closed = b.state === "cancelled" || b.state === "expired"
  const minutes = Math.round((new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60_000)
  const soon = new Date(b.starts_at) <= new Date(Date.now() + 12 * 3600_000)
  const needsConfirm = ["reserved", "pending_review", "conflict", "expired"].includes(b.state)
  const payLabel = b.deposit_unrecorded > 0 ? "Registrar seña" : "Registrar pago"

  // acción principal: la que más probablemente se necesita ahora
  const primary: { label: string; run: () => void; icon?: React.ReactNode } | null = closed
    ? null
    : active && soon
      ? { label: "Realizado", run: () => onStatus(b, "done"), icon: <CheckCircle2 /> }
      : b.balance > 0 || b.deposit_unrecorded > 0
        ? { label: payLabel, run: () => onPay(b), icon: <Wallet /> }
        : needsConfirm
          ? { label: "Confirmar", run: () => onStatus(b, "confirmed") }
          : null

  const menu: MenuItem[] = [
    { label: payLabel, onSelect: () => onPay(b), icon: <Wallet />, hidden: closed || primary?.label === payLabel },
    { label: "Confirmar turno", onSelect: () => onStatus(b, "confirmed"), hidden: !needsConfirm || primary?.label === "Confirmar" },
    { label: "Marcar como realizado", onSelect: () => onStatus(b, "done"), hidden: !active || primary?.label === "Realizado" },
    { label: "Marcar ausente", onSelect: () => onStatus(b, "no_show"), hidden: !active },
    { label: "Enviar recordatorio por WhatsApp", icon: <MessageCircle />, hidden: !active || !b.phone, href: `https://wa.me/${waNumber(b.phone)}?text=${encodeURIComponent(`Hola ${b.name.split(" ")[0]}! Te recordamos tu turno de ${b.service_name} el ${shortDateTime(b.starts_at)} hs en Eterna.`)}` },
    { label: "Ver comprobante", hidden: !b.has_receipt, href: `/api/admin/bookings/${b.id}/comprobante` },
    { label: "Ver ficha del paciente", icon: <UserRound />, hidden: !b.patient_id || !onPatient, onSelect: () => onPatient?.(b.patient_id!) },
    { label: "Cancelar turno", danger: true, icon: <XCircle />, hidden: closed, onSelect: () => onStatus(b, "cancelled") },
  ]

  return (
    <li className={`group grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 py-4 first:pt-1 last:pb-1 lg:grid-cols-[76px_minmax(0,1fr)_minmax(300px,360px)_236px] lg:items-start ${closed ? "opacity-70" : ""}`}>
      {/* horario */}
      <div className="w-[76px]">
        <p className="font-serif text-xl font-semibold leading-none tabular-nums text-ink">{hhmm(b.starts_at)}</p>
        <p className="mt-1 text-xs tabular-nums text-ink-3">hasta {hhmm(b.ends_at)}</p>
        {compact && <p className="mt-0.5 text-xs text-ink-3">{shortDate(b.starts_at)}</p>}
        {onQuick && !closed ? (
          <select
            value={minutes}
            onChange={(e) => onQuick(b, { durationMin: Number(e.target.value) })}
            className="mt-1.5 h-7 w-full rounded-md border border-line bg-white px-1 text-xs text-ink-2 hover:border-line-strong focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
            aria-label={`Duración del turno de ${b.name}`}
          >
            {Array.from(new Set([...DURATIONS, minutes])).sort((x, y) => x - y).map((m) => <option key={m} value={m}>{m} min</option>)}
          </select>
        ) : (
          <p className="text-xs text-ink-3">{minutes} min</p>
        )}
      </div>

      {/* paciente, servicio y estado */}
      <div className="min-w-0">
        <p className="truncate text-[0.9375rem] font-semibold text-ink">
          {b.patient_id && onPatient ? (
            <button onClick={() => onPatient(b.patient_id!)} className="rounded hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45">{b.name}</button>
          ) : (
            b.name
          )}
        </p>
        <p className="text-sm text-ink-2 lg:truncate">{b.service_name}</p>
        <p className="mt-0.5 truncate text-xs text-ink-3">
          {[b.zones, b.professional && `con ${b.professional}`, SOURCE[b.source] ?? b.source].filter(Boolean).join(" · ")}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge tone={st.tone}>{st.label}</Badge>
          {!closed && <Badge tone={PAY[b.pay_status].tone}>{PAY[b.pay_status].label}</Badge>}
          {b.rescheduled > 0 && <Badge tone="accent">Reprogramado</Badge>}
          {b.promo_title && <Badge tone="neutral">{b.promo_title}</Badge>}
        </div>
        {b.notes && <p className="mt-1.5 line-clamp-2 text-xs text-ink-2" title={b.notes}><span className="font-medium">Obs.:</span> {b.notes}</p>}
      </div>

      {/* dinero: siempre en el mismo lugar y orden */}
      <div className="col-span-2 grid grid-cols-4 gap-2 rounded-lg bg-surface/70 px-3 py-2 lg:col-span-1">
        <div>
          <QuickMoney label="Precio" value={b.final_price} emphasis="strong" empty="Cargar" onSave={onQuick && !closed ? (n) => onQuick(b, b.discount > 0 ? { finalPrice: n } : { price: n, finalPrice: n }) : undefined} />
          {b.discount > 0 && <p className="text-[11px] tabular-nums text-ink-3 line-through" aria-label={`Precio sin descuento ${formatARS(b.price)}`}>{formatARS(b.price)}</p>}
        </div>
        <QuickMoney label="Seña" value={b.deposit} empty="Definir" onSave={onQuick && !closed ? (n) => onQuick(b, { deposit: n }) : undefined} />
        <QuickMoney label="Pagado" value={b.paid + b.deposit_unrecorded} />
        <QuickMoney label="Resta" value={b.balance} emphasis="due" />
      </div>

      {/* acciones */}
      <div className="col-span-2 flex items-center justify-end gap-1.5 lg:col-span-1 lg:pt-0.5">
        {primary && (
          <button onClick={primary.run} className={`${btnSmall} ${primary.label === "Realizado" ? "" : "border-primary/25 text-primary"}`}>
            {primary.icon}
            {primary.label}
          </button>
        )}
        <button onClick={() => onEdit(b)} className={btnSmall} aria-label={`Editar turno de ${b.name}`}>
          <Pencil /> Editar
        </button>
        <ActionMenu items={menu} label={`Más acciones para el turno de ${b.name}`} />
      </div>
    </li>
  )
}

/* ───────────── Acciones comunes sobre turnos ───────────── */

export function useAppointmentActions(flash: Flash, reload: () => void) {
  const [editing, setEditing] = useState<{ booking?: AgendaItem; patient?: { id: number; name: string } } | null>(null)
  const [paying, setPaying] = useState<{ booking?: AgendaItem; patient?: { id: number; name: string } } | null>(null)

  const changeStatus = async (b: AgendaItem, status: string) => {
    const msg: Record<string, string> = {
      cancelled: `¿Cancelar el turno de ${b.name}? El horario queda libre y el turno se conserva en el historial.`,
      no_show: `¿Marcar a ${b.name} como ausente?`,
    }
    if (msg[status] && !confirm(msg[status])) return
    try {
      await api("/api/admin/bookings", { method: "PATCH", body: JSON.stringify({ id: b.id, status }) })
      flash(`Turno: ${STATUS[status]?.label.toLowerCase() ?? status}`)
      reload()
    } catch (e) {
      if (e instanceof ApiError && e.message === "horario_ocupado") {
        if (confirm(`Ese horario ya está ocupado por ${(e.data.with as string[]).join(", ")}. ¿Confirmarlo igual (sobreturno)?`)) {
          await api("/api/admin/bookings", { method: "PATCH", body: JSON.stringify({ id: b.id, status, allowOverlap: true }) }).catch(() => flash("No se pudo actualizar", true))
          reload()
        }
        return
      }
      flash("No se pudo actualizar el turno", true)
    }
  }

  // edición rápida desde la tarjeta (duración, precio, seña): guarda al instante y queda en el historial
  const quick = async (b: AgendaItem, patch: Record<string, unknown>, allowOverlap = false) => {
    try {
      await api("/api/admin/bookings", { method: "PATCH", body: JSON.stringify({ id: b.id, ...patch, allowOverlap }) })
      flash("Turno actualizado")
      reload()
    } catch (e) {
      if (e instanceof ApiError && e.message === "horario_ocupado") {
        if (confirm(`Con esa duración se superpone con ${(e.data.with as string[]).join(", ")}. ¿Guardarlo igual?`)) return quick(b, patch, true)
        return
      }
      flash(e instanceof ApiError && e.message === "sin_permiso" ? "Tu usuario no tiene permiso para esto" : "No se pudo actualizar", true)
    }
  }

  const dialogs = (
    <>
      {editing && (
        <AppointmentDialog
          booking={editing.booking}
          patient={editing.patient}
          flash={flash}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            reload()
          }}
        />
      )}
      {paying && (
        <PaymentDialog
          booking={paying.booking}
          patient={paying.patient}
          flash={flash}
          onClose={() => setPaying(null)}
          onSaved={() => {
            setPaying(null)
            reload()
          }}
        />
      )}
    </>
  )

  return {
    edit: (b: AgendaItem) => setEditing({ booking: b }),
    create: (patient?: { id: number; name: string }) => setEditing({ patient }),
    pay: (b: AgendaItem) => setPaying({ booking: b }),
    payPatient: (patient: { id: number; name: string }) => setPaying({ patient }),
    changeStatus,
    quick,
    dialogs,
  }
}

/* ───────────── Crear / editar turno ───────────── */

function PatientPicker({ value, onChange }: { value: { id: number; name: string } | null; onChange: (p: { id: number; name: string } | null, draft?: { name: string; phone: string }) => void }) {
  const [q, setQ] = useState("")
  const [results, setResults] = useState<Array<{ id: number; name: string; phone: string }>>([])
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ name: "", phone: "" })
  useEffect(() => {
    if (q.trim().length < 2) return setResults([])
    const t = setTimeout(() => api<{ patients: typeof results }>(`/api/admin/patients?q=${encodeURIComponent(q)}`).then((d) => setResults(d.patients)).catch(() => {}), 250)
    return () => clearTimeout(t)
  }, [q])
  if (value)
    return (
      <div className="flex items-center justify-between rounded-lg border border-line bg-surface-2 px-3 py-2">
        <p className="text-sm font-medium text-ink">{value.name}</p>
        <button onClick={() => onChange(null)} className="text-xs text-primary hover:underline">Cambiar</button>
      </div>
    )
  if (creating)
    return (
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-line p-3">
        <label className={`${lbl} col-span-2`}>Nombre y apellido<input value={draft.name} onChange={(e) => { const d = { ...draft, name: e.target.value }; setDraft(d); onChange(null, d) }} className={`${field} mt-1`} /></label>
        <label className={`${lbl} col-span-2`}>WhatsApp<input value={draft.phone} onChange={(e) => { const d = { ...draft, phone: e.target.value }; setDraft(d); onChange(null, d) }} className={`${field} mt-1`} placeholder="11 2345 6789" /></label>
        <p className="col-span-2 text-xs text-ink-3">Si el teléfono ya existe, el turno se asocia a esa ficha (no se duplica).</p>
        <button onClick={() => { setCreating(false); onChange(null) }} className="col-span-2 text-left text-xs text-primary hover:underline">Buscar un paciente existente</button>
      </div>
    )
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-3" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o teléfono…" className={`${field} pl-9`} autoFocus />
      </div>
      {results.length > 0 && (
        <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-line">
          {results.map((r) => (
            <li key={r.id}>
              <button onClick={() => onChange({ id: r.id, name: r.name })} className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-surface">
                <span className="text-ink">{r.name}</span>
                <span className="text-ink-3">{r.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button onClick={() => setCreating(true)} className={`${btnSmall}`}><UserPlus className="h-3.5 w-3.5" /> Paciente nuevo</button>
    </div>
  )
}

export function AppointmentDialog({ booking, patient, flash, onClose, onSaved }: {
  booking?: AgendaItem
  patient?: { id: number; name: string }
  flash: Flash
  onClose: () => void
  onSaved: () => void
}) {
  const catalog = useCatalog(flash)
  const editing = !!booking
  const [who, setWho] = useState<{ id: number; name: string } | null>(booking?.patient_id ? { id: booking.patient_id, name: booking.name } : patient ?? null)
  const [draft, setDraft] = useState<{ name: string; phone: string } | undefined>()
  const [f, setF] = useState(() => ({
    serviceId: booking?.service_id ?? 0,
    serviceName: booking?.service_name ?? "",
    zones: booking?.zones ?? "",
    professional: booking?.professional ?? "",
    start: booking ? toLocalInput(booking.starts_at) : "",
    durationMin: booking ? Math.round((new Date(booking.ends_at).getTime() - new Date(booking.starts_at).getTime()) / 60_000) : 30,
    promoId: booking?.promo_id ?? 0,
    price: booking?.price ?? 0,
    finalPrice: booking ? String(booking.final_price) : "",
    deposit: booking?.deposit ?? 0,
    status: booking?.status ?? "confirmed",
    notes: booking?.notes ?? "",
  }))
  const [slots, setSlots] = useState<string[] | null>(null)
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<typeof f>) => setF((v) => ({ ...v, ...p }))
  const day = f.start.slice(0, 10)

  useEffect(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return setSlots(null)
    api<{ slots: string[] }>(`/api/admin/slots?dia=${day}&duracion=${f.durationMin}`).then((d) => setSlots(d.slots)).catch(() => setSlots(null))
  }, [day, f.durationMin])

  const service = catalog?.services.find((s) => s.id === f.serviceId)
  const promos = (catalog?.promos ?? []).filter((p) => (promoActiveOn(p, day || todayAR()) || p.id === booking?.promo_id) && (!p.category || !service || p.category === service.category))
  const promo = promos.find((p) => p.id === f.promoId)
  // si se corrige el precio de un turno sin cambiar su promo, se mantiene el descuento que se había acordado (no el actual de la promo)
  const keepsDeal = !!booking && f.promoId === (booking.promo_id ?? 0) && booking.price > 0
  const computedFinal = keepsDeal
    ? Math.round((f.price * booking!.final_price) / booking!.price)
    : promo?.kind === "percent" ? f.price - Math.round((f.price * promo.percent) / 100) : f.price

  const pickService = (id: number) => {
    const s = catalog?.services.find((x) => x.id === id)
    if (!s) return set({ serviceId: 0 })
    const deposit = s.deposit > 0 ? s.deposit : Math.round(((catalog?.depositPercent ?? 0) * s.price) / 100)
    set({ serviceId: s.id, serviceName: s.gender && s.gender !== "Unisex" ? `${s.name} (${s.gender})` : s.name, zones: s.detail || f.zones, durationMin: s.duration_min, price: s.price, deposit, finalPrice: "" })
  }

  const save = async (allowOverlap = false) => {
    if (!who && !draft?.name.trim()) return flash("Elegí o cargá el paciente", true)
    if (!f.start) return flash("Elegí día y horario", true)
    if (!f.serviceName.trim()) return flash("Elegí el tratamiento", true)
    setBusy(true)
    const body = {
      ...(editing ? { id: booking!.id } : { patientId: who?.id ?? null, patient: who ? undefined : draft, source: patient ? "paciente" : "admin" }),
      serviceId: f.serviceId || null,
      serviceName: f.serviceName,
      zones: f.zones,
      professional: f.professional,
      start: fromLocalInput(f.start),
      durationMin: f.durationMin,
      promoId: f.promoId || null,
      price: f.price,
      finalPrice: f.finalPrice === "" ? (editing ? computedFinal : null) : Number(f.finalPrice),
      deposit: f.deposit,
      status: f.status === "pending_review" || f.status === "conflict" ? undefined : f.status,
      notes: f.notes,
      allowOverlap,
    }
    try {
      await api("/api/admin/bookings", { method: editing ? "PATCH" : "POST", body: JSON.stringify(body) })
      flash(editing ? "Turno actualizado" : "Turno creado: ya figura en la agenda y en la ficha del paciente")
      onSaved()
    } catch (e) {
      if (e instanceof ApiError && e.message === "horario_ocupado") {
        if (confirm(`Ese horario ya está ocupado (${(e.data.with as string[]).join(", ")}). ¿Guardarlo igual como sobreturno?`)) {
          setBusy(false)
          return save(true)
        }
      } else
        flash(
          e instanceof ApiError && e.message === "paciente_invalido" ? "Falta el paciente"
          : e instanceof ApiError && e.message === "profesional_no_habilitada" ? String(e.data.detail)
          : e instanceof ApiError && e.message === "sin_permiso" ? "Tu usuario no tiene permiso para esto"
          : "Revisá los datos del turno",
          true,
        )
    }
    setBusy(false)
  }

  return (
    <Drawer
      title={editing ? "Editar turno" : patient ? `Agregar sesión · ${patient.name}` : "Nuevo turno"}
      subtitle={editing ? `${booking!.name} · ${shortDateTime(booking!.starts_at)}` : undefined}
      onClose={onClose}
      footer={
        <>
          <button onClick={() => save()} disabled={busy} className={btnPrimary}>{busy ? <Spinner /> : <Save />} {editing ? "Guardar cambios" : "Crear turno"}</button>
          <button onClick={onClose} className={btnGhost}>Cancelar</button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className={`${lbl} mb-1`}>Paciente</p>
          {editing ? <p className="text-sm font-medium text-ink">{booking!.name}</p> : <PatientPicker value={who} onChange={(p, d) => { setWho(p); setDraft(d) }} />}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className={`${lbl} col-span-2`}>Tratamiento
            <select value={f.serviceId} onChange={(e) => pickService(Number(e.target.value))} className={`${field} mt-1`}>
              <option value={0}>{f.serviceName && !f.serviceId ? f.serviceName : "Elegí un servicio…"}</option>
              {(catalog?.services ?? []).filter((s) => s.active || s.id === f.serviceId).map((s) => (
                <option key={s.id} value={s.id}>{[s.category, s.name, s.gender].filter(Boolean).join(" · ")} — {formatARS(s.price)}</option>
              ))}
            </select>
          </label>
          <label className={`${lbl} col-span-2`}>Zonas a tratar<input value={f.zones} onChange={(e) => set({ zones: e.target.value })} className={`${field} mt-1`} placeholder="Piernas completas + cavado + axilas" /></label>
          <label className={lbl}>Día y hora<input type="datetime-local" step={300} value={f.start} onChange={(e) => set({ start: e.target.value })} className={`${field} mt-1`} /></label>
          <label className={lbl}>Duración (min)<input type="number" min={5} step={5} value={f.durationMin} onChange={(e) => set({ durationMin: Number(e.target.value) })} className={`${field} mt-1`} /></label>
          <div className="col-span-2 -mt-1 flex flex-wrap gap-1.5">
            {[15, 30, 45, 60, 90].map((m) => (
              <button key={m} onClick={() => set({ durationMin: m })} className={`h-7 rounded-full border px-2.5 text-xs ${f.durationMin === m ? "border-primary bg-primary text-primary-foreground" : "border-line bg-white text-ink hover:bg-surface"}`}>{m} min</button>
            ))}
          </div>
          {slots && (
            <div className="col-span-2">
              <p className="text-xs text-ink-3">{slots.length ? "Horarios libres de esa jornada:" : "No hay horarios libres cargados ese día (podés agendar igual)."}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {slots.slice(0, 24).map((s) => (
                  <button key={s} onClick={() => set({ start: `${day}T${hhmm(s)}` })} className={`h-7 rounded-full border px-2.5 text-xs ${f.start.endsWith(hhmm(s)) ? "border-primary bg-primary text-primary-foreground" : "border-line bg-white text-ink hover:bg-surface"}`}>
                    {hhmm(s)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className={lbl}>Profesional
            <input list="professionals" value={f.professional} onChange={(e) => set({ professional: e.target.value })} className={`${field} mt-1`} placeholder="Sin asignar" />
            <datalist id="professionals">{(catalog?.professionals ?? []).map((p) => <option key={p} value={p} />)}</datalist>
          </label>
          <label className={lbl}>Estado
            <select value={f.status} onChange={(e) => set({ status: e.target.value })} className={`${field} mt-1`}>
              {["reserved", "confirmed", "done", "no_show", "cancelled"].map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
              {!["reserved", "confirmed", "done", "no_show", "cancelled"].includes(f.status) && <option value={f.status}>{STATUS[f.status]?.label ?? f.status}</option>}
            </select>
          </label>
        </div>

        <div className="rounded-xl border border-line bg-surface p-3">
          <p className="text-sm font-medium text-ink">Precio y seña</p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <label className={lbl}>Precio habitual<input type="number" min={0} value={f.price} onChange={(e) => set({ price: Number(e.target.value), finalPrice: "" })} className={`${field} mt-1`} /></label>
            <label className={lbl}>Promoción
              <select value={f.promoId} onChange={(e) => set({ promoId: Number(e.target.value), finalPrice: "" })} className={`${field} mt-1`}>
                <option value={0}>Sin promoción</option>
                {promos.map((p) => <option key={p.id} value={p.id}>{p.title}{p.kind === "percent" ? ` (−${p.percent}%)` : ""}</option>)}
              </select>
            </label>
            <label className={lbl}>Precio final<input type="number" min={0} value={f.finalPrice === "" ? computedFinal : f.finalPrice} onChange={(e) => set({ finalPrice: e.target.value })} className={`${field} mt-1`} /></label>
            <label className={lbl}>Seña requerida<input type="number" min={0} value={f.deposit} onChange={(e) => set({ deposit: Number(e.target.value) })} className={`${field} mt-1`} /></label>
          </div>
          {editing && booking!.promo_title && !booking!.promo_id && (
            <p className="mt-2 text-xs text-amber-700">Este turno tiene anotada la promo «{booking!.promo_title}». Si cambiás el precio o elegís otra promo, revisá el precio final.</p>
          )}
          <p className="mt-2 text-xs text-ink-3">
            El precio queda congelado en este turno: si después cambiás la lista de precios o la promoción, este turno conserva lo acordado.
            {catalog && catalog.depositPercent > 0 && ` Política de seña: ${catalog.depositPercent}%.`}
          </p>
          {editing && <BookingPayments bookingId={booking!.id} flash={flash} />}
        </div>

        <label className={`${lbl} block`}>Observaciones<textarea rows={3} value={f.notes} onChange={(e) => set({ notes: e.target.value })} className={`${field} mt-1 h-auto py-2`} /></label>

        {editing && <BookingHistory id={booking!.id} />}
      </div>
    </Drawer>
  )
}

/** Pagos de un turno, con corrección de importe, medio, concepto o fecha (los automáticos no se tocan). */
function BookingPayments({ bookingId, flash }: { bookingId: string; flash: Flash }) {
  const catalog = useCatalog(flash)
  const [list, setList] = useState<Payment[] | null>(null)
  const [edit, setEdit] = useState<{ id: number; amount: number | string; method: string; concept: string; paidAt: string } | null>(null)
  const load = useCallback(() => {
    api<{ payments: Payment[] }>("/api/admin/payments")
      .then((d) => setList(d.payments.filter((p) => p.booking_id === bookingId)))
      .catch(() => setList([]))
  }, [bookingId])
  useEffect(load, [load])
  const save = async () => {
    if (!edit) return
    try {
      await api("/api/admin/payments", { method: "PUT", body: JSON.stringify({ id: edit.id, amount: Number(edit.amount), method: edit.method, concept: edit.concept, paidAt: fromLocalInput(edit.paidAt) }) })
      flash("Pago corregido")
      setEdit(null)
      load()
    } catch {
      flash("Revisá el importe", true)
    }
  }
  const annul = async (p: Payment) => {
    if (!confirm(`¿Anular el pago de ${formatARS(p.amount)}? Queda registrado en la auditoría.`)) return
    await api(`/api/admin/payments?id=${p.id}`, { method: "DELETE" }).catch(() => flash("No se pudo anular", true))
    load()
  }
  if (list === null) return null
  return (
    <div className="mt-2 border-t border-border pt-2">
      <p className="text-xs font-medium text-ink">Pagos de este turno {list.length === 0 && <span className="font-normal text-ink-3">(todavía ninguno; se cargan con «Registrar pago»)</span>}</p>
      <ul className="mt-1 space-y-1">
        {list.map((p) =>
          edit?.id === p.id ? (
            <li key={p.id} className="grid grid-cols-2 gap-1.5 rounded-lg border border-line bg-white p-2">
              <input type="number" min={1} value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} className={`${field} h-8`} aria-label="Importe" />
              <select value={edit.method} onChange={(e) => setEdit({ ...edit, method: e.target.value })} className={`${field} h-8`} aria-label="Medio">
                {Array.from(new Set([...(catalog?.methods ?? []), edit.method])).map((m) => <option key={m}>{m}</option>)}
              </select>
              <select value={edit.concept} onChange={(e) => setEdit({ ...edit, concept: e.target.value })} className={`${field} h-8`} aria-label="Concepto">
                {Array.from(new Set(["Seña", "Pago parcial", "Pago total", "Saldo", "Otro", edit.concept])).map((c) => <option key={c}>{c}</option>)}
              </select>
              <input type="datetime-local" value={edit.paidAt} onChange={(e) => setEdit({ ...edit, paidAt: e.target.value })} className={`${field} h-8`} aria-label="Fecha" />
              <div className="col-span-2 flex gap-2">
                <button onClick={save} className={`${btnPrimary} h-8`}>Guardar pago</button>
                <button onClick={() => setEdit(null)} className={`${btnGhost} h-8`}>Cancelar</button>
              </div>
            </li>
          ) : (
            <li key={p.id} className="flex items-center gap-2 text-xs text-ink-2">
              <span className="flex-1">{shortDate(p.paid_at)} · {p.concept} · {p.method} · <strong className="text-ink">{formatARS(p.amount)}</strong></span>
              {p.origin === "manual" ? (
                <>
                  <button onClick={() => setEdit({ id: p.id, amount: p.amount, method: p.method, concept: p.concept, paidAt: toLocalInput(p.paid_at) })} className="text-primary hover:underline">Corregir</button>
                  <button onClick={() => annul(p)} className="text-red-700 hover:underline">Anular</button>
                </>
              ) : (
                <span className="text-ink-3">automático</span>
              )}
            </li>
          ),
        )}
      </ul>
    </div>
  )
}

function BookingHistory({ id }: { id: string }) {
  const [history, setHistory] = useState<Array<{ kind: string; detail: Record<string, unknown>; actor: string; created_at: string }> | null>(null)
  useEffect(() => {
    api<{ history: NonNullable<typeof history> }>(`/api/admin/bookings?id=${id}`).then((d) => setHistory(d.history)).catch(() => {})
  }, [id])
  if (!history?.length) return null
  const describe = (h: (typeof history)[number]) => {
    const d = h.detail
    if (h.kind === "reprogramado") return `Reprogramado: ${shortDateTime(d.antes as string)} → ${shortDateTime(d.despues as string)}`
    if (h.kind === "estado") return `Estado: ${STATUS[d.antes as string]?.label ?? d.antes} → ${STATUS[d.despues as string]?.label ?? d.despues}`
    if (h.kind === "pago") return `Pago ${formatARS(Number(d.importe))} · ${d.medio} · ${d.concepto}`
    if (h.kind === "pago_anulado") return `Pago anulado ${formatARS(Number(d.importe))}`
    if (h.kind === "pago_corregido") return `Pago corregido: ${formatARS(Number(d.antes))} → ${formatARS(Number(d.despues))}`
    if (h.kind === "creado") return `Creado desde ${SOURCE[d.origen as string] ?? d.origen}`
    return h.kind
  }
  return (
    <div className="border-t border-border pt-4">
      <p className="flex items-center gap-1.5 text-sm font-medium text-ink"><History className="h-4 w-4" /> Historial del turno</p>
      <ul className="mt-2 space-y-1 text-xs text-ink-2">
        {history.map((h, i) => <li key={i}>{shortDateTime(h.created_at)} · {describe(h)} <span className="text-ink-3">({h.actor})</span></li>)}
      </ul>
    </div>
  )
}

/* ───────────── Registrar pago ───────────── */

export function PaymentDialog({ booking, patient, flash, onClose, onSaved }: {
  booking?: AgendaItem
  patient?: { id: number; name: string }
  flash: Flash
  onClose: () => void
  onSaved: () => void
}) {
  const catalog = useCatalog(flash)
  const registeringDeposit = !!booking && booking.deposit_unrecorded > 0
  const suggested = booking ? (registeringDeposit ? booking.deposit_unrecorded : booking.balance) : 0
  const [f, setF] = useState({ amount: suggested || "", method: "", concept: registeringDeposit ? "Seña" : "Pago parcial", paidAt: toLocalInput(new Date()), notes: "" })
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<typeof f>) => setF((v) => ({ ...v, ...p }))
  const method = f.method || catalog?.methods[0] || ""
  const amount = Number(f.amount)
  const concept = booking && !registeringDeposit && amount >= booking.balance ? (booking.paid === 0 ? "Pago total" : "Saldo") : f.concept

  const save = async () => {
    if (!amount || amount <= 0) return flash("Ingresá el importe", true)
    setBusy(true)
    try {
      await api("/api/admin/payments", {
        method: "POST",
        body: JSON.stringify({ bookingId: booking?.id ?? null, patientId: booking?.patient_id ?? patient?.id ?? null, amount, method, concept, notes: f.notes, paidAt: fromLocalInput(f.paidAt) }),
      })
      flash(`Pago de ${formatARS(amount)} registrado`)
      onSaved()
    } catch {
      flash("No se pudo registrar el pago", true)
    }
    setBusy(false)
  }

  return (
    <Drawer
      title="Registrar pago"
      onClose={onClose}
      footer={
        <>
          <button onClick={save} disabled={busy || !catalog} className={btnPrimary}>{busy ? <Spinner /> : <Save />} Registrar pago</button>
          <button onClick={onClose} className={btnGhost}>Cancelar</button>
        </>
      }
    >
      <div className="space-y-4">
        {booking && (
          <div className="rounded-xl border border-line bg-surface p-3 text-sm text-ink">
            <p className="font-medium">{booking.name} · {booking.service_name}</p>
            <p className="text-ink-2">{shortDateTime(booking.starts_at)}</p>
            <p className="mt-1">Precio {formatARS(booking.final_price)} · Seña {formatARS(booking.deposit)} · Pagado {formatARS(booking.paid + booking.deposit_unrecorded)} · <strong>Resta {formatARS(booking.balance)}</strong></p>
            {registeringDeposit && <p className="mt-1 text-xs text-ink-3">La seña ya se considera abonada (se paga al reservar). Registrala para dejar asentado con qué medio y cuándo se pagó; el saldo no cambia.</p>}
          </div>
        )}
        {!booking && patient && <p className="text-sm text-ink">Pago a cuenta de <strong>{patient.name}</strong> (sin turno asociado).</p>}
        <div className="grid grid-cols-2 gap-3">
          <label className={lbl}>Importe<input type="number" min={1} value={f.amount} onChange={(e) => set({ amount: e.target.value })} className={`${field} mt-1`} autoFocus /></label>
          <label className={lbl}>Medio de pago
            <select value={method} onChange={(e) => set({ method: e.target.value })} className={`${field} mt-1`}>
              {(catalog?.methods ?? []).map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
          <label className={lbl}>Concepto
            <select value={concept} onChange={(e) => set({ concept: e.target.value })} className={`${field} mt-1`}>
              {["Seña", "Pago parcial", "Pago total", "Saldo", "Otro"].map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className={lbl}>Fecha del pago<input type="datetime-local" value={f.paidAt} onChange={(e) => set({ paidAt: e.target.value })} className={`${field} mt-1`} /></label>
          <label className={`${lbl} col-span-2`}>Notas<input value={f.notes} onChange={(e) => set({ notes: e.target.value })} className={`${field} mt-1`} placeholder="Opcional" /></label>
        </div>
        {booking && amount > 0 && (() => {
          const after = Math.max(0, booking.balance - Math.max(0, amount - booking.deposit_unrecorded))
          return <p className="text-sm text-ink-2">Después de este pago resta: <strong className="text-ink">{formatARS(after)}</strong>{after === 0 && " · queda pagado"}</p>
        })()}
      </div>
    </Drawer>
  )
}

/* ───────────── Agenda general ───────────── */

type Range = "dia" | "semana" | "mes" | "proximos"

function rangeOf(kind: Range, anchor: string): { from: string; to: string; label: string } {
  if (kind === "dia") return { from: anchor, to: anchor, label: formatDay(anchor) }
  if (kind === "semana") {
    const from = addDays(anchor, -((weekdayOf(anchor) + 6) % 7))
    const to = addDays(from, 6)
    return { from, to, label: `Semana del ${formatDay(from).toLowerCase()} al ${formatDay(to).toLowerCase()}` }
  }
  if (kind === "mes") {
    const from = `${anchor.slice(0, 7)}-01`
    const to = addDays(addDays(from, 32).slice(0, 8) + "01", -1)
    const label = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${from}T12:00:00Z`))
    return { from, to, label: label.charAt(0).toUpperCase() + label.slice(1) }
  }
  return { from: anchor, to: addDays(anchor, 90), label: `Próximos 90 días desde el ${formatDay(anchor).toLowerCase()}` }
}

export function AgendaView({ flash, onPatient }: { flash: Flash; onPatient: (id: number) => void }) {
  const [kind, setKind] = useState<Range>("semana")
  const [anchor, setAnchor] = useState(todayAR())
  const [items, setItems] = useState<AgendaItem[] | null>(null)
  const [q, setQ] = useState("")
  const [statusFilter, setStatusFilter] = useState("activos")
  const [pro, setPro] = useState("")
  const r = rangeOf(kind, anchor)

  const load = useCallback(() => {
    api<{ bookings: AgendaItem[] }>(`/api/admin/bookings?desde=${r.from}&hasta=${r.to}`)
      .then((d) => setItems(d.bookings))
      .catch(() => flash("No se pudo cargar la agenda", true))
  }, [r.from, r.to, flash])
  useEffect(load, [load])
  const actions = useAppointmentActions(flash, load)

  const shift = (n: number) => {
    if (kind === "dia") setAnchor(addDays(anchor, n))
    else if (kind === "semana") setAnchor(addDays(anchor, 7 * n))
    else if (kind === "mes") {
      const [y, m] = anchor.split("-").map(Number)
      setAnchor(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10))
    } else setAnchor(addDays(anchor, 90 * n))
  }

  const term = q.trim().toLowerCase()
  const visible = (items ?? []).filter(
    (b) =>
      (statusFilter === "todos" || (statusFilter === "activos" ? b.state !== "cancelled" && b.state !== "expired" : b.state === statusFilter || (statusFilter === "deuda" && b.balance > 0 && b.state !== "cancelled"))) &&
      (!pro || b.professional === pro) &&
      (!term || `${b.name} ${b.phone} ${b.service_name} ${b.zones}`.toLowerCase().includes(term)),
  )
  const byDay = useMemo(() => {
    const m = new Map<string, AgendaItem[]>()
    for (const b of visible) {
      const d = todayAR(new Date(b.starts_at))
      m.set(d, [...(m.get(d) ?? []), b])
    }
    return Array.from(m)
  }, [visible])
  const pros = Array.from(new Set((items ?? []).map((b) => b.professional).filter(Boolean)))
  const totals = visible
    .filter((b) => b.state !== "cancelled" && b.state !== "expired")
    .reduce((a, b) => ({ sold: a.sold + b.final_price, paid: a.paid + b.paid + b.deposit_unrecorded, due: a.due + b.balance }), { sold: 0, paid: 0, due: 0 })
  const isToday = anchor === todayAR()

  return (
    <section className="space-y-5">
      <PageHeader
        title="Agenda"
        description={<span className="hidden sm:inline">Todos los turnos (web, chatbot, administración y fichas de pacientes) en un solo lugar.</span>}
        actions={<button onClick={() => actions.create()} className={btnPrimary}><CalendarPlus /> Nuevo turno</button>}
      />

      <div className="rounded-xl border border-line bg-white shadow-card">
        {/* período */}
        <div className="flex flex-col gap-3 border-b border-line p-3 sm:p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => shift(-1)} className={`${btnIcon} h-9 w-9`} aria-label="Período anterior"><ChevronLeft /></button>
            <button onClick={() => setAnchor(todayAR())} disabled={isToday} className={`${btnSmall} h-9 px-3`}>Hoy</button>
            <button onClick={() => shift(1)} className={`${btnIcon} h-9 w-9`} aria-label="Período siguiente"><ChevronRight /></button>
            <p className="ml-1 min-w-0 text-[0.9375rem] font-semibold text-ink" aria-live="polite">{r.label}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented label="Vista" value={kind} onChange={setKind} options={[["dia", "Día"], ["semana", "Semana"], ["mes", "Mes"], ["proximos", "Próximos"]]} />
            <input type="date" value={anchor} onChange={(e) => e.target.value && setAnchor(e.target.value)} className={`${fieldInline} h-9 w-[9.5rem]`} aria-label="Ir a una fecha" />
          </div>
        </div>
        {/* filtros */}
        <div className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_200px] sm:p-4 lg:grid-cols-[minmax(0,320px)_200px_220px_1fr] lg:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar paciente o tratamiento" aria-label="Buscar en la agenda" className={`${field} h-9 pl-9`} type="search" />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${field} h-9`} aria-label="Filtrar por estado">
            <option value="activos">Turnos activos</option>
            <option value="todos">Todos (incluye cancelados)</option>
            <option value="deuda">Con saldo pendiente</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {pros.length > 0 ? (
            <select value={pro} onChange={(e) => setPro(e.target.value)} className={`${field} h-9`} aria-label="Filtrar por profesional">
              <option value="">Todas las profesionales</option>
              {pros.map((p) => <option key={p}>{p}</option>)}
            </select>
          ) : (
            <span className="hidden lg:block" />
          )}
          <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm sm:col-span-2 lg:col-span-1 lg:justify-end">
            <div className="flex gap-1"><dt className="text-ink-3">Turnos</dt><dd className="font-medium tabular-nums text-ink">{visible.length}</dd></div>
            <div className="flex gap-1"><dt className="text-ink-3">Vendido</dt><dd className="font-medium tabular-nums text-ink">{formatARS(totals.sold)}</dd></div>
            <div className="flex gap-1"><dt className="text-ink-3">Cobrado</dt><dd className="font-medium tabular-nums text-ink">{formatARS(totals.paid)}</dd></div>
            <div className="flex gap-1"><dt className="text-ink-3">Por cobrar</dt><dd className="font-semibold tabular-nums text-primary">{formatARS(totals.due)}</dd></div>
          </dl>
        </div>
      </div>

      {items === null ? (
        <Loading rows={4} />
      ) : byDay.length === 0 ? (
        <Card>
          <Empty
            icon={<CalendarPlus />}
            title={term || statusFilter !== "activos" || pro ? "Ningún turno coincide con los filtros" : "No hay turnos en este período"}
            text={term || statusFilter !== "activos" || pro ? "Probá con otra búsqueda o limpiá los filtros." : "Podés agendar uno o moverte a otro período."}
            action={
              term || statusFilter !== "activos" || pro ? (
                <button onClick={() => (setQ(""), setStatusFilter("activos"), setPro(""))} className={btnGhost}>Limpiar filtros</button>
              ) : (
                <button onClick={() => actions.create()} className={btnGhost}>Agendar un turno</button>
              )
            }
          />
        </Card>
      ) : (
        byDay.map(([d, list]) => (
          <section key={d} aria-label={formatDay(d)} className="rounded-xl border border-line bg-white shadow-card">
            <h2 className="flex items-baseline gap-2 border-b border-line px-4 py-3 sm:px-5">
              <span className={`text-[0.9375rem] font-semibold ${d === todayAR() ? "text-primary" : "text-ink"}`}>{d === todayAR() ? `Hoy · ${formatDay(d)}` : formatDay(d)}</span>
              <span className="text-sm text-ink-3">{list.length} {list.length === 1 ? "turno" : "turnos"}</span>
            </h2>
            <ul className="divide-y divide-line px-4 sm:px-5">
              {list.map((b) => <AppointmentRow key={b.id} b={b} onEdit={actions.edit} onPay={actions.pay} onStatus={actions.changeStatus} onPatient={onPatient} onQuick={actions.quick} />)}
            </ul>
          </section>
        ))
      )}
      {actions.dialogs}
    </section>
  )
}

/* ───────────── Inicio ───────────── */

type Dashboard = {
  today: AgendaItem[]
  upcomingCount: number
  collectedMonth: number
  collectedToday: number
  withoutDeposit: AgendaItem[]
  toReview: AgendaItem[]
  pendingBalance: number
}

export function DashboardView({ flash, onPatient, go }: { flash: Flash; onPatient: (id: number) => void; go: (tab: string) => void }) {
  const [d, setD] = useState<Dashboard | null>(null)
  const load = useCallback(() => {
    api<Dashboard>("/api/admin/dashboard").then(setD).catch(() => flash("No se pudo cargar el resumen", true))
  }, [flash])
  useEffect(load, [load])
  const actions = useAppointmentActions(flash, load)
  const alerts = useAdminAlerts(flash)
  const pending = (d?.toReview.length ?? 0) + (d?.withoutDeposit.length ?? 0)

  return (
    <section className="space-y-5">
      <PageHeader
        title="Inicio"
        description={formatDay(todayAR())}
        actions={
          <>
            <button onClick={() => go("pacientes")} className={btnGhost}><Search /> Buscar paciente</button>
            <button onClick={() => actions.create()} className={btnPrimary}><CalendarPlus /> Nuevo turno</button>
            <ActionMenu
              label="Accesos rápidos"
              items={[
                { label: "Registrar un pago (Caja)", icon: <Wallet />, onSelect: () => go("caja") },
                { label: "Abrir o editar una jornada", icon: <CalendarPlus />, onSelect: () => go("agenda") },
                { label: "Crear una promoción", icon: <Plus />, onSelect: () => go("promos") },
                { label: "Ver conversaciones", icon: <MessageCircle />, onSelect: () => go("conversaciones") },
              ]}
            />
          </>
        }
      />

      {!d ? (
        <Loading rows={3} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-6 xl:grid-cols-5 [&>*]:sm:col-span-2 [&>*]:xl:col-span-1">
            <Stat label="Turnos de hoy" value={d.today.length} />
            <Stat label="Próximos turnos" value={d.upcomingCount} />
            <div className="col-span-2 sm:!col-span-2 xl:!col-span-1"><Stat label="Cobrado hoy" value={formatARS(d.collectedToday)} /></div>
            <div className="sm:!col-span-3 xl:!col-span-1"><Stat label="Cobrado este mes" value={formatARS(d.collectedMonth)} /></div>
            <div className="sm:!col-span-3 xl:!col-span-1"><Stat label="Por cobrar" value={formatARS(d.pendingBalance)} hint="De los turnos próximos" tone="primary" /></div>
          </div>

          <Card
            title="Turnos de hoy"
            padded={false}
            actions={<button onClick={() => go("turnos")} className={btnSmall}>Ver agenda completa</button>}
          >
            {d.today.length === 0 ? (
              <Empty icon={<CalendarPlus />} title="No hay turnos hoy" text="Los turnos de hoy aparecen acá, con su seña y saldo." action={<button onClick={() => actions.create()} className={btnGhost}>Agendar un turno</button>} />
            ) : (
              <ul className="divide-y divide-line px-4 sm:px-5">
                {d.today.map((b) => <AppointmentRow key={b.id} b={b} onEdit={actions.edit} onPay={actions.pay} onStatus={actions.changeStatus} onPatient={onPatient} onQuick={actions.quick} />)}
              </ul>
            )}
          </Card>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
            <Card title="Para atender" description={pending || alerts ? undefined : "Todo al día."}>
              {d.toReview.length + d.withoutDeposit.length === 0 && !alerts ? (
                <Loading rows={2} />
              ) : (
                <ul className="-my-2.5 divide-y divide-line">
                  {d.toReview.map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{b.name}</p>
                        <p className="text-xs text-ink-2">{STATUS[b.state].label} · {shortDateTime(b.starts_at)}</p>
                      </div>
                      <button onClick={() => go("transferencias")} className={btnSmall}>Revisar</button>
                    </li>
                  ))}
                  {d.withoutDeposit.slice(0, 8).map((b) => (
                    <li key={b.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{b.name}</p>
                        <p className="text-xs text-ink-2">Seña de {formatARS(b.deposit_unrecorded)} sin registrar el medio · {shortDateTime(b.starts_at)}</p>
                      </div>
                      <button onClick={() => actions.pay(b)} className={btnSmall}>Registrar</button>
                    </li>
                  ))}
                  {alerts && <AlertItems d={alerts} onPatient={onPatient} go={go} />}
                </ul>
              )}
            </Card>
            <PeriodPanel flash={flash} />
          </div>
        </>
      )}
      {actions.dialogs}
    </section>
  )
}

/* ───────────── Pacientes ───────────── */

const PATIENT_STATUSES = ["Nueva", "Activa", "Pausada", "Inactiva", "Finalizó", "Dejó", "Archivada"]
const PATIENT_TONE: Record<string, Tone> = { Nueva: "accent", Activa: "success", Pausada: "warning", Finalizó: "info" }
type SortKey = "nombre" | "resta" | "proximo" | "sesiones"

export function PatientsView({ flash, openId, onOpened }: { flash: Flash; openId: number | null; onOpened: () => void }) {
  const [patients, setPatients] = useState<PatientSummary[] | null>(null)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("")
  const [sort, setSort] = useState<SortKey>("nombre")
  const [open, setOpen] = useState<number | "new" | null>(null)

  const load = useCallback(() => {
    api<{ patients: PatientSummary[] }>("/api/admin/patients").then((d) => setPatients(d.patients)).catch(() => flash("No se pudieron cargar los pacientes", true))
  }, [flash])
  useEffect(load, [load])
  useEffect(() => {
    if (openId) {
      setOpen(openId)
      onOpened()
    }
  }, [openId, onOpened])

  const q = query.trim().toLowerCase()
  const visible = useMemo(() => {
    const list = (patients ?? []).filter((p) => (!status || p.status === status || (status === "deuda" && p.balance > 0)) && (!q || `${p.name} ${p.phone} ${p.treatments} ${p.email}`.toLowerCase().includes(q)))
    const by: Record<SortKey, (a: PatientSummary, b: PatientSummary) => number> = {
      nombre: (a, b) => a.name.localeCompare(b.name, "es"),
      resta: (a, b) => b.balance - a.balance,
      sesiones: (a, b) => b.sessions_done - a.sessions_done,
      proximo: (a, b) => (a.next_appointment ?? "9").localeCompare(b.next_appointment ?? "9"),
    }
    return [...list].sort(by[sort])
  }, [patients, status, q, sort])
  const totals = visible.reduce((a, p) => ({ balance: a.balance + p.balance, sessions: a.sessions + p.sessions_done }), { balance: 0, sessions: 0 })
  const paidOf = (p: PatientSummary) => p.paid + (p.deposits_unrecorded ?? 0)
  const filtered = !!q || !!status

  return (
    <section className="space-y-5">
      <PageHeader
        title="Pacientes"
        description={patients ? `${visible.length} ${visible.length === 1 ? "paciente" : "pacientes"} · ${totals.sessions} sesiones realizadas · ${formatARS(totals.balance)} por cobrar` : undefined}
        actions={<button onClick={() => setOpen("new")} className={btnPrimary}><UserPlus /> Nuevo paciente</button>}
      />

      <div className="rounded-xl border border-line bg-white shadow-card">
        <div className="grid gap-2 border-b border-line p-3 sm:grid-cols-[minmax(0,1fr)_200px_200px] sm:p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, teléfono, email o zona" aria-label="Buscar paciente" className={`${field} h-9 pl-9`} />
          </div>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${field} h-9`} aria-label="Filtrar por estado">
            <option value="">Todos los estados</option>
            <option value="deuda">Con saldo pendiente</option>
            {PATIENT_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className={`${field} h-9`} aria-label="Ordenar">
            <option value="nombre">Ordenar por nombre</option>
            <option value="resta">Mayor saldo pendiente</option>
            <option value="proximo">Próximo turno</option>
            <option value="sesiones">Más sesiones</option>
          </select>
        </div>

        {patients === null ? (
          <div className="p-4"><Loading rows={5} /></div>
        ) : visible.length === 0 ? (
          <Empty
            icon={<Users />}
            title={filtered ? "No hay pacientes que coincidan" : "Todavía no hay pacientes"}
            text={filtered ? "Probá con otra búsqueda o cambiá el filtro." : "Se crean solos al reservar por la web o el chat, o podés cargarlos acá."}
            action={filtered ? <button onClick={() => (setQuery(""), setStatus(""))} className={btnGhost}>Limpiar filtros</button> : <button onClick={() => setOpen("new")} className={btnGhost}>Cargar paciente</button>}
          />
        ) : (
          <>
            {/* escritorio y tablet: tabla */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className={tableHead}>
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">Paciente</th>
                    <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">Tratamiento</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">Sesiones</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">Pagado</th>
                    <th scope="col" className="px-3 py-2.5 text-right font-medium">Resta</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Próximo turno</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {visible.map((p) => (
                    <tr key={p.id} onClick={() => setOpen(p.id)} className="cursor-pointer transition-colors duration-100 hover:bg-surface/70">
                      <td className="px-4 py-3">
                        <button onClick={(e) => (e.stopPropagation(), setOpen(p.id))} className="rounded text-left font-medium text-ink hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45">
                          {p.name}
                        </button>
                        <p className="text-xs tabular-nums text-ink-3">{p.phone || "Sin teléfono"}</p>
                      </td>
                      <td className="hidden max-w-[260px] truncate px-3 py-3 text-ink-2 lg:table-cell" title={p.treatments}>{p.treatments || <span className="text-ink-3">—</span>}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-ink">{p.sessions_done}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-ink-2">{paidOf(p) > 0 ? formatARS(paidOf(p)) : <span className="text-ink-3">—</span>}</td>
                      <td className={`px-3 py-3 text-right tabular-nums ${p.balance > 0 ? "font-semibold text-primary" : "text-ink-3"}`}>{p.balance > 0 ? formatARS(p.balance) : "—"}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-ink-2">{p.next_appointment ? shortDateTime(p.next_appointment) : <span className="text-ink-3">Sin turno</span>}</td>
                      <td className="px-4 py-3"><Badge tone={PATIENT_TONE[p.status] ?? "neutral"}>{p.status}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* celular: tarjetas */}
            <ul className="divide-y divide-line md:hidden">
              {visible.map((p) => (
                <li key={p.id}>
                  <button onClick={() => setOpen(p.id)} className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left hover:bg-surface/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/45">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{p.name}</p>
                      <p className="text-xs text-ink-3">{p.phone || "Sin teléfono"} · {p.sessions_done} sesiones</p>
                      <p className="mt-0.5 text-xs text-ink-2">{p.next_appointment ? `Próximo: ${shortDateTime(p.next_appointment)}` : "Sin próximo turno"}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <Badge tone={PATIENT_TONE[p.status] ?? "neutral"}>{p.status}</Badge>
                      {p.balance > 0 && <p className="mt-1 text-sm font-semibold tabular-nums text-primary">Resta {formatARS(p.balance)}</p>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {open !== null && (
        <PatientDrawer
          id={open === "new" ? null : open}
          flash={flash}
          onClose={() => {
            setOpen(null)
            load()
          }}
          onCreated={(id) => {
            setOpen(id)
            load()
          }}
        />
      )}
    </section>
  )
}

type Treatment = { category: string; status: string; notes: string; sessions_done: number; first_session: string | null; last_session: string | null; next_session: string | null; zones: string; professionals: string }
type Profile = { patient: PatientSummary; bookings: AgendaItem[]; payments: Payment[]; treatments: Treatment[] }

function PatientDrawer({ id, flash, onClose, onCreated }: { id: number | null; flash: Flash; onClose: () => void; onCreated: (id: number) => void }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [form, setForm] = useState({ name: "", phone: "", email: "", gender: "", treatments: "", status: "Nueva", source: "", birth_date: "", notes: "", marketing_consent: false })
  const [tab, setTab] = useState<"sesiones" | "pagos" | "datos">(id ? "sesiones" : "datos")

  const load = useCallback(() => {
    if (!id) return
    api<Profile>(`/api/admin/patients?id=${id}`)
      .then((d) => {
        setProfile(d)
        const p = d.patient
        setForm({ name: p.name, phone: p.phone, email: p.email, gender: p.gender, treatments: p.treatments, status: p.status, source: p.source, birth_date: p.birth_date ?? "", notes: p.notes, marketing_consent: p.marketing_consent })
      })
      .catch(() => flash("No se pudo cargar el paciente", true))
  }, [id, flash])
  useEffect(load, [load])
  const actions = useAppointmentActions(flash, load)
  const set = (p: Partial<typeof form>) => setForm((v) => ({ ...v, ...p }))

  const save = async () => {
    try {
      if (id) {
        await api("/api/admin/patients", { method: "PUT", body: JSON.stringify({ id, ...form, birth_date: form.birth_date || null }) })
        flash("Datos guardados")
        load()
      } else {
        const r = await api<{ id: number }>("/api/admin/patients", { method: "POST", body: JSON.stringify({ ...form, birth_date: form.birth_date || null }) })
        flash("Paciente creado")
        onCreated(r.id)
      }
    } catch (e) {
      if (e instanceof ApiError && e.message === "telefono_existente") {
        flash(`Ese teléfono ya es de ${e.data.name as string}: abrimos su ficha`, true)
        onCreated(e.data.id as number)
      } else flash("Revisá los datos (el nombre es obligatorio)", true)
    }
  }

  const removePayment = async (p: Payment) => {
    if (!confirm(`¿Anular el pago de ${formatARS(p.amount)} del ${shortDate(p.paid_at)}? Queda registrado en la auditoría.`)) return
    await api(`/api/admin/payments?id=${p.id}`, { method: "DELETE" }).catch(() => flash("No se pudo anular", true))
    load()
  }

  const remove = async () => {
    if (!id || !confirm(`¿Eliminar a ${form.name}?`)) return
    try {
      await api(`/api/admin/patients?id=${id}`, { method: "DELETE" })
      flash("Paciente eliminado")
      onClose()
    } catch (e) {
      flash(e instanceof ApiError && e.message === "tiene_historial" ? "Tiene turnos o pagos: en lugar de borrarlo, pasalo a «Archivada»" : "No se pudo eliminar", true)
    }
  }

  const p = profile?.patient
  const upcoming = (profile?.bookings ?? []).filter((b) => new Date(b.starts_at) > new Date() && b.state !== "cancelled" && b.state !== "expired").reverse()
  const past = (profile?.bookings ?? []).filter((b) => !upcoming.includes(b))
  const sessionNumber = useMemo(() => {
    const done = (profile?.bookings ?? []).filter((b) => b.state === "done").slice().reverse()
    return new Map(done.map((b, i) => [b.id, (p?.legacy_sessions ?? 0) + i + 1]))
  }, [profile, p?.legacy_sessions])

  return (
    <Drawer title={id ? form.name || "Paciente" : "Nuevo paciente"} subtitle={profile?.patient.phone || undefined} onClose={onClose} wide>
      {p && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              ["Sesiones realizadas", String(p.sessions_done)],
              ["Próximo turno", p.next_appointment ? shortDateTime(p.next_appointment) : "Sin turno"],
              ["Facturado", formatARS(p.billed)],
              ["Pagado", formatARS(p.paid)],
              ["Resta abonar", formatARS(p.balance)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-line bg-surface p-3">
                <p className="text-[11px] text-ink-3">{k}</p>
                <p className={`mt-0.5 font-medium ${k === "Resta abonar" && p.balance > 0 ? "text-primary" : "text-ink"}`}>{v}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={() => actions.create({ id: p.id, name: p.name })} className={btnPrimary}><CalendarPlus className="h-4 w-4" /> Agregar sesión</button>
            <button onClick={() => actions.payPatient({ id: p.id, name: p.name })} className={btnGhost}><Wallet className="h-4 w-4" /> Pago a cuenta</button>
            {p.phone && <a href={`https://wa.me/${p.phone.replace(/\D/g, "").replace(/^(?!54)/, "549")}`} target="_blank" rel="noreferrer" className={btnGhost}>WhatsApp</a>}
          </div>
          {!p.next_appointment && p.sessions_done > 0 && ["Activa", "Nueva"].includes(p.status) && (
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Tiene sesiones realizadas y no tiene fecha para continuar.</p>
          )}
          {(p.legacy_sessions > 0 || p.legacy_balance > 0) && (
            <p className="mt-3 text-xs text-ink-3">
              Incluye datos cargados antes del sistema integrado: {p.legacy_sessions} sesiones y {formatARS(p.legacy_balance)} de saldo previo.
            </p>
          )}
        </>
      )}

      {id && (
        <div className="mt-5 flex gap-1 border-b border-border">
          {(["sesiones", "pagos", "datos"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`border-b-2 px-3 py-2 text-sm ${tab === t ? "border-primary font-medium text-primary" : "border-transparent text-ink-3"}`}>
              {{ sesiones: "Sesiones y turnos", pagos: "Pagos", datos: "Datos personales" }[t]}
            </button>
          ))}
        </div>
      )}

      {tab === "sesiones" && profile && (
        <div className="mt-3 space-y-4">
          {profile.treatments.length > 0 && (
            <div>
              <p className="text-sm font-medium text-ink">Tratamientos</p>
              <div className="mt-1 grid gap-2 sm:grid-cols-2">
                {profile.treatments.map((t) => (
                  <div key={t.category} className="rounded-xl border border-line p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium text-ink">{t.category}</p>
                      <select
                        value={t.status}
                        onChange={(e) => api("/api/admin/patients", { method: "PUT", body: JSON.stringify({ id, treatment: { category: t.category, status: e.target.value, notes: t.notes } }) }).then(load).catch(() => flash("No se pudo actualizar", true))}
                        className="h-8 rounded-md border border-line bg-white px-2 text-xs"
                        aria-label="Estado del tratamiento"
                      >
                        {["Activo", "Pausado", "Finalizado", "Abandonado"].map((x) => <option key={x}>{x}</option>)}
                      </select>
                    </div>
                    <p className="mt-1 text-ink-2">{t.sessions_done} sesiones · primera {shortDate(t.first_session)} · última {shortDate(t.last_session)}</p>
                    <p className="text-ink-2">Próxima: {t.next_session ? shortDateTime(t.next_session) : "sin fecha"}</p>
                    {t.zones && <p className="text-xs text-ink-3">Zonas: {t.zones}</p>}
                    {t.professionals && <p className="text-xs text-ink-3">Profesionales: {t.professionals}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
          {upcoming.length > 0 && (
            <div>
              <p className="text-sm font-medium text-ink">Próximos</p>
              <ul className="divide-y divide-border">
                {upcoming.map((b) => <AppointmentRow key={b.id} b={b} compact onEdit={actions.edit} onPay={actions.pay} onStatus={actions.changeStatus} onQuick={actions.quick} />)}
              </ul>
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-ink">Historial</p>
            {past.length === 0 ? (
              <p className="mt-1 text-sm text-ink-3">Todavía no hay sesiones registradas.</p>
            ) : (
              <ul className="divide-y divide-border">
                {past.map((b) => (
                  <Fragment key={b.id}>
                    {sessionNumber.has(b.id) && <li className="pt-2 text-xs font-medium text-primary">Sesión n.º {sessionNumber.get(b.id)}</li>}
                    <AppointmentRow b={b} compact onEdit={actions.edit} onPay={actions.pay} onStatus={actions.changeStatus} onQuick={actions.quick} />
                  </Fragment>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "pagos" && profile && (
        <div className="mt-3">
          {profile.payments.length === 0 ? (
            <p className="mt-1 text-sm text-ink-2">No hay pagos registrados.</p>
          ) : (
            <ul className="divide-y divide-border">
              {profile.payments.map((x) => (
                <li key={x.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <p className="w-24 shrink-0 text-ink-3">{shortDate(x.paid_at)}</p>
                  <div className="min-w-0 flex-1">
                    <p className="text-ink">{x.concept} · {x.method}{x.service_name ? ` · ${x.service_name}` : ""}</p>
                    <p className="text-xs text-ink-3">Registró: {x.created_by}{x.notes ? ` · ${x.notes}` : ""}</p>
                  </div>
                  <p className="font-medium text-ink">{formatARS(x.amount)}</p>
                  {x.origin === "manual" && (
                    <button
                      onClick={async () => {
                        const v = prompt(`Importe correcto para el pago del ${shortDate(x.paid_at)}:`, String(x.amount))
                        if (!v || Number(v) === x.amount) return
                        await api("/api/admin/payments", { method: "PUT", body: JSON.stringify({ id: x.id, amount: Number(v) }) }).then(() => flash("Pago corregido")).catch(() => flash("Importe inválido", true))
                        load()
                      }}
                      className={btnSmall}
                    >
                      Corregir
                    </button>
                  )}
                  {x.origin === "manual" && <button onClick={() => removePayment(x)} className={`${btnIcon} h-8 w-8 text-red-700`} aria-label="Anular pago"><Trash2 className="h-3.5 w-3.5" /></button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "datos" && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <label className={`${lbl} col-span-2`}>Nombre y apellido<input value={form.name} onChange={(e) => set({ name: e.target.value })} className={`${field} mt-1`} /></label>
            <label className={lbl}>WhatsApp<input value={form.phone} onChange={(e) => set({ phone: e.target.value })} className={`${field} mt-1`} /></label>
            <label className={lbl}>Email<input type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} className={`${field} mt-1`} /></label>
            <label className={lbl}>Fecha de nacimiento<input type="date" value={form.birth_date} onChange={(e) => set({ birth_date: e.target.value })} className={`${field} mt-1`} /></label>
            <label className={lbl}>Género<select value={form.gender} onChange={(e) => set({ gender: e.target.value })} className={`${field} mt-1`}>{["", "Mujer", "Hombre", "Otro"].map((g) => <option key={g} value={g}>{g || "—"}</option>)}</select></label>
            <label className={lbl}>Cómo llegó a Eterna<input list="sources" value={form.source} onChange={(e) => set({ source: e.target.value })} className={`${field} mt-1`} /></label>
            <datalist id="sources">{["Instagram", "Recomendación", "Instituto Ghisoni", "Chat", "Web", "Google", "Otro"].map((s) => <option key={s} value={s} />)}</datalist>
            <label className={lbl}>Estado<select value={form.status} onChange={(e) => set({ status: e.target.value })} className={`${field} mt-1`}>{PATIENT_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></label>
            <label className={`${lbl} col-span-2`}>Tratamientos / zonas habituales<input value={form.treatments} onChange={(e) => set({ treatments: e.target.value })} className={`${field} mt-1`} /></label>
            <label className={`${lbl} col-span-2`}>Observaciones administrativas<textarea rows={4} value={form.notes} onChange={(e) => set({ notes: e.target.value })} className={`${field} mt-1 h-auto py-2`} /></label>
            <label className="col-span-2 flex items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" checked={form.marketing_consent} onChange={(e) => set({ marketing_consent: e.target.checked })} className="accent-[#882626]" /> Acepta recibir comunicaciones comerciales (promociones, novedades)
            </label>
          </div>
          <p className="text-xs text-ink-3">Las sesiones, los pagos, el saldo y el próximo turno se calculan solos a partir de la agenda y los pagos registrados.</p>
          <div className="flex gap-2">
            <button onClick={save} className={btnPrimary}><Save className="h-4 w-4" /> {id ? "Guardar" : "Crear paciente"}</button>
            {id && <button onClick={remove} className={`${btnIcon} ml-auto text-red-700`} aria-label="Eliminar paciente"><Trash2 className="h-4 w-4" /></button>}
          </div>
        </div>
      )}
      {actions.dialogs}
    </Drawer>
  )
}

/* ───────────── Caja ───────────── */

export function CashView({ flash }: { flash: Flash }) {
  const [from, setFrom] = useState(`${todayAR().slice(0, 7)}-01`)
  const [to, setTo] = useState(todayAR())
  const [payments, setPayments] = useState<Payment[] | null>(null)
  const [bookings, setBookings] = useState<AgendaItem[] | null>(null)

  const load = useCallback(() => {
    Promise.all([
      api<{ payments: Payment[] }>(`/api/admin/payments?desde=${from}&hasta=${to}`),
      api<{ bookings: AgendaItem[] }>(`/api/admin/bookings?desde=${from}&hasta=${to}`),
    ])
      .then(([p, b]) => {
        setPayments(p.payments)
        setBookings(b.bookings)
      })
      .catch(() => flash("No se pudo cargar la caja", true))
  }, [from, to, flash])
  useEffect(load, [load])

  const firm = (bookings ?? []).filter((b) => !["cancelled", "expired", "no_show", "pending_payment"].includes(b.state))
  const sold = firm.reduce((n, b) => n + b.final_price, 0)
  const collected = (payments ?? []).reduce((n, p) => n + p.amount, 0)
  const due = firm.reduce((n, b) => n + b.balance, 0)
  const byMethod = Object.entries((payments ?? []).reduce<Record<string, number>>((m, p) => ({ ...m, [p.method]: (m[p.method] ?? 0) + p.amount }), {})).sort((a, b) => b[1] - a[1])
  const preset = (k: "mes" | "anterior" | "hoy") => {
    const t = todayAR()
    if (k === "hoy") return (setFrom(t), setTo(t))
    if (k === "mes") return (setFrom(`${t.slice(0, 7)}-01`), setTo(t))
    const lastPrev = addDays(`${t.slice(0, 7)}-01`, -1)
    setFrom(`${lastPrev.slice(0, 7)}-01`)
    setTo(lastPrev)
  }

  return (
    <section className="space-y-5">
      <PageHeader
        title="Caja"
        description="Lo vendido (turnos del período), lo efectivamente cobrado y lo que falta cobrar, por separado."
        actions={<a href={`/api/admin/payments?desde=${from}&hasta=${to}&formato=csv`} className={btnGhost}><Download /> Exportar CSV</a>}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => preset("hoy")} className={btnSmall}>Hoy</button>
        <button onClick={() => preset("mes")} className={btnSmall}>Este mes</button>
        <button onClick={() => preset("anterior")} className={btnSmall}>Mes anterior</button>
        <div className="flex items-center gap-2">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${fieldInline} h-9 w-[9.5rem]`} aria-label="Desde" />
          <span className="text-sm text-ink-3">a</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${fieldInline} h-9 w-[9.5rem]`} aria-label="Hasta" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Vendido" value={formatARS(sold)} hint="Turnos firmes del período" />
        <Stat label="Cobrado" value={formatARS(collected)} hint="Pagos registrados en el período" />
        <Stat label="Por cobrar" value={formatARS(due)} hint="Saldo de esos turnos" tone="primary" />
      </div>
      {byMethod.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm" aria-label="Cobrado por medio de pago">
          <span className="text-ink-3">Por medio:</span>
          {byMethod.map(([m, v]) => (
            <span key={m} className="rounded-full border border-line bg-white px-2.5 py-1 text-ink-2">{m} <strong className="font-semibold tabular-nums text-ink">{formatARS(v)}</strong></span>
          ))}
        </div>
      )}
      <Card title="Movimientos" padded={false}>
        {payments === null ? (
          <div className="p-4"><Loading /></div>
        ) : payments.length === 0 ? (
          <Empty icon={<Wallet />} title="No hay pagos en este período" text="Los pagos se registran desde cada turno (Registrar pago) o desde la ficha del paciente." />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className={tableHead}>
                  <tr>
                    <th scope="col" className="px-4 py-2.5 font-medium">Fecha</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Paciente</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Turno</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Concepto</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Medio</th>
                    <th scope="col" className="px-4 py-2.5 text-right font-medium">Importe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {payments.map((p) => (
                    <tr key={p.id} className="hover:bg-surface/50">
                      <td className="whitespace-nowrap px-4 py-3 text-ink-2">{shortDateTime(p.paid_at)}</td>
                      <td className="px-3 py-3 font-medium text-ink">{p.patient_name ?? "—"}</td>
                      <td className="px-3 py-3 text-ink-2">{p.service_name ? `${p.service_name} · ${shortDate(p.starts_at ?? null)}` : "A cuenta"}</td>
                      <td className="px-3 py-3 text-ink-2">{p.concept}</td>
                      <td className="px-3 py-3 text-ink-2">{p.method}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums text-ink">{formatARS(p.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-line md:hidden">
              {payments.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-ink">{p.patient_name ?? "—"}</p>
                    <p className="text-xs text-ink-2">{p.concept} · {p.method}</p>
                    <p className="text-xs text-ink-3">{shortDateTime(p.paid_at)}{p.service_name ? ` · ${p.service_name}` : ""}</p>
                  </div>
                  <p className="shrink-0 font-semibold tabular-nums text-ink">{formatARS(p.amount)}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </section>
  )
}
