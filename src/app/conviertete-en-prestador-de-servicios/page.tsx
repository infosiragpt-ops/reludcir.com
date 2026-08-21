import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Conviértete en prestador de servicios",
  description:
    "Conoce cómo ofrecer servicios de limpieza de manera independiente a través de la plataforma Reludcir.",
  alternates: { canonical: "/conviertete-en-prestador-de-servicios" },
};

const availabilityOptions = [
  ["Días", "Define los días en los que deseas ofrecer tus servicios."],
  ["Horarios", "Indica los horarios en los que estarás disponible."],
  ["Zonas", "Selecciona las zonas geográficas donde deseas prestar servicios."],
] as const;

const independentBenefits = [
  "Tú decides cuándo ofrecer tus servicios.",
  "Tú defines dónde deseas prestar servicios.",
  "Puedes modificar tu disponibilidad cuando lo necesites.",
  "No existe una cantidad mínima de servicios.",
  "Puedes ofrecer tus servicios a otros clientes, empresas o plataformas.",
  "No existe exclusividad.",
] as const;

const incorporationRequirements = [
  "Documento de identidad.",
  "Validación de información personal.",
  "Información sobre experiencia previa.",
  "Participación en una inducción sobre el uso de la plataforma.",
] as const;

export default function ServiceProviderPage() {
  return (
    <main className="content-page service-page">
      <section className="page-hero service-page__hero" aria-labelledby="provider-title">
        <div className="content-shell page-hero__content">
          <h1 id="provider-title">Conviértete en prestador de servicios</h1>
          <p>Ofrece servicios de limpieza a través de Reludcir.</p>
        </div>
      </section>

      <section className="page-section" aria-labelledby="income-title">
        <div className="content-shell content-shell--narrow">
          <header className="section-heading">
            <h2 id="income-title">Genera ingresos administrando tu propio tiempo</h2>
          </header>
          <p>
            Reludcir es una plataforma tecnológica que facilita el contacto entre
            personas que requieren servicios de limpieza para sus hogares y prestadores
            independientes que desean ofrecer estos servicios de acuerdo con su propia
            disponibilidad.
          </p>
          <p>
            Si cuentas con experiencia, eres responsable y disfrutas brindar un servicio
            de calidad, puedes registrarte en nuestra plataforma y comenzar a recibir
            solicitudes de clientes que buscan un prestador disponible en su zona.
          </p>
        </div>
      </section>

      <section className="page-section page-section--muted" aria-labelledby="how-title">
        <div className="content-shell">
          <header className="section-heading">
            <h2 id="how-title">¿Cómo funciona?</h2>
            <p>Como prestador independiente, tú defines directamente en la plataforma:</p>
          </header>
          <div className="feature-list">
            {availabilityOptions.map(([title, description]) => (
              <article className="feature-item" key={title}>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
          <aside className="notice">
            <p>
              Puedes actualizar esta información en cualquier momento, sin penalidad. La
              plataforma mostrará tu perfil únicamente a los clientes cuya solicitud
              coincida con la disponibilidad y ubicación que hayas definido.
            </p>
          </aside>
          <p>
            Cada cliente elige libremente al prestador con quien desea contratar el
            servicio. Una vez realizado el servicio y confirmado por el cliente, Reludcir
            gestiona la liquidación del pago correspondiente.
          </p>
        </div>
      </section>

      <section className="page-section" aria-labelledby="activity-title">
        <div className="content-shell">
          <header className="section-heading">
            <h2 id="activity-title">Tú administras tu actividad</h2>
            <p>Como prestador independiente:</p>
          </header>
          <ul className="feature-list">
            {independentBenefits.map((benefit) => (
              <li className="feature-item" key={benefit}>
                <p>{benefit}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="page-section page-section--muted">
        <div className="content-shell two-column-section">
          <section aria-labelledby="trust-title">
            <h2 id="trust-title">Calidad y confianza</h2>
            <p>
              Nuestra comunidad se basa en la confianza. Los clientes podrán calificar la
              experiencia recibida. Las mejores valoraciones podrán dar lugar a programas
              de reconocimiento e incentivos definidos por la plataforma.
            </p>
            <p>
              Todos los usuarios deberán cumplir las Condiciones de Uso y los estándares
              mínimos de calidad y seguridad establecidos para proteger a la comunidad.
            </p>
          </section>
          <section aria-labelledby="payments-title">
            <h2 id="payments-title">Pagos</h2>
            <p>
              Los pagos de los clientes son procesados por Reludcir. Las liquidaciones a
              los prestadores se realizan semanalmente por los servicios efectivamente
              completados.
            </p>
          </section>
        </div>
      </section>

      <section className="page-section page-section--accent" aria-labelledby="register-title">
        <div className="content-shell content-shell--narrow">
          <header className="section-heading">
            <h2 id="register-title">¿Quién puede registrarse?</h2>
            <p>Buscamos personas responsables, comprometidas y orientadas al buen servicio.</p>
          </header>
          <p>Durante el proceso de incorporación podremos solicitar:</p>
          <ul>
            {incorporationRequirements.map((requirement) => (
              <li key={requirement}>{requirement}</li>
            ))}
          </ul>
          <p>
            Forma parte de la comunidad Reludcir y comienza a ofrecer tus servicios con
            total flexibilidad.
          </p>
        </div>
      </section>
    </main>
  );
}
