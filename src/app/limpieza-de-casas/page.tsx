import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Limpieza de casas",
  description:
    "Servicios de limpieza de casas y departamentos por horas en Lima. Reserva en línea y gestiona tu servicio desde tu cuenta.",
  alternates: { canonical: "/limpieza-de-casas" },
};

const services = [
  {
    title: "Limpieza de superficies",
    description:
      "Limpieza de pisos y espacios como sala, comedor, cocina, baños y habitaciones.",
  },
  {
    title: "Lavado y planchado",
    description:
      "Lavado de ropa en lavadora y planchado aproximado de 6 a 9 prendas por hora.",
  },
  {
    title: "Limpieza de utensilios",
    description:
      "Limpieza de utensilios de cocina y uso doméstico, exceptuando objetos delicados o frágiles.",
  },
  {
    title: "Desinfección de espacios",
    description:
      "Desinfección de baños, cocinas, manijas, interruptores y mobiliario de uso frecuente.",
  },
  {
    title: "Atención a las mascotas",
    description:
      "Limpieza de sus espacios, alimentación y agua dentro del hogar. No incluye paseos fuera del domicilio.",
  },
];

const accountActions = [
  ["Agendar", "Reserva desde tu teléfono o computadora en pocos minutos."],
  ["Pagar", "Paga con Yape, transferencia bancaria o tarjeta de crédito o débito."],
  ["Notificaciones", "Recibe por WhatsApp el estado y los recordatorios de tus reservas."],
  ["Reprogramar", "Escoge una nueva fecha y hora desde tu panel de control."],
  ["Incidentes", "Avisa cualquier incidente ocurrido durante el servicio."],
  ["Tardanzas", "Repórtanos si el agente no llega dentro del tiempo previsto."],
  ["Inasistencias", "Notifícanos desde tu reserva si el agente no se presenta."],
  ["Cancelar", "Cancela sin costo cuando lo haces con al menos 24 horas de anticipación."],
];

const faqs: Array<{ answer: ReactNode; question: string }> = [
  {
    question: "¿Qué es Reludcir?",
    answer:
      "Reludcir es una plataforma que conecta a clientes que necesitan ayuda con la limpieza de su hogar con prestadores de servicios por horas.",
  },
  {
    question: "¿Cómo funciona?",
    answer: (
      <p>
        Ingresa al <Link href="/#form">formulario de reservas</Link>, selecciona la
        ubicación, el tipo de servicio, la fecha, la hora y el personal disponible. Al
        reservar tendrás una cuenta para administrar tus pedidos.
      </p>
    ),
  },
  {
    question: "¿Cuál es el precio?",
    answer: (
      <div>
        <p>
          El precio depende de la duración y de si eliges un servicio único o recurrente.
          Antes de confirmar verás siempre el total de tu reserva.
        </p>
        <ul>
          <li>Servicio único de 4 horas: S/ 67.</li>
          <li>Servicio único de 6 horas: S/ 99.</li>
          <li>Servicio único de 8 horas: S/ 127.</li>
          <li>Servicios recurrentes desde S/ 61.</li>
        </ul>
      </div>
    ),
  },
  {
    question: "¿Cómo contrato un servicio?",
    answer: (
      <p>
        Completa tu reserva en línea. Te enviaremos notificaciones sobre el estado del
        pedido, el pago y la confirmación del servicio.
      </p>
    ),
  },
  {
    question: "¿Cómo pago el servicio?",
    answer:
      "Puedes pagar con Yape o Plin, transferencia bancaria, tarjeta de crédito o tarjeta de débito.",
  },
  {
    question: "¿En qué distritos atienden?",
    answer:
      "Atendemos en Miraflores, San Borja, San Isidro, Surco, Surquillo, Jesús María, San Miguel, Barranco y Magdalena.",
  },
  {
    question: "¿Cuál es el horario de atención?",
    answer:
      "Los agentes brindan servicios de lunes a domingo, desde las 7 a. m. hasta las 7 p. m. Puedes reservar en la web las 24 horas.",
  },
  {
    question: "¿Con cuánto tiempo de anticipación debo reservar?",
    answer:
      "Las reservas están disponibles con un mínimo de 10 horas de anticipación para poder confirmar la disponibilidad del personal.",
  },
  {
    question: "¿Puedo cancelar un servicio?",
    answer: (
      <p>
        Sí. Una cancelación con al menos 24 horas de anticipación no tiene costo. Después
        de ese plazo podría aplicarse un cargo de hasta el 100 % del monto contratado. La
        solicitud se realiza desde <Link href="/mis-reservas">Mis reservas</Link>.
      </p>
    ),
  },
  {
    question: "¿Puedo reprogramar un servicio?",
    answer: (
      <p>
        Sí. Elige una nueva fecha y hora desde <Link href="/mis-reservas">tu panel</Link>.
        Reprogramar hasta 12 horas antes no tiene costo adicional.
      </p>
    ),
  },
  {
    question: "¿Quién proporciona los materiales de limpieza?",
    answer: (
      <div>
        <p>
          El cliente proporciona los materiales y herramientas; el agente realiza la
          limpieza. Recomendamos tener preparados:
        </p>
        <ul>
          <li>Limpiavidrios, quitagrasas, detergente, lavavajilla y limpiatodo.</li>
          <li>Lejía, desinfectante y agua limpia.</li>
          <li>Escoba, recogedor, baldes, paños, esponjas, cepillos, trapeador y mopa.</li>
          <li>Puntos de agua accesibles y zonas de trabajo despejadas e iluminadas.</li>
        </ul>
      </div>
    ),
  },
  {
    question: "¿Qué pasa si el agente llega tarde?",
    answer: (
      <p>
        Existe una tolerancia de 5 minutos. Después de ese tiempo puedes reportar la
        tardanza desde tu panel. Nuestro equipo revisará el caso y se pondrá en contacto
        contigo y con el agente.
      </p>
    ),
  },
  {
    question: "¿Qué pasa si el agente no llega?",
    answer: (
      <p>
        Repórtalo desde <Link href="/mis-reservas">Mis reservas</Link>. Nos comunicaremos
        contigo para reprogramar el servicio o gestionar la devolución correspondiente.
      </p>
    ),
  },
  {
    question: "¿Qué pasa si ocurre un daño material?",
    answer: (
      <p>
        Registra un reporte de incidente desde tu reserva. Revisaremos lo ocurrido con el
        cliente y el agente para determinar la solución y cualquier compensación aplicable.
      </p>
    ),
  },
];

export default function CleaningServicesPage() {
  return (
    <main className="content-page service-page">
      <section className="page-hero service-page__hero" aria-labelledby="service-title">
        <div className="content-shell page-hero__content">
          <h1 id="service-title">Limpieza de casas</h1>
          <p>
            Deja la limpieza de tu casa o departamento en nuestras manos y usa tu tiempo
            en cosas más importantes. Agendar es fácil, rápido y seguro.
          </p>
          <div className="button-group">
            <Link className="button button--primary" href="/#form">
              Reservar la limpieza aquí
            </Link>
            <Link className="button button--secondary" href="/mis-reservas">
              Ver mis reservas
            </Link>
          </div>
        </div>
      </section>

      <section className="page-section service-page__included" aria-labelledby="included-title">
        <div className="content-shell">
          <header className="section-heading">
            <h2 id="included-title">Servicios de limpieza de casas y departamentos</h2>
            <p>
              Nuestros agentes realizan las tareas habituales que cada hogar necesita.
              Priorizan el trabajo de acuerdo con tus indicaciones y el tiempo contratado.
            </p>
          </header>
          <div className="feature-list service-list">
            {services.map((service) => (
              <article className="feature-item service-list__item" key={service.title}>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
              </article>
            ))}
          </div>
          <aside className="notice service-page__duration" aria-label="Duración del servicio">
            <h3>¿Cuántas horas puedo contratar?</h3>
            <p>
              Hay planes de 4, 6 y 8 horas por día. Si necesitas ampliar el tiempo,
              comunícate con nuestro equipo para coordinar el cambio.
            </p>
          </aside>
        </div>
      </section>

      <section className="page-section page-section--muted" aria-labelledby="control-title">
        <div className="content-shell">
          <header className="section-heading">
            <h2 id="control-title">Tienes el control en tus manos</h2>
            <p>
              Consulta cada reserva y avísanos de cualquier cambio o problema desde tu
              panel de control.
            </p>
          </header>
          <ol className="feature-list account-action-list">
            {accountActions.map(([title, description]) => (
              <li className="feature-item account-action-list__item" key={title}>
                <h3>{title}</h3>
                <p>{description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="page-section faq-section" aria-labelledby="faq-title">
        <div className="content-shell content-shell--narrow">
          <header className="section-heading">
            <h2 id="faq-title">Preguntas sobre la limpieza de casas</h2>
            <p>Respuestas frecuentes sobre reservas, pagos y la atención del servicio.</p>
          </header>
          <div className="accordion faq-list">
            {faqs.map((faq) => (
              <details className="accordion__item" key={faq.question}>
                <summary>{faq.question}</summary>
                <div className="accordion__content">{faq.answer}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="page-section page-section--accent" aria-labelledby="quality-title">
        <div className="content-shell">
          <header className="section-heading">
            <h2 id="quality-title">Calidad del servicio</h2>
            <p>
              Verificamos, capacitamos y acompañamos al personal para brindar un servicio
              confiable de inicio a fin.
            </p>
          </header>
          <ol className="process-list">
            <li>
              <h3>Verificación y contratación</h3>
              <p>Revisamos la identidad, experiencia y antecedentes de cada postulante.</p>
            </li>
            <li>
              <h3>Homologación y capacitación</h3>
              <p>El personal participa en una inducción y en capacitaciones de servicio.</p>
            </li>
            <li>
              <h3>Retroalimentación y seguimiento</h3>
              <p>Usamos los comentarios de los clientes para mantener y mejorar la calidad.</p>
            </li>
          </ol>
          <div className="section-cta">
            <Link className="button button--primary" href="/#form">
              Reservar un servicio de limpieza
            </Link>
            <Link className="text-link" href="/contactar-con-servicios-de-limpieza">
              ¿Tienes otra pregunta? Contáctanos
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
