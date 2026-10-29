"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { ArrowLeft, ArrowUp, CalendarCheck, Clock, MapPin, MessageCircle, Navigation, RotateCcw } from "lucide-react"
import type { ChatCard, ChatOutput, ChatResponse } from "@/lib/chat-types"
import { DAY_RE, formatARS, formatDay } from "@/lib/time"

type Message = { id: number; role: "user" | "assistant"; text?: string; card?: ChatCard }

const WELCOME = "Hola, soy la asistente de Eterna. Puedo contarte sobre nuestros tratamientos, mostrarte turnos libres y ayudarte a reservar. ¿En qué te ayudo?"
const SUGGESTIONS = ["¿Qué servicios tienen?", "Quiero reservar depilación láser", "¿Cómo me preparo para el láser?", "¿Dónde quedan?"]
const STORAGE_KEY = "eterna-chat-v1"

const ERRORS: Record<string, string> = {
  sin_modelo: "El chat no está disponible en este momento. Escribinos por WhatsApp y te respondemos.",
  demasiados_mensajes: "Recibimos muchos mensajes seguidos. Esperá unos minutos y probá de nuevo.",
}

function readStored(): { messages: Message[]; responseId?: string } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function Card({ card, send }: { card: ChatCard; send: (text: string) => void }) {
  const base = "w-full rounded-2xl border border-premium bg-white p-5 shadow-premium"
  if (card.type === "services") {
    return (
      <div className={base}>
        <p className="font-serif text-lg font-semibold text-premium">Servicios</p>
        <ul className="mt-3 divide-y divide-border">
          {card.items.map((s) => (
            <li key={s.id} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-medium text-premium">{s.name}</p>
                <p className="shrink-0 text-sm font-medium text-primary">{s.price > 0 ? formatARS(s.price) : "A evaluar"}</p>
              </div>
              <p className="mt-1 text-sm text-premium/65">{s.description}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-premium/55">
                <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{s.duration} min</span>
                {s.deposit > 0 && <span>Seña {formatARS(s.deposit)}</span>}
                <button type="button" onClick={() => send(`Quiero reservar ${s.name}`)} className="ml-auto rounded-full border border-primary/25 px-3 py-1 text-xs font-medium text-primary transition-premium hover:bg-primary/5">
                  Reservar
                </button>
              </div>
            </li>
          ))}
        </ul>
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
        {card.type === "payment" &&
          (card.checkoutUrl ? (
            <a href={card.checkoutUrl} className="mt-4 flex h-12 items-center justify-center rounded-xl bg-[#009ee3] px-5 text-sm font-semibold text-white transition-premium hover:bg-[#0089c7]">
              Pagar seña de {formatARS(card.amount)} con Mercado Pago
            </a>
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
    return (
      <div className="w-full overflow-hidden rounded-2xl border border-premium bg-white shadow-premium">
        <iframe title={`Mapa: ${card.address}`} src={card.embedUrl} className="h-56 w-full border-0 sm:h-64" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm text-premium"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />{card.address}</p>
          <a href={card.directionsUrl} target="_blank" rel="noreferrer" className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground transition-premium hover:bg-primary/90">
            <Navigation className="h-4 w-4" /> Cómo llegar
          </a>
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
  const nextId = useRef(1)
  const endRef = useRef<HTMLDivElement>(null)
  const boxRef = useRef<HTMLTextAreaElement>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const stored = readStored()
    if (stored?.messages?.length) {
      setMessages(stored.messages)
      responseId.current = stored.responseId
      nextId.current = Math.max(...stored.messages.map((m) => m.id)) + 1
    }
    const day = params.get("fecha")
    const q = params.get("q")?.trim().slice(0, 300)
    if (day && DAY_RE.test(day)) void send(`Quiero un turno para el ${formatDay(day).toLowerCase()} (${day})`)
    else if (q) void send(q)
    if (day || q) window.history.replaceState(null, "", "/chat")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: messages.slice(-60), responseId: responseId.current }))
    } catch {}
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [messages, busy])

  const add = (items: Array<Omit<Message, "id">>) => setMessages((v) => [...v, ...items.map((m) => ({ ...m, id: nextId.current++ }))])

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
        body: JSON.stringify({ message: text, previousResponseId: responseId.current }),
      })
      const data = (await res.json().catch(() => ({ ok: false, error: "error_interno" }))) as ChatResponse
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
    nextId.current = 1
    setMessages([{ id: 0, role: "assistant", text: WELCOME }])
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {}
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
          {messages.map((m) =>
            m.card ? (
              <div key={m.id} className="w-full max-w-[34rem] self-start">
                <Card card={m.card} send={(t) => void send(t)} />
              </div>
            ) : (
              <p
                key={m.id}
                className={[
                  "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-4 py-3 text-[15px] leading-relaxed",
                  m.role === "user" ? "self-end rounded-br-md bg-primary text-primary-foreground" : "self-start rounded-bl-md border border-premium bg-white text-premium shadow-premium",
                ].join(" ")}
              >
                {m.text}
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
