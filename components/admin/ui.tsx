"use client"

/**
 * Sistema de diseño del panel de Eterna.
 * Una sola fuente para alturas, radios, bordes, colores de texto, estados y componentes base,
 * así todas las pantallas se ven y se comportan igual.
 *
 * Escala: controles 40 px (32 px en acciones compactas), radio 8 px en controles y 12 px en tarjetas,
 * espaciado en múltiplos de 4 px. Texto: ink (principal), ink-2 (secundario), ink-3 (terciario, AA sobre blanco y nude).
 */
import { useEffect, useId, useRef, useState } from "react"
import { Loader2, MoreHorizontal, X } from "lucide-react"
import { TIME_ZONE } from "@/lib/time"

/* ───────────── Clases base ───────────── */

const focus = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/45 focus-visible:ring-offset-1 focus-visible:ring-offset-white"

export const field =
  "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink placeholder:text-ink-3 transition-colors duration-150 hover:border-line-strong focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:bg-surface disabled:text-ink-3"
export const fieldInline = field.replace("w-full ", "")
export const btn = `inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-4 text-sm font-medium transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 ${focus}`
export const btnPrimary = `${btn} bg-primary text-white shadow-[0_1px_1px_rgba(60,20,20,0.12)] hover:bg-primary-hover active:bg-primary-active`
export const btnGhost = `${btn} border border-line bg-white text-ink hover:border-line-strong hover:bg-surface active:bg-surface-2`
export const btnQuiet = `${btn} text-ink-2 hover:bg-surface hover:text-ink active:bg-surface-2`
export const btnDanger = `${btn} border border-red-200 bg-white text-red-700 hover:bg-red-50 active:bg-red-100`
export const btnIcon = `inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-ink-2 transition-colors duration-150 hover:bg-surface hover:text-ink active:bg-surface-2 disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4 ${focus}`
export const btnSmall = `inline-flex h-9 sm:h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-white px-2.5 text-xs font-medium text-ink transition-colors duration-150 hover:border-line-strong hover:bg-surface active:bg-surface-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:h-3.5 [&_svg]:w-3.5 ${focus}`
export const btnLink = `rounded text-primary underline-offset-2 hover:underline ${focus}`
export const panel = "rounded-xl border border-line bg-white p-4 shadow-card sm:p-5"
export const lbl = "block text-xs font-medium text-ink-2"
export const chip = "inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium"
export const tableHead = "border-b border-line bg-surface/60 text-left text-xs font-medium text-ink-2"

/** Colores semánticos de estados: siempre acompañados de texto, nunca solo color. */
export const TONE = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
  accent: "border-violet-200 bg-violet-50 text-violet-800",
  danger: "border-red-200 bg-red-50 text-red-800",
  neutral: "border-line bg-surface text-ink-2",
} as const
export type Tone = keyof typeof TONE

export function Badge({ tone = "neutral", children, title }: { tone?: Tone; children: React.ReactNode; title?: string }) {
  return (
    <span className={`${chip} ${TONE[tone]}`} title={title}>
      {children}
    </span>
  )
}

/* ───────────── Estructura de página ───────────── */

export function PageHeader({ title, description, actions, children }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="font-serif text-[1.625rem] font-semibold leading-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm leading-relaxed text-ink-2">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function Card({ title, description, actions, children, className = "", padded = true }: { title?: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; children?: React.ReactNode; className?: string; padded?: boolean }) {
  return (
    <section className={`rounded-xl border border-line bg-white shadow-card ${padded ? "p-4 sm:p-5" : ""} ${className}`}>
      {(title || actions) && (
        <div className={`flex flex-wrap items-start justify-between gap-2 ${padded ? "mb-3" : "border-b border-line px-4 py-3 sm:px-5"}`}>
          <div className="min-w-0">
            {title && <h2 className="text-[0.9375rem] font-semibold text-ink">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-ink-2">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "primary" }) {
  return (
    <div className="h-full rounded-xl border border-line bg-white p-4 shadow-card">
      <p className="text-xs font-medium text-ink-2">{label}</p>
      <p className={`mt-1 font-serif text-2xl font-semibold tabular-nums ${tone === "primary" ? "text-primary" : "text-ink"}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-3">{hint}</p>}
    </div>
  )
}

export function Empty({ title, text, action, icon }: { title: string; text?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      {icon && <div className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink-3 [&_svg]:h-5 [&_svg]:w-5">{icon}</div>}
      <p className="text-sm font-medium text-ink">{title}</p>
      {text && <p className="max-w-sm text-sm text-ink-2">{text}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function Loading({ label = "Cargando…", rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3 p-1">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-14 animate-pulse rounded-lg bg-surface" style={{ opacity: 1 - i * 0.2 }} />
      ))}
    </div>
  )
}

export function Spinner() {
  return <Loader2 className="animate-spin" aria-hidden />
}

/** Control segmentado (vistas, períodos). */
export function Segmented<T extends string>({ options, value, onChange, label }: { options: Array<[T, string]>; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-line bg-surface p-0.5">
      {options.map(([v, text]) => (
        <button
          key={v}
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={`h-8 rounded-md px-3 text-xs font-medium transition-colors duration-150 ${focus} ${value === v ? "bg-white text-ink shadow-[0_1px_2px_rgba(60,47,47,0.12)]" : "text-ink-2 hover:text-ink"}`}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

/** Campo con etiqueta asociada (y ayuda opcional) para que lectores de pantalla y clics en la etiqueta funcionen. */
export function Field({ label, hint, className = "", children }: { label: string; hint?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className={lbl}>{label}</span>
      <span className="mt-1 block">{children}</span>
      {hint && <span className="mt-1 block text-xs text-ink-3">{hint}</span>}
    </label>
  )
}

/* ───────────── Menú contextual ───────────── */

export type MenuItem = { label: string; onSelect?: () => void; href?: string; danger?: boolean; hidden?: boolean; icon?: React.ReactNode }

/** Acciones secundarias de un registro. Se abre con clic o teclado y se cierra con Escape o clic afuera. */
export function ActionMenu({ items, label = "Más acciones" }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  const visible = items.filter((i) => !i.hidden)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false)
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onKey)
    ref.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus()
    return () => {
      document.removeEventListener("mousedown", onDoc)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])
  if (!visible.length) return null
  const itemCls = `flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors duration-100 [&_svg]:h-4 [&_svg]:w-4 ${focus}`
  const onKeyNav = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
    e.preventDefault()
    const els = Array.from(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])
    const i = els.indexOf(document.activeElement as HTMLElement)
    els[(i + (e.key === "ArrowDown" ? 1 : -1) + els.length) % els.length]?.focus()
  }
  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button aria-haspopup="menu" aria-expanded={open} aria-controls={id} aria-label={label} title={label} onClick={() => setOpen(!open)} className={`${btnIcon} h-9 w-9 sm:h-8 sm:w-8`}>
        <MoreHorizontal />
      </button>
      {open && (
        <div id={id} role="menu" onKeyDown={onKeyNav} className="absolute right-0 z-30 mt-1 min-w-[200px] rounded-lg border border-line bg-white p-1 shadow-pop">
          {visible.map((it) =>
            it.href ? (
              <a key={it.label} role="menuitem" href={it.href} target="_blank" rel="noreferrer" onClick={() => setOpen(false)} className={`${itemCls} text-ink hover:bg-surface`}>
                {it.icon}
                {it.label}
              </a>
            ) : (
              <button
                key={it.label}
                role="menuitem"
                onClick={() => {
                  setOpen(false)
                  it.onSelect?.()
                }}
                className={`${itemCls} ${it.danger ? "text-red-700 hover:bg-red-50" : "text-ink hover:bg-surface"}`}
              >
                {it.icon}
                {it.label}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  )
}

/* ───────────── Panel lateral (drawer) ───────────── */

/**
 * Panel lateral modal: se cierra con Escape, botón o clic en el fondo, bloquea el scroll de la página
 * y lleva el foco adentro al abrirse (y lo devuelve al cerrarse).
 */
export function Drawer({ title, subtitle, onClose, children, wide, footer }: { title: string; subtitle?: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean; footer?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      // solo cierra el panel de más arriba
      const all = document.querySelectorAll("[data-drawer]")
      if (all[all.length - 1] === ref.current) onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = overflow
      prev?.focus?.()
    }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-[rgba(40,28,28,0.32)] backdrop-blur-[1px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        data-drawer
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex h-full w-full flex-col bg-white shadow-pop outline-none ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"} animate-in slide-in-from-right-4 duration-200`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3.5 sm:px-6">
          <div className="min-w-0">
            <h2 id={titleId} className="truncate font-serif text-xl font-semibold text-ink">{title}</h2>
            {subtitle && <div className="mt-0.5 text-sm text-ink-2">{subtitle}</div>}
          </div>
          <button onClick={onClose} className={btnIcon} aria-label="Cerrar"><X /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>
        {footer && <div className="flex flex-wrap items-center gap-2 border-t border-line bg-white px-4 py-3 sm:px-6">{footer}</div>}
      </div>
    </div>
  )
}

/* ───────────── Datos y formatos ───────────── */

export type Flash = (text: string, error?: boolean) => void

export class ApiError extends Error {
  constructor(
    message: string,
    readonly data: Record<string, unknown>,
  ) {
    super(message)
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } })
  if (res.status === 401) {
    window.location.href = "/admin/login"
    throw new Error("no_autorizado")
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError((data as { error?: string }).error ?? "error", data as Record<string, unknown>)
  return data as T
}

export const hhmm = (iso: string | Date) =>
  new Intl.DateTimeFormat("es-AR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso))

export const shortDateTime = (iso: string | Date | null) =>
  iso ? new Intl.DateTimeFormat("es-AR", { timeZone: TIME_ZONE, weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso)) : "—"

export const shortDate = (iso: string | Date | null) =>
  iso ? new Intl.DateTimeFormat("es-AR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "2-digit" }).format(new Date(iso)) : "—"

/** "2026-11-25T16:00" en hora argentina, para inputs datetime-local */
export const toLocalInput = (iso: string | Date | null) => (iso ? new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 16) : "")
export const fromLocalInput = (v: string) => (v ? `${v}:00-03:00` : "")

/** Barra fija que aparece cuando hay cambios sin guardar en un formulario largo. */
export function SaveBar({ dirty, onSave, onDiscard, busy }: { dirty: boolean; onSave: () => void; onDiscard: () => void; busy?: boolean }) {
  if (!dirty) return null
  return (
    <div className="sticky bottom-4 z-10 mx-auto flex w-fit max-w-full items-center gap-3 rounded-xl border border-line bg-white py-2 pl-4 pr-2 shadow-pop animate-in fade-in slide-in-from-bottom-2 duration-200">
      <p className="text-sm text-ink">Tenés cambios sin guardar</p>
      <button onClick={onDiscard} className={`${btnQuiet} h-9`}>Descartar</button>
      <button onClick={onSave} disabled={busy} className={`${btnPrimary} h-9`}>{busy ? <Spinner /> : null}Guardar cambios</button>
    </div>
  )
}
