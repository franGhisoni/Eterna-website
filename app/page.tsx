"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Menu, X, Phone, MapPin, Clock, Star, Sparkles, Heart, ShieldCheck, Building2, Stethoscope } from "lucide-react"
import { AvailabilityCalendar } from "@/components/availability-calendar"

export default function HomePage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [scrollY, setScrollY] = useState(0)
  const isScrolled = scrollY > 8
  const heroCardParallaxY = Math.min(scrollY * 0.14, 120)
  const heroCardParallaxX = Math.max(-scrollY * 0.03, -24)
  const availableDaysThisMonth = [13, 27]
  const whatsappPhone = "541140420769"
  const aboutImageRef = useRef<HTMLDivElement | null>(null)
  const [aboutImageTop, setAboutImageTop] = useState(0)
  const [viewportH, setViewportH] = useState(0)

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    if (media.matches) return

    const handleScroll = () => {
      setScrollY(window.scrollY || 0)
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  useEffect(() => {
    const measure = () => {
      if (!aboutImageRef.current) return
      const rect = aboutImageRef.current.getBoundingClientRect()
      setAboutImageTop(rect.top + window.scrollY)
      setViewportH(window.innerHeight || 0)
    }
    const raf = window.requestAnimationFrame(measure)
    window.addEventListener("resize", measure, { passive: true })
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener("resize", measure)
    }
  }, [])

  useEffect(() => {
    const previous = document.body.style.overflow
    if (isMenuOpen) document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previous
    }
  }, [isMenuOpen])

  useEffect(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"))
    if (!elements.length) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          ;(entry.target as HTMLElement).classList.add("is-visible")
          observer.unobserve(entry.target)
        }
      },
      { threshold: 0.18, rootMargin: "0px 0px -10% 0px" }
    )

    for (const el of elements) observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const handleWhatsAppClick = () => {
    const message = encodeURIComponent(
      "Hola! Quisiera información sobre turnos y disponibilidad en Eterna. ¿Me pasás opciones y horarios? Gracias!"
    )
    window.open(`https://wa.me/${whatsappPhone}?text=${message}`, "_blank")
  }

  const address = "José Pereyra Lucena 575, Lomas de Zamora, Buenos Aires"
  const mapsDirectionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address)}`
  const mapsEmbedUrl = `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
  const aboutDelta = viewportH ? scrollY - (aboutImageTop - viewportH * 0.4) : 0
  const aboutImageY = clamp(aboutDelta * 0.04, -18, 18)
  const aboutCardsY = clamp(aboutDelta * 0.07, -28, 28)
  const aboutCardsX = clamp(aboutDelta * 0.02, -12, 12)

  return (
    <div className="min-h-screen bg-premium-light">
      {/* Navigation */}
      <nav className="fixed top-[calc(env(safe-area-inset-top)+0.75rem)] left-0 right-0 z-50">
        <div className="max-w-6xl mx-auto px-3 sm:px-5 lg:px-6">
          <div
            className={[
              "liquid-glass liquid-glass-soft rounded-[1.25rem] transition-premium",
              isScrolled ? "shadow-[0_10px_26px_rgba(0,0,0,0.10)]" : "shadow-[0_6px_18px_rgba(0,0,0,0.08)]",
            ].join(" ")}
          >
            <div className="relative flex items-center px-3 sm:px-4 py-2">
              <a href="#inicio" className="flex items-center gap-2 shrink-0">
                <img src="/eterna-logo.png" alt="Eterna" className="h-7 w-auto" />
                <span className="font-berlys ot-ligs text-xl leading-none tracking-wide text-premium">
                  eterna
                </span>
              </a>

              <div className="hidden lg:flex flex-1 justify-end pr-1">
                <div className="flex items-center gap-6 text-xs whitespace-nowrap">
                  {[
                    ["Inicio", "#inicio"],
                    ["Servicios", "#servicios"],
                    ["Nosotros", "#sobre-nosotros"],
                    ["Resultados", "#resultados"],
                    ["Contacto", "#contacto"],
                  ].map(([label, href]) => (
                    <a
                      key={href}
                      href={href}
                      className="group relative text-premium/80 hover:text-premium transition-premium"
                    >
                      <span className="relative">
                        {label}
                        <span className="absolute -bottom-1.5 left-0 h-px w-full origin-left scale-x-0 bg-gradient-to-r from-primary/0 via-primary/45 to-primary/0 transition-premium group-hover:scale-x-100" />
                      </span>
                    </a>
                  ))}
                </div>
              </div>

              <div className="ml-auto flex items-center justify-end gap-2 shrink-0">
                <button
                  onClick={() => setIsMenuOpen((v) => !v)}
                  className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-xl liquid-glass liquid-glass-soft shadow-[0_6px_18px_rgba(0,0,0,0.08)] transition-premium hover:bg-white/18"
                  aria-label={isMenuOpen ? "Cerrar menú" : "Abrir menú"}
                  aria-expanded={isMenuOpen}
                >
                  {isMenuOpen ? <X className="h-5 w-5 text-premium" /> : <Menu className="h-5 w-5 text-premium" />}
                </button>
              </div>
            </div>

            <div
              className={[
                "lg:hidden overflow-hidden transition-premium",
                isMenuOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0 pointer-events-none",
              ].join(" ")}
            >
              <div className="px-3 pb-3 pt-1.5">
                <div className="rounded-xl liquid-glass liquid-glass-soft shadow-[0_6px_18px_rgba(0,0,0,0.08)]">
                  <div className="p-2.5 grid gap-1">
                    {[
                      ["Inicio", "#inicio"],
                      ["Servicios", "#servicios"],
                      ["Nosotros", "#sobre-nosotros"],
                      ["Resultados", "#resultados"],
                      ["Contacto", "#contacto"],
                    ].map(([label, href]) => (
                      <a
                        key={href}
                        href={href}
                        onClick={() => setIsMenuOpen(false)}
                        className="flex items-center justify-between rounded-xl px-3.5 py-2.5 text-premium/85 hover:text-premium hover:bg-white/18 transition-premium"
                      >
                        <span className="text-sm">{label}</span>
                        <span className="h-1.5 w-1.5 rounded-full bg-primary/30" />
                      </a>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section - Luxury Style with Background Text Overlay */}
      <section id="inicio" className="relative min-h-screen overflow-hidden pt-20 sm:pt-24 scroll-mt-28">
        {/* Background Image */}
        <div className="absolute inset-0 z-0">
          <img
            src="/sporty-curly-haired-woman-good-shape-has-thin-body-covers-eyes-with-arm-dressed-bodysuit-has-smooth-healthy-skin-slender-legs-demonstrates-perfect-figure-isolated-beige-background.jpg"
            alt="Mujer con piel saludable y cuerpo tonificado - Estética premium"
            className="w-full h-full object-cover"
            fetchPriority="high"
            decoding="async"
            style={{ transform: `translateY(${scrollY * 0.1}px)`, willChange: "transform" }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-white/10 to-white/30" />
        </div>

        {/* Background Text Overlay - "Eterna" */}
        <div className="absolute inset-0 z-[5] pointer-events-none">
          <div className="absolute bottom-0 left-0 right-0 text-center transform translate-y-1/3">
            <h1 className="font-berlys ot-ligs text-[35vw] font-light tracking-wider leading-none select-none 
bg-gradient-to-b from-white/99 via-white/15 to-transparent bg-clip-text text-transparent whitespace-nowrap">
  eterna
</h1>
          </div>
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 sm:pt-14 lg:pt-16 pb-14">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-7 items-start lg:items-stretch">
            <div className="lg:col-span-6 flex items-stretch">
              <div
                data-hero-card="true"
                className="w-full max-w-[520px] h-full rounded-[1.5rem] liquid-glass liquid-glass-strong shadow-[0_10px_28px_rgba(0,0,0,0.10)] transition-premium hover:shadow-[0_14px_34px_rgba(0,0,0,0.12)] animate-in fade-in duration-700"
                style={{
                  transform: `translate3d(${heroCardParallaxX}px, ${heroCardParallaxY}px, 0)`,
                  willChange: "transform",
                }}
              >
                <div className="relative p-6 sm:p-7 text-left">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs tracking-[0.28em] uppercase text-premium/60">
                        Centro de Estética Integral
                      </p>
                      <h2 className="mt-2 font-berlys ot-ligs text-3xl sm:text-4xl leading-none tracking-wide text-premium">
                        eterna
                      </h2>
                      <p className="mt-3 text-sm sm:text-base text-premium/75 leading-relaxed">
                        Depilación láser y cuidado de la piel con un enfoque de calidad, simple y honesto en resultados.
                      </p>
                    </div>

                    <div className="hidden sm:flex h-12 w-12 items-center justify-center rounded-2xl liquid-glass liquid-glass-soft">
                      <Sparkles className="h-5 w-5 text-primary" />
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="flex items-center gap-3 rounded-2xl liquid-glass liquid-glass-soft px-4 py-3">
                      <MapPin className="h-4 w-4 text-primary" />
                      <p className="text-sm text-premium/80">Instituto Ghisoni · Lomas</p>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl liquid-glass liquid-glass-soft px-4 py-3">
                      <Clock className="h-4 w-4 text-primary" />
                      <p className="text-sm text-premium/80">Lun a Vie · 10 a 19 hs</p>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                    <Button
                      onClick={handleWhatsAppClick}
                      className="h-11 rounded-xl bg-primary text-primary-foreground px-5 text-sm shadow-[0_10px_26px_rgba(136,38,38,0.22)] hover:bg-primary/90 transition-premium"
                    >
                      <Phone className="mr-2 h-4 w-4" />
                      Reservar Turno
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 flex lg:justify-end items-stretch">
              <div className="w-full max-w-[520px] h-full animate-in fade-in slide-in-from-right-4 duration-700">
                <AvailabilityCalendar availableDays={availableDaysThisMonth} whatsappPhone={whatsappPhone} />
              </div>
            </div>
          </div>
        </div>

        {/* Hero Content - Main Content */}
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="space-y-8">
            {/* <div className="space-y-4">
              <h2 className="font-serif text-4xl sm:text-5xl lg:text-7xl font-bold text-premium leading-tight">
                Depilación Definitiva
                <span className="block text-primary">con Resultados Reales</span>
              </h2>
              <p className="text-lg sm:text-xl lg:text-2xl text-muted-foreground max-w-2xl mx-auto leading-relaxed">
                Experiencia premium en centro estético médico. Tecnología de última generación, 
                resultados visibles desde la primera sesión.
              </p>
            </div> */}

            {/* Benefits */}
            {/* <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
              <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 shadow-premium border border-premium">
                <Sparkles className="h-8 w-8 text-primary mx-auto mb-3" />
                <h3 className="font-semibold text-premium mb-2">Rápido</h3>
                <p className="text-sm text-muted-foreground">Sesiones de 15-30 min</p>
              </div>
              <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 shadow-premium border border-premium">
                <Star className="h-8 w-8 text-primary mx-auto mb-3" />
                <h3 className="font-semibold text-premium mb-2">Efectivo</h3>
                <p className="text-sm text-muted-foreground">Reducción permanente</p>
              </div>
              <div className="bg-white/80 backdrop-blur-sm rounded-xl p-6 shadow-premium border border-premium">
                <Heart className="h-8 w-8 text-primary mx-auto mb-3" />
                <h3 className="font-semibold text-premium mb-2">Personalizado</h3>
                <p className="text-sm text-muted-foreground">Tratamiento adaptado</p>
              </div>
            </div> */}

            {/* CTA Button */}
            {/* <Button 
              onClick={handleWhatsAppClick}
              size="lg"
              className="bg-primary text-primary-foreground hover:bg-primary/90 text-lg px-8 py-6 rounded-xl shadow-premium-lg transition-premium hover:scale-105"
            >
              <Phone className="mr-3 h-5 w-5" />
              Reservar Turno Ahora
            </Button> */}

            {/* <p className="text-sm text-muted-foreground">
              📍 Instituto Ghisoni • José Pereyra Lucena 575, Lomas de Zamora
            </p> */}
          </div>
        </div>
      </section>

      <section id="instituto-ghisoni" className="py-16 sm:py-20 bg-premium-light scroll-mt-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div data-reveal className="reveal reveal-left lg:col-span-5 space-y-7">
              <div className="flex flex-wrap items-center gap-3 rounded-2xl sm:rounded-full liquid-glass liquid-glass-strong px-4 py-2 shadow-premium max-w-full">
                <img src="/ghisoni-logo.png" alt="Instituto Ghisoni" className="h-6 w-auto" />
                <span className="text-[11px] sm:text-xs tracking-[0.22em] sm:tracking-[0.28em] uppercase text-premium/70 leading-snug">
                  Instituto Ghisoni <span className="hidden sm:inline">· Lomas de Zamora</span>
                </span>
              </div>

              <div>
                <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-premium leading-tight">
                  Atendemos dentro del Instituto Ghisoni
                </h2>
                <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed">
                  <span className="font-berlys ot-ligs text-premium">eterna</span> funciona en un entorno médico real, reconocido y
                  profesional. No es un gabinete improvisado: es un espacio pensado para la seguridad, la higiene y una experiencia
                  premium desde que entrás.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div data-reveal className="reveal" style={{ transitionDelay: "0ms" }}>
                  <div className="rounded-[1.5rem] liquid-glass liquid-glass-strong shadow-premium p-5 transition-premium hover:-translate-y-0.5 hover:shadow-premium-lg">
                    <div className="flex items-start gap-3">
                      <ShieldCheck className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <p className="font-medium text-premium">Confianza y seguridad</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Estándares clínicos, procesos claros y una atención que transmite tranquilidad.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div data-reveal className="reveal" style={{ transitionDelay: "90ms" }}>
                  <div className="rounded-[1.5rem] liquid-glass liquid-glass-strong shadow-premium p-5 transition-premium hover:-translate-y-0.5 hover:shadow-premium-lg">
                    <div className="flex items-start gap-3">
                      <Building2 className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <p className="font-medium text-premium">Institución reconocida</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Ubicación física real dentro de una clínica/instituto médico de referencia.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div data-reveal className="reveal" style={{ transitionDelay: "180ms" }}>
                  <div className="rounded-[1.5rem] liquid-glass liquid-glass-strong shadow-premium p-5 transition-premium hover:-translate-y-0.5 hover:shadow-premium-lg">
                    <div className="flex items-start gap-3">
                      <Stethoscope className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <p className="font-medium text-premium">Respaldo profesional</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Atención cuidada, protocolos serios y acompañamiento en cada etapa.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div data-reveal className="reveal" style={{ transitionDelay: "270ms" }}>
                  <div className="rounded-[1.5rem] liquid-glass liquid-glass-strong shadow-premium p-5 transition-premium hover:-translate-y-0.5 hover:shadow-premium-lg">
                    <div className="flex items-start gap-3">
                      <Sparkles className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <p className="font-medium text-premium">Tecnología y calidad</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Equipos y criterios de trabajo pensados para resultados reales y elegantes.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                <Button
                  onClick={handleWhatsAppClick}
                  className="h-11 rounded-xl bg-primary text-primary-foreground px-6 text-sm shadow-[0_10px_26px_rgba(136,38,38,0.22)] hover:bg-primary/90 transition-premium"
                >
                  <Phone className="mr-2 h-4 w-4" />
                  Reservar Turno
                </Button>
                <div className="rounded-xl liquid-glass liquid-glass-soft px-4 py-3 shadow-[0_8px_22px_rgba(0,0,0,0.08)]">
                  <p className="text-xs tracking-[0.25em] uppercase text-premium/55">
                    Atención
                  </p>
                  <p className="mt-1 text-sm text-premium/80">
                    Lun a Vie · 10:00 a 19:00
                  </p>
                </div>
              </div>
            </div>

            <div data-reveal className="reveal reveal-right lg:col-span-7">
              <div className="relative overflow-hidden rounded-[2rem] border border-premium shadow-premium-lg bg-black/10">
                <video
                  src="/VID-20260509-WA0002.mp4"
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className="h-[340px] sm:h-[520px] w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/25 to-black/10" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(255,255,255,0.14),transparent_55%),radial-gradient(circle_at_85%_0%,rgba(136,38,38,0.18),transparent_55%)]" />
                <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
                  <div className="flex flex-wrap items-center gap-2 rounded-2xl sm:rounded-full liquid-glass liquid-glass-soft px-4 py-2 max-w-full">
                    <MapPin className="h-4 w-4 text-white/85" />
                    <p className="text-sm text-white/90 leading-snug">
                      Instituto Ghisoni · {address}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section id="servicios" className="py-16 sm:py-20 bg-white scroll-mt-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div data-reveal className="reveal text-center mb-14 sm:mb-16">
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-premium mb-4">
              Nuestros Servicios
            </h2>
            <p className="text-base sm:text-xl text-muted-foreground max-w-2xl mx-auto">
              Tecnología avanzada y atención personalizada para realzar tu belleza natural
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Depilación Definitiva */}
            <div data-reveal className="reveal" style={{ transitionDelay: "0ms" }}>
              <div className="bg-premium-card rounded-2xl p-8 shadow-premium border border-premium hover:shadow-premium-lg transition-premium hover:-translate-y-1">
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                    <Sparkles className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="font-serif text-2xl font-semibold text-premium">Depilación Definitiva</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Láser diodo de alta potencia para eliminación permanente del vello. Seguro para todo tipo de piel, resultados desde la
                    primera sesión.
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>✓ Rostro y cuerpo completo</li>
                    <li>✓ Sin dolor, sin cicatrices</li>
                    <li>✓ Resultados garantizados</li>
                  </ul>
                  <Button
                    onClick={handleWhatsAppClick}
                    className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90 transition-premium"
                  >
                    Consultar Precios
                  </Button>
                </div>
              </div>
            </div>

            {/* Medicina Estética */}
            <div data-reveal className="reveal" style={{ transitionDelay: "110ms" }}>
              <div className="bg-premium-card rounded-2xl p-8 shadow-premium border border-premium hover:shadow-premium-lg transition-premium hover:-translate-y-1">
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto">
                    <Star className="h-8 w-8 text-accent" />
                  </div>
                  <h3 className="font-serif text-2xl font-semibold text-premium">Medicina Estética</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Tratamientos con toxina botulínica para rejuvenecimiento facial. Resultados naturales y armónicos, realzando tu belleza.
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>✓ Arrugas de expresión</li>
                    <li>✓ Lifting sin cirugía</li>
                    <li>✓ Resultados duraderos</li>
                  </ul>
                  <Button
                    onClick={handleWhatsAppClick}
                    className="w-full h-11 bg-accent text-accent-foreground hover:bg-accent/90 transition-premium"
                  >
                    Más Información
                  </Button>
                </div>
              </div>
            </div>

            {/* HIFU - Próximamente */}
            <div data-reveal className="reveal" style={{ transitionDelay: "220ms" }}>
              <div className="bg-premium-card rounded-2xl p-8 shadow-premium border border-premium hover:shadow-premium-lg transition-premium opacity-75">
                <div className="text-center space-y-4">
                  <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
                    <Heart className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-serif text-2xl font-semibold text-premium">HIFU</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    Próximamente... Ultrasonido focalizado de alta intensidad para lifting no invasivo.
                  </p>
                  <div className="bg-muted text-muted-foreground px-4 py-2 rounded-full text-sm">
                    Muy Pronto
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="resultados" className="py-16 sm:py-20 bg-premium-light scroll-mt-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div data-reveal className="reveal reveal-left lg:col-span-7">
              <div className="rounded-[2rem] liquid-glass liquid-glass-strong shadow-premium-lg p-4 sm:p-5">
                <div className="relative rounded-[1.75rem] overflow-hidden">
                  <div className="flex gap-3 sm:gap-4">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div
                        key={i}
                        className="relative h-[360px] sm:h-[440px] lg:h-[520px] w-[48px] sm:w-[60px] lg:w-[66px] rounded-full overflow-hidden bg-[#2b2b2b]/10"
                      >
                        <img
                          src="/profile-naked-female-body.jpg"
                          alt="Resultados estéticos - Eterna"
                          className="absolute inset-0 h-full w-full object-cover grayscale contrast-150 brightness-75"
                          loading="lazy"
                          decoding="async"
                          style={{ objectPosition: `${(i / 8) * 100}% 50%` }}
                        />
                        {i === 4 && <div className="absolute inset-0 bg-[#d4a574]/25 mix-blend-multiply" />}
                      </div>
                    ))}
                  </div>

                  <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/20 via-transparent to-white/25" />
                </div>

                {/* <div className="absolute top-5 left-5 sm:top-6 sm:left-6 w-[280px] sm:w-[320px] rounded-[1.75rem] bg-[#2b2b2b] text-[#faf1e8] p-6 shadow-premium-lg border border-white/10 transition-premium hover:-translate-y-1">
                  <p className="text-xs tracking-[0.25em] uppercase text-[#faf1e8]/70">
                    Resultados
                  </p>
                  <h3 className="mt-3 font-serif text-2xl font-semibold">
                    Piel luminosa, sin exceso
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-[#faf1e8]/85">
                    Protocolos claros, tecnología adecuada y un enfoque natural para que tu piel se vea mejor sin perder tu esencia.
                  </p>
                </div> */}
              </div>
            </div>

            <div data-reveal className="reveal reveal-right lg:col-span-5">
              <div className="space-y-6">
                <div>
                  <p className="text-xs tracking-[0.28em] uppercase text-premium/60">
                    Estética Integral
                  </p>
                  <h2 className="mt-3 font-serif text-3xl sm:text-4xl font-bold text-premium">
                    Resultados que se ven y se sienten
                  </h2>
                  <p className="mt-4 text-muted-foreground leading-relaxed">
                    Cada tratamiento en <span className="font-berlys ot-ligs text-premium">eterna</span> combina precisión, cuidado y seguimiento.
                    Buscamos cambios reales, elegantes y sostenibles.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div data-reveal className="reveal" style={{ transitionDelay: "60ms" }}>
                    <div className="rounded-[1.5rem] liquid-glass liquid-glass-strong shadow-premium overflow-hidden transition-premium hover:-translate-y-0.5 hover:shadow-premium-lg">
                      <img
                        src="/portrait-young-woman-massaging-her-neck-using-gua-sha.jpg"
                        alt="Cuidado de la piel"
                        className="h-40 w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                      <div className="p-5">
                        <p className="text-sm text-premium/80">
                          Protocolos claros, tecnología adecuada y un enfoque natural para que tu piel se vea mejor sin perder tu esencia.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div data-reveal className="reveal" style={{ transitionDelay: "140ms" }}>
                    <div className="rounded-[1.5rem] liquid-glass liquid-glass-strong shadow-premium overflow-hidden transition-premium hover:-translate-y-0.5 hover:shadow-premium-lg">
                      <img
                        src="/skin-care-woman-with-beauty-face-touching-healthy-facial-skin-portrait-beautiful-smiling-girl-model-with-natural-makeup-touching-glowing-hydrated-skin-white-wall.jpg"
                        alt="Piel saludable"
                        className="h-40 w-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                      <div className="p-5">
                        <p className="text-sm text-premium/80">
                          Naturalidad, confianza y una experiencia premium de principio a fin.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  {/* <Button
                    onClick={handleWhatsAppClick}
                    className="h-11 rounded-xl bg-primary text-primary-foreground px-6 text-sm shadow-[0_10px_26px_rgba(136,38,38,0.22)] hover:bg-primary/90 transition-premium"
                  >
                    <Phone className="mr-2 h-4 w-4" />
                    Reservar Turno
                  </Button> */}
                  <div className="rounded-xl liquid-glass liquid-glass-soft px-4 py-3 shadow-[0_8px_22px_rgba(0,0,0,0.08)]">
                    <p className="text-xs tracking-[0.25em] uppercase text-premium/55">
                      Atención
                    </p>
                    <p className="mt-1 text-sm text-premium/80">
                      Instituto Ghisoni · Lomas de Zamora
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="sobre-nosotros" className="py-16 sm:py-20 bg-premium-light scroll-mt-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Encabezado editorial */}
          <div data-reveal className="reveal text-center mb-14">
            <h2 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-premium">
              Sobre <span className="font-berlys ot-ligs">eterna</span>
            </h2>
            <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
              Elegancia, confianza y resultados duraderos en depilación láser y cuidado de la piel.
            </p>
          </div>

          {/* Layout editorial con superposición */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            {/* Imagen principal (60–70% en desktop) */}
            <div className="lg:col-span-8">
              <div className="relative">
                {/* Imagen B/N */}
                <div
                  ref={aboutImageRef}
                  data-reveal
                  className="reveal relative overflow-hidden rounded-[2rem] shadow-premium-lg border border-premium"
                >
                  <img
                    src="/different-women-standing-together.jpg"
                    alt="Cuidado de la piel y estética premium"
                    className="h-[420px] sm:h-[520px] lg:h-[640px] w-full object-cover grayscale contrast-125 brightness-95"
                    loading="lazy"
                    decoding="async"
                    style={{ transform: `translate3d(0, ${aboutImageY}px, 0)`, willChange: "transform" }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-tr from-black/20 via-transparent to-white/10" />
                </div>

                {/* Card superior izquierda (desktop) */}
                <div className="hidden lg:block absolute -top-8 -left-8 w-[360px]">
                  <div
                    data-reveal
                    className="reveal rounded-[1.75rem] liquid-glass liquid-glass-strong p-7 shadow-[0_14px_40px_rgba(0,0,0,0.16)] transition-premium hover:shadow-[0_18px_46px_rgba(0,0,0,0.18)]"
                    style={{
                      transform: `translate3d(${-aboutCardsX}px, ${aboutCardsY}px, 0)`,
                      willChange: "transform",
                    }}
                  >
                    <p className="text-xs tracking-[0.25em] uppercase text-premium/60">
                      Filosofía
                    </p>
                    <h3 className="mt-3 font-serif text-2xl font-semibold text-premium">
                      Nuestra Esencia
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-premium/75">
                      <span className="font-berlys ot-ligs">eterna</span> nace del equilibrio entre ciencia y belleza: tratamientos precisos, cuidados
                      y una experiencia serena, pensada para que te sientas segura desde el primer contacto.
                    </p>
                  </div>
                </div>

                {/* Card inferior derecha (desktop) */}
                <div className="hidden lg:block absolute -bottom-10 -right-10 w-[420px]">
                  <div
                    data-reveal
                    className="reveal rounded-[1.75rem] liquid-glass liquid-glass-strong p-8 shadow-[0_16px_44px_rgba(0,0,0,0.16)] transition-premium hover:shadow-[0_20px_52px_rgba(0,0,0,0.18)]"
                    style={{
                      transform: `translate3d(${aboutCardsX}px, ${aboutCardsY}px, 0)`,
                      willChange: "transform",
                    }}
                  >
                    <p className="text-xs tracking-[0.25em] uppercase text-premium/60">
                      Confianza
                    </p>
                    <h3 className="mt-3 font-serif text-2xl font-semibold text-premium">
                      Nuestra Historia
                    </h3>
                    <p className="mt-3 text-sm leading-relaxed text-premium/75">
                      Somos una marca enfocada en depilación láser y cuidado de la piel con un estándar
                      premium: diagnóstico personalizado, protocolos claros y resultados medibles. Atendemos
                      en Instituto Ghisoni, en Lomas de Zamora, para sumar respaldo profesional y una experiencia
                      que se siente tan cuidada como el resultado final.
                    </p>
                  </div>
                </div>
              </div>

              {/* Cards en mobile (debajo de la imagen) */}
              <div className="lg:hidden mt-8 grid grid-cols-1 gap-6">
                <div
                  data-reveal
                  className="reveal rounded-[1.75rem] liquid-glass liquid-glass-strong p-7 shadow-[0_14px_40px_rgba(0,0,0,0.14)] transition-premium hover:shadow-[0_18px_46px_rgba(0,0,0,0.16)]"
                  style={{
                    transform: `translate3d(0, ${aboutCardsY * 0.65}px, 0)`,
                    willChange: "transform",
                  }}
                >
                  <p className="text-xs tracking-[0.25em] uppercase text-premium/60">
                    Filosofía
                  </p>
                  <h3 className="mt-3 font-serif text-2xl font-semibold text-premium">
                    Nuestra Esencia
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-premium/75">
                    <span className="font-berlys ot-ligs">eterna</span> nace del equilibrio entre ciencia y belleza: tratamientos precisos, cuidados
                    y una experiencia serena, pensada para que te sientas segura desde el primer contacto.
                  </p>
                </div>

                <div
                  data-reveal
                  className="reveal rounded-[1.75rem] liquid-glass liquid-glass-strong p-8 shadow-[0_16px_44px_rgba(0,0,0,0.14)] transition-premium hover:shadow-[0_20px_52px_rgba(0,0,0,0.16)]"
                  style={{
                    transform: `translate3d(0, ${aboutCardsY * 0.65}px, 0)`,
                    willChange: "transform",
                  }}
                >
                  <p className="text-xs tracking-[0.25em] uppercase text-premium/60">
                    Confianza
                  </p>
                  <h3 className="mt-3 font-serif text-2xl font-semibold text-premium">
                    Nuestra Historia
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-premium/75">
                    Somos una marca enfocada en depilación láser y cuidado de la piel con un estándar
                    premium: diagnóstico personalizado, protocolos claros y resultados medibles. Atendemos
                    en Instituto Ghisoni, en Lomas de Zamora, para sumar respaldo profesional y una experiencia
                    que se siente tan cuidada como el resultado final.
                  </p>
                </div>
              </div>
            </div>

            {/* Columna de soporte (detalle + ubicación) */}
            <div className="lg:col-span-4 lg:pt-10">
              <div data-reveal className="reveal rounded-[2rem] liquid-glass liquid-glass-strong p-8 shadow-premium">
                <h3 className="font-serif text-2xl font-semibold text-premium">
                  Profesional, cálido, real
                </h3>
                <p className="mt-4 text-muted-foreground leading-relaxed">
                  Priorizamos una experiencia simple y premium: atención personalizada, tiempos claros y
                  un enfoque honesto en resultados. Menos ruido, más precisión.
                </p>

                <div className="mt-6 space-y-4">
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium text-premium">Instituto Ghisoni</p>
                      <p className="text-sm text-muted-foreground">José Pereyra Lucena 575, Lomas de Zamora</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium text-premium">Horarios</p>
                      <p className="text-sm text-muted-foreground">Lunes a Viernes 10:00 - 19:00</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="testimonios" className="py-16 sm:py-20 bg-white scroll-mt-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div data-reveal className="reveal text-center mb-14 sm:mb-16">
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-premium mb-4">
              Lo que dicen nuestras clientas
            </h2>
            <p className="text-base sm:text-xl text-muted-foreground max-w-2xl mx-auto">
              Resultados reales, experiencias auténticas
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div data-reveal className="reveal" style={{ transitionDelay: "0ms" }}>
              <div className="bg-premium-card rounded-2xl p-8 shadow-premium border border-premium transition-premium hover:-translate-y-1 hover:shadow-premium-lg">
                <div className="flex items-center mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 text-yellow-400 fill-current" />
                  ))}
                </div>
                <p className="text-muted-foreground mb-4 italic">
                  "Excelente atención y resultados sorprendentes. La depilación láser fue la mejor inversión en mi bienestar personal.
                  Totalmente recomendable."
                </p>
                <p className="font-semibold text-premium">— María L.</p>
              </div>
            </div>

            <div data-reveal className="reveal" style={{ transitionDelay: "110ms" }}>
              <div className="bg-premium-card rounded-2xl p-8 shadow-premium border border-premium transition-premium hover:-translate-y-1 hover:shadow-premium-lg">
                <div className="flex items-center mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 text-yellow-400 fill-current" />
                  ))}
                </div>
                <p className="text-muted-foreground mb-4 italic">
                  "Profesionales muy capacitados. El ambiente es acogedor y la tecnología que utilizan es de primera. Me siento segura y
                  cómoda en cada visita."
                </p>
                <p className="font-semibold text-premium">— Laura G.</p>
              </div>
            </div>

            <div data-reveal className="reveal" style={{ transitionDelay: "220ms" }}>
              <div className="bg-premium-card rounded-2xl p-8 shadow-premium border border-premium transition-premium hover:-translate-y-1 hover:shadow-premium-lg">
                <div className="flex items-center mb-4">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="h-5 w-5 text-yellow-400 fill-current" />
                  ))}
                </div>
                <p className="text-muted-foreground mb-4 italic">
                  "Los resultados superaron mis expectativas. El trato personalizado y la calidad del servicio hacen que valga cada peso
                  invertido."
                </p>
                <p className="font-semibold text-premium">— Carolina M.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="contacto" className="py-16 sm:py-20 bg-premium-light scroll-mt-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div id="donde-atendemos" className="mt-14 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div data-reveal className="reveal reveal-left lg:col-span-5 space-y-6">
              <div>
                <p className="text-xs tracking-[0.28em] uppercase text-premium/60">
                  Ubicación
                </p>
                <h3 className="mt-3 font-serif text-3xl sm:text-4xl font-bold text-premium">
                  ¿Dónde atendemos?
                </h3>
                <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed">
                  Una dirección real y fácil de encontrar. Llegás a un instituto médico, entrás y te atendemos en un espacio
                  profesional, cuidado y sereno.
                </p>
              </div>

              <div className="rounded-[1.75rem] liquid-glass liquid-glass-strong shadow-premium p-6">
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <MapPin className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium text-premium">Dirección</p>
                      <p className="text-sm text-muted-foreground">{address}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Phone className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium text-premium">WhatsApp</p>
                      <p className="text-sm text-muted-foreground">11 4042-0769</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <Clock className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="font-medium text-premium">Horarios</p>
                      <p className="text-sm text-muted-foreground">Lunes a Viernes 10:00 - 19:00</p>
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <Button asChild className="h-11 rounded-xl liquid-glass liquid-glass-soft text-premium hover:bg-white/20 transition-premium">
                    <a href={mapsDirectionsUrl} target="_blank" rel="noreferrer">
                      <MapPin className="mr-2 h-4 w-4 text-primary" />
                      Cómo llegar
                    </a>
                  </Button>
                  <Button
                    onClick={handleWhatsAppClick}
                    className="h-11 rounded-xl bg-primary text-primary-foreground px-6 text-sm shadow-[0_10px_26px_rgba(136,38,38,0.22)] hover:bg-primary/90 transition-premium"
                  >
                    <Phone className="mr-2 h-4 w-4" />
                    Reservar Turno
                  </Button>
                </div>
              </div>
            </div>

            <div data-reveal className="reveal reveal-right lg:col-span-7">
              <div className="rounded-[2rem] overflow-hidden liquid-glass liquid-glass-strong shadow-premium-lg">
                <div className="relative aspect-[16/10] sm:aspect-[16/9]">
                  <iframe
                    title="Mapa - Instituto Ghisoni"
                    src={mapsEmbedUrl}
                    className="absolute inset-0 h-full w-full"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    allowFullScreen
                  />
                </div>
              </div>
            </div>
          </div>

          <div data-reveal className="reveal reveal-scale mt-14">
            <div className="rounded-[2rem] liquid-glass liquid-glass-strong shadow-premium-lg p-8 sm:p-10 text-center">
                <p className="text-xs tracking-[0.28em] uppercase text-premium/60">
                  Turnos
                </p>
                <h3 className="mt-3 font-serif text-3xl sm:text-4xl font-bold text-premium">
                  Reservá tu turno en <span className="font-berlys ot-ligs">eterna</span> y atendete en un entorno médico profesional.
                </h3>
                <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
                  Atención cuidada, espacio real y respaldo institucional para que te sientas segura desde el primer minuto.
                </p>
                <div className="mt-7 flex justify-center">
                  <Button
                    onClick={handleWhatsAppClick}
                    size="lg"
                    className="h-12 rounded-xl bg-primary text-primary-foreground px-8 text-base shadow-[0_12px_30px_rgba(136,38,38,0.22)] hover:bg-primary/90 transition-premium hover:scale-[1.02]"
                  >
                    <Phone className="mr-3 h-5 w-5" />
                    Reservar Turno por WhatsApp
                  </Button>
                </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-premium py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div data-reveal className="reveal text-center space-y-4">
            <div className="flex items-center justify-center space-x-3">
              <img src="/eterna-logo.png" alt="Eterna" className="h-8 w-auto" />
              <span className="font-berlys ot-ligs text-xl font-medium text-premium tracking-wide">Eterna</span>
            </div>
            <p className="text-muted-foreground">
              Instituto Ghisoni • Centro de Estética y Depilación Médica
            </p>
            <p className="text-sm text-muted-foreground">
              José Pereyra Lucena 575, Lomas de Zamora • 11 4042-0769
            </p>
            <p className="text-xs text-muted-foreground">
              © 2025 <span className="font-berlys ot-ligs">eterna</span>. Todos los derechos reservados.
            </p>
          </div>
        </div>
      </footer>

      {/* WhatsApp Floating Button */}
      <a
        href={`https://wa.me/541140420769?text=${encodeURIComponent(
          "Hola! Quisiera información sobre turnos y disponibilidad en Eterna. ¿Me pasás opciones y horarios? Gracias!"
        )}`}
        target="_blank"
        rel="noreferrer"
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+1.5rem)] right-[calc(env(safe-area-inset-right)+1.5rem)] z-50 bg-primary text-white p-4 rounded-full shadow-premium-lg hover:scale-110 transition-premium hover:bg-primary/90"
        aria-label="WhatsApp"
      >
        <Phone className="h-6 w-6" />
      </a>
    </div>
  )
}
