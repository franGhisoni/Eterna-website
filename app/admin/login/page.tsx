"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Lock } from "lucide-react"

const ERRORS: Record<string, string> = {
  credenciales_invalidas: "Usuario o contraseña incorrectos.",
  demasiados_intentos: "Demasiados intentos. Esperá unos minutos.",
  sin_configurar: "Falta SESSION_SECRET en las variables del servidor.",
  secreto_corto: "SESSION_SECRET es muy corto: tiene que tener al menos 16 caracteres.",
  sin_base: "Falta DATABASE_URL en las variables del servidor.",
  base_no_disponible: "La base de datos no responde. Revisá los registros del servidor (Deploy Logs).",
}

export default function LoginPage() {
  const router = useRouter()
  const [user, setUser] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError("")
    const res = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user, password }) }).catch(() => null)
    if (res?.ok) {
      router.replace("/admin")
      router.refresh()
      return
    }
    const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined
    setError(ERRORS[data?.error ?? ""] ?? (res ? `No se pudo iniciar sesión (error ${res.status} del servidor).` : "No hay conexión con el servidor."))
    setBusy(false)
  }

  const field = "mt-1.5 h-11 w-full rounded-xl border border-premium bg-white px-3.5 text-sm text-premium outline-none focus:border-primary/40 focus:ring-[3px] focus:ring-primary/10"
  return (
    <main className="flex min-h-screen items-center justify-center bg-premium-light px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-[1.5rem] border border-premium bg-white p-7 shadow-premium-lg">
        <div className="flex items-center gap-3">
          <img src="/eterna-logo.webp" alt="" className="h-8 w-auto" />
          <div>
            <p className="font-berlys text-xl leading-none text-premium">eterna</p>
            <p className="text-xs text-premium/55">Panel interno</p>
          </div>
        </div>
        <label className="mt-7 block text-sm font-medium text-premium">
          Usuario
          <input autoComplete="username" value={user} onChange={(e) => setUser(e.target.value)} className={field} required />
        </label>
        <label className="mt-4 block text-sm font-medium text-premium">
          Contraseña
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} required />
        </label>
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        <button disabled={busy} className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-primary-foreground transition-premium hover:bg-primary/90 disabled:opacity-60">
          <Lock className="h-4 w-4" /> {busy ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  )
}
