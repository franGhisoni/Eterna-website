import { TIME_ZONE } from "@/lib/time"

export const field = "h-10 w-full rounded-lg border border-premium bg-white px-3 text-sm text-premium outline-none focus:border-primary/40 focus:ring-[3px] focus:ring-primary/10"
export const fieldInline = "h-10 rounded-lg border border-premium bg-white px-3 text-sm text-premium outline-none focus:border-primary/40 focus:ring-[3px] focus:ring-primary/10"
export const btn = "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-medium transition-premium disabled:opacity-50"
export const btnPrimary = `${btn} bg-primary text-primary-foreground hover:bg-primary/90`
export const btnGhost = `${btn} border border-premium bg-white text-premium hover:bg-secondary`
export const btnIcon = "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-premium bg-white text-premium transition-premium hover:bg-secondary"
export const btnSmall = "inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-premium bg-white px-2.5 text-xs font-medium text-premium transition-premium hover:bg-secondary disabled:opacity-50"
export const panel = "rounded-2xl border border-premium bg-white p-5 shadow-premium sm:p-6"
export const lbl = "text-xs text-premium/60"
export const chip = "inline-flex w-fit shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs"

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
