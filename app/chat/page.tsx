"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowUp, CalendarCheck, Clock, MapPin, MessageCircle, Navigation, RotateCcw } from "lucide-react"
import type { ChatCard, ChatOutput, ChatResponse } from "@/lib/chat-types"
import { DAY_RE, formatARS, formatDay } from "@/lib/time"
import { TransferPayment, type ReceiptOutcome } from "@/components/transfer-payment"

type Message = { id: number; role: "user" | "assistant"; text?: string; card?: ChatCard }

const WELCOME = "Hola, soy la asistente de Eterna. Puedo contarte sobre nuestros tratamientos, mostrarte turnos libres y ayudarte a reservar. ¿En qué te ayudo?"
const SUGGESTIONS = ["¿Qué servicios tienen?", "Quiero reservar depilación láser", "¿Cómo me preparo para el láser?", "¿Dónde quedan?"]
const STORAGE_KEY = "eterna-chat-v3"
/** La conversación se conserva en el dispositivo este tiempo desde el último movimiento. */
const STORAGE_TTL_MS = 7 * 24 * 3600_000

type BookingState = { state: string; expiresAt: string | null }
type Stored = { messages: Message[]; responseId?: string; conversationId?: string; staffSeen?: number; draft?: string; savedAt?: number }

const ERRORS: Record<string, string> = {
  sin_modelo: "El chat no está disponible en este momento. Escribinos por WhatsApp y te respondemos.",
  demasiados_mensajes: "Recibimos muchos mensajes seguidos. Esperá unos minutos y probá de nuevo.",
}

function readStored(): Stored | null {
  try {
    // localStorage sobrevive a cerrar la pestaña o el navegador; sessionStorage (versión anterior) se migra una vez
    const raw = localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem("eterna-chat-v2")
    if (!raw) return null
    const data = JSON.parse(raw) as Stored
    if (!Array.isArray(data.messages) || !data.messages.length) return null
    if (data.savedAt && Date.now() - data.savedAt > STORAGE_TTL_MS) {
      localStorage.removeItem(STORAGE_KEY)
      return null
    }
    return data
  } catch {
    return null
  }
}

function clearStored() {
  try {
    localStorage.removeItem(STORAGE_KEY)
    sessionStorage.removeItem("eterna-chat-v2")
  } catch {}
}

function RichText({ text }: { text: string }) {
  return <>{text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i} className="font-semibold">{part}</strong> : part))}</>
}

function Card({ card, send, onReceipt, booking }: { card: ChatCard; send: (text: string) => void; onReceipt: (outcome: ReceiptOutcome) => void; booking?: BookingState }) {
  const base = "w-full rounded-2xl border border-premium bg-white p-5 shadow-premium"
  if (card.type === "services") {
    const groups = new Map<string, typeof card.items>()
    for (const s of card.items) groups.set(s.category || "", [...(groups.get(s.category || "") ?? []), s])
    const multi = groups.size > 1
    return (
      <div className={base}>
        <p className="font-serif text-lg font-semibold text-premium">{card.title || "Servicios"}</p>
        <p className="text-xs text-premium/50">Precios por sesión</p>
        {Array.from(groups, ([cat, items]) => (
          <div key={cat}>
            {multi && cat && <p className="mt-4 text-xs font-medium uppercase tracking-[0.18em] text-premium/50">{cat}</p>}
            <ul className="mt-1 divide-y divide-border">
              {items.map((s) => {
                const info = s.detail && s.detail.toLowerCase() !== s.name.toLowerCase() ? s.detail : s.description
                const label = `${s.name}${s.gender && s.gender !== "Unisex" ? ` (${s.gender.toLowerCase()})` : ""}`
                return (
                  <li key={s.id} className="py-2.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="font-medium text-premium">{label}</p>
                      <p className="shrink-0 text-sm font-medium text-primary">{s.price > 0 ? formatARS(s.price) : "A evaluar"}</p>
                    </div>
                    {info && <p className="mt-0.5 text-sm text-premium/60">{info}</p>}
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-premium/50">
                      <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{s.duration} min</span>
                      {s.deposit > 0 && <span>Seña {formatARS(s.deposit)}</span>}
                      <button type="button" onClick={() => send(`Quiero reservar ${label}`)} className="ml-auto rounded-full border border-primary/25 px-3 py-1 text-xs font-medium text-primary transition-premium hover:bg-primary/5">
                        Reservar
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    )
  }
  if (card.type === "slots") {
    return (
      <div className={base}>
        <p className="font-serif text-lg font-semibold text-premium">Turnos libres</p>
        <p className="text-sm text-premium/60">{card.service}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {card.items.map((s) => (
            <button key={s.start} type="button" onClick={() => send(`Elijo el turno del ${s.label}`)} className="rounded-xl border border-premium bg-premium-light px-4 py-3 text-left text-sm font-medium text-premium transition-premium hover:border-primary/40 hover:bg-secondary">
              {s.label} hs
            </button>
          ))}
        </div>
      </div>
    )
  }
  if (card.type === "payment" || card.type === "confirmed") {
    return (
      <div className={base}>
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-5 w-5 text-primary" />
          <p className="font-serif text-lg font-semibold text-premium">{card.type === "confirmed" ? "Turno confirmado" : "Tu turno está guardado"}</p>
        </div>
        <dl className="mt-3 divide-y divide-border">
          {card.rows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-2.5 text-sm">
              <dt className="text-premium/60">{k}</dt>
              <dd className="text-right font-medium text-premium">{v}</dd>
            </div>
          ))}
        </dl>
        {card.type === "payment" && booking && ["expired", "cancelled"].includes(booking.state) && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">{booking.state === "expired" ? "Esta reserva venció" : "Esta reserva fue cancelada"}</p>
            <p className="mt-0.5">El horario se liberó. Escribime y buscamos otro turno.</p>
            <button type="button" onClick={() => send("Quiero reservar de nuevo")} className="mt-2 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100">Buscar otro turno</button>
          </div>
        )}
        {card.type === "payment" && booking && ["confirmed", "done", "reserved"].includes(booking.state) && (
          <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-medium text-emerald-900">Tu seña ya está registrada y el turno está confirmado.</p>
        )}
        {card.type === "payment" && booking && booking.state === "pending_review" && (
          <p className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">Recibimos tu comprobante. El equipo lo está revisando y te confirma el turno.</p>
        )}
        {card.type === "payment" && !(booking && ["expired", "cancelled", "confirmed", "done", "reserved", "pending_review"].includes(booking.state)) &&
          (card.checkoutUrl ? (
            <a href={card.checkoutUrl} className="mt-4 flex h-12 items-center justify-center rounded-xl bg-[#009ee3] px-5 text-sm font-semibold text-white transition-premium hover:bg-[#0089c7]">
              Pagar seña de {formatARS(card.amount)} con Mercado Pago
            </a>
          ) : card.transfer ? (
            <TransferPayment bookingId={card.bookingId} amount={card.amount} transfer={card.transfer} onSent={onReceipt} />
          ) : (
            <a href={card.whatsappUrl} target="_blank" rel="noreferrer" className="mt-4 flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-premium hover:bg-primary/90">
              <MessageCircle className="h-4 w-4" /> Coordinar la seña por WhatsApp
            </a>
          ))}
        <Link href={`/reserva/${card.bookingId}`} className="mt-3 block text-center text-xs text-premium/55 underline-offset-4 hover:underline">
          Ver el estado de la reserva
        </Link>
      </div>
    )
  }
  if (card.type === "map") {
    const view = card.viewUrl ?? card.directionsUrl
    return (
      <div className="w-full overflow-hidden rounded-2xl border border-premium bg-white shadow-premium">
        {/* el mapa entero es un enlace: tocarlo abre Google Maps (la app en el celular) */}
        <div className="relative h-56 bg-secondary sm:h-64">
          {/* se ve mientras carga el mapa (o si el mapa no puede cargarse) */}
          <div aria-hidden className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-premium/60">
            <MapPin className="h-8 w-8 text-primary" />
            <span className="px-6 text-center text-xs">{card.address}</span>
          </div>
          <iframe title={`Mapa: ${card.address}`} src={card.embedUrl} tabIndex={-1} aria-hidden className="pointer-events-none relative h-full w-full border-0" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
          <a href={view} target="_blank" rel="noreferrer" aria-label={`Abrir ${card.address} en Google Maps`} className="absolute inset-0 flex items-end justify-end p-3 transition-premium hover:bg-black/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/95 px-3 py-1.5 text-xs font-medium text-premium shadow-premium">
              <MapPin className="h-3.5 w-3.5 text-primary" /> Abrir en Google Maps
            </span>
          </a>
        </div>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            {card.place && <p className="font-serif text-base font-semibold text-premium">{card.place}</p>}
            <p className="flex items-start gap-2 text-sm text-premium"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{card.address}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <a href={view} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-premium bg-white px-4 text-sm font-medium text-premium transition-premium hover:bg-secondary">
              Ver en Maps
            </a>
            <a href={card.directionsUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-premium hover:bg-primary/90">
              <Navigation className="h-4 w-4" /> Cómo llegar
            </a>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className={base}>
      <p className="font-serif text-lg font-semibold text-premium">Hablá con el equipo</p>
      {card.reason && <p className="mt-1 text-sm text-premium/65">{card.reason}</p>}
      <a href={card.url} target="_blank" rel="noreferrer" className="mt-4 flex h-11 items-center justify-center gap-2 rounded-xl bg-[#25d366] px-5 text-sm font-semibold text-white transition-premium hover:bg-[#1fbe5b]">
        <MessageCircle className="h-4 w-4" /> Escribir por WhatsApp
      </a>
    </div>
  )
}

export default function ChatPage() {
  const params = useSearchParams()
  const [messages, setMessages] = useState<Message[]>([{ id: 0, role: "assistant", text: WELCOME }])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const responseId = useRef<string | undefined>(undefined)
  const conversationId = useRef<string | undefined>(undefined)
  const staffSeen = useRef(0)
  const [human, setHuman] = useState(false)
  const [bookingStates, setBookingStates] = useState<Record<string, BookingState>>({})
  const [restored, setRestored] = useState(false)
  const nextId = useRef(1)
  const endRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLTextAreaElement>(null)
  const started = useRef(false)
  const pendingContext = useRef<string[]>([])

  useEffect(() => {
    if (started.current) return
    started.current = true
    const stored = readStored()
    if (stored?.messages?.length) {
      setMessages(stored.messages)
      responseId.current = stored.responseId
      conversationId.current = stored.conversationId
      staffSeen.current = stored.staffSeen ?? 0
      nextId.current = Math.max(...stored.messages.map((m) => m.id)) + 1
      if (stored.draft) setInput(stored.draft)
      // reservas con seña pendiente: se consulta su estado real para no mostrar un botón de pago vencido
      const ids = Array.from(new Set(stored.messages.flatMap((m) => (m.card?.type === "payment" ? [m.card.bookingId] : []))))
      for (const id of ids) {
        fetch(`/api/reserva/${id}/estado`)
          .then((r) => (r.ok ? (r.json() as Promise<BookingState>) : null))
          .then((st) => st && setBookingStates((v) => ({ ...v, [id]: st })))
          .catch(() => {})
      }
      if (stored.messages.length > 1) setRestored(true)
    }
    const day = params.get("fecha")
    const q = params.get("q")?.trim().slice(0, 300)
    if (day && DAY_RE.test(day)) void send(`Quiero un turno para el ${formatDay(day).toLowerCase()} (${day})`)
    else if (q) void send(q)
    if (day || q) window.history.replaceState(null, "", "/chat")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // se guarda en el dispositivo después de cada mensaje y mientras se escribe (el borrador también se conserva)
  useEffect(() => {
    if (!started.current) return
    try {
      const data: Stored = {
        messages: messages.slice(-60),
        responseId: responseId.current,
        conversationId: conversationId.current,
        staffSeen: staffSeen.current,
        draft: input.slice(0, 1500),
        savedAt: Date.now(),
      }
      if (messages.length > 1 || input) localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // sin espacio o modo privado: el chat sigue funcionando, solo que sin guardado
    }
  }, [messages, input, busy])
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages, busy])

  // si hay otra pestaña abierta con el mismo chat, se mantiene sincronizado
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue || busy) return
      try {
        const d = JSON.parse(e.newValue) as Stored
        if (!d.messages?.length || d.messages.length <= messages.length) return
        setMessages(d.messages)
        responseId.current = d.responseId
        conversationId.current = d.conversationId
        nextId.current = Math.max(...d.messages.map((m) => m.id)) + 1
      } catch {}
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [messages.length, busy])

  const add = (items: Array<Omit<Message, "id">>) => setMessages((v) => [...v, ...items.map((m) => ({ ...m, id: nextId.current++ }))])

  // cuando una persona del equipo toma la conversación, sus respuestas llegan acá
  useEffect(() => {
    const poll = async () => {
      if (!conversationId.current) return
      try {
        const r = await fetch(`/api/chat?conversacion=${conversationId.current}&desde=${staffSeen.current}`)
        const d = (await r.json()) as { ok: boolean; human: boolean; messages: Array<{ id: number; text: string }>; last: number }
        if (!d.ok) return
        setHuman(d.human)
        if (d.messages.length) {
          staffSeen.current = d.last
          add(d.messages.map((m) => ({ role: "assistant" as const, text: m.text })))
        }
      } catch {}
    }
    const t = setInterval(poll, human ? 4000 : 15000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [human])

  async function send(raw: string) {
    const text = raw.trim()
    if (!text || busy) return
    setInput("")
    if (boxRef.current) boxRef.current.style.height = ""
    add([{ role: "user", text }])
    setBusy(true)
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: [...pendingContext.current.splice(0), text].join("\n"), previousResponseId: responseId.current, conversationId: conversationId.current }),
      })
      const data = (await res.json().catch(() => ({ ok: false, error: "error_interno" }))) as ChatResponse & { conversationId?: string; human?: boolean }
      if (data.conversationId) conversationId.current = data.conversationId
      if (data.ok && data.human) {
        setHuman(true)
        return
      }
      if (!data.ok) {
        add([{ role: "assistant", text: ERRORS[data.error] ?? "No pude responderte ahora. ¿Probamos de nuevo?" }])
        return
      }
      responseId.current = data.responseId
      add(data.outputs.map((o: ChatOutput) => ("card" in o ? { role: "assistant", card: o.card } : { role: "assistant", text: o.text })))
    } catch {
      add([{ role: "assistant", text: "Se cortó la conexión. ¿Probamos de nuevo?" }])
    } finally {
      setBusy(false)
      boxRef.current?.focus()
    }
  }

  const reset = () => {
    responseId.current = undefined
    conversationId.current = undefined
    staffSeen.current = 0
    setHuman(false)
    nextId.current = 1
    setMessages([{ id: 0, role: "assistant", text: WELCOME }])
    setInput("")
    setRestored(false)
    setBookingStates({})
    clearStored()
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-premium-light">
      <header className="border-b border-premium bg-white/70 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Link href="/" aria-label="Volver al inicio" className="flex h-10 w-10 items-center justify-center rounded-xl text-premium/70 transition-premium hover:bg-secondary">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <img src="/eterna-logo.webp" alt="" className="h-8 w-auto" />
          <div className="min-w-0 flex-1">
            <p className="font-berlys text-xl leading-none text-premium">eterna</p>
            <p className="mt-0.5 truncate text-xs text-premium/60">Consultas y turnos online</p>
          </div>
          <button type="button" onClick={reset} aria-label="Nueva conversación" title="Nueva conversación" className="flex h-10 w-10 items-center justify-center rounded-xl text-premium/60 transition-premium hover:bg-secondary">
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto" aria-live="polite">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
          {restored && (
            <div className="flex items-center justify-between gap-3 self-center rounded-full border border-premium bg-white px-4 py-1.5 text-xs text-premium/70 shadow-premium">
              <span>Retomamos tu conversación anterior</span>
              <button type="button" onClick={reset} className="font-medium text-primary underline-offset-4 hover:underline">Empezar de nuevo</button>
            </div>
          )}
          {messages.map((m) =>
            m.card ? (
              <div key={m.id} className="w-full max-w-[34rem] self-start">
                <Card card={m.card} booking={m.card.type === "payment" ? bookingStates[m.card.bookingId] : undefined} send={(t) => void send(t)} onReceipt={(outcome) =>
                    pendingContext.current.push(
                      outcome === "confirmed"
                        ? "[sistema: el comprobante de transferencia coincidió y el turno quedó confirmado]"
                        : "[sistema: la persona subió el comprobante de transferencia; el equipo lo revisa y el turno todavía no está confirmado]",
                    )
                  } />
              </div>
            ) : (
              <p
                key={m.id}
                className={[
                  "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-[15px] leading-relaxed",
                  m.role === "user" ? "self-end rounded-br-md bg-primary text-primary-foreground" : "self-start rounded-bl-md border border-premium bg-white text-premium shadow-premium",
                ].join(" ")}
              >
                <RichText text={m.text ?? ""} />
              </p>
            ),
          )}
          {messages.length === 1 && !busy && (
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" onClick={() => void send(s)} className="rounded-full border border-primary/20 bg-white px-4 py-2 text-sm text-premium transition-premium hover:border-primary/40 hover:bg-secondary">
                  {s}
                </button>
              ))}
            </div>
          )}
          {human && (
            <p className="self-center rounded-full bg-secondary px-3 py-1 text-xs text-premium/70">Te está respondiendo una persona del equipo de Eterna</p>
          )}
          {busy && (
            <div className="flex gap-1.5 self-start rounded-2xl rounded-bl-md border border-premium bg-white px-4 py-4 shadow-premium" aria-label="Escribiendo">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-2 w-2 animate-pulse rounded-full bg-primary/60" style={{ animationDelay: `${i * 200}ms` }} />
              ))}
            </div>
          )}
          <div ref={endRef} />
        </div>
      </main>

      <footer className="border-t border-premium bg-white/70 backdrop-blur">
        <div className="mx-auto max-w-3xl px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <div className="relative">
            <textarea
              ref={boxRef}
              rows={1}
              value={input}
              placeholder="Escribí tu consulta…"
              aria-label="Mensaje"
              maxLength={1500}
              onChange={(e) => {
                setInput(e.target.value)
                e.target.style.height = "auto"
                e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  void send(input)
                }
              }}
              className="block max-h-40 min-h-[52px] w-full resize-none rounded-2xl border border-premium bg-white py-3.5 pl-4 pr-14 text-[15px] text-premium outline-none placeholder:text-premium/45 focus:border-primary/40 focus:ring-[3px] focus:ring-primary/10"
            />
            <button type="button" aria-label="Enviar" disabled={!input.trim() || busy} onClick={() => void send(input)} className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-premium hover:bg-primary/90 disabled:bg-premium/15 disabled:text-premium/40">
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-premium/45">Asistente virtual. Las indicaciones médicas se definen en la evaluación con el profesional.</p>
        </div>
      </footer>
    </div>
  )
}
