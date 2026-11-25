"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { CalendarClock, Check, MessageCircle, Plus, Save, Send, UserRound, X } from "lucide-react"
import { addDays, formatDay, todayAR } from "@/lib/time"
import { PatientPicker } from "./operations"
import { ActionMenu, api, ApiError, Badge, btn, btnGhost, btnLink, btnPrimary, btnSmall, Card, Drawer, Empty, Field, field, Loading, PageHeader, Segmented, shortDate, shortDateTime, Spinner, type Flash } from "./ui"

type Item = {
  id: number
  title: string
  description: string
  message: string
  due_on: string | null
  done: boolean
  done_at: string | null
  auto_key: string | null
  patient_id: number | null
  name: string
  phone: string
  last_service: string | null
  last_session: string | null
  created_by: string
}

/** Enlace de WhatsApp con el mensaje escrito. La persona del equipo lo revisa y lo envía. */
function waLink(phone: string, text: string) {
  const digits = phone.replace(/\D/g, "")
  const full = digits.startsWith("54") ? digits : `549${digits.replace(/^0+/, "").replace(/^15/, "")}`
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`
}

type Kind = "todos" | "despues" | "sena" | "recordatorio" | "otros"
const kindOf = (m: Pick<Item, "auto_key">): Exclude<Kind, "todos"> => {
  const k = m.auto_key?.split(":")[0]
  return k === "despues" ? "despues" : k === "pedirsena" ? "sena" : k === "recordatorio" ? "recordatorio" : "otros"
}
const KIND_LABEL: Record<Exclude<Kind, "todos">, string> = { despues: "Después de la sesión", sena: "Pedir la seña", recordatorio: "Recordatorio de turno", otros: "Otros" }

const TOPICS = ["Agendar la próxima sesión", "Recordatorio de turno", "Recordar saldo pendiente", "Seguimiento de consulta", "Confirmar asistencia", "Resultados / cómo te sentiste"]

function dueLabel(due: string | null, today: string): { text: string; tone: "danger" | "warning" | "neutral" | "info" } {
  if (!due) return { text: "Sin fecha", tone: "neutral" }
  if (due < today) {
    const days = Math.round((new Date(today).getTime() - new Date(due).getTime()) / 86400_000)
    return { text: `Atrasado ${days} ${days === 1 ? "día" : "días"}`, tone: "danger" }
  }
  if (due === today) return { text: "Para hoy", tone: "warning" }
  if (due === addDays(today, 1)) return { text: "Mañana", tone: "info" }
  return { text: `El ${due.slice(8)}/${due.slice(5, 7)}`, tone: "neutral" }
}

function MessageCard({ m, today, onChanged, flash, onPatient }: { m: Item; today: string; onChanged: () => void; flash: Flash; onPatient: (id: number) => void }) {
  const [text, setText] = useState(m.message)
  const [opened, setOpened] = useState(false)
  const [snooze, setSnooze] = useState(false)
  const [snoozeDate, setSnoozeDate] = useState(addDays(today, 3))
  const [busy, setBusy] = useState(false)
  useEffect(() => setText(m.message), [m.message])
  const dirty = text !== m.message
  const due = dueLabel(m.due_on, today)

  const act = async (body: Record<string, unknown>, ok: string) => {
    setBusy(true)
    try {
      await api("/api/admin/messages", { method: "PATCH", body: JSON.stringify({ id: m.id, ...body }) })
      flash(ok)
      onChanged()
    } catch {
      flash("No se pudo actualizar", true)
    }
    setBusy(false)
  }

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {m.patient_id ? (
              <button onClick={() => onPatient(m.patient_id!)} className="text-[0.9375rem] font-semibold text-ink hover:text-primary hover:underline">{m.name || "Sin nombre"}</button>
            ) : (
              <p className="text-[0.9375rem] font-semibold text-ink">{m.name || "Sin nombre"}</p>
            )}
            <span className="text-sm tabular-nums text-ink-3">{m.phone || "Sin teléfono"}</span>
          </div>
          <p className="mt-0.5 text-sm text-ink">{m.title}</p>
          {m.description && <p className="text-xs text-ink-2">{m.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {m.done ? <Badge tone="success"><Check className="h-3 w-3" /> Enviado {m.done_at ? shortDate(m.done_at) : ""}</Badge> : <Badge tone={due.tone}>{due.text}</Badge>}
        </div>
      </div>

      <label className="mt-3 block">
        <span className="sr-only">Mensaje para {m.name}</span>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          readOnly={m.done}
          rows={Math.min(6, Math.max(2, Math.ceil(text.length / 90)))}
          className={`${field} h-auto resize-y py-2 text-sm leading-relaxed ${m.done ? "bg-surface text-ink-2" : ""}`}
          placeholder="Escribí el mensaje…"
        />
      </label>

      {!m.done && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {m.phone && text.trim() ? (
            <a href={waLink(m.phone, text)} target="_blank" rel="noreferrer" onClick={() => setOpened(true)} className={`${btn} h-9 bg-[#1f9d55] text-white hover:bg-[#188046] active:bg-[#14693a]`}>
              <MessageCircle /> Abrir en WhatsApp
            </a>
          ) : (
            <span className="text-xs text-ink-3">{m.phone ? "Escribí el mensaje para poder enviarlo" : "Falta el teléfono: cargalo en la ficha"}</span>
          )}
          {opened ? (
            <button onClick={() => act({ action: "sent", message: dirty ? text : undefined }, "Marcado como enviado")} disabled={busy} className={`${btnGhost} h-9 border-primary text-primary`}>
              {busy ? <Spinner /> : <Check />} Ya lo envié
            </button>
          ) : (
            <button onClick={() => act({ action: "sent" }, "Marcado como enviado")} disabled={busy} className={`${btnGhost} h-9`}>
              <Check /> Marcar enviado
            </button>
          )}
          {dirty && (
            <button onClick={() => act({ action: "edit", message: text }, "Mensaje guardado")} disabled={busy} className={btnSmall}>
              <Save /> Guardar texto
            </button>
          )}
          <ActionMenu
            label={`Más acciones para ${m.name}`}
            items={[
              { label: "Posponer 3 días", icon: <CalendarClock />, onSelect: () => act({ action: "snooze", days: 3 }, "Pospuesto 3 días") },
              { label: "Posponer 1 semana", icon: <CalendarClock />, onSelect: () => act({ action: "snooze", days: 7 }, "Pospuesto 1 semana") },
              { label: "Elegir otra fecha…", icon: <CalendarClock />, onSelect: () => setSnooze(true) },
              { label: "Ver ficha del paciente", icon: <UserRound />, hidden: !m.patient_id, onSelect: () => onPatient(m.patient_id!) },
              { label: "No hace falta enviarlo", danger: true, icon: <X />, onSelect: () => confirm(`¿Descartar el mensaje para ${m.name}? No se va a volver a mostrar.`) && act({ action: "dismiss" }, "Descartado") },
            ]}
          />
        </div>
      )}
      {m.done && (
        <button onClick={() => act({ action: "reopen" }, "Vuelve a pendientes")} className={`${btnLink} mt-2 text-xs`}>Volver a pendientes</button>
      )}
      {snooze && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface/60 p-2.5">
          <label className="text-xs font-medium text-ink-2" htmlFor={`snooze-${m.id}`}>Recordármelo el</label>
          <input id={`snooze-${m.id}`} type="date" min={today} value={snoozeDate} onChange={(e) => setSnoozeDate(e.target.value)} className={`${field} h-9 w-44`} />
          <button onClick={() => (setSnooze(false), act({ action: "snooze", dueOn: snoozeDate }, `Te lo recordamos el ${snoozeDate.slice(8)}/${snoozeDate.slice(5, 7)}`))} className={`${btnPrimary} h-9`}>Guardar</button>
          <button onClick={() => setSnooze(false)} className={`${btnGhost} h-9`}>Cancelar</button>
        </div>
      )}
    </li>
  )
}

function NewReminder({ flash, onClose, onSaved }: { flash: Flash; onClose: () => void; onSaved: () => void }) {
  const [who, setWho] = useState<{ id: number; name: string } | null>(null)
  const [title, setTitle] = useState(TOPICS[0])
  const [message, setMessage] = useState("")
  const [dueOn, setDueOn] = useState(todayAR())
  const [busy, setBusy] = useState(false)
  const save = async () => {
    if (!who) return flash("Elegí a quién hay que escribirle", true)
    if (!title.trim()) return flash("Indicá sobre qué", true)
    setBusy(true)
    try {
      await api("/api/admin/messages", { method: "POST", body: JSON.stringify({ patientId: who.id, title, message, dueOn }) })
      flash("Recordatorio creado")
      onSaved()
    } catch (e) {
      flash(e instanceof ApiError ? "Revisá los datos del recordatorio" : "No se pudo crear", true)
    }
    setBusy(false)
  }
  return (
    <Drawer
      title="Nuevo recordatorio"
      subtitle="Elegí a quién, sobre qué y cuándo querés acordarte"
      onClose={onClose}
      footer={
        <>
          <button onClick={save} disabled={busy} className={btnPrimary}>{busy ? <Spinner /> : <Save />} Guardar recordatorio</button>
          <button onClick={onClose} className={btnGhost}>Cancelar</button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-1 text-xs font-medium text-ink-2">Paciente</p>
          <PatientPicker value={who} onChange={(p) => setWho(p)} />
        </div>
        <Field label="Sobre qué">
          <input list="topics" value={title} onChange={(e) => setTitle(e.target.value)} className={field} />
          <datalist id="topics">{TOPICS.map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
        <Field label="Cuándo querés recordarlo"><input type="date" min={todayAR()} value={dueOn} onChange={(e) => setDueOn(e.target.value)} className={field} /></Field>
        <Field label="Mensaje (opcional)" hint="Lo podés dejar redactado ahora o escribirlo cuando llegue el día.">
          <textarea rows={5} value={message} onChange={(e) => setMessage(e.target.value)} className={`${field} h-auto py-2`} placeholder="Hola! Te escribimos de Eterna…" />
        </Field>
      </div>
    </Drawer>
  )
}

export function MessagesView({ flash, onPatient }: { flash: Flash; onPatient: (id: number) => void }) {
  const [state, setState] = useState<"pendientes" | "enviados">("pendientes")
  const [items, setItems] = useState<Item[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [kind, setKind] = useState<Kind>("todos")
  const today = todayAR()

  const load = useCallback(() => {
    api<{ items: Item[] }>(`/api/admin/messages?estado=${state}`)
      .then((d) => setItems(d.items))
      .catch(() => flash("No se pudieron cargar los mensajes", true))
  }, [state, flash])
  useEffect(() => {
    setItems(null)
    load()
  }, [load])

  const counts = useMemo(() => {
    const c: Record<Kind, number> = { todos: 0, despues: 0, sena: 0, recordatorio: 0, otros: 0 }
    for (const m of items ?? []) (c.todos++, c[kindOf(m)]++)
    return c
  }, [items])
  const { dueNow, later } = useMemo(() => {
    const list = (items ?? []).filter((m) => kind === "todos" || kindOf(m) === kind)
    return { dueNow: list.filter((m) => !m.due_on || m.due_on <= today), later: list.filter((m) => m.due_on && m.due_on > today) }
  }, [items, today, kind])

  return (
    <section className="space-y-5">
      <PageHeader
        title="Mensajes para enviar"
        description="Tres mensajes automáticos: al terminar la sesión (cómo le fue y agendar la próxima), 10 días antes (la seña) y un día antes (recordatorio). Cada uno viene redactado: lo abrís en WhatsApp, lo revisás y lo enviás vos. El sistema nunca manda nada por su cuenta."
        actions={<button onClick={() => setCreating(true)} className={btnPrimary}><Plus /> Nuevo recordatorio</button>}
      />
      <Segmented
        label="Mostrar"
        value={state}
        onChange={setState}
        options={[["pendientes", `Pendientes${items && state === "pendientes" ? ` (${items.length})` : ""}`], ["enviados", "Enviados"]]}
      />

      {state === "pendientes" && items && items.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo de mensaje">
          {(["todos", "despues", "sena", "recordatorio", "otros"] as Kind[]).filter((k) => k === "todos" || counts[k] > 0).map((k) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`h-8 rounded-full border px-3 text-xs font-medium transition-colors ${kind === k ? "border-primary bg-primary text-white" : "border-line bg-white text-ink-2 hover:bg-surface"}`}>
              {k === "todos" ? "Todos" : KIND_LABEL[k]} · {counts[k]}
            </button>
          ))}
        </div>
      )}

      {items === null ? (
        <Loading rows={3} />
      ) : items.length === 0 ? (
        <Card>
          <Empty
            icon={<Send />}
            title={state === "pendientes" ? "No hay mensajes pendientes" : "Todavía no marcaste mensajes como enviados"}
            text={state === "pendientes" ? "Cuando alguien termine una sesión, aparece el mensaje para saber cómo le fue y agendar la próxima; 10 días antes de cada turno, el pedido de seña; y el día anterior, el recordatorio. También podés crear tus propios recordatorios." : undefined}
            action={state === "pendientes" ? <button onClick={() => setCreating(true)} className={btnGhost}>Crear un recordatorio</button> : undefined}
          />
        </Card>
      ) : state === "enviados" ? (
        <Card padded={false}>
          <ul className="divide-y divide-line px-4 sm:px-5">
            {items.map((m) => <MessageCard key={m.id} m={m} today={today} flash={flash} onChanged={load} onPatient={onPatient} />)}
          </ul>
        </Card>
      ) : (
        <>
          {dueNow.length > 0 && (
            <Card title={<>Para hoy y atrasados <span className="font-normal text-ink-3">· {dueNow.length}</span></>} padded={false}>
              <ul className="divide-y divide-line px-4 sm:px-5">
                {dueNow.map((m) => <MessageCard key={m.id} m={m} today={today} flash={flash} onChanged={load} onPatient={onPatient} />)}
              </ul>
            </Card>
          )}
          {later.length > 0 && (
            <Card title={<>Próximos días <span className="font-normal text-ink-3">· {later.length}</span></>} description="Ya están redactados; aparecen arriba el día que corresponde." padded={false}>
              <ul className="divide-y divide-line px-4 sm:px-5">
                {later.map((m) => <MessageCard key={m.id} m={m} today={today} flash={flash} onChanged={load} onPatient={onPatient} />)}
              </ul>
            </Card>
          )}
        </>
      )}
      {creating && <NewReminder flash={flash} onClose={() => setCreating(false)} onSaved={() => (setCreating(false), load())} />}
    </section>
  )
}
