import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Contactar con servicios de limpieza",
  description:
    "Contacta al equipo de Reludcir por WhatsApp o correo electrónico para resolver dudas sobre tu servicio de limpieza.",
  alternates: { canonical: "/contactar-con-servicios-de-limpieza" },
};

const whatsappMessage = encodeURIComponent(
  "Reludcir, ¿me podrían informar sobre el servicio de limpieza?",
);

export default function ContactPage() {
  return (
    <main className="content-page contact-page">
      <section className="page-hero contact-page__hero" aria-labelledby="contact-title">
        <div className="content-shell page-hero__content">
          <h1 id="contact-title">Contactar con servicios de limpieza</h1>
          <p>
            Escríbenos para resolver dudas sobre una reserva, solicitar atención o conocer
            más sobre nuestros servicios para hogares y empresas.
          </p>
          <Link className="button button--primary" href="/#form">
            Solicitar un servicio de limpieza
          </Link>
        </div>
      </section>

      <section className="page-section contact-page__channels" aria-labelledby="channels-title">
        <div className="content-shell">
          <header className="section-heading">
            <h2 id="channels-title">Canales de atención</h2>
            <p>Elige el medio que te resulte más cómodo.</p>
          </header>
          <div className="contact-list">
            <article className="contact-item">
              <h3>WhatsApp</h3>
              <p>
                Atención automática disponible las 24 horas y acceso a nuestro equipo de
                soporte cuando lo necesites.
              </p>
              <a
                className="button button--primary"
                href={`https://wa.me/51994358300?text=${whatsappMessage}`}
                rel="noreferrer"
                target="_blank"
              >
                Escribir al +51 994 358 300
              </a>
            </article>
            <article className="contact-item">
              <h3>Correo electrónico</h3>
              <p>
                Recomendado para solicitudes corporativas, propuestas o consultas que
                requieren más detalle.
              </p>
              <a className="text-link" href="mailto:info.reludcir@gmail.com">
                info.reludcir@gmail.com
              </a>
            </article>
            <article className="contact-item">
              <h3>Agenda una llamada</h3>
              <p>Reserva una llamada de 15 minutos en el horario que prefieras.</p>
              <a
                className="text-link"
                href="https://calendly.com/reludcir/15min"
                rel="noreferrer"
                target="_blank"
              >
                Ver horarios disponibles
              </a>
            </article>
          </div>
        </div>
      </section>

      <section className="page-section page-section--muted" aria-labelledby="notifications-title">
        <div className="content-shell two-column-section">
          <div>
            <h2 id="notifications-title">Notificaciones por correo electrónico</h2>
            <p>
              Te enviaremos información sobre el estado de tu pedido, confirmaciones de
              pago y los cambios que realices en una reserva.
            </p>
          </div>
          <div>
            <h2>Notificaciones por WhatsApp</h2>
            <p>
              Recibirás confirmaciones y recordatorios automáticos. Para responder o pedir
              ayuda, utiliza la línea de WhatsApp indicada arriba.
            </p>
          </div>
        </div>
      </section>

      <section className="page-section" aria-labelledby="social-title">
        <div className="content-shell">
          <h2 id="social-title">Redes sociales de Reludcir</h2>
          <nav className="social-links" aria-label="Redes sociales">
            <a href="https://www.instagram.com/reludcir/" rel="noreferrer" target="_blank">
              Instagram
            </a>
            <a href="https://www.facebook.com/reludcir" rel="noreferrer" target="_blank">
              Facebook
            </a>
            <a href="https://twitter.com/reludcir" rel="noreferrer" target="_blank">
              X / Twitter
            </a>
          </nav>
          <p className="privacy-note">
            Consulta cómo usamos y protegemos tu información en nuestra{" "}
            <Link href="/privacidad">política de privacidad</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}
