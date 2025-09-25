import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import { Suspense } from "react"
import "./globals.css"

export const metadata: Metadata = {
  title: "Eterna - Centro de Estética y Depilación de Instituto Ghisoni",
  description: "Centro de estética y depilación del Instituto Ghisoni de ginecología y fertilidad en Pereira",
  generator: "v0.app",
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
    <html lang="es">
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable} antialiased`}>
        <Suspense fallback={null}>{children}</Suspense>
        <Analytics />
      </body>
    </html>
  )
}
