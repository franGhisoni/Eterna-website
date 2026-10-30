"use client"

import { useState } from "react"
import { Check, Copy, Upload } from "lucide-react"
import { formatARS } from "@/lib/time"

export type TransferData = { alias: string; holder: string; bank: string; cbu: string }

const ERRORS: Record<string, string> = {
  archivo_grande: "El archivo pesa más de 5 MB. Probá con una captura más liviana.",
  archivo_invalido: "Subí una imagen (JPG, PNG o WebP) o un PDF.",
  expired: "La reserva venció y el horario se liberó. Buscá otro turno.",
  demasiados_intentos: "Demasiados intentos. Esperá unos minutos.",
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(value).catch(() => undefined)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <dt className="shrink-0 text-premium/60">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2 font-medium text-premium">
        <span className="break-all text-right">{value}</span>
        <button type="button" onClick={copy} aria-label={`Copiar ${label}`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-premium text-premium/60 transition-premium hover:bg-secondary">
          {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </dd>
    </div>
  )
}

export function TransferPayment({ bookingId, amount, transfer, onSent }: { bookingId: string; amount: number; transfer: TransferData; onSent?: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle")
  const [error, setError] = useState("")

  const submit = async () => {
    if (!file) return
    setState("sending")
    setError("")
    const body = new FormData()
    body.append("file", file)
    try {
      const res = await fetch(`/api/reserva/${bookingId}/comprobante`, { method: "POST", body })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (res.ok || data.error === "already_sent") {
        setState("sent")
        onSent?.()
        return
      }
      setError(ERRORS[data.error ?? ""] ?? "No pudimos recibir el comprobante. Probá de nuevo.")
    } catch {
      setError("Se cortó la conexión. Probá de nuevo.")
    }
    setState("idle")
  }

  if (state === "sent") {
    return <p className="mt-4 rounded-xl bg-secondary/60 px-4 py-3 text-sm text-premium">Recibimos tu comprobante. El equipo revisa la transferencia y te confirma el turno.</p>
  }

  return (
    <div className="mt-4">
      <p className="text-sm text-premium">Transferí <strong className="font-semibold">{formatARS(amount)}</strong> y subí el comprobante para que revisemos tu turno.</p>
      <dl className="mt-2 divide-y divide-border rounded-xl border border-premium px-3">
        <CopyRow label="Alias" value={transfer.alias} />
        {transfer.cbu && <CopyRow label="CBU/CVU" value={transfer.cbu} />}
        {transfer.holder && <div className="flex justify-between gap-3 py-2 text-sm"><dt className="text-premium/60">Titular</dt><dd className="text-right font-medium text-premium">{transfer.holder}</dd></div>}
        {transfer.bank && <div className="flex justify-between gap-3 py-2 text-sm"><dt className="text-premium/60">Banco</dt><dd className="text-right font-medium text-premium">{transfer.bank}</dd></div>}
      </dl>
      <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-primary/35 bg-premium-light px-4 py-4 text-center text-sm text-premium/75 transition-premium focus-within:ring-[3px] focus-within:ring-primary/15 hover:bg-secondary">
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="sr-only"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null)
            setError("")
          }}
        />
        <Upload className="h-4 w-4 shrink-0 text-primary" />
        <span className="break-all">{file ? file.name : "Elegí la imagen o el PDF del comprobante"}</span>
      </label>
      <button type="button" onClick={submit} disabled={!file || state === "sending"} className="mt-3 flex h-12 w-full items-center justify-center rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground transition-premium hover:bg-primary/90 disabled:opacity-50">
        {state === "sending" ? "Enviando…" : "Enviar comprobante"}
      </button>
      <p className="mt-2 text-center text-xs text-premium/50">JPG, PNG, WebP o PDF de hasta 5 MB.</p>
      {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  )
}
