import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import { Suspense } from "react"
import "./globals.css"

export const metadata: Metadata = {
  title: "Eterna | Depilación láser y estética médica en Lomas de Zamora",
  description:
    "Depilación láser, medicina estética y HIFU en Instituto Ghisoni, Lomas de Zamora. Consultá disponibilidad y reservá tu turno por WhatsApp.",
  keywords: ["depilación láser", "estética médica", "HIFU", "Lomas de Zamora", "Instituto Ghisoni"],
  robots: { index: true, follow: true },
  openGraph: {
    title: "Eterna | Estética médica en Lomas de Zamora",
    description: "Atención estética en Instituto Ghisoni. Consultá disponibilidad por WhatsApp.",
    locale: "es_AR",
    type: "website",
  },
  icons: {
    icon: "/eterna-logo.png",
    shortcut: "/eterna-logo.png",
    apple: "/eterna-logo.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es-AR">
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable} antialiased`}>
        <Suspense fallback={null}>{children}</Suspense>
        <Analytics />
      </body>
    </html>
  )
}
