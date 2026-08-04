"use client"

import { Sparkles } from "lucide-react"

type AvailabilityCalendarProps = {
  availableDays: number[]
  subtitle?: string
  whatsappPhone: string
}

function toMondayIndex(date: Date) {
  return (date.getDay() + 6) % 7
}

function buildMonthGrid(year: number, monthIndex: number) {
  const firstOfMonth = new Date(year, monthIndex, 1)
  const leadingEmpty = toMondayIndex(firstOfMonth)
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()

  const cells: Array<number | null> = []
  for (let i = 0; i < leadingEmpty; i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) cells.push(day)
  while (cells.length % 7 !== 0) cells.push(null)
  while (cells.length < 42) cells.push(null)

  return { cells, daysInMonth }
}

function formatMonthTitle(date: Date) {
  const raw = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" }).format(date)
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

export function AvailabilityCalendar({ availableDays, subtitle = "Reservá tu lugar" }: AvailabilityCalendarProps) {
  const now = new Date()
  const year = now.getFullYear()
  const monthIndex = now.getMonth()
  const { cells, daysInMonth } = buildMonthGrid(year, monthIndex)

  const monthLabel = formatMonthTitle(new Date(year, monthIndex, 1))
  const today = now.getDate()
  const availableSet = new Set(availableDays.filter((d) => d >= today && d <= daysInMonth))
  const hasAvailability = availableSet.size > 0

  const buildWhatsAppUrl = (day: number) => {
    const date = new Date(year, monthIndex, day)
    const dateLabel = new Intl.DateTimeFormat("es-AR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(date)
    const message = encodeURIComponent(
      `Hola! Estoy interesada en reservar una cita para el ${dateLabel}. ¿Qué horarios tenés disponibles?`
    )
    return `https://wa.me/${whatsappPhone}?text=${message}`
  }

  return (
    <div className="liquid-glass liquid-glass-strong h-full rounded-[1.5rem] shadow-[0_10px_28px_rgba(0,0,0,0.10)]">
      <div className="relative h-full p-5 sm:p-6 flex flex-col">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs tracking-[0.28em] uppercase text-premium/60">Disponibilidad</p>
            <h3 className="mt-2 font-serif text-xl sm:text-2xl font-bold text-premium leading-tight">
              {hasAvailability ? "Próximas fechas disponibles" : "Consultá próximas fechas"}
            </h3>
            <p className="mt-1.5 text-sm text-premium/70">
              {hasAvailability ? subtitle : "Escribinos para conocer la disponibilidad actual."}
            </p>
          </div>

          <div className="hidden sm:flex items-center gap-2 rounded-full bg-white/12 border border-white/20 px-3 py-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-xs text-premium/75 whitespace-nowrap">Turnos limitados</span>
          </div>
        </div>

        <div className="mt-3.5 flex items-center justify-between">
          <p className="text-sm font-medium text-premium/85">{monthLabel}</p>
          <div className="sm:hidden inline-flex items-center gap-2 rounded-full bg-white/12 border border-white/20 px-3 py-1.5">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-xs text-premium/75">Turnos limitados</span>
          </div>
        </div>

        <div className="mt-2.5">
          <div className="grid grid-cols-7 gap-1.5 text-[10px] text-premium/60">
            {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((d) => (
              <div key={d} className="text-center tracking-wide">
                {d}
              </div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-7 gap-1.5">
            {cells.map((day, idx) => {
              const isAvailable = day !== null && availableSet.has(day)
              return (
                <div key={idx} className="h-8 w-8 sm:h-9 sm:w-9 mx-auto">
                  {day === null ? (
                    <div className="h-full w-full" />
                  ) : (
                    <button
                      type="button"
                      disabled={!isAvailable}
                      aria-disabled={!isAvailable}
                      aria-label={isAvailable ? `${new Intl.DateTimeFormat("es-AR", { dateStyle: "full" }).format(new Date(year, monthIndex, day))}, disponible` : `${new Intl.DateTimeFormat("es-AR", { dateStyle: "full" }).format(new Date(year, monthIndex, day))}, no disponible`}
                      onClick={() => {
                        if (!isAvailable) return
                        window.open(buildWhatsAppUrl(day), "_blank", "noopener,noreferrer")
                      }}
                      className={[
                        "relative h-full w-full rounded-full text-[13px] font-medium",
                        "transition-premium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
                        isAvailable
                          ? [
                              "text-primary",
                              "bg-white/20 border border-primary/25",
                              "shadow-[0_0_0_1px_rgba(136,38,38,0.18),0_10px_22px_rgba(136,38,38,0.18)]",
                              "hover:shadow-[0_0_0_1px_rgba(136,38,38,0.24),0_14px_30px_rgba(136,38,38,0.22)]",
                              "hover:bg-white/26 hover:scale-[1.05]",
                            ].join(" ")
                          : "text-premium/55 bg-white/10 border border-white/16 cursor-default opacity-75",
                      ].join(" ")}
                    >
                      {isAvailable && (
                        <>
                          <span className="absolute inset-0 -z-10 rounded-full bg-[radial-gradient(circle_at_50%_35%,rgba(136,38,38,0.18),transparent_60%)]" />
                          <span className="absolute -inset-2 -z-20 rounded-full bg-[radial-gradient(circle,rgba(136,38,38,0.25),transparent_60%)] blur-md" />
                        </>
                      )}
                      {day}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-auto pt-4">
          <div className="flex items-center justify-between rounded-2xl bg-white/10 border border-white/18 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_0_6px_rgba(136,38,38,0.12)]" />
            <span className="text-xs text-premium/70">{hasAvailability ? "Fechas disponibles" : "Disponibilidad a confirmar"}</span>
          </div>
          <span className="text-xs text-premium/60">
            {hasAvailability ? Array.from(availableSet).map((d) => String(d).padStart(2, "0")).join(" · ") : "WhatsApp"}
          </span>
          </div>
        </div>
      </div>
    </div>
  )
}
