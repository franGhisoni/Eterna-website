"use client"

import { Fragment, useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, CalendarPlus, ChevronLeft, ChevronRight, Download, History, Plus, Save, Search, Trash2, UserPlus, Wallet, X } from "lucide-react"
import { addDays, formatARS, formatDay, todayAR, weekdayOf } from "@/lib/time"
import { api, ApiError, btnGhost, btnIcon, btnPrimary, btnSmall, chip, field, fieldInline, fromLocalInput, hhmm, lbl, panel, shortDate, shortDateTime, toLocalInput, type Flash } from "./ui"

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
  legacy_sessions: number
  legacy_balance: number
  sessions_done: number
  upcoming: number
  next_appointment: string | null
  last_session: string | null
  billed: number
  paid: number
  balance: number
}

type Payment = { id: number; booking_id: string | null; patient_id: number | null; amount: number; method: string; concept: string; origin: string; notes: string; paid_at: string; created_by: string; patient_name?: string | null; service_name?: string | null; starts_at?: string | null }

/* ───────────── Etiquetas ───────────── */

export const STATUS: Record<string, { label: string; cls: string }> = {
  reserved: { label: "Reservado", cls: "bg-violet-50 text-violet-700 border-violet-200" },
  pending_payment: { label: "Pendiente de seña", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  pending_review: { label: "Comprobante a revisar", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  confirmed: { label: "Confirmado", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  done: { label: "Realizado", cls: "bg-teal-50 text-teal-700 border-teal-200" },
  no_show: { label: "Ausente", cls: "bg-orange-50 text-orange-700 border-orange-200" },
  cancelled: { label: "Cancelado", cls: "bg-stone-100 text-stone-500 border-stone-200" },
  expired: { label: "Seña vencida", cls: "bg-stone-100 text-stone-500 border-stone-200" },
  conflict: { label: "Pagado · revisar", cls: "bg-red-50 text-red-700 border-red-200" },
}

export const PAY: Record<AgendaItem["pay_status"], { label: string; cls: string }> = {
  sin_cargo: { label: "Sin cargo", cls: "bg-stone-50 text-stone-500 border-stone-200" },
  sin_sena: { label: "Sin pagos", cls: "bg-stone-50 text-stone-600 border-stone-200" },
  sena_pendiente: { label: "Seña pendiente", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  sena_abonada: { label: "Seña abonada", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  pago_parcial: { label: "Pago parcial", cls: "bg-sky-50 text-sky-700 border-sky-200" },
  pagado: { label: "Pagado", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
}

const SOURCE: Record<string, string> = { web: "Web", chat: "Chatbot", admin: "Administrador", paciente: "Ficha del paciente" }
const ACTIVE = ["reserved", "pending_payment", "pending_review", "confirmed", "conflict"]

/* ───────────── Catálogo (servicios, promos, medios de pago) ───────────── */

export function useCatalog(flash: Flash) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  useEffect(() => {
    Promise.all([
      api<{ services: Service[] }>("/api/admin/services"),
      api<{ promos: Promo[] }>("/api/admin/promos"),
      api<{ settings: { payments: { methods: string[]; depositPercent: number }; team: { professionals: string[] } } }>("/api/admin/settings"),
    ])
      .then(([s, p, c]) =>
        setCatalog({ services: s.services, promos: p.promos, methods: c.settings.payments.methods, professionals: c.settings.team.professionals, depositPercent: c.settings.payments.depositPercent }),
      )
      .catch(() => flash("No se pudo cargar el catálogo", true))
  }, [flash])
  return catalog
}

const promoActiveOn = (p: Promo, day: string) => p.active && (!p.starts_on || p.starts_on <= day) && (!p.ends_on || p.ends_on >= day)

/* ───────────── Tarjeta de turno ───────────── */

export function AppointmentRow({ b, onEdit, onPay, onStatus, onPatient, compact }: {
  b: AgendaItem
  onEdit: (b: AgendaItem) => void
  onPay: (b: AgendaItem) => void
  onStatus: (b: AgendaItem, status: string) => void
  onPatient?: (id: number) => void
  compact?: boolean
}) {
  const st = STATUS[b.state] ?? STATUS.confirmed
  const active = ACTIVE.includes(b.state)
  const minutes = Math.round((new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 60_000)
  return (
    <li className="flex flex-col gap-3 py-3.5 lg:flex-row lg:items-start">
      <div className="w-24 shrink-0">
        <p className="font-serif text-lg font-semibold leading-none text-premium">{hhmm(b.starts_at)}</p>
        <p className="mt-1 text-xs text-premium/55">a {hhmm(b.ends_at)} · {minutes} min</p>
        {compact && <p className="mt-1 text-xs text-premium/55">{shortDate(b.starts_at)}</p>}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium text-premium">
          {b.patient_id && onPatient ? (
            <button onClick={() => onPatient(b.patient_id!)} className="hover:text-primary hover:underline">{b.name}</button>
          ) : (
            b.name
          )}
          <span className="font-normal text-premium/60"> · {b.service_name}</span>
        </p>
        {(b.zones || b.professional) && (
          <p className="text-sm text-premium/70">
            {b.zones && <>Zonas: {b.zones}</>}
            {b.zones && b.professional && " · "}
            {b.professional && <>Profesional: {b.professional}</>}
          </p>
        )}
        <p className="text-sm text-premium">
          {b.discount > 0 && <span className="mr-1 text-premium/45 line-through">{formatARS(b.price)}</span>}
          <strong className="font-semibold">{b.final_price > 0 ? formatARS(b.final_price) : "Sin precio"}</strong>
          {b.promo_title && <span className="text-primary"> · {b.promo_title}</span>}
          {b.final_price > 0 && (
            <>
              <span className="text-premium/60"> · Pagado {formatARS(b.paid)}</span>
              <span className={b.balance > 0 ? "font-medium text-primary" : "text-premium/60"}> · Resta {formatARS(b.balance)}</span>
            </>
          )}
          {b.deposit > 0 && <span className="text-premium/50"> · Seña pedida {formatARS(b.deposit)}</span>}
        </p>
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className={`${chip} ${st.cls}`}>{st.label}</span>
          <span className={`${chip} ${PAY[b.pay_status].cls}`}>{PAY[b.pay_status].label}</span>
          {b.rescheduled > 0 && <span className={`${chip} border-violet-200 bg-violet-50 text-violet-700`}>Reprogramado</span>}
          <span className="text-xs text-premium/50">Origen: {SOURCE[b.source] ?? b.source}</span>
          {b.phone && (
            <a className="text-xs text-premium/50 hover:text-primary" href={`https://wa.me/${b.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">· {b.phone}</a>
          )}
        </div>
        {b.notes && <p className="text-xs text-premium/60">Obs.: {b.notes}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap gap-1.5 lg:max-w-[260px] lg:justify-end">
        {b.state !== "cancelled" && b.balance > 0 && <button onClick={() => onPay(b)} className={btnSmall}><Wallet className="h-3.5 w-3.5" /> Registrar pago</button>}
        <button onClick={() => onEdit(b)} className={btnSmall}>Editar / reprogramar</button>
        {b.has_receipt && <a href={`/api/admin/bookings/${b.id}/comprobante`} target="_blank" rel="noreferrer" className={btnSmall}>Comprobante</a>}
        {(b.state === "reserved" || b.state === "pending_review" || b.state === "conflict" || b.state === "expired") && (
          <button onClick={() => onStatus(b, "confirmed")} className={btnSmall}>Confirmar</button>
        )}
        {active && new Date(b.starts_at) <= new Date(Date.now() + 12 * 3600_000) && (
          <>
            <button onClick={() => onStatus(b, "done")} className={btnSmall}>Realizado</button>
            <button onClick={() => onStatus(b, "no_show")} className={btnSmall}>Ausente</button>
          </>
        )}
        {active && b.phone && (
          <a
            className={btnSmall}
            target="_blank"
            rel="noreferrer"
            href={`https://wa.me/${b.phone.replace(/\D/g, "").replace(/^(?!54)/, "549")}?text=${encodeURIComponent(`Hola ${b.name.split(" ")[0]}! Te recordamos tu turno de ${b.service_name} el ${shortDateTime(b.starts_at)} hs en Eterna.${b.balance > 0 && b.paid === 0 && b.deposit > 0 ? " Recordá abonar la seña para confirmarlo." : ""}`)}`}
          >
            Recordatorio
          </a>
        )}
        {b.state !== "cancelled" && b.state !== "expired" && <button onClick={() => onStatus(b, "cancelled")} className={`${btnSmall} text-destructive`}>Cancelar</button>}
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
    dialogs,
  }
}

/* ───────────── Crear / editar turno ───────────── */

function Drawer({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/25" onClick={onClose}>
      <div className={`h-full w-full ${wide ? "max-w-3xl" : "max-w-lg"} overflow-y-auto bg-white p-5 shadow-premium-lg sm:p-6`} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={title}>
        <div className="flex items-center justify-between gap-3">
          <p className="font-serif text-xl font-bold text-premium">{title}</p>
          <button onClick={onClose} className={btnIcon} aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

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
      <div className="flex items-center justify-between rounded-lg border border-premium bg-secondary/40 px-3 py-2">
        <p className="text-sm font-medium text-premium">{value.name}</p>
        <button onClick={() => onChange(null)} className="text-xs text-primary hover:underline">Cambiar</button>
      </div>
    )
  if (creating)
    return (
      <div className="grid grid-cols-2 gap-2 rounded-lg border border-premium p-3">
        <label className={`${lbl} col-span-2`}>Nombre y apellido<input value={draft.name} onChange={(e) => { const d = { ...draft, name: e.target.value }; setDraft(d); onChange(null, d) }} className={`${field} mt-1`} /></label>
        <label className={`${lbl} col-span-2`}>WhatsApp<input value={draft.phone} onChange={(e) => { const d = { ...draft, phone: e.target.value }; setDraft(d); onChange(null, d) }} className={`${field} mt-1`} placeholder="11 2345 6789" /></label>
        <p className="col-span-2 text-xs text-premium/55">Si el teléfono ya existe, el turno se asocia a esa ficha (no se duplica).</p>
        <button onClick={() => { setCreating(false); onChange(null) }} className="col-span-2 text-left text-xs text-primary hover:underline">Buscar un paciente existente</button>
      </div>
    )
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-premium/40" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o teléfono…" className={`${field} pl-9`} autoFocus />
      </div>
      {results.length > 0 && (
        <ul className="max-h-48 divide-y divide-border overflow-y-auto rounded-lg border border-premium">
          {results.map((r) => (
            <li key={r.id}>
              <button onClick={() => onChange({ id: r.id, name: r.name })} className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-secondary/50">
                <span className="text-premium">{r.name}</span>
                <span className="text-premium/50">{r.phone}</span>
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
  const computedFinal = promo?.kind === "percent" ? f.price - Math.round((f.price * promo.percent) / 100) : f.price

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
      } else flash(e instanceof ApiError && e.message === "paciente_invalido" ? "Falta el paciente" : "Revisá los datos del turno", true)
    }
    setBusy(false)
  }

  return (
    <Drawer title={editing ? "Editar turno" : patient ? `Agregar sesión · ${patient.name}` : "Nuevo turno"} onClose={onClose}>
      <div className="mt-5 space-y-4">
        <div>
          <p className={`${lbl} mb-1`}>Paciente</p>
          {editing ? <p className="text-sm font-medium text-premium">{booking!.name}</p> : <PatientPicker value={who} onChange={(p, d) => { setWho(p); setDraft(d) }} />}
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
          {slots && (
            <div className="col-span-2">
              <p className="text-xs text-premium/55">{slots.length ? "Horarios libres de esa jornada:" : "No hay horarios libres cargados ese día (podés agendar igual)."}</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {slots.slice(0, 24).map((s) => (
                  <button key={s} onClick={() => set({ start: `${day}T${hhmm(s)}` })} className={`h-7 rounded-full border px-2.5 text-xs ${f.start.endsWith(hhmm(s)) ? "border-primary bg-primary text-primary-foreground" : "border-premium bg-white text-premium hover:bg-secondary"}`}>
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

        <div className="rounded-xl border border-premium bg-premium-light/60 p-3">
          <p className="text-sm font-medium text-premium">Precio y seña</p>
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
          <p className="mt-2 text-xs text-premium/55">
            El precio queda congelado en este turno: si después cambiás la lista de precios o la promoción, este turno conserva lo acordado.
            {catalog && catalog.depositPercent > 0 && ` Política de seña: ${catalog.depositPercent}%.`}
          </p>
          {editing && <p className="mt-1 text-xs text-premium/55">Pagado hasta ahora: {formatARS(booking!.paid)}. Los pagos se registran con «Registrar pago».</p>}
        </div>

        <label className={`${lbl} block`}>Observaciones<textarea rows={3} value={f.notes} onChange={(e) => set({ notes: e.target.value })} className={`${field} mt-1 h-auto py-2`} /></label>

        <div className="flex gap-2">
          <button onClick={() => save()} disabled={busy} className={btnPrimary}><Save className="h-4 w-4" /> {editing ? "Guardar cambios" : "Crear turno"}</button>
          <button onClick={onClose} className={btnGhost}>Cancelar</button>
        </div>
        {editing && <BookingHistory id={booking!.id} />}
      </div>
    </Drawer>
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
    if (h.kind === "creado") return `Creado desde ${SOURCE[d.origen as string] ?? d.origen}`
    return h.kind
  }
  return (
    <div className="border-t border-border pt-4">
      <p className="flex items-center gap-1.5 text-sm font-medium text-premium"><History className="h-4 w-4" /> Historial del turno</p>
      <ul className="mt-2 space-y-1 text-xs text-premium/70">
        {history.map((h, i) => <li key={i}>{shortDateTime(h.created_at)} · {describe(h)} <span className="text-premium/40">({h.actor})</span></li>)}
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
  const suggested = booking ? (booking.paid === 0 && booking.deposit > 0 && booking.deposit < booking.balance ? booking.deposit : booking.balance) : 0
  const [f, setF] = useState({ amount: suggested || "", method: "", concept: booking && booking.paid === 0 && booking.deposit > 0 ? "Seña" : "Pago parcial", paidAt: toLocalInput(new Date()), notes: "" })
  const [busy, setBusy] = useState(false)
  const set = (p: Partial<typeof f>) => setF((v) => ({ ...v, ...p }))
  const method = f.method || catalog?.methods[0] || ""
  const amount = Number(f.amount)
  const concept = booking && amount >= booking.balance ? (booking.paid === 0 ? "Pago total" : "Saldo") : f.concept

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
    <Drawer title="Registrar pago" onClose={onClose}>
      <div className="mt-5 space-y-4">
        {booking && (
          <div className="rounded-xl border border-premium bg-premium-light/60 p-3 text-sm text-premium">
            <p className="font-medium">{booking.name} · {booking.service_name}</p>
            <p className="text-premium/65">{shortDateTime(booking.starts_at)}</p>
            <p className="mt-1">Precio {formatARS(booking.final_price)} · Pagado {formatARS(booking.paid)} · <strong>Resta {formatARS(booking.balance)}</strong></p>
          </div>
        )}
        {!booking && patient && <p className="text-sm text-premium">Pago a cuenta de <strong>{patient.name}</strong> (sin turno asociado).</p>}
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
        {booking && amount > 0 && <p className="text-sm text-premium/70">Después de este pago resta: <strong className="text-premium">{formatARS(Math.max(0, booking.balance - amount))}</strong>{amount >= booking.balance && " · queda pagado"}</p>}
        <div className="flex gap-2">
          <button onClick={save} disabled={busy || !catalog} className={btnPrimary}><Save className="h-4 w-4" /> Registrar</button>
          <button onClick={onClose} className={btnGhost}>Cancelar</button>
        </div>
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
  return { from: anchor, to: addDays(anchor, 90), label: "Próximos 90 días" }
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
  const totals = visible.filter((b) => b.state !== "cancelled" && b.state !== "expired").reduce((a, b) => ({ sold: a.sold + b.final_price, paid: a.paid + b.paid, due: a.due + b.balance }), { sold: 0, paid: 0, due: 0 })

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-premium">Agenda</h1>
          <p className="text-sm text-premium/60">Todos los turnos (web, chatbot, administración y fichas de pacientes) en un solo lugar.</p>
        </div>
        <button onClick={() => actions.create()} className={btnPrimary}><CalendarPlus className="h-4 w-4" /> Nuevo turno</button>
      </div>

      <div className={`${panel} space-y-3 p-4 sm:p-4`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-premium p-0.5">
            {(["dia", "semana", "mes", "proximos"] as Range[]).map((k) => (
              <button key={k} onClick={() => setKind(k)} className={`h-8 rounded-md px-3 text-xs ${kind === k ? "bg-primary text-primary-foreground" : "text-premium/70 hover:bg-secondary"}`}>
                {{ dia: "Día", semana: "Semana", mes: "Mes", proximos: "Listado" }[k]}
              </button>
            ))}
          </div>
          <button onClick={() => shift(-1)} className={`${btnIcon} h-9 w-9`} aria-label="Anterior"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => setAnchor(todayAR())} className={`${btnSmall} h-9`}>Hoy</button>
          <button onClick={() => shift(1)} className={`${btnIcon} h-9 w-9`} aria-label="Siguiente"><ChevronRight className="h-4 w-4" /></button>
          <input type="date" value={anchor} onChange={(e) => e.target.value && setAnchor(e.target.value)} className={`${fieldInline} h-9 w-40`} aria-label="Ir a fecha" />
          <p className="ml-1 font-medium text-premium">{r.label}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar paciente, tratamiento…" className={`${fieldInline} h-9 w-56`} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={`${fieldInline} h-9`} aria-label="Estado">
            <option value="activos">Activos</option>
            <option value="todos">Todos (incluye cancelados)</option>
            <option value="deuda">Con saldo pendiente</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          {pros.length > 0 && (
            <select value={pro} onChange={(e) => setPro(e.target.value)} className={`${fieldInline} h-9`} aria-label="Profesional">
              <option value="">Todas las profesionales</option>
              {pros.map((p) => <option key={p}>{p}</option>)}
            </select>
          )}
        </div>
        <p className="text-sm text-premium/70">
          {visible.length} turnos · Vendido {formatARS(totals.sold)} · Cobrado {formatARS(totals.paid)} · <span className="font-medium text-primary">Por cobrar {formatARS(totals.due)}</span>
        </p>
      </div>

      {items === null ? (
        <p className="text-sm text-premium/60">Cargando…</p>
      ) : byDay.length === 0 ? (
        <div className={panel}><p className="text-sm text-premium/60">No hay turnos en este período.</p></div>
      ) : (
        byDay.map(([d, list]) => (
          <div key={d} className={panel}>
            <p className="font-medium text-premium">{formatDay(d)} <span className="text-sm font-normal text-premium/50">· {list.length} {list.length === 1 ? "turno" : "turnos"}</span></p>
            <ul className="mt-1 divide-y divide-border">
              {list.map((b) => <AppointmentRow key={b.id} b={b} onEdit={actions.edit} onPay={actions.pay} onStatus={actions.changeStatus} onPatient={onPatient} />)}
            </ul>
          </div>
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
  const tile = (label: string, value: string, hint?: string) => (
    <div className={`${panel} p-4 sm:p-4`}>
      <p className="text-xs text-premium/55">{label}</p>
      <p className="mt-1 font-serif text-2xl font-semibold text-premium">{value}</p>
      {hint && <p className="text-xs text-premium/50">{hint}</p>}
    </div>
  )
  if (!d) return <p className="text-sm text-premium/60">Cargando…</p>
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-premium">Inicio</h1>
          <p className="text-sm text-premium/60">{formatDay(todayAR())}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => actions.create()} className={btnPrimary}><CalendarPlus className="h-4 w-4" /> Nuevo turno</button>
          <button onClick={() => go("pacientes")} className={btnGhost}><UserPlus className="h-4 w-4" /> Pacientes</button>
          <button onClick={() => go("promos")} className={btnGhost}><Plus className="h-4 w-4" /> Promoción</button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {tile("Turnos de hoy", String(d.today.length))}
        {tile("Próximos turnos", String(d.upcomingCount))}
        {tile("Cobrado hoy", formatARS(d.collectedToday))}
        {tile("Cobrado este mes", formatARS(d.collectedMonth))}
        {tile("Por cobrar (turnos próximos)", formatARS(d.pendingBalance))}
      </div>

      {(d.withoutDeposit.length > 0 || d.toReview.length > 0) && (
        <div className={`${panel} border-amber-200`}>
          <p className="flex items-center gap-2 font-medium text-premium"><AlertTriangle className="h-4 w-4 text-amber-600" /> Para atender</p>
          <ul className="mt-2 space-y-1 text-sm text-premium/80">
            {d.toReview.map((b) => <li key={b.id}>· {b.name}: {STATUS[b.state].label.toLowerCase()} ({shortDateTime(b.starts_at)})</li>)}
            {d.withoutDeposit.slice(0, 12).map((b) => (
              <li key={b.id}>
                · {b.name} — turno {shortDateTime(b.starts_at)} sin seña ({formatARS(b.deposit)} pedida){" "}
                <button onClick={() => actions.pay(b)} className="text-primary hover:underline">registrar</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={panel}>
        <p className="font-medium text-premium">Turnos de hoy</p>
        {d.today.length === 0 ? (
          <p className="mt-2 text-sm text-premium/60">No hay turnos hoy.</p>
        ) : (
          <ul className="mt-1 divide-y divide-border">
            {d.today.map((b) => <AppointmentRow key={b.id} b={b} onEdit={actions.edit} onPay={actions.pay} onStatus={actions.changeStatus} onPatient={onPatient} />)}
          </ul>
        )}
      </div>
      {actions.dialogs}
    </section>
  )
}

/* ───────────── Pacientes ───────────── */

const PATIENT_STATUSES = ["Nueva", "Activa", "Pausada", "Inactiva", "Finalizó", "Dejó", "Archivada"]
const PATIENT_CLS: Record<string, string> = {
  Nueva: "bg-violet-50 text-violet-700 border-violet-200",
  Activa: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Pausada: "bg-amber-50 text-amber-700 border-amber-200",
  Finalizó: "bg-sky-50 text-sky-700 border-sky-200",
}

export function PatientsView({ flash, openId, onOpened }: { flash: Flash; openId: number | null; onOpened: () => void }) {
  const [patients, setPatients] = useState<PatientSummary[] | null>(null)
  const [query, setQuery] = useState("")
  const [status, setStatus] = useState("")
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
  const visible = (patients ?? []).filter((p) => (!status || p.status === status || (status === "deuda" && p.balance > 0)) && (!q || `${p.name} ${p.phone} ${p.treatments} ${p.email}`.toLowerCase().includes(q)))
  const totals = visible.reduce((a, p) => ({ balance: a.balance + p.balance, sessions: a.sessions + p.sessions_done }), { balance: 0, sessions: 0 })

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-premium">Pacientes</h1>
          <p className="text-sm text-premium/60">{visible.length} pacientes · {totals.sessions} sesiones realizadas · {formatARS(totals.balance)} por cobrar</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar nombre, teléfono, zona…" className={`${fieldInline} w-56`} aria-label="Buscar paciente" />
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${fieldInline} w-40`} aria-label="Estado">
            <option value="">Todos</option>
            <option value="deuda">Con saldo pendiente</option>
            {PATIENT_STATUSES.map((s) => <option key={s}>{s}</option>)}
          </select>
          <button onClick={() => setOpen("new")} className={btnPrimary}><Plus className="h-4 w-4" /> Nuevo</button>
        </div>
      </div>
      <div className={`${panel} overflow-x-auto p-0 sm:p-0`}>
        {patients === null ? (
          <p className="p-5 text-sm text-premium/60">Cargando…</p>
        ) : (
          <table className="w-full min-w-[820px] text-sm">
            <thead className="border-b border-premium text-left text-xs text-premium/55">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-3 py-3 font-medium">Tratamiento</th>
                <th className="px-3 py-3 text-right font-medium">Sesiones</th>
                <th className="px-3 py-3 text-right font-medium">Pagado</th>
                <th className="px-3 py-3 text-right font-medium">Resta</th>
                <th className="px-3 py-3 font-medium">Próximo turno</th>
                <th className="px-3 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visible.map((p) => (
                <tr key={p.id} onClick={() => setOpen(p.id)} className="cursor-pointer transition-premium hover:bg-secondary/40">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-premium">{p.name}</p>
                    <p className="text-xs text-premium/50">{p.phone || "sin teléfono"}</p>
                  </td>
                  <td className="max-w-[240px] px-3 py-2.5 text-premium/75">{p.treatments || "—"}</td>
                  <td className="px-3 py-2.5 text-right text-premium">{p.sessions_done}</td>
                  <td className="px-3 py-2.5 text-right text-premium/75">{p.paid > 0 ? formatARS(p.paid) : "—"}</td>
                  <td className={`px-3 py-2.5 text-right ${p.balance > 0 ? "font-medium text-primary" : "text-premium/50"}`}>{p.balance > 0 ? formatARS(p.balance) : "—"}</td>
                  <td className="px-3 py-2.5 text-premium/75">{shortDateTime(p.next_appointment)}</td>
                  <td className="px-3 py-2.5"><span className={`${chip} ${PATIENT_CLS[p.status] ?? "bg-stone-100 text-stone-500 border-stone-200"}`}>{p.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
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

type Profile = { patient: PatientSummary; bookings: AgendaItem[]; payments: Payment[] }

function PatientDrawer({ id, flash, onClose, onCreated }: { id: number | null; flash: Flash; onClose: () => void; onCreated: (id: number) => void }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [form, setForm] = useState({ name: "", phone: "", email: "", gender: "", treatments: "", status: "Nueva", source: "", birth_date: "", notes: "" })
  const [tab, setTab] = useState<"sesiones" | "pagos" | "datos">(id ? "sesiones" : "datos")

  const load = useCallback(() => {
    if (!id) return
    api<Profile>(`/api/admin/patients?id=${id}`)
      .then((d) => {
        setProfile(d)
        const p = d.patient
        setForm({ name: p.name, phone: p.phone, email: p.email, gender: p.gender, treatments: p.treatments, status: p.status, source: p.source, birth_date: p.birth_date ?? "", notes: p.notes })
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
    <Drawer title={id ? form.name || "Paciente" : "Nuevo paciente"} onClose={onClose} wide>
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
              <div key={k} className="rounded-xl border border-premium bg-premium-light/60 p-3">
                <p className="text-[11px] text-premium/55">{k}</p>
                <p className={`mt-0.5 font-medium ${k === "Resta abonar" && p.balance > 0 ? "text-primary" : "text-premium"}`}>{v}</p>
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
            <p className="mt-3 text-xs text-premium/55">
              Incluye datos cargados antes del sistema integrado: {p.legacy_sessions} sesiones y {formatARS(p.legacy_balance)} de saldo previo.
            </p>
          )}
        </>
      )}

      {id && (
        <div className="mt-5 flex gap-1 border-b border-border">
          {(["sesiones", "pagos", "datos"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`border-b-2 px-3 py-2 text-sm ${tab === t ? "border-primary font-medium text-primary" : "border-transparent text-premium/60"}`}>
              {{ sesiones: "Sesiones y turnos", pagos: "Pagos", datos: "Datos personales" }[t]}
            </button>
          ))}
        </div>
      )}

      {tab === "sesiones" && profile && (
        <div className="mt-3 space-y-4">
          {upcoming.length > 0 && (
            <div>
              <p className="text-sm font-medium text-premium">Próximos</p>
              <ul className="divide-y divide-border">
                {upcoming.map((b) => <AppointmentRow key={b.id} b={b} compact onEdit={actions.edit} onPay={actions.pay} onStatus={actions.changeStatus} />)}
              </ul>
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-premium">Historial</p>
            {past.length === 0 ? (
              <p className="mt-1 text-sm text-premium/60">Todavía no hay sesiones registradas.</p>
            ) : (
              <ul className="divide-y divide-border">
                {past.map((b) => (
                  <Fragment key={b.id}>
                    {sessionNumber.has(b.id) && <li className="pt-2 text-xs font-medium text-primary">Sesión n.º {sessionNumber.get(b.id)}</li>}
                    <AppointmentRow b={b} compact onEdit={actions.edit} onPay={actions.pay} onStatus={actions.changeStatus} />
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
            <p className="text-sm text-premium/60">No hay pagos registrados.</p>
          ) : (
            <ul className="divide-y divide-border">
              {profile.payments.map((x) => (
                <li key={x.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <p className="w-24 shrink-0 text-premium/60">{shortDate(x.paid_at)}</p>
                  <div className="min-w-0 flex-1">
                    <p className="text-premium">{x.concept} · {x.method}{x.service_name ? ` · ${x.service_name}` : ""}</p>
                    <p className="text-xs text-premium/50">Registró: {x.created_by}{x.notes ? ` · ${x.notes}` : ""}</p>
                  </div>
                  <p className="font-medium text-premium">{formatARS(x.amount)}</p>
                  {x.origin === "manual" && <button onClick={() => removePayment(x)} className={`${btnIcon} h-8 w-8 text-destructive`} aria-label="Anular pago"><Trash2 className="h-3.5 w-3.5" /></button>}
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
          </div>
          <p className="text-xs text-premium/55">Las sesiones, los pagos, el saldo y el próximo turno se calculan solos a partir de la agenda y los pagos registrados.</p>
          <div className="flex gap-2">
            <button onClick={save} className={btnPrimary}><Save className="h-4 w-4" /> {id ? "Guardar" : "Crear paciente"}</button>
            {id && <button onClick={remove} className={`${btnIcon} ml-auto text-destructive`} aria-label="Eliminar paciente"><Trash2 className="h-4 w-4" /></button>}
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
  const byMethod = (payments ?? []).reduce<Record<string, number>>((m, p) => ({ ...m, [p.method]: (m[p.method] ?? 0) + p.amount }), {})

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-premium">Caja</h1>
          <p className="text-sm text-premium/60">Lo vendido (turnos del período), lo efectivamente cobrado y lo que falta cobrar, por separado.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${fieldInline} h-9`} aria-label="Desde" />
          <span className="text-premium/50">a</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${fieldInline} h-9`} aria-label="Hasta" />
          <a href={`/api/admin/payments?desde=${from}&hasta=${to}&formato=csv`} className={`${btnGhost} h-9`}><Download className="h-4 w-4" /> Exportar CSV</a>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          ["Vendido (turnos del período)", sold],
          ["Cobrado en el período", collected],
          ["Por cobrar de esos turnos", due],
        ].map(([k, v]) => (
          <div key={k} className={`${panel} p-4 sm:p-4`}>
            <p className="text-xs text-premium/55">{k}</p>
            <p className="mt-1 font-serif text-2xl font-semibold text-premium">{formatARS(v as number)}</p>
          </div>
        ))}
      </div>
      {Object.keys(byMethod).length > 0 && (
        <p className="text-sm text-premium/70">{Object.entries(byMethod).map(([m, v]) => `${m}: ${formatARS(v)}`).join(" · ")}</p>
      )}
      <div className={`${panel} overflow-x-auto p-0 sm:p-0`}>
        {payments === null ? (
          <p className="p-5 text-sm text-premium/60">Cargando…</p>
        ) : payments.length === 0 ? (
          <p className="p-5 text-sm text-premium/60">No hay pagos en este período.</p>
        ) : (
          <table className="w-full min-w-[700px] text-sm">
            <thead className="border-b border-premium text-left text-xs text-premium/55">
              <tr>
                <th className="px-4 py-3 font-medium">Fecha</th>
                <th className="px-3 py-3 font-medium">Paciente</th>
                <th className="px-3 py-3 font-medium">Turno</th>
                <th className="px-3 py-3 font-medium">Concepto</th>
                <th className="px-3 py-3 font-medium">Medio</th>
                <th className="px-3 py-3 text-right font-medium">Importe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2.5 text-premium/70">{shortDateTime(p.paid_at)}</td>
                  <td className="px-3 py-2.5 text-premium">{p.patient_name ?? "—"}</td>
                  <td className="px-3 py-2.5 text-premium/70">{p.service_name ? `${p.service_name} · ${shortDate(p.starts_at ?? null)}` : "A cuenta"}</td>
                  <td className="px-3 py-2.5 text-premium/70">{p.concept}</td>
                  <td className="px-3 py-2.5 text-premium/70">{p.method}</td>
                  <td className="px-3 py-2.5 text-right font-medium text-premium">{formatARS(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
