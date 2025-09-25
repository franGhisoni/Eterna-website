"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { MapPin, Phone, Clock, Sparkles, Star, Heart } from "lucide-react"

export default function HomePage() {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    setIsVisible(true)
  }, [])

  const handleWhatsAppClick = () => {
    const message = encodeURIComponent(
      "Hola! Me gustaría agendar una cita en Eterna - Centro de Estética del Instituto Ghisoni. Código: 20FFOPEN",
    )
    window.open(`https://wa.me/573001234567?text=${message}`, "_blank")
  }

  const handlePromoWhatsAppClick = () => {
    const message = encodeURIComponent(
      "Hola! Me interesa la promoción 2x1 para el 03/09 con mi amiga/pareja en Eterna - Centro de Estética. Código: 20FFOPEN",
    )
    window.open(`https://wa.me/573001234567?text=${message}`, "_blank")
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background Video/Image */}
      <div className="absolute inset-0 z-0">
        <img
          src="/elegant-spa-treatment-room-with-soft-lighting-and-.jpg"
          alt="Centro de Estética"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 video-overlay" />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex justify-between items-center p-6 md:p-8">
        <div
          className={`flex items-center gap-4 transition-all duration-1000 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"}`}
        >
          <img src="/ghisoni-logo.png" alt="Instituto Ghisoni" className="h-12 w-12" />
          <div>
            <h1 className="text-xl md:text-2xl font-sans text-eterna-beige text-shadow">Instituto Ghisoni</h1>
            <div className="flex items-center gap-2">
              <img src="/eterna-logo.png" alt="Eterna" className="h-6 w-6" />
              <p className="text-sm text-eterna-beige/80 font-sans italic">Eterna: centro de estética</p>
            </div>
          </div>
        </div>

        <div
          className={`transition-all duration-1000 delay-200 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-4"}`}
        >
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
        <div
          className={`transition-all duration-1000 delay-300 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
        >
          <h2 className="text-7xl md:text-9xl lg:text-[12rem] font-berlys text-eterna-beige mb-4 text-shadow text-balance tracking-wider">
            ETERNA
          </h2>

          <p className="text-2xl md:text-3xl lg:text-4xl font-sans text-eterna-beige/90 mb-8 text-shadow">
            Belleza y Bienestar Redefinidos
          </p>

          <p className="text-lg md:text-xl text-eterna-beige/90 mb-8 max-w-2xl mx-auto font-light leading-relaxed text-pretty">
            Descubre una nueva dimensión de cuidado personal en nuestro centro de estética y depilación, donde la
            excelencia médica se encuentra con la belleza.
          </p>

          <div className="bg-eterna-bordo/20 backdrop-blur-md shadow-xl shadow-eterna-bordo/30 rounded-xl p-6 mb-8 max-w-lg mx-auto">
            <h3 className="text-2xl font-sans font-semibold text-eterna-beige mb-3">¡Promoción Especial!</h3>
            <p className="text-eterna-beige/90 text-lg mb-4 font-sans">
              Agenda tu turno para el{" "}
              <span className="font-medium text-eterna-bordo bg-eterna-beige px-2 py-1 rounded">03/09</span>
            </p>
            <p className="text-xl font-medium text-eterna-beige mb-4 font-sans">
              🎉 <span className="text-eterna-bordo bg-eterna-beige px-2 py-1 rounded font-bold">2x1</span> con tu amiga
              o pareja
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
                Código: <span className="text-eterna-bordo bg-eterna-beige px-2 py-1 rounded font-bold">20FFOPEN</span>
              </p>
              <p className="text-eterna-beige/80 text-sm font-sans">20% descuento primera sesión</p>
            </div>
          </div>
        </div>
      </div>

      {/* Services Section */}
      <div className="relative z-10 bg-black/40 backdrop-blur-sm py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <div
            className={`transition-all duration-1000 delay-500 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
          >
            <h3 className="text-3xl md:text-4xl font-berlys text-eterna-beige text-center mb-12 text-shadow">
              Nuestros Servicios
            </h3>

            <div className="grid md:grid-cols-3 gap-8">
              <div className="bg-eterna-beige/5 backdrop-blur-subtle shadow-lg shadow-eterna-bordo/10 rounded-lg p-6 text-center hover:bg-eterna-beige/10 transition-all duration-300">
                <Sparkles className="h-12 w-12 text-eterna-bordo mx-auto mb-4" />
                <h4 className="text-xl font-sans font-semibold text-eterna-beige mb-3">Depilación Láser</h4>
                <p className="text-eterna-beige/80 font-light font-sans">
                  Tecnología de última generación para resultados duraderos y seguros
                </p>
              </div>

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
            </div>
          </div>
        </div>
      </div>

      {/* Contact Section */}
      <div className="relative z-10 py-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div
            className={`transition-all duration-1000 delay-700 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
          >
            <h3 className="text-3xl md:text-4xl font-berlys text-eterna-beige mb-8 text-shadow">Visítanos</h3>

            <div className="grid md:grid-cols-2 gap-8 mb-12">
              <div className="bg-eterna-beige/10 backdrop-blur-subtle shadow-lg shadow-eterna-bordo/20 rounded-lg p-6">
                <MapPin className="h-8 w-8 text-eterna-bordo mx-auto mb-4" />
                <h4 className="text-lg font-sans font-semibold text-eterna-beige mb-2">Ubicación</h4>
                <p className="text-eterna-beige/90 font-light font-sans">Pereyra Lucena 575</p>
                <p className="text-eterna-beige/80 text-sm mt-1 font-sans">Lomas de Zamora</p>
              </div>

              <div className="bg-eterna-beige/10 backdrop-blur-subtle shadow-lg shadow-eterna-bordo/20 rounded-lg p-6">
                <Clock className="h-8 w-8 text-eterna-bordo mx-auto mb-4" />
                <h4 className="text-lg font-sans font-semibold text-eterna-beige mb-2">Horarios</h4>
                <p className="text-eterna-beige/90 font-light font-sans">Lun - Vie: 10:00 - 19:00</p>
                <p className="text-eterna-beige/80 text-sm font-sans">Sábados cerrado</p>
              </div>
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
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 bg-black/80 backdrop-blur-sm py-8 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div
            className={`transition-all duration-1000 delay-900 ${isVisible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}`}
          >
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
