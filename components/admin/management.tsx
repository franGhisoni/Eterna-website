"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Bot, CalendarCheck, ChevronLeft, ChevronRight, Copy, Download, Hand, MessageSquare, Plus, Save, ShieldCheck, Trash2, UserPlus } from "lucide-react"
import { addDays, formatARS, formatDay, todayAR, weekdayOf } from "@/lib/time"
import { api, ApiError, btnGhost, btnIcon, btnPrimary, btnSmall, chip, field, fieldInline, lbl, panel, shortDate, shortDateTime, type Flash } from "./ui"

/* ───────────── Lista editable genérica (profesionales, equipos, usuarios, preguntas) ───────────── */

type Col = { key: string; label: string; type?: "text" | "longtext" | "bool" | "select" | "password" | "int"; options?: Array<[string, string]>; wide?: boolean; placeholder?: string }

export function RecordList({ entity, title, intro, cols, blank, flash, readOnly, renderExtra }: {
  entity: string
  title: string
  intro?: string
  cols: Col[]
  blank: Record<string, unknown>
  flash: Flash
  readOnly?: boolean
  renderExtra?: (item: Record<string, unknown>) => React.ReactNode
}) {
  const [items, setItems] = useState<Array<Record<string, unknown>> | null>(null)
  const load = useCallback(() => {
    api<{ items: Array<Record<string, unknown>> }>(`/api/admin/data/${entity}`).then((d) => setItems(d.items)).catch(() => flash(`No se pudo cargar: ${title}`, true))
  }, [entity, title, flash])
  useEffect(load, [load])
  const update = (i: number, patch: Record<string, unknown>) => setItems((v) => v?.map((x, j) => (j === i ? { ...x, ...patch } : x)) ?? v)
  const save = async (i: number) => {
    const item = items![i]
    try {
      const r = await api<{ item: Record<string, unknown> }>(`/api/admin/data/${entity}`, { method: item.id ? "PUT" : "POST", body: JSON.stringify(item) })
      setItems((v) => v?.map((x, j) => (j === i ? r.item : x)) ?? v)
      flash("Guardado")
    } catch (e) {
      flash(e instanceof ApiError ? (e.message === "ya_existe" ? "Ya existe uno con ese nombre" : `Revisá los datos (${e.message})`) : "No se pudo guardar", true)
    }
  }
  const remove = async (i: number) => {
    const item = items![i]
    if (!item.id) return setItems((v) => v?.filter((_, j) => j !== i) ?? v)
    if (!confirm("¿Eliminar / dar de baja?")) return
    await api(`/api/admin/data/${entity}?id=${item.id}`, { method: "DELETE" }).catch(() => flash("No se pudo eliminar", true))
    load()
  }
  return (
    <div className={panel}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-serif text-lg font-semibold text-premium">{title}</p>
          {intro && <p className="max-w-3xl text-sm text-premium/60">{intro}</p>}
        </div>
        {!readOnly && <button onClick={() => setItems((v) => [{ ...blank }, ...(v ?? [])])} className={`${btnGhost} h-9`}><Plus className="h-4 w-4" /> Agregar</button>}
      </div>
      {items === null ? (
        <p className="mt-3 text-sm text-premium/60">Cargando…</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-premium/60">Todavía no hay nada cargado.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {items.map((it, i) => (
            <li key={String(it.id ?? `n${i}`)} className="py-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {cols.map((c) => {
                  const v = it[c.key]
                  const cls = c.wide ? "sm:col-span-2 lg:col-span-4" : ""
                  if (c.type === "bool")
                    return (
                      <label key={c.key} className={`flex items-center gap-2 self-end pb-2 text-sm text-premium/70 ${cls}`}>
                        <input type="checkbox" disabled={readOnly} checked={v === true} onChange={(e) => update(i, { [c.key]: e.target.checked })} className="accent-[#882626]" /> {c.label}
                      </label>
                    )
                  if (c.type === "select")
                    return (
                      <label key={c.key} className={`${lbl} ${cls}`}>{c.label}
                        <select disabled={readOnly} value={String(v ?? "")} onChange={(e) => update(i, { [c.key]: e.target.value })} className={`${field} mt-1`}>
                          {c.options!.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                        </select>
                      </label>
                    )
                  if (c.type === "longtext")
                    return (
                      <label key={c.key} className={`${lbl} ${cls || "sm:col-span-2"}`}>{c.label}
                        <textarea disabled={readOnly} rows={3} value={String(v ?? "")} onChange={(e) => update(i, { [c.key]: e.target.value })} placeholder={c.placeholder} className={`${field} mt-1 h-auto py-2`} />
                      </label>
                    )
                  return (
                    <label key={c.key} className={`${lbl} ${cls}`}>{c.label}
                      <input
                        disabled={readOnly}
                        type={c.type === "password" ? "password" : c.type === "int" ? "number" : "text"}
                        value={c.type === "password" ? String(it.password ?? "") : String(v ?? "")}
                        onChange={(e) => update(i, { [c.type === "password" ? "password" : c.key]: c.type === "int" ? Number(e.target.value) : e.target.value })}
                        placeholder={c.type === "password" && it.id ? "Dejar vacío para no cambiarla" : c.placeholder}
                        className={`${field} mt-1`}
                      />
                    </label>
                  )
                })}
              </div>
              {renderExtra?.(it)}
              {!readOnly && (
                <div className="mt-2 flex justify-end gap-2">
                  <button onClick={() => remove(i)} className={`${btnIcon} h-9 w-9 text-destructive`} aria-label="Eliminar"><Trash2 className="h-4 w-4" /></button>
                  <button onClick={() => save(i)} className={`${btnPrimary} h-9`}><Save className="h-4 w-4" /> Guardar</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ───────────── Equipo de trabajo ───────────── */

export function TeamView({ flash }: { flash: Flash }) {
  return (
    <section className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold text-premium">Equipo y equipamiento</h1>
        <p className="text-sm text-premium/60">Las profesionales habilitadas para cada tratamiento y los equipos del centro. El sistema no deja asignar un turno a una profesional dada de baja o no habilitada.</p>
      </div>
      <RecordList
        entity="profesionales"
        title="Profesionales"
        flash={flash}
        blank={{ name: "", phone: "", email: "", specialty: "", treatments: "", active: true, notes: "" }}
        cols={[
          { key: "name", label: "Nombre" },
          { key: "phone", label: "Teléfono" },
          { key: "email", label: "Email" },
          { key: "specialty", label: "Especialidad" },
          { key: "treatments", label: "Tratamientos habilitados (separados por coma; vacío = todos)", wide: true, placeholder: "Depilación Definitiva, HIFU" },
          { key: "active", label: "Activa", type: "bool" },
          { key: "notes", label: "Observaciones", type: "longtext" },
        ]}
      />
      <RecordList
        entity="equipos"
        title="Equipamiento"
        flash={flash}
        intro="El asistente menciona solo los equipos en estado «Operativo»."
        blank={{ name: "", model: "", treatments: "", status: "Operativo", notes: "" }}
        cols={[
          { key: "name", label: "Equipo" },
          { key: "model", label: "Modelo" },
          { key: "treatments", label: "Tratamientos" },
          { key: "status", label: "Estado", type: "select", options: [["Operativo", "Operativo"], ["En mantenimiento", "En mantenimiento"], ["Fuera de servicio", "Fuera de servicio"]] },
          { key: "notes", label: "Observaciones y mantenimiento", type: "longtext", wide: true },
        ]}
      />
    </section>
  )
}

/* ───────────── Jornadas ───────────── */

type RangeRow = { start: string; end: string; professional: string; slotMinutes: number | "" ; gapMinutes: number; published: boolean; notes: string }
type ApiRange = { day: string; start_time: string; end_time: string; professional: string; slot_minutes: number | null; gap_minutes: number; published: boolean; notes: string }
type Block = { id: number; day: string; start_time: string; end_time: string; professional: string; reason: string }

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]
const WEEKDAY_NUM = [1, 2, 3, 4, 5, 6, 0]
const toRow = (r: ApiRange): RangeRow => ({ start: r.start_time, end: r.end_time, professional: r.professional, slotMinutes: r.slot_minutes ?? "", gapMinutes: r.gap_minutes, published: r.published, notes: r.notes })
const newRow = (rows: RangeRow[]): RangeRow => ({ start: rows.length ? "15:00" : "10:00", end: rows.length ? "19:00" : "13:00", professional: "", slotMinutes: "", gapMinutes: 0, published: true, notes: "" })

function RangesEditor({ rows, onChange, professionals }: { rows: RangeRow[]; onChange: (r: RangeRow[]) => void; professionals: string[] }) {
  const set = (i: number, patch: Partial<RangeRow>) => onChange(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  return (
    <div className="space-y-3">
      {rows.map((r, i) => (
        <div key={i} className="rounded-xl border border-premium p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className={lbl}>Desde<input type="time" value={r.start} onChange={(e) => set(i, { start: e.target.value })} className={`${field} mt-1`} /></label>
            <label className={lbl}>Hasta<input type="time" value={r.end} onChange={(e) => set(i, { end: e.target.value })} className={`${field} mt-1`} /></label>
            <label className={`${lbl} col-span-2`}>Profesional
              <select value={r.professional} onChange={(e) => set(i, { professional: e.target.value })} className={`${field} mt-1`}>
                <option value="">Sin asignar (capacidad general)</option>
                {professionals.map((p) => <option key={p}>{p}</option>)}
              </select>
            </label>
            <label className={lbl}>Turno cada (min)<input type="number" min={5} step={5} placeholder="General" value={r.slotMinutes} onChange={(e) => set(i, { slotMinutes: e.target.value === "" ? "" : Number(e.target.value) })} className={`${field} mt-1`} /></label>
            <label className={lbl}>Intervalo entre pacientes<input type="number" min={0} step={5} value={r.gapMinutes} onChange={(e) => set(i, { gapMinutes: Number(e.target.value) })} className={`${field} mt-1`} /></label>
            <label className={`${lbl} col-span-2`}>Observaciones<input value={r.notes} onChange={(e) => set(i, { notes: e.target.value })} className={`${field} mt-1`} placeholder="Ej.: jornada de depilación" /></label>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-premium/70">
              <input type="checkbox" checked={r.published} onChange={(e) => set(i, { published: e.target.checked })} className="accent-[#882626]" /> Publicada para reservas online
            </label>
            <button onClick={() => onChange(rows.filter((_, j) => j !== i))} className={`${btnIcon} h-8 w-8`} aria-label="Quitar franja"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      ))}
      <button onClick={() => onChange([...rows, newRow(rows)])} className={`${btnGhost} h-9 text-xs`}><Plus className="h-3.5 w-3.5" /> Agregar franja</button>
    </div>
  )
}

const toApi = (rows: RangeRow[]) => rows.map((r) => ({ ...r, slotMinutes: r.slotMinutes === "" ? null : r.slotMinutes }))

export function JornadasView({ flash }: { flash: Flash }) {
  const [month, setMonth] = useState(() => todayAR().slice(0, 7))
  const [data, setData] = useState<{ ranges: ApiRange[]; blocks: Block[]; occupancy: Record<string, { taken: number; free: number }> } | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [editing, setEditing] = useState<RangeRow[]>([])
  const [professionals, setProfessionals] = useState<string[]>([])
  const [affected, setAffected] = useState<Array<{ id: string; name: string; starts_at: string; service_name: string; phone: string }>>([])
  const [copyTo, setCopyTo] = useState("")
  const [block, setBlock] = useState({ start_time: "13:00", end_time: "14:00", professional: "", reason: "" })
  const [bulk, setBulk] = useState({ from: todayAR(), to: addDays(todayAR(), 27), weekdays: [3], ranges: [newRow([])] as RangeRow[] })

  const first = `${month}-01`
  const last = addDays(addDays(first, 32).slice(0, 8) + "01", -1)
  const load = useCallback(() => {
    api<NonNullable<typeof data>>(`/api/admin/agenda?desde=${first}&hasta=${last}`).then(setData).catch(() => flash("No se pudo cargar las jornadas", true))
  }, [first, last, flash])
  useEffect(load, [load])
  useEffect(() => {
    api<{ items: Array<{ name: string; active: boolean }> }>("/api/admin/data/profesionales").then((d) => setProfessionals(d.items.filter((p) => p.active).map((p) => p.name))).catch(() => {})
  }, [])

  const byDay = useMemo(() => {
    const m = new Map<string, ApiRange[]>()
    for (const r of data?.ranges ?? []) m.set(r.day, [...(m.get(r.day) ?? []), r])
    return m
  }, [data])

  const select = (d: string) => {
    setSelected(d)
    setEditing((byDay.get(d) ?? []).map(toRow))
    setAffected([])
  }

  const saveDay = async (rows: RangeRow[]) => {
    if (!selected) return
    try {
      const r = await api<{ affected: typeof affected }>("/api/admin/agenda", { method: "PUT", body: JSON.stringify({ day: selected, ranges: toApi(rows) }) })
      setAffected(r.affected)
      setEditing(rows)
      flash(rows.length ? "Jornada guardada: el chat ya ofrece estos horarios" : "Jornada cerrada")
      load()
    } catch (e) {
      flash(e instanceof ApiError && e.message === "horarios_invalidos" ? "Revisá las franjas: el fin debe ser posterior al inicio y una misma profesional no puede tener franjas superpuestas" : "No se pudo guardar", true)
    }
  }

  const duplicate = async () => {
    const days = copyTo.split(/[\s,;]+/).map((x) => x.trim()).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))
    if (!selected || !days.length) return flash("Elegí al menos una fecha destino", true)
    try {
      await api("/api/admin/agenda", { method: "POST", body: JSON.stringify({ copyFrom: selected, to: days }) })
      flash(`Jornada duplicada en ${days.length} días`)
      setCopyTo("")
      load()
    } catch {
      flash("No se pudo duplicar (¿la jornada tiene franjas guardadas?)", true)
    }
  }

  const addBlock = async () => {
    if (!selected) return
    try {
      await api("/api/admin/data/bloqueos", { method: "POST", body: JSON.stringify({ day: selected, ...block }) })
      flash("Horario bloqueado")
      load()
    } catch {
      flash("Revisá el horario del bloqueo", true)
    }
  }
  const removeBlock = async (id: number) => {
    await api(`/api/admin/data/bloqueos?id=${id}`, { method: "DELETE" }).catch(() => flash("No se pudo quitar", true))
    load()
  }

  const applyBulk = async () => {
    try {
      const r = await api<{ days: number }>("/api/admin/agenda", { method: "PUT", body: JSON.stringify({ ...bulk, ranges: toApi(bulk.ranges) }) })
      flash(`Aplicado a ${r.days} días`)
      load()
    } catch {
      flash("Revisá las franjas", true)
    }
  }

  const lead = (weekdayOf(first) + 6) % 7
  const cells: Array<string | null> = [...Array(lead).fill(null)]
  for (let d = first; d <= last; d = addDays(d, 1)) cells.push(d)
  const today = todayAR()
  const monthLabel = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", month: "long", year: "numeric" }).format(new Date(`${first}T12:00:00Z`))
  const shift = (n: number) => {
    const [y, m] = month.split("-").map(Number)
    setMonth(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7))
    setSelected(null)
  }
  const dayBlocks = (data?.blocks ?? []).filter((b) => b.day === selected)

  return (
    <section className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold text-premium">Jornadas y disponibilidad</h1>
        <p className="text-sm text-premium/60">Eterna atiende por jornadas: solo se pueden reservar online los días y franjas publicados acá. Al ocuparse un horario deja de ofrecerse solo.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className={panel}>
          <div className="flex items-center justify-between">
            <button onClick={() => shift(-1)} className={btnIcon} aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" /></button>
            <p className="font-medium text-premium first-letter:uppercase">{monthLabel}</p>
            <button onClick={() => shift(1)} className={btnIcon} aria-label="Mes siguiente"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-xs text-premium/55">{WEEKDAYS.map((w) => <div key={w}>{w}</div>)}</div>
          <div className="mt-2 grid grid-cols-7 gap-1.5">
            {cells.map((d, i) => {
              if (!d) return <div key={`e${i}`} />
              const occ = data?.occupancy[d]
              const has = byDay.has(d)
              const hidden = has && byDay.get(d)!.every((r) => !r.published)
              const pct = occ && occ.taken + occ.free ? Math.round((occ.taken * 100) / (occ.taken + occ.free)) : null
              return (
                <button
                  key={d}
                  onClick={() => select(d)}
                  className={[
                    "flex min-h-[70px] flex-col items-start rounded-lg border p-1.5 text-left transition-premium sm:min-h-[84px] sm:p-2",
                    selected === d ? "border-primary ring-2 ring-primary/15" : "border-premium hover:border-primary/40",
                    has ? (hidden ? "bg-stone-100" : "bg-secondary/60") : "bg-white",
                    d < today ? "opacity-50" : "",
                  ].join(" ")}
                >
                  <span className={`text-sm font-medium ${d === today ? "text-primary" : "text-premium"}`}>{Number(d.slice(8))}</span>
                  {(byDay.get(d) ?? []).map((r) => (
                    <span key={`${r.start_time}${r.professional}`} className="mt-0.5 hidden text-[10px] leading-tight text-primary sm:block">{r.start_time}–{r.end_time}{r.professional ? ` · ${r.professional.split(" ")[0]}` : ""}</span>
                  ))}
                  {pct !== null && has && <span className="mt-auto text-[10px] text-premium/60">{occ!.taken} tomados · {pct}%</span>}
                  {hidden && <span className="text-[10px] text-premium/50">oculta</span>}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className={panel}>
            {selected ? (
              <>
                <p className="font-medium text-premium">{formatDay(selected)}</p>
                {data?.occupancy[selected] && <p className="mb-2 text-xs text-premium/60">{data.occupancy[selected].taken} turnos tomados · {data.occupancy[selected].free} horarios libres</p>}
                <RangesEditor rows={editing} onChange={setEditing} professionals={professionals} />
                <div className="mt-4 flex flex-wrap gap-2">
                  <button onClick={() => saveDay(editing)} className={btnPrimary}><Save className="h-4 w-4" /> Guardar jornada</button>
                  <button onClick={() => confirm("¿Cerrar la agenda de este día? Los turnos ya tomados no se borran: te mostramos cuáles hay que reprogramar.") && saveDay([])} className={btnGhost}>Cerrar día</button>
                </div>
                {affected.length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <p className="font-medium">Turnos a reprogramar ({affected.length}):</p>
                    <ul className="mt-1 space-y-0.5">
                      {affected.map((a) => (
                        <li key={a.id}>· {a.name} — {shortDateTime(a.starts_at)} · {a.service_name} {a.phone && <a className="underline" target="_blank" rel="noreferrer" href={`https://wa.me/${a.phone.replace(/\D/g, "").replace(/^(?!54)/, "549")}`}>WhatsApp</a>}</li>
                      ))}
                    </ul>
                    <p className="mt-1 text-xs">Reprogramalos desde la Agenda («Editar / reprogramar»): el historial conserva la fecha anterior.</p>
                  </div>
                )}
                <div className="mt-4 border-t border-border pt-3">
                  <p className="text-sm font-medium text-premium">Duplicar esta jornada</p>
                  <input value={copyTo} onChange={(e) => setCopyTo(e.target.value)} placeholder="Fechas: 2026-12-02, 2026-12-09" className={`${field} mt-1`} />
                  <button onClick={duplicate} className={`${btnGhost} mt-2 h-9`}><Copy className="h-4 w-4" /> Duplicar</button>
                </div>
                <div className="mt-4 border-t border-border pt-3">
                  <p className="text-sm font-medium text-premium">Bloquear horarios</p>
                  {dayBlocks.map((b) => (
                    <p key={b.id} className="mt-1 flex items-center justify-between text-sm text-premium/75">
                      {b.start_time}–{b.end_time}{b.professional ? ` · ${b.professional}` : ""}{b.reason ? ` · ${b.reason}` : ""}
                      <button onClick={() => removeBlock(b.id)} className="text-xs text-destructive hover:underline">Quitar</button>
                    </p>
                  ))}
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <input type="time" value={block.start_time} onChange={(e) => setBlock({ ...block, start_time: e.target.value })} className={field} aria-label="Desde" />
                    <input type="time" value={block.end_time} onChange={(e) => setBlock({ ...block, end_time: e.target.value })} className={field} aria-label="Hasta" />
                    <select value={block.professional} onChange={(e) => setBlock({ ...block, professional: e.target.value })} className={`${field} col-span-2`} aria-label="Profesional">
                      <option value="">Todas</option>
                      {professionals.map((p) => <option key={p}>{p}</option>)}
                    </select>
                    <input value={block.reason} onChange={(e) => setBlock({ ...block, reason: e.target.value })} placeholder="Motivo" className={`${field} col-span-2`} />
                  </div>
                  <button onClick={addBlock} className={`${btnGhost} mt-2 h-9`}>Bloquear</button>
                </div>
              </>
            ) : (
              <p className="text-sm text-premium/60">Elegí un día del calendario para abrir, editar, duplicar o cerrar su jornada.</p>
            )}
          </div>

          <div className={panel}>
            <p className="font-medium text-premium">Repetir horarios</p>
            <p className="mb-3 text-xs text-premium/55">Aplica las mismas franjas a varios días. Reemplaza lo que ya haya en esos días.</p>
            <div className="grid grid-cols-2 gap-2">
              <label className={lbl}>Desde<input type="date" value={bulk.from} onChange={(e) => setBulk({ ...bulk, from: e.target.value })} className={`${field} mt-1`} /></label>
              <label className={lbl}>Hasta<input type="date" value={bulk.to} onChange={(e) => setBulk({ ...bulk, to: e.target.value })} className={`${field} mt-1`} /></label>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {WEEKDAYS.map((w, i) => {
                const n = WEEKDAY_NUM[i]
                const on = bulk.weekdays.includes(n)
                return (
                  <button key={w} onClick={() => setBulk({ ...bulk, weekdays: on ? bulk.weekdays.filter((x) => x !== n) : [...bulk.weekdays, n] })} className={`h-8 rounded-full border px-3 text-xs ${on ? "border-primary bg-primary text-primary-foreground" : "border-premium bg-white text-premium/70"}`}>{w}</button>
                )
              })}
            </div>
            <div className="mt-3"><RangesEditor rows={bulk.ranges} onChange={(r) => setBulk({ ...bulk, ranges: r })} professionals={professionals} /></div>
            <button onClick={applyBulk} disabled={!bulk.weekdays.length} className={`${btnPrimary} mt-4 w-full`}>Aplicar</button>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ───────────── Bandeja de conversaciones ───────────── */

type Conversation = {
  id: string
  contact_name: string
  phone: string
  patient_id: number | null
  status: string
  topic: string
  interest: string
  booked: boolean
  needs_followup: boolean
  human: boolean
  notes: string
  last_message: string
  last_at: string
  created_at: string
  messages_count: number
  flagged_count: number
}
type Msg = { id: number; role: "user" | "assistant" | "staff"; text: string; card: { type: string; rows?: Array<[string, string]>; title?: string; service?: string } | null; author: string; flagged: boolean; correction: string; created_at: string }

const CONV_STATUS: Record<string, string> = {
  nueva: "Nueva consulta",
  en_conversacion: "En conversación",
  pendiente: "Pendiente de respuesta",
  interesada: "Interesada",
  turno_reservado: "Turno reservado",
  derivada: "Derivada a administración",
  cerrada: "Cerrada",
}

export function InboxView({ flash, onPatient }: { flash: Flash; onPatient: (id: number) => void }) {
  const [list, setList] = useState<Conversation[] | null>(null)
  const [filter, setFilter] = useState({ estado: "", q: "", seguimiento: false })
  const [open, setOpen] = useState<{ conversation: Conversation; messages: Msg[] } | null>(null)
  const [reply, setReply] = useState("")
  const [fixing, setFixing] = useState<{ id: number; text: string } | null>(null)
  const [newPatient, setNewPatient] = useState({ name: "", phone: "" })

  const load = useCallback(() => {
    const qs = new URLSearchParams({ ...(filter.estado && { estado: filter.estado }), ...(filter.q && { q: filter.q }), ...(filter.seguimiento && { seguimiento: "1" }) })
    api<{ conversations: Conversation[] }>(`/api/admin/conversations?${qs}`).then((d) => setList(d.conversations)).catch(() => flash("No se pudo cargar la bandeja", true))
  }, [filter, flash])
  useEffect(load, [load])

  const openConv = useCallback(async (id: string) => {
    const d = await api<{ conversation: Conversation; messages: Msg[] }>(`/api/admin/conversations?id=${id}`)
    setOpen(d)
    setNewPatient({ name: d.conversation.contact_name, phone: d.conversation.phone })
  }, [])
  useEffect(() => {
    if (!open?.conversation.human) return
    const t = setInterval(() => openConv(open.conversation.id).catch(() => {}), 5000)
    return () => clearInterval(t)
  }, [open?.conversation.id, open?.conversation.human, openConv])

  const act = async (body: Record<string, unknown>, ok: string) => {
    if (!open) return
    try {
      const d = await api<{ conversation: Conversation; messages: Msg[] }>("/api/admin/conversations", { method: "PATCH", body: JSON.stringify({ id: open.conversation.id, ...body }) })
      setOpen(d)
      flash(ok)
      load()
    } catch (e) {
      flash(e instanceof ApiError && e.message === "faltan_datos" ? "Faltan nombre o teléfono" : "No se pudo actualizar", true)
    }
  }

  const createTask = async () => {
    if (!open) return
    const c = open.conversation
    await api("/api/admin/data/tareas", {
      method: "POST",
      body: JSON.stringify({ title: `Seguimiento: ${c.contact_name || "consulta del chat"}`, description: c.interest ? `Consultó por ${c.interest}` : c.last_message, kind: "comercial", conversation_id: c.id, patient_id: c.patient_id, due_on: todayAR() }),
    })
      .then(() => flash("Tarea creada"))
      .catch(() => flash("No se pudo crear la tarea", true))
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-premium">Conversaciones</h1>
          <p className="text-sm text-premium/60">Lo que el asistente habla con las personas. Podés tomar la conversación, responder a mano y corregir respuestas para que no se repitan.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <input value={filter.q} onChange={(e) => setFilter({ ...filter, q: e.target.value })} placeholder="Buscar…" className={`${fieldInline} h-9 w-44`} />
          <select value={filter.estado} onChange={(e) => setFilter({ ...filter, estado: e.target.value })} className={`${fieldInline} h-9`}>
            <option value="">Todos los estados</option>
            {Object.entries(CONV_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-premium/70"><input type="checkbox" checked={filter.seguimiento} onChange={(e) => setFilter({ ...filter, seguimiento: e.target.checked })} className="accent-[#882626]" /> Necesitan seguimiento</label>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className={`${panel} max-h-[75vh] overflow-y-auto p-0 sm:p-0`}>
          {list === null ? (
            <p className="p-4 text-sm text-premium/60">Cargando…</p>
          ) : list.length === 0 ? (
            <p className="p-4 text-sm text-premium/60">No hay conversaciones.</p>
          ) : (
            <ul className="divide-y divide-border">
              {list.map((c) => (
                <li key={c.id}>
                  <button onClick={() => openConv(c.id)} className={`w-full px-4 py-3 text-left hover:bg-secondary/40 ${open?.conversation.id === c.id ? "bg-secondary/50" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-medium text-premium">{c.contact_name || "Sin nombre"}</p>
                      <p className="shrink-0 text-[11px] text-premium/50">{shortDateTime(c.last_at)}</p>
                    </div>
                    <p className="truncate text-xs text-premium/60">{c.last_message}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span className={`${chip} border-premium text-[10px] text-premium/70`}>{CONV_STATUS[c.status] ?? c.status}</span>
                      {c.booked && <span className={`${chip} border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700`}>Reservó</span>}
                      {c.human && <span className={`${chip} border-sky-200 bg-sky-50 text-[10px] text-sky-700`}>Atiende el equipo</span>}
                      {c.interest && <span className="text-[10px] text-premium/50">{c.interest}</span>}
                      {c.flagged_count > 0 && <span className="text-[10px] text-destructive">{c.flagged_count} corregidas</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {open ? (
          <div className={`${panel} space-y-4`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-serif text-lg font-semibold text-premium">{open.conversation.contact_name || "Sin nombre"}</p>
                <p className="text-sm text-premium/60">
                  {open.conversation.phone || "sin teléfono"} · iniciada {shortDateTime(open.conversation.created_at)}
                  {open.conversation.interest && ` · interés: ${open.conversation.interest}`}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select value={open.conversation.status} onChange={(e) => act({ status: e.target.value }, "Estado actualizado")} className={`${fieldInline} h-9`}>
                  {Object.entries(CONV_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                {open.conversation.human ? (
                  <button onClick={() => act({ human: false }, "El asistente vuelve a responder")} className={`${btnGhost} h-9`}><Bot className="h-4 w-4" /> Devolver al asistente</button>
                ) : (
                  <button onClick={() => act({ human: true }, "Tomaste la conversación: el asistente deja de responder")} className={`${btnGhost} h-9`}><Hand className="h-4 w-4" /> Tomar control</button>
                )}
                <button onClick={createTask} className={`${btnGhost} h-9`}><Plus className="h-4 w-4" /> Tarea</button>
              </div>
            </div>

            <div className="max-h-[48vh] space-y-2 overflow-y-auto rounded-xl border border-premium bg-premium-light/50 p-3">
              {open.messages.map((m) => (
                <div key={m.id} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
                  <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-primary text-primary-foreground" : m.role === "staff" ? "border border-sky-200 bg-sky-50 text-premium" : "border border-premium bg-white text-premium"} ${m.flagged ? "ring-2 ring-red-200" : ""}`}>
                    {m.text || (m.card ? <span className="italic text-premium/60">[{m.card.type === "slots" ? `horarios de ${m.card.service}` : m.card.type === "services" ? `lista de servicios: ${m.card.title}` : m.card.type === "payment" ? "reserva con seña" : m.card.type === "confirmed" ? "turno confirmado" : m.card.type}]</span> : "")}
                  </div>
                  <p className="mt-0.5 text-[10px] text-premium/45">
                    {m.role === "staff" ? `Equipo · ${m.author}` : m.role === "assistant" ? "Asistente" : "Persona"} · {shortDateTime(m.created_at)}
                    {m.role === "assistant" && m.text && !m.flagged && <button onClick={() => setFixing({ id: m.id, text: "" })} className="ml-2 text-primary hover:underline">Corregir</button>}
                  </p>
                  {m.flagged && <p className="max-w-[85%] text-[11px] text-destructive">Corrección guardada: {m.correction}</p>}
                  {fixing?.id === m.id && (
                    <div className="mt-1 w-full max-w-[85%] space-y-1">
                      <textarea rows={3} value={fixing.text} onChange={(e) => setFixing({ ...fixing, text: e.target.value })} placeholder="¿Cuál debería haber sido la respuesta?" className={`${field} h-auto py-2`} />
                      <p className="text-[11px] text-premium/55">Se guarda como pregunta frecuente y el asistente la usa desde la próxima conversación. Las correcciones no cambian precios ni políticas: eso se edita en su sección.</p>
                      <div className="flex gap-2">
                        <button onClick={() => { act({ correct: { messageId: m.id, text: fixing.text } }, "Corrección guardada en la base de conocimiento"); setFixing(null) }} className={`${btnPrimary} h-8`}>Guardar corrección</button>
                        <button onClick={() => setFixing(null)} className={`${btnGhost} h-8`}>Cancelar</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === "Enter" && reply.trim() && (act({ reply }, "Respuesta enviada"), setReply(""))} placeholder="Responder como equipo de Eterna…" className={field} />
              <button onClick={() => { act({ reply }, "Respuesta enviada"); setReply("") }} disabled={!reply.trim()} className={btnPrimary}><MessageSquare className="h-4 w-4" /> Enviar</button>
            </div>
            <p className="text-xs text-premium/50">Al responder a mano tomás la conversación: la persona ve tu mensaje en el chat y el asistente no responde hasta que se la devuelvas.</p>

            <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-premium">Paciente</p>
                {open.conversation.patient_id ? (
                  <button onClick={() => onPatient(open.conversation.patient_id!)} className={`${btnGhost} mt-1 h-9`}>Ver ficha</button>
                ) : (
                  <div className="mt-1 space-y-1.5">
                    <input value={newPatient.name} onChange={(e) => setNewPatient({ ...newPatient, name: e.target.value })} placeholder="Nombre y apellido" className={field} />
                    <input value={newPatient.phone} onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })} placeholder="WhatsApp" className={field} />
                    <button onClick={() => act({ patient: newPatient }, "Paciente creado y vinculado")} className={`${btnGhost} h-9`}><UserPlus className="h-4 w-4" /> Crear paciente</button>
                  </div>
                )}
              </div>
              <label className={lbl}>Observaciones internas
                <textarea rows={4} defaultValue={open.conversation.notes} key={open.conversation.id} onBlur={(e) => e.target.value !== open.conversation.notes && act({ notes: e.target.value }, "Observación guardada")} className={`${field} mt-1 h-auto py-2`} />
                <label className="mt-1 flex items-center gap-2 text-sm text-premium/70">
                  <input type="checkbox" checked={open.conversation.needs_followup} onChange={(e) => act({ needs_followup: e.target.checked }, "Actualizado")} className="accent-[#882626]" /> Necesita seguimiento
                </label>
              </label>
            </div>
          </div>
        ) : (
          <div className={panel}><p className="text-sm text-premium/60">Elegí una conversación para leerla.</p></div>
        )}
      </div>
    </section>
  )
}

/* ───────────── Tareas ───────────── */

type Task = { id: number; title: string; description: string; kind: string; patient_id: number | null; booking_id: string | null; conversation_id: string | null; assignee: string; due_on: string | null; done: boolean; comments: Array<{ text: string; by: string; at: string }>; created_by: string; created_at: string }

export function TasksView({ flash, onPatient }: { flash: Flash; onPatient: (id: number) => void }) {
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [show, setShow] = useState<"pendientes" | "hechas" | "todas">("pendientes")
  const [draft, setDraft] = useState({ title: "", description: "", assignee: "", due_on: todayAR() })
  const [comment, setComment] = useState<Record<number, string>>({})
  const [team, setTeam] = useState<string[]>([])

  const load = useCallback(() => {
    api<{ items: Task[] }>("/api/admin/data/tareas").then((d) => setTasks(d.items)).catch(() => flash("No se pudieron cargar las tareas", true))
  }, [flash])
  useEffect(() => {
    // al abrir, el sistema genera los seguimientos pendientes según las reglas configuradas
    api("/api/admin/insights?vista=panel").catch(() => {}).finally(load)
    api<{ items: Array<{ name: string; active: boolean }> }>("/api/admin/data/profesionales").then((d) => setTeam(d.items.filter((p) => p.active).map((p) => p.name))).catch(() => {})
  }, [load])

  const save = async (t: Partial<Task> & { comment?: string }) => {
    try {
      await api("/api/admin/data/tareas", { method: t.id ? "PUT" : "POST", body: JSON.stringify(t) })
      load()
    } catch {
      flash("No se pudo guardar la tarea", true)
    }
  }
  const visible = (tasks ?? []).filter((t) => (show === "todas" ? true : show === "hechas" ? t.done : !t.done))
  const overdue = (t: Task) => !t.done && t.due_on && t.due_on < todayAR()

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-premium">Tareas y seguimientos</h1>
          <p className="text-sm text-premium/60">Las tareas con origen «sistema» se crean solas según las reglas de Configuración (señas, confirmaciones, saldos, tratamientos sin continuar, consultas sin reserva). Nunca se envían mensajes automáticos.</p>
        </div>
        <select value={show} onChange={(e) => setShow(e.target.value as typeof show)} className={`${fieldInline} h-9`}>
          <option value="pendientes">Pendientes</option>
          <option value="hechas">Completadas</option>
          <option value="todas">Todas</option>
        </select>
      </div>
      <div className={`${panel} grid gap-2 sm:grid-cols-[1fr_1fr_160px_150px_auto]`}>
        <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Nueva tarea…" className={field} />
        <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Descripción" className={field} />
        <input list="team-list" value={draft.assignee} onChange={(e) => setDraft({ ...draft, assignee: e.target.value })} placeholder="Responsable" className={field} />
        <datalist id="team-list">{team.map((p) => <option key={p} value={p} />)}</datalist>
        <input type="date" value={draft.due_on} onChange={(e) => setDraft({ ...draft, due_on: e.target.value })} className={field} />
        <button onClick={() => draft.title.trim() && save(draft).then(() => setDraft({ title: "", description: "", assignee: "", due_on: todayAR() }))} className={btnPrimary}><Plus className="h-4 w-4" /> Crear</button>
      </div>
      <div className={panel}>
        {tasks === null ? (
          <p className="text-sm text-premium/60">Cargando…</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-premium/60">No hay tareas.</p>
        ) : (
          <ul className="divide-y divide-border">
            {visible.map((t) => (
              <li key={t.id} className="flex gap-3 py-3">
                <input type="checkbox" checked={t.done} onChange={(e) => save({ id: t.id, done: e.target.checked })} className="mt-1 h-4 w-4 accent-[#882626]" aria-label="Completada" />
                <div className="min-w-0 flex-1">
                  <p className={`font-medium ${t.done ? "text-premium/45 line-through" : "text-premium"}`}>{t.title}</p>
                  {t.description && <p className="text-sm text-premium/65">{t.description}</p>}
                  <p className="mt-0.5 text-xs text-premium/50">
                    {t.due_on && <span className={overdue(t) ? "font-medium text-destructive" : ""}>Vence {shortDate(`${t.due_on}T12:00:00-03:00`)} · </span>}
                    {t.assignee ? `Responsable: ${t.assignee}` : "Sin responsable"} · Origen: {t.created_by}
                    {t.patient_id && <> · <button onClick={() => onPatient(t.patient_id!)} className="text-primary hover:underline">ver paciente</button></>}
                  </p>
                  {t.comments.map((c, i) => <p key={i} className="mt-1 text-xs text-premium/70">💬 {c.text} <span className="text-premium/40">— {c.by}, {shortDateTime(c.at)}</span></p>)}
                  <div className="mt-1 flex gap-2">
                    <input value={comment[t.id] ?? ""} onChange={(e) => setComment({ ...comment, [t.id]: e.target.value })} placeholder="Agregar comentario" className={`${fieldInline} h-8 flex-1 text-xs`} />
                    <button onClick={() => comment[t.id]?.trim() && save({ id: t.id, comment: comment[t.id] }).then(() => setComment({ ...comment, [t.id]: "" }))} className={btnSmall}>Comentar</button>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <input list="team-list" defaultValue={t.assignee} onBlur={(e) => e.target.value !== t.assignee && save({ id: t.id, assignee: e.target.value })} placeholder="Responsable" className={`${fieldInline} h-8 w-36 text-xs`} />
                  <input type="date" defaultValue={t.due_on ?? ""} onBlur={(e) => e.target.value !== (t.due_on ?? "") && save({ id: t.id, due_on: e.target.value || null })} className={`${fieldInline} h-8 w-36 text-xs`} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/* ───────────── Reportes ───────────── */

type Reports = {
  summary: Record<string, number>
  byDay: Array<Record<string, string | number>>
  byTreatment: Array<Record<string, string | number>>
  byProfessional: Array<Record<string, string | number>>
  byPromo: Array<Record<string, string | number>>
  byMethod: Array<Record<string, string | number>>
  monthly: Array<Record<string, string | number>>
  commercial: Record<string, number>
  topServices: Array<Record<string, string | number>>
  byHour: Array<Record<string, string | number>>
  occupancy: Array<Record<string, string | number>>
}

const MONEY = new Set(["vendido", "cobrado", "descuento"])

function ReportTable({ title, rows, section, from, to, bar }: { title: string; rows: Array<Record<string, string | number>>; section: string; from: string; to: string; bar?: string }) {
  const max = bar ? Math.max(1, ...rows.map((r) => Number(r[bar]) || 0)) : 1
  return (
    <div className={panel}>
      <div className="flex items-center justify-between gap-2">
        <p className="font-medium text-premium">{title}</p>
        <a href={`/api/admin/insights?vista=reportes&desde=${from}&hasta=${to}&seccion=${section}&formato=csv`} className={btnSmall}><Download className="h-3.5 w-3.5" /> CSV</a>
      </div>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-premium/60">Sin datos en el período.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-premium/55">
              <tr>{Object.keys(rows[0]).map((k) => <th key={k} className="px-2 py-1.5 font-medium capitalize">{k.replace(/_/g, " ")}</th>)}{bar && <th />}</tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r, i) => (
                <tr key={i}>
                  {Object.entries(r).map(([k, v]) => <td key={k} className="px-2 py-1.5 text-premium/80">{MONEY.has(k) ? formatARS(Number(v)) : k === "ocupacion" ? `${v}%` : String(v)}</td>)}
                  {bar && <td className="w-1/4 px-2"><div className="h-2 rounded-full bg-primary/70" style={{ width: `${(Number(r[bar]) * 100) / max}%` }} /></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function ReportsView({ flash }: { flash: Flash }) {
  const [from, setFrom] = useState(`${todayAR().slice(0, 7)}-01`)
  const [to, setTo] = useState(todayAR())
  const [r, setR] = useState<Reports | null>(null)
  useEffect(() => {
    setR(null)
    api<Reports>(`/api/admin/insights?vista=reportes&desde=${from}&hasta=${to}`).then(setR).catch(() => flash("No se pudieron cargar los reportes", true))
  }, [from, to, flash])
  const preset = (kind: "mes" | "anterior" | "anio") => {
    const t = todayAR()
    if (kind === "mes") return (setFrom(`${t.slice(0, 7)}-01`), setTo(t))
    if (kind === "anio") return (setFrom(`${t.slice(0, 4)}-01-01`), setTo(t))
    const firstThis = `${t.slice(0, 7)}-01`
    const lastPrev = addDays(firstThis, -1)
    setFrom(`${lastPrev.slice(0, 7)}-01`)
    setTo(lastPrev)
  }
  const s = r?.summary
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold text-premium">Reportes</h1>
          <p className="text-sm text-premium/60">Calculados con los turnos y pagos reales. «Vendido» es lo acordado en turnos firmes; «cobrado» es el dinero efectivamente registrado.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => preset("mes")} className={btnSmall}>Este mes</button>
          <button onClick={() => preset("anterior")} className={btnSmall}>Mes anterior</button>
          <button onClick={() => preset("anio")} className={btnSmall}>Este año</button>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${fieldInline} h-9`} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${fieldInline} h-9`} />
        </div>
      </div>
      {!r || !s ? (
        <p className="text-sm text-premium/60">Calculando…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              ["Vendido", formatARS(s.sold)],
              ["Cobrado", formatARS(s.collected)],
              ["Pendiente de cobro", formatARS(s.pending)],
              ["Turnos", String(s.bookings)],
              ["Pacientes nuevos", String(s.new_patients)],
              ["Cancelaciones", String(s.cancelled)],
              ["Ausencias", String(s.no_show)],
              ["Conversión chat → reserva", `${r.commercial.conversion}% (${r.commercial.consultas_con_reserva}/${r.commercial.consultas})`],
            ].map(([k, v]) => (
              <div key={k} className={`${panel} p-4 sm:p-4`}><p className="text-xs text-premium/55">{k}</p><p className="mt-1 font-serif text-xl font-semibold text-premium">{v}</p></div>
            ))}
          </div>
          <ReportTable title="Evolución mensual (últimos 12 meses)" rows={r.monthly} section="monthly" from={from} to={to} bar="cobrado" />
          <div className="grid gap-4 lg:grid-cols-2">
            <ReportTable title="Ingresos por jornada" rows={r.byDay} section="byDay" from={from} to={to} bar="vendido" />
            <ReportTable title="Ocupación por jornada" rows={r.occupancy} section="occupancy" from={from} to={to} bar="ocupacion" />
            <ReportTable title="Ingresos por tratamiento" rows={r.byTreatment} section="byTreatment" from={from} to={to} bar="vendido" />
            <ReportTable title="Por profesional" rows={r.byProfessional} section="byProfessional" from={from} to={to} bar="turnos" />
            <ReportTable title="Promociones" rows={r.byPromo} section="byPromo" from={from} to={to} bar="usos" />
            <ReportTable title="Cobrado por medio de pago" rows={r.byMethod} section="byMethod" from={from} to={to} bar="cobrado" />
            <ReportTable title="Servicios más solicitados" rows={r.topServices} section="topServices" from={from} to={to} bar="turnos" />
            <ReportTable title="Horarios más solicitados" rows={r.byHour} section="byHour" from={from} to={to} bar="turnos" />
          </div>
          <div className={panel}>
            <p className="font-medium text-premium">Comercial</p>
            <p className="mt-1 text-sm text-premium/75">
              Reservas por chat: {r.commercial.reservas_chat} · por la web: {r.commercial.reservas_web} · cargadas por el equipo: {r.commercial.reservas_admin} · pacientes recurrentes (2+ sesiones): {r.commercial.recurrentes} · reprogramaciones: {s.rescheduled}
            </p>
          </div>
        </>
      )}
    </section>
  )
}

/* ───────────── Usuarios, auditoría y respaldo ───────────── */

export function SecurityView({ flash }: { flash: Flash }) {
  const [log, setLog] = useState<Array<{ id: number; entity: string; entity_id: string; action: string; before: unknown; after: unknown; actor: string; created_at: string }> | null>(null)
  const [entity, setEntity] = useState("")
  const [q, setQ] = useState("")
  const [openRow, setOpenRow] = useState<number | null>(null)
  useEffect(() => {
    const qs = new URLSearchParams({ vista: "auditoria", ...(entity && { entidad: entity }), ...(q && { q }) })
    api<{ items: NonNullable<typeof log> }>(`/api/admin/insights?${qs}`).then((d) => setLog(d.items)).catch(() => flash("No se pudo cargar la auditoría", true))
  }, [entity, q, flash])
  return (
    <section className="space-y-4">
      <div>
        <h1 className="font-serif text-2xl font-bold text-premium">Usuarios y seguridad</h1>
        <p className="text-sm text-premium/60">Quién entra al panel y qué puede hacer, el registro de cambios y la copia de seguridad.</p>
      </div>
      <RecordList
        entity="usuarios"
        title="Usuarios del panel"
        intro="Administración principal: todo. Recepción: agenda, jornadas, pacientes, pagos, conversaciones y tareas; ve servicios y promociones sin modificarlos. Profesional: solo su agenda, ver pacientes y cargar observaciones de sus sesiones. El usuario configurado en el servidor siempre entra como administración principal."
        flash={flash}
        blank={{ username: "", name: "", role: "recepcion", password: "", professional: "", active: true }}
        cols={[
          { key: "username", label: "Usuario" },
          { key: "name", label: "Nombre" },
          { key: "role", label: "Rol", type: "select", options: [["owner", "Administración principal"], ["recepcion", "Administración / recepción"], ["profesional", "Profesional"]] },
          { key: "password_hash", label: "Contraseña (mín. 8)", type: "password" },
          { key: "professional", label: "Profesional asociada (para el rol Profesional)" },
          { key: "active", label: "Activo", type: "bool" },
        ]}
      />
      <div className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 font-medium text-premium"><ShieldCheck className="h-4 w-4" /> Copia de seguridad</p>
          <a href="/api/admin/insights?vista=respaldo" className={btnGhost}><Download className="h-4 w-4" /> Descargar respaldo completo (JSON)</a>
        </div>
        <p className="mt-1 text-sm text-premium/60">Incluye pacientes, turnos, pagos, promociones, servicios, jornadas, conversaciones, tareas y auditoría. Guardalo en un lugar seguro: contiene datos personales. Además conviene activar los respaldos automáticos de la base en Railway.</p>
      </div>
      <div className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium text-premium">Registro de actividad</p>
          <div className="flex gap-2">
            <select value={entity} onChange={(e) => setEntity(e.target.value)} className={`${fieldInline} h-9`}>
              <option value="">Todo</option>
              {["turno", "pago", "paciente", "servicio", "promocion", "jornada", "conversacion", "tarea", "usuario", "profesional", "acceso"].map((x) => <option key={x}>{x}</option>)}
            </select>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Usuario o acción" className={`${fieldInline} h-9 w-40`} />
          </div>
        </div>
        {log === null ? (
          <p className="mt-2 text-sm text-premium/60">Cargando…</p>
        ) : (
          <ul className="mt-2 divide-y divide-border text-sm">
            {log.map((l) => (
              <li key={l.id} className="py-2">
                <button onClick={() => setOpenRow(openRow === l.id ? null : l.id)} className="flex w-full flex-wrap gap-x-3 text-left">
                  <span className="text-premium/50">{shortDateTime(l.created_at)}</span>
                  <span className="font-medium text-premium">{l.actor}</span>
                  <span className="text-premium/80">{l.action} {l.entity}</span>
                  <span className="truncate text-premium/45">{l.entity_id}</span>
                </button>
                {openRow === l.id && (
                  <div className="mt-1 grid gap-2 text-xs sm:grid-cols-2">
                    <pre className="overflow-x-auto rounded bg-stone-50 p-2">Antes: {JSON.stringify(l.before, null, 1)}</pre>
                    <pre className="overflow-x-auto rounded bg-stone-50 p-2">Después: {JSON.stringify(l.after, null, 1)}</pre>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/* ───────────── Indicadores del período y alertas (para Inicio) ───────────── */

type Panel = {
  alerts: { promosExpiring: Array<{ id: number; title: string; ends_on: string }>; inactivePatients: Array<{ id: number; name: string; last: string }>; withoutNextSession: Array<{ id: number; name: string }>; partialPayments: Array<{ id: string; name: string; balance: number }>; incompleteProfiles: Array<{ id: number; name: string }>; freeSlotsNextWeek: number }
  metrics: Record<string, number>
  followUpsCreated: number
}

export function PeriodPanel({ flash, onPatient, go }: { flash: Flash; onPatient: (id: number) => void; go: (tab: string) => void }) {
  const [range, setRange] = useState<"dia" | "semana" | "mes" | "custom">("mes")
  const [custom, setCustom] = useState({ from: `${todayAR().slice(0, 7)}-01`, to: todayAR() })
  const [d, setD] = useState<Panel | null>(null)
  const t = todayAR()
  const period =
    range === "dia" ? { from: t, to: t }
    : range === "semana" ? { from: addDays(t, -((weekdayOf(t) + 6) % 7)), to: addDays(t, 6 - ((weekdayOf(t) + 6) % 7)) }
    : range === "mes" ? { from: `${t.slice(0, 7)}-01`, to: addDays(addDays(`${t.slice(0, 7)}-01`, 32).slice(0, 8) + "01", -1) }
    : custom
  useEffect(() => {
    api<Panel>(`/api/admin/insights?vista=panel&desde=${period.from}&hasta=${period.to}`).then(setD).catch(() => flash("No se pudieron cargar los indicadores", true))
  }, [period.from, period.to, flash])
  if (!d) return null
  const m = d.metrics
  const names = (xs: Array<{ id: number; name: string }>) =>
    xs.slice(0, 8).map((x, i) => (
      <span key={x.id}>{i > 0 && ", "}<button onClick={() => onPatient(x.id)} className="text-primary hover:underline">{x.name}</button></span>
    ))
  const a = d.alerts
  return (
    <div className="space-y-4">
      <div className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium text-premium">Indicadores del período</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {(["dia", "semana", "mes", "custom"] as const).map((k) => (
              <button key={k} onClick={() => setRange(k)} className={`h-8 rounded-md px-3 text-xs ${range === k ? "bg-primary text-primary-foreground" : "border border-premium text-premium/70"}`}>
                {{ dia: "Hoy", semana: "Semana", mes: "Mes", custom: "Personalizado" }[k]}
              </button>
            ))}
            {range === "custom" && (
              <>
                <input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} className={`${fieldInline} h-8 text-xs`} />
                <input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} className={`${fieldInline} h-8 text-xs`} />
              </>
            )}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
          {[
            ["Turnos", m.bookings],
            ["Sin confirmar", m.pending_confirmation],
            ["Cancelados", m.cancelled],
            ["Reprogramados", m.rescheduled],
            ["Ausentes", m.no_show],
            ["Pacientes activos", m.active_patients],
            ["Pacientes nuevos", m.new_patients],
            ["Vendido", formatARS(m.sold)],
            ["Cobrado", formatARS(m.collected)],
            ["Horarios libres próximos 7 días", a.freeSlotsNextWeek],
          ].map(([k, v]) => (
            <div key={String(k)} className="rounded-xl border border-premium bg-premium-light/60 p-3">
              <p className="text-[11px] text-premium/55">{k}</p>
              <p className="mt-0.5 font-medium text-premium">{v}</p>
            </div>
          ))}
        </div>
      </div>
      {(a.promosExpiring.length > 0 || a.inactivePatients.length > 0 || a.withoutNextSession.length > 0 || a.partialPayments.length > 0 || a.incompleteProfiles.length > 0) && (
        <div className={`${panel} space-y-1.5 text-sm text-premium/80`}>
          <p className="flex items-center gap-2 font-medium text-premium"><CalendarCheck className="h-4 w-4 text-primary" /> Alertas administrativas</p>
          {a.promosExpiring.length > 0 && <p>· Promociones por vencer: {a.promosExpiring.map((p) => `${p.title} (${p.ends_on})`).join(", ")} <button onClick={() => go("promos")} className="text-primary hover:underline">ver</button></p>}
          {a.withoutNextSession.length > 0 && <p>· Con sesiones y sin fecha para continuar ({a.withoutNextSession.length}): {names(a.withoutNextSession)}</p>}
          {a.inactivePatients.length > 0 && <p>· Hace tiempo que no vuelven ({a.inactivePatients.length}): {names(a.inactivePatients)}</p>}
          {a.partialPayments.length > 0 && <p>· Pagos parciales pendientes: {a.partialPayments.slice(0, 8).map((p) => `${p.name} (resta ${formatARS(p.balance)})`).join(", ")}</p>}
          {a.incompleteProfiles.length > 0 && <p>· Fichas incompletas: {names(a.incompleteProfiles)}</p>}
          {d.followUpsCreated > 0 && <p className="text-xs text-premium/55">Se crearon {d.followUpsCreated} tareas de seguimiento nuevas. <button onClick={() => go("tareas")} className="text-primary hover:underline">Ver tareas</button></p>}
        </div>
      )}
    </div>
  )
}

/* ───────────── Vista previa del asistente ───────────── */

export function AssistantPreview() {
  const [text, setText] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const load = () => {
    setOpen(!open)
    if (!open) api<{ instructions: string }>("/api/admin/insights?vista=asistente").then((d) => setText(d.instructions)).catch(() => setText("No se pudo cargar"))
  }
  return (
    <div className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium text-premium">Lo que sabe el asistente ahora</p>
          <p className="text-sm text-premium/60">Se arma en cada conversación con los precios, promociones vigentes, preguntas frecuentes, equipos, políticas y horarios actuales. Así podés verificar que un cambio ya le llegó.</p>
        </div>
        <button onClick={load} className={btnGhost}>{open ? "Ocultar" : "Ver"}</button>
      </div>
      {open && <pre className="mt-3 max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-xl bg-stone-50 p-3 text-xs text-premium/80">{text ?? "Cargando…"}</pre>}
    </div>
  )
}
