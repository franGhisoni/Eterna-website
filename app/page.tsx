"use client"

import { useState, useEffect, useRef, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { MapPin, Phone, Clock, Sparkles, Star, Heart, Instagram } from "lucide-react"

function RevealOnScroll({
  children,
  delay = 0,
  className = "",
  fade = false,
  distance = "translate-y-24",
}: {
  children: ReactNode
  delay?: number
  className?: string
  fade?: boolean
  distance?: "translate-y-12" | "translate-y-16" | "translate-y-24" | "translate-y-32"
}) {
  const elementRef = useRef<HTMLDivElement | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const node = elementRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.unobserve(entry.target)
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -50px 0px" },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const hiddenClass = fade ? `opacity-0 ${distance}` : `opacity-100 ${distance}`
  const visibleClass = "opacity-100 translate-y-0"

  return (
    <div
      ref={elementRef}
      className={`transition-transform duration-700 ${inView ? visibleClass : hiddenClass} ${className}`}
      style={{ transitionDelay: `${delay}ms`, willChange: "transform" }}
    >
      {children}
    </div>
  )
}

export default function HomePage() {
  const [isVisible] = useState(true)
  const [scrollY, setScrollY] = useState(0)



  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY || 0)
    }
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const handleWhatsAppClick = () => {
    const message = encodeURIComponent(
      "Hola! Quisiera información sobre turnos y disponibilidad en Eterna. ¿Me pasás opciones y horarios? Gracias!",
    )
    window.open(`https://wa.me/541140420769?text=${message}`, "_blank")
  }

  const handlePromoWhatsAppClick = () => {
    const message = encodeURIComponent(
      "Hola! Me interesa la promoción 2x1. ¿Qué disponibilidad hay y cómo reservo el turno?",
    )
    window.open(`https://wa.me/541140420769?text=${message}`, "_blank")
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background Video/Image */}
      <div className="absolute inset-0 z-0">
        <img
          src="/elegant-spa-treatment-room-with-soft-lighting-and-.jpg"
          alt="Centro de Estética"
          className="w-full h-full object-cover"
          style={{ transform: `translateY(${scrollY * 0.15}px) scale(1.1)`, willChange: "transform" }}
        />
        <div className="absolute inset-0 video-overlay" />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex justify-between items-center px-6 md:px-8 py-1 md:py-2">
        <div className="flex items-center gap-3">
          <img src="/ghisoni-logo.png" alt="Instituto Ghisoni" className="h-20 md:h-28 lg:h-36 w-auto block" />
          <h1 className="text-2xl md:text-3xl font-sans text-eterna-beige text-shadow leading-none relative -top-1 md:-top-2">Instituto Ghisoni</h1>
        </div>

        <div>
          <Button
            onClick={handleWhatsAppClick}
            className="bg-eterna-beige/10 backdrop-blur-subtle shadow-lg shadow-eterna-bordo/20 text-eterna-beige hover:bg-eterna-beige/20 transition-all duration-300"
          >
            Agendar Cita
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-[80vh] px-6 text-center">
        <div>
          <img
            src="/eterna-logo.png"
            alt="Eterna logo"
            className="h-24 md:h-32 lg:h-40 mx-auto mb-6 drop-shadow-lg"
          />
          <h2 className="text-7xl md:text-9xl lg:text-[12rem] font-berlys ot-ligs text-eterna-beige mb-4 text-shadow text-balance tracking-wider">
            eterna
          </h2>

          <p className="text-2xl md:text-3xl lg:text-4xl font-sans text-eterna-beige/90 mb-8 text-shadow">
            Belleza y Bienestar Redefinidos
          </p>

          <p className="text-lg md:text-xl text-eterna-beige/90 mb-8 max-w-2xl mx-auto font-light leading-relaxed text-pretty">
            Descubre una nueva dimensión de cuidado personal en nuestro centro de estética y depilación, donde la
            excelencia médica se encuentra con la belleza.
          </p>

          <div className="bg-eterna-bordo/20 backdrop-blur-md shadow-xl shadow-eterna-bordo/30 rounded-xl p-6 mb-8 max-w-lg mx-auto">
            <h3 className="text-2xl font-sans font-semibold text-eterna-beige mb-3">
              {process.env.NEXT_PUBLIC_PROMO_TITLE || "¡Promoción Especial!"}
            </h3>
            <p className="text-eterna-beige/90 text-lg mb-4 font-sans">
              Agenda tu turno para el{" "}
              <span className="font-medium text-eterna-bordo bg-eterna-beige px-2 py-1 rounded">
                {process.env.NEXT_PUBLIC_PROMO_DATE || "03/09"}
              </span>
            </p>
            <p className="text-xl font-medium text-eterna-beige mb-4 font-sans">
              🎉 <span className="text-eterna-bordo bg-eterna-beige px-2 py-1 rounded font-bold">{process.env.NEXT_PUBLIC_PROMO_HIGHLIGHT || "2x1"}</span> {process.env.NEXT_PUBLIC_PROMO_DESC || "con tu amiga o pareja"}
            </p>
            <Button
              onClick={handlePromoWhatsAppClick}
              className="bg-eterna-bordo hover:bg-eterna-bordo/90 text-eterna-beige px-6 py-3 font-medium transition-all duration-300 transform hover:scale-105 shadow-lg"
            >
              Reservar Promoción 2x1
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-12">
            <Button
              onClick={handleWhatsAppClick}
              size="lg"
              className="bg-eterna-bordo hover:bg-eterna-bordo/90 text-eterna-beige px-8 py-4 text-lg font-medium transition-all duration-300 transform hover:scale-105 shadow-lg"
            >
              <Phone className="mr-2 h-5 w-5" />
              Reservar Ahora
            </Button>

            <div className="bg-eterna-beige/10 backdrop-blur-subtle shadow-lg shadow-eterna-bordo/20 rounded-lg px-6 py-3">
              <p className="text-eterna-beige font-medium font-sans">
                Código: <span className="text-eterna-bordo bg-eterna-beige px-2 py-1 rounded font-bold">{process.env.NEXT_PUBLIC_DISCOUNT_CODE || "20FFOPEN"}</span>
              </p>
              <p className="text-eterna-beige/80 text-sm font-sans">{process.env.NEXT_PUBLIC_DISCOUNT_DESC || "20% descuento primera sesión"}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Services Section */}
      <div className="relative z-10 bg-black/40 backdrop-blur-sm py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <div>
            <h3 className="text-3xl md:text-4xl font-berlys text-eterna-beige text-center mb-12 text-shadow">
              Nuestros Servicios
            </h3>

            <div className="grid md:grid-cols-3 gap-8">
              <RevealOnScroll distance="translate-y-32">
                <div className="bg-eterna-beige/5 backdrop-blur-subtle shadow-lg shadow-eterna-bordo/10 rounded-lg p-6 text-center hover:bg-eterna-beige/10 transition-all duration-300">
                  <Sparkles className="h-12 w-12 text-eterna-bordo mx-auto mb-4" />
                  <h4 className="text-xl font-sans font-semibold text-eterna-beige mb-3">Depilación Láser</h4>
                  <p className="text-eterna-beige/80 font-light font-sans">
                    Tecnología de última generación para resultados duraderos y seguros
                  </p>
                </div>
              </RevealOnScroll>

              <RevealOnScroll delay={100} distance="translate-y-32">
                <div className="bg-eterna-beige/5 backdrop-blur-subtle shadow-lg shadow-eterna-bordo/10 rounded-lg p-6 text-center hover:bg-eterna-beige/10 transition-all duration-300 group relative overflow-hidden">
                  <Star className="h-12 w-12 text-eterna-bordo mx-auto mb-4 group-hover:blur-sm transition-all duration-300" />
                  <h4 className="text-xl font-sans font-semibold text-eterna-beige mb-3 group-hover:blur-sm transition-all duration-300">
                    Tratamientos Faciales
                  </h4>
                  <p className="text-eterna-beige/80 font-light font-sans group-hover:blur-sm transition-all duration-300">
                    Rejuvenecimiento y cuidado personalizado para tu piel
                  </p>
                  <div className="absolute inset-0 bg-eterna-bordo/90 backdrop-blur-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                    <p className="text-white text-2xl font-sans font-bold">Pronto Disponible</p>
                  </div>
                </div>
              </RevealOnScroll>

              <RevealOnScroll delay={200} distance="translate-y-32">
                <div className="bg-eterna-beige/5 backdrop-blur-subtle shadow-lg shadow-eterna-bordo/10 rounded-lg p-6 text-center hover:bg-eterna-beige/10 transition-all duration-300 group relative overflow-hidden">
                  <Heart className="h-12 w-12 text-eterna-bordo mx-auto mb-4 group-hover:blur-sm transition-all duration-300" />
                  <h4 className="text-xl font-sans font-semibold text-eterna-beige mb-3 group-hover:blur-sm transition-all duration-300">
                    Cuidado Corporal
                  </h4>
                  <p className="text-eterna-beige/80 font-light font-sans group-hover:blur-sm transition-all duration-300">
                    Tratamientos integrales para tu bienestar y belleza
                  </p>
                  <div className="absolute inset-0 bg-eterna-bordo/90 backdrop-blur-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                    <p className="text-white text-2xl font-sans font-bold">Pronto Disponible</p>
                  </div>
                </div>
              </RevealOnScroll>
            </div>
          </div>
        </div>
      </div>

      {/* Contact Section */}
      <div className="relative z-10 py-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div>
            <h3 className="text-3xl md:text-4xl font-berlys text-eterna-beige mb-8 text-shadow">Visítanos</h3>

            <div className="grid md:grid-cols-2 gap-8 mb-12">
              <RevealOnScroll distance="translate-y-32">
                <div className="bg-eterna-beige/10 backdrop-blur-lg shadow-lg shadow-eterna-bordo/20 rounded-lg p-6">
                  <MapPin className="h-8 w-8 text-eterna-bordo mx-auto mb-4" />
                  <h4 className="text-lg font-sans font-semibold text-eterna-beige mb-2">Ubicación</h4>
                  <p className="text-eterna-beige/90 font-light font-sans">Pereyra Lucena 575</p>
                  <p className="text-eterna-beige/80 text-sm mt-1 font-sans">Lomas de Zamora</p>
                </div>
              </RevealOnScroll>

              <RevealOnScroll delay={100} distance="translate-y-32">
                <div className="bg-eterna-beige/10 backdrop-blur-lg shadow-lg shadow-eterna-bordo/20 rounded-lg p-6">
                  <Clock className="h-8 w-8 text-eterna-bordo mx-auto mb-4" />
                  <h4 className="text-lg font-sans font-semibold text-eterna-beige mb-2">Horarios</h4>
                  <p className="text-eterna-beige/90 font-light font-sans">Lun - Vie: 10:00 - 19:00</p>
                  <p className="text-eterna-beige/80 text-sm font-sans">Sábados cerrado</p>
                </div>
              </RevealOnScroll>
            </div>

            <div className="bg-eterna-bordo/20 backdrop-blur-subtle shadow-xl shadow-eterna-bordo/30 rounded-lg p-8">
              <h4 className="text-2xl font-sans font-semibold text-eterna-beige mb-4">
                ¿Lista para transformar tu belleza?
              </h4>
              <p className="text-eterna-beige/90 mb-6 font-light font-sans">
                Agenda tu cita y descubre la excelencia en cuidado estético
              </p>
              <Button
                onClick={handleWhatsAppClick}
                size="lg"
                className="bg-eterna-bordo hover:bg-eterna-bordo/90 text-eterna-beige px-8 py-4 text-lg font-medium transition-all duration-300 transform hover:scale-105 shadow-lg"
              >
                <Phone className="mr-2 h-5 w-5" />
                Contactar por WhatsApp
              </Button>
            </div>

            {/* Social Section */}
            <div className="mt-12">
              <h4 className="text-2xl font-berlys text-eterna-beige mb-6 text-shadow">Redes</h4>
              <div className="flex items-center justify-center gap-6">
                <a
                  href="https://instagram.com/eterna.st"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-eterna-beige/90 hover:text-eterna-beige transition-colors"
                >
                  <Instagram className="h-6 w-6 text-eterna-beige" />
                  <span className="font-sans">@eterna.st</span>
                </a>
                <a
                  href="https://instagram.com/instituto_ghisoni"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-eterna-beige/90 hover:text-eterna-beige transition-colors"
                >
                  <Instagram className="h-6 w-6 text-eterna-beige" />
                  <span className="font-sans">@instituto_ghisoni</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 bg-black/80 backdrop-blur-sm py-8 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div>
            <p className="text-eterna-beige/60 font-sans">
              © 2025 Instituto Ghisoni - Eterna: Centro de Estética y Depilación
            </p>
            <p className="text-eterna-beige/40 text-sm mt-2 font-sans">Ginecología, Fertilidad y Belleza Integral</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
