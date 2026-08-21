import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDownCircle,
  ArrowRightCircle,
  BadgeCheck,
  Building2,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  Facebook,
  HeartHandshake,
  House,
  MapPinned,
  MessageCircle,
  PawPrint,
  ShieldCheck,
  Shirt,
  Sparkles,
  SprayCan,
  Star,
  Twitter,
  Utensils,
  WalletCards,
  Zap,
} from "lucide-react";
import { BookingWizard } from "@/components/booking/BookingWizard";
import { HowItWorksGallery } from "@/components/HowItWorksGallery";
import { testimonials } from "@/data/site";

export const metadata: Metadata = {
  title: { absolute: "Servicios de limpieza a domicilio - Reludcir" },
  description:
    "Servicios de limpieza a domicilio. Reserva un servicio de limpieza para tu casa o departamento; selecciona tu ubicación, servicio y horario.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Servicios de limpieza a domicilio",
    description:
      "Servicios de limpieza a domicilio. Reserva un servicio de limpieza para tu casa o departamento; selecciona tu ubicación, servicio y horario.",
    locale: "es_ES",
    images: [
      {
        url: "/assets/businesswoman-disinfecting-office.jpg",
        width: 1_600,
        height: 1_067,
        type: "image/jpeg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@reludcir",
    title: "Servicios de limpieza a domicilio",
    description:
      "Servicios de limpieza a domicilio. Reserva un servicio de limpieza para tu casa o departamento; selecciona tu ubicación, servicio y horario.",
    images: ["/assets/businesswoman-disinfecting-office.jpg"],
  },
};

const priceCards = [
  {
    hours: "4 horas",
    price: "S/. 67",
    description: "Hasta 50 m² | Minidepartamentos o casas: sala, habitación, cocina y baño.",
    image: "/assets/cleaning-bedroom.webp",
  },
  {
    hours: "6 horas",
    price: "S/. 99",
    description: "Hasta 90 m² | Departamentos o casas: sala, dos habitaciones, cocina y baño.",
    image: "/assets/cleaning-living-room.webp",
  },
  {
    hours: "8 horas",
    price: "S/. 127",
    description: "Hasta 120 m² | Casas o depas: sala, tres habitaciones, cocina, baños y balcón.",
    image: "/assets/cleaning-lima.webp",
  },
];

const includedServices = [
  {
    icon: Sparkles,
    title: "Limpieza de espacios de tu casa",
    text: "Limpieza de sala, comedor, cocina, baños, habitaciones y demás ambientes de tu hogar.",
  },
  {
    icon: Shirt,
    title: "Lavado y planchado de ropa",
    text: "Lavado en lavadora y planchado, según el tiempo disponible y las indicaciones del hogar.",
  },
  {
    icon: Utensils,
    title: "Limpieza de utensilios",
    text: "Lavado de platos, cubiertos, vasos y ollas de uso diario, evitando objetos delicados.",
  },
  {
    icon: SprayCan,
    title: "Desinfección de espacios",
    text: "Desinfección de baños, cocina, manijas, interruptores y superficies de uso frecuente.",
  },
  {
    icon: PawPrint,
    title: "Atención a mascotas",
    text: "Limpieza de sus espacios, agua fresca y alimentación dentro del domicilio.",
  },
];

const reasons = [
  {
    icon: CalendarCheck2,
    title: "Reserva 100% online, 24/7",
    text: "Completa el pedido a cualquier hora y recibe confirmación automáticamente.",
  },
  {
    icon: WalletCards,
    title: "Precios transparentes",
    text: "Conoce el total y la duración antes de confirmar el turno.",
  },
  {
    icon: Clock3,
    title: "Flexibilidad total",
    text: "Servicios de lunes a domingo y autogestión desde tu panel.",
  },
  {
    icon: House,
    title: "Ideal para casas, depas y Airbnb",
    text: "Priorizamos el servicio según el inmueble y tus instrucciones.",
  },
  {
    icon: BadgeCheck,
    title: "Personal verificado",
    text: "Agentes evaluados, capacitados y supervisados.",
  },
  {
    icon: ShieldCheck,
    title: "Seguridad y confidencialidad",
    text: "Protegemos tus datos, tu hogar y la información de cada reserva.",
  },
  {
    icon: HeartHandshake,
    title: "Garantía de satisfacción",
    text: "Revisamos cada incidencia y buscamos una solución rápida.",
  },
  {
    icon: Star,
    title: "Calificaciones reales",
    text: "El servicio mantiene una valoración promedio de 4.8 sobre 5.",
  },
];

export default function HomePage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "HomeAndConstructionBusiness",
    name: "Reludcir",
    url: process.env.NEXT_PUBLIC_SITE_URL ?? "https://reludcir.com",
    telephone: "+51 994 358 300",
    areaServed: "Lima, Perú",
    priceRange: "S/ 61 - S/ 127",
    aggregateRating: { "@type": "AggregateRating", ratingValue: "4.8", bestRating: "5" },
  };

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <section className="homeHero">
        <div className="contentWidth heroContent">
          <h1>Servicios de limpieza a domicilio</h1>
          <p>
            Servicios de limpieza a domicilio. Reserva un servicio de limpieza para tu
            casa o departamento; selecciona tu ubicación, servicio y horario. Listo.
          </p>
          <div className="heroActions">
            <a className="primaryButton" href="#form">
              Reservar un servicio de limpieza a domicilio
              <ArrowDownCircle aria-hidden="true" />
            </a>
            <Link className="secondaryButton" href="/limpieza-de-casas">
              ¿Como funciona? <ArrowRightCircle aria-hidden="true" />
            </Link>
          </div>
        </div>
        <HowItWorksGallery />
      </section>

      <section className="reservationBand" id="form">
        <div className="bookingWrap contentWidth">
          <div className="bookingTabs" role="tablist" aria-label="Tipo de reserva">
            <button type="button" role="tab" aria-selected="true">Reservas para hogares</button>
            <button type="button" role="tab" aria-selected="false" disabled>
              Reservas para empresas [próximamente]
            </button>
          </div>
          <BookingWizard />
        </div>
      </section>

      <div className="sectionRibbon">¿Por qué elegirnos?</div>

      <section className="serviceBenefitsSection" aria-label="Beneficios del servicio">
        <div className="serviceBenefitBadges contentWidth">
          <Image src="/assets/price-4h.webp" alt="Notificaciones por WhatsApp" width={199} height={113} />
          <Image src="/assets/price-6h.webp" alt="Reservas inmediatas, disponibles 24/7" width={199} height={113} />
          <Image src="/assets/price-8h.webp" alt="Ahorro con precios justos" width={199} height={113} />
          <Image src="/assets/price-cta.webp" alt="Servicio de limpieza confiable" width={199} height={113} />
        </div>
      </section>

      <section className="servicesOverview contentWidth sectionPad">
        <div className="overviewCopy">
          <span className="sectionIcon"><House aria-hidden="true" /></span>
          <h2>Servicios de limpieza a domicilio de casas y depas</h2>
          <p>
            Limpiamos tu casa, departamento o edificio. Puedes contratar un servicio
            puntual o recurrente y elegir exactamente cuántas horas necesitas.
          </p>
          <Link href="/limpieza-de-casas">Leer más sobre el servicio <ArrowRightCircle aria-hidden="true" /></Link>
        </div>
        <div className="overviewSide">
          <article>
            <span className="sectionIcon"><Building2 aria-hidden="true" /></span>
            <h3>Limpieza para empresas</h3>
            <p>Atendemos oficinas, depósitos y otras instalaciones con servicios puntuales o recurrentes.</p>
          </article>
          <article>
            <span className="sectionIcon"><MapPinned aria-hidden="true" /></span>
            <h3>Ubicaciones</h3>
            <p>Disponibles en Surco, Miraflores, San Borja, San Isidro, Surquillo, Jesús María, San Miguel, Magdalena y Barranco.</p>
            <a href="#form">Ver distritos disponibles</a>
          </article>
          <article className="quickBooking">
            <CalendarCheck2 aria-hidden="true" />
            <div>
              <h3>Agenda en pocos segundos.</h3>
              <p>Reserva 24/7 y reprograma hasta 12 horas antes del servicio.</p>
            </div>
            <a href="#form">Reservar</a>
          </article>
        </div>
      </section>

      <section className="whatsAppStrip">
        <div className="contentWidth">
          <MessageCircle aria-hidden="true" />
          <div><span>Escríbenos al WhatsApp</span><strong>+51 994 358 300</strong></div>
          <a href="https://wa.me/51994358300" target="_blank" rel="noreferrer">Abrir WhatsApp</a>
        </div>
      </section>

      <section className="pricingSection sectionPad">
        <div className="sectionIntro contentWidth">
          <span>Precios claros</span>
          <h2>Precios de servicios de limpieza de casas</h2>
          <p>
            Los servicios domésticos cuestan entre S/ 61 y S/ 127. Al contratar más
            horas o una frecuencia recurrente accedes a mejores tarifas.
          </p>
        </div>
        <div className="priceGrid contentWidth">
          {priceCards.map((card) => (
            <article className="priceCard" key={card.hours}>
              <Image src={card.image} alt={`Servicio de limpieza de ${card.hours}`} width={199} height={113} />
              <div>
                <h3>{card.hours} - {card.price}</h3>
                <p>{card.description}</p>
                <a href="#form">Elegir servicio <ArrowRightCircle aria-hidden="true" /></a>
              </div>
            </article>
          ))}
          <article className="priceCard priceCardCta">
            <Image src="/assets/cleaning-by-hours.webp" alt="Servicio de limpieza por horas" width={780} height={435} />
            <div>
              <h3>Contratar un servicio de limpieza</h3>
              <p>Reserva uno o varios servicios desde el formulario de pedidos.</p>
              <a href="#form">Contratar ahora <ArrowRightCircle aria-hidden="true" /></a>
            </div>
          </article>
        </div>
      </section>

      <section className="trustSection sectionPad">
        <div className="sectionIntro contentWidth">
          <span>Servicio confiable</span>
          <h2>Servicios de limpieza confiable</h2>
        </div>
        <div className="trustGrid contentWidth">
          <article>
            <Clock3 aria-hidden="true" />
            <h3>Siempre disponibles</h3>
            <ul>
              <li>Agenda online en cualquier momento, 24/7.</li>
              <li>Paga con Yape, tarjeta o transferencia.</li>
              <li>Confirmación inmediata y recordatorios.</li>
              <li>Flexibilidad para reprogramar.</li>
            </ul>
          </article>
          <article>
            <BadgeCheck aria-hidden="true" />
            <h3>Agentes confiables</h3>
            <ul>
              <li>Entrevista personal y evaluación.</li>
              <li>Verificación domiciliaria y antecedentes.</li>
              <li>Capacitaciones y seguimiento.</li>
            </ul>
          </article>
          <article>
            <Zap aria-hidden="true" />
            <h3>Priorizamos la eficiencia</h3>
            <p>Cada agente organiza el tiempo contratado alrededor de las tareas que tú priorices.</p>
            <Image src="/assets/cleaning-offices.webp" alt="Servicios de limpieza a domicilio" width={555} height={585} />
          </article>
        </div>
        <div className="ratingStrip contentWidth">
          <div><strong>4.8</strong><span>de 5</span><div className="stars">★★★★★</div></div>
          <div><strong>4.8/5</strong><span>En reviews</span></div>
          <div><strong>4.7/5</strong><span>En reviews</span></div>
          <div><strong>4.8/5</strong><span>En reviews</span></div>
        </div>
      </section>

      <section className="whySection sectionPad contentWidth">
        <div className="whyLead">
          <div>
            <span>Reserva segura</span>
            <h2>¿Por qué elegir nuestro servicio de limpieza a domicilio en Lima?</h2>
            <h3>Reserva online para casas y departamentos en menos de dos minutos.</h3>
            <p>
              El proceso es inmediato: eliges distrito, duración, fecha, agente y ves
              el precio final antes de confirmar, sin llamadas ni cotizaciones.
            </p>
          </div>
        </div>
        <div className="reasonGrid">
          {reasons.map(({ icon: Icon, title, text }) => (
            <article key={title}>
              <Icon aria-hidden="true" />
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="testimonials sectionPad">
        <div className="sectionIntro contentWidth"><span>Clientes</span><h2>Calificaciones reales</h2></div>
        <div className="testimonialGrid contentWidth">
          {testimonials.map((testimonial) => (
            <figure key={testimonial.name}>
              <Image
                className="testimonialAvatar"
                src={testimonial.image}
                alt={`Retrato de ${testimonial.name}`}
                width={82}
                height={82}
              />
              <div className="stars">★★★★★</div>
              <blockquote>“{testimonial.quote}”</blockquote>
              <figcaption>
                <a href={testimonial.socialUrl} target="_blank" rel="noreferrer">
                  <strong>{testimonial.name}</strong>
                  {testimonial.social === "twitter" ? (
                    <Twitter aria-label="Twitter" />
                  ) : (
                    <Facebook aria-label="Facebook" />
                  )}
                </a>
                <span>{testimonial.role}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="includedSection sectionPad contentWidth">
        <div className="sectionIntro">
          <span>Tu hogar</span>
          <h2>¿Qué incluye los servicios de limpieza a domicilio?</h2>
          <p>Priorizamos espacios, ropa, utensilios, desinfección, orden y la atención básica de tus mascotas.</p>
        </div>
        <div className="includedGrid">
          {includedServices.map(({ icon: Icon, title, text }) => (
            <article key={title}><Icon aria-hidden="true" /><h3>{title}</h3><p>{text}</p></article>
          ))}
        </div>
        <a className="primaryButton centeredButton" href="#form">Agendar un servicio de limpieza</a>
      </section>

      <section className="stepsSection sectionPad">
        <div className="contentWidth stepsLayout">
          <div>
            <span>Reserva en 2 minutos</span>
            <h2>Cómo reservar un servicio de limpieza en Reludcir</h2>
            <p>Elige distrito, horario, personal y realiza el pago directamente.</p>
            <a className="secondaryButton" href="#form">Agendar en este momento</a>
          </div>
          <ol>
            {[
              "Ingresa a Reservas para hogares.",
              "Selecciona el distrito donde se realizará la limpieza.",
              "Elige un servicio único o recurrente.",
              "Selecciona una duración de 4, 6 u 8 horas.",
              "Escoge la fecha y el horario disponible.",
              "Selecciona al personal y revisa su calificación.",
              "Completa tus datos y la dirección del servicio.",
              "Revisa servicio, fecha, personal, distrito y total.",
              "Confirma el turno.",
              "Completa el pago con tarjeta, Yape o transferencia.",
            ].map((item) => <li key={item}><CheckCircle2 aria-hidden="true" />{item}</li>)}
          </ol>
          <aside className="stepsImportant">
            <h3>Importante</h3>
            <p>
              Si ya tienes una cuenta, tus reservas quedan disponibles en el panel. Todo
              el proceso puede completarse en línea sin esperar una cotización.
            </p>
          </aside>
        </div>
      </section>

      <section className="newsletterSection">
        <div className="contentWidth">
          <div>
            <span>Suscríbete a nuestro Newsletter</span>
            <h2>Te enviaremos noticias y ofertas especiales.</h2>
            <p id="newsletter-suscrito" className="newsletterSuccess" role="status">
              Gracias. Tu correo quedó suscrito correctamente.
            </p>
          </div>
          <form action="/api/v1/newsletter" method="post">
            <label className="srOnly" htmlFor="newsletter-email">Correo electrónico</label>
            <input id="newsletter-email" name="email" type="email" placeholder="Tu correo electrónico" required />
            <button type="submit">Suscribirme</button>
          </form>
        </div>
      </section>
    </main>
  );
}
