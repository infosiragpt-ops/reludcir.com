import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  districtLandingPages,
  districtLandingPageSlugs,
  isDistrictLandingPageSlug,
} from "@/data/district-landing-pages";
import {
  editorialArticles,
  editorialPageByPath,
  editorialPages,
  type EditorialPage,
} from "@/data/editorial-pages";
import { serviceFaq } from "@/data/site";

type SitePageProps = {
  params: Promise<{ siteRoute: string[] }>;
};

const routePrefix = "servicio-de-limpieza-en-";

function getDistrictFromRoute(route: string) {
  const district = route.startsWith(routePrefix) ? route.slice(routePrefix.length) : "";

  return isDistrictLandingPageSlug(district) ? district : null;
}

const includedServices = [
  {
    title: "Limpieza de superficies",
    description:
      "Pisos y ambientes como sala, comedor, cocina, baños y habitaciones.",
  },
  {
    title: "Lavado y planchado",
    description:
      "Lavado de ropa en lavadora y planchado aproximado de 6 a 9 prendas por hora.",
  },
  {
    title: "Limpieza de utensilios",
    description:
      "Utensilios de cocina y objetos de uso doméstico, excepto piezas delicadas.",
  },
  {
    title: "Desinfección de espacios",
    description:
      "Baños, cocinas, manijas, interruptores y mobiliario de uso frecuente.",
  },
  {
    title: "Atención a las mascotas",
    description:
      "Limpieza de sus espacios, alimentación y agua dentro del hogar; no incluye paseos.",
  },
] as const;

const accountActions = [
  ["Agenda", "Elige en línea la duración, la fecha y el personal disponible."],
  ["Paga", "Usa Yape, transferencia bancaria o tarjeta de crédito o débito."],
  ["Notificaciones", "Recibe por WhatsApp el estado y los recordatorios de la visita."],
  ["Reprograma", "Selecciona una nueva fecha y hora desde tu panel de control."],
  ["Incidentes", "Informa cualquier problema ocurrido durante el servicio."],
  ["Tardanzas", "Avísanos desde la reserva si el agente supera el tiempo de tolerancia."],
  ["Inasistencias", "Repórtanos si el agente no llega para coordinar una solución."],
  ["Cancela", "Cancela desde tu panel; con 24 horas de anticipación no tiene costo."],
] as const;

export const dynamicParams = false;

export function generateStaticParams() {
  return [
    ...districtLandingPageSlugs.map((district) => ({
      siteRoute: [`${routePrefix}${district}`],
    })),
    ...editorialPages.map((page) => ({ siteRoute: page.path.split("/") })),
  ];
}

export async function generateMetadata({ params }: SitePageProps): Promise<Metadata> {
  const { siteRoute } = await params;
  const districtRoute = siteRoute.length === 1 ? siteRoute[0]! : "";
  const district = getDistrictFromRoute(districtRoute);

  if (!district) {
    const editorialPage = editorialPageByPath.get(siteRoute.join("/"));
    if (!editorialPage) return {};
    const canonical = `/${editorialPage.path}`;
    return {
      title: editorialPage.title,
      description: editorialPage.description,
      alternates: { canonical },
      openGraph: {
        type: editorialPage.kind === "article" ? "article" : "website",
        locale: "es_ES",
        title: editorialPage.title,
        description: editorialPage.description,
        url: canonical,
        images: ["/assets/businesswoman-disinfecting-office.jpg"],
      },
      twitter: {
        card: "summary_large_image",
        site: "@reludcir",
        title: editorialPage.title,
        description: editorialPage.description,
        images: ["/assets/businesswoman-disinfecting-office.jpg"],
      },
    };
  }

  const page = districtLandingPages[district];
  const canonical = `/servicio-de-limpieza-en-${district}`;

  return {
    title: page.metadataTitle,
    description: page.description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      locale: "es_ES",
      title: page.metadataTitle,
      description: page.description,
      url: canonical,
      images: ["/assets/servicios-de-limpieza-distrito.webp"],
    },
    twitter: {
      card: "summary_large_image",
      site: "@reludcir",
      title: page.metadataTitle,
      description: page.description,
      images: ["/assets/servicios-de-limpieza-distrito.webp"],
    },
  };
}

function EditorialContentPage({ page }: { page: EditorialPage }) {
  const isArticle = page.kind === "article";
  const visibleArticles = isArticle
    ? editorialArticles.filter((article) => article.path !== page.path).slice(0, 3)
    : editorialArticles;

  return (
    <main className="content-page editorialPage">
      <section className="page-hero editorialHero">
        <div className="content-shell page-hero__content">
          <p className="editorialEyebrow">
            {isArticle ? "Consejos para el hogar" : "Archivo de Reludcir"}
          </p>
          <h1>{page.title}</h1>
          <p>{page.description}</p>
        </div>
      </section>
      {isArticle ? (
        <article className="page-section editorialArticle">
          <div className="content-shell content-shell--narrow">
            <p className="editorialLead">{page.description}</p>
            <h2>Una rutina que puedas mantener</h2>
            <p>
              Empieza por ventilar, recoger objetos y preparar los materiales. Trabaja de
              arriba hacia abajo y de las áreas más limpias a las más exigentes para no
              repetir tareas.
            </p>
            <h2>Prioriza seguridad y constancia</h2>
            <p>
              Lee las indicaciones de cada producto, evita mezclas peligrosas y prueba
              cualquier solución en una zona discreta. Las sesiones breves y frecuentes
              suelen dar mejores resultados que una limpieza agotadora y esporádica.
            </p>
            <aside className="notice">
              <h3>¿Prefieres delegarlo?</h3>
              <p>
                Reserva 4, 6 u 8 horas con personal disponible en tu distrito y gestiona
                la visita desde tu cuenta.
              </p>
              <Link className="button button--primary" href="/#form">
                Reservar un servicio
              </Link>
            </aside>
          </div>
        </article>
      ) : null}
      <section className="page-section page-section--muted">
        <div className="content-shell">
          <header className="section-heading">
            <h2>{isArticle ? "También puede interesarte" : "Artículos de Reludcir"}</h2>
            <p>Guías sencillas para cuidar, ordenar y limpiar tu hogar.</p>
          </header>
          <div className="editorialGrid">
            {visibleArticles.map((article) => (
              <article className="feature-item" key={article.path}>
                <h3>
                  <Link href={`/${article.path}`}>{article.title}</Link>
                </h3>
                <p>{article.description}</p>
                <Link className="text-link" href={`/${article.path}`}>
                  Leer artículo
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

export default async function SiteContentPage({ params }: SitePageProps) {
  const { siteRoute } = await params;
  const routePath = siteRoute.join("/");
  const districtRoute = siteRoute.length === 1 ? siteRoute[0]! : "";
  const district = getDistrictFromRoute(districtRoute);

  if (!district) {
    const editorialPage = editorialPageByPath.get(routePath);
    if (!editorialPage) notFound();
    return <EditorialContentPage page={editorialPage} />;
  }

  const page = districtLandingPages[district];
  const titleId = `service-title-${district}`;
  const faqStructuredData = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: serviceFaq.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };

  return (
    <main className="content-page service-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqStructuredData) }}
      />
      <section className="page-hero service-page__hero" aria-labelledby={titleId}>
        <div className="content-shell page-hero__content">
          <h1 id={titleId}>{page.heading}</h1>
          <p>{page.introduction}</p>
          <div className="button-group">
            <Link className="button button--primary" href="/#form">
              Reservar la limpieza aquí
            </Link>
            <Link className="button button--secondary" href="/limpieza-de-casas">
              Ver todos los detalles
            </Link>
          </div>
        </div>
      </section>

      <section className="page-section" aria-labelledby="home-cleaning-title">
        <div className="content-shell">
          <header className="section-heading">
            <h2 id="home-cleaning-title">Limpieza en el hogar</h2>
            <p>
              El agente prioriza las tareas según tus indicaciones y el tiempo que hayas
              contratado para el servicio en {page.name}.
            </p>
          </header>
          <div className="feature-list service-list">
            {includedServices.map((service) => (
              <article className="feature-item service-list__item" key={service.title}>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
              </article>
            ))}
          </div>
          <Image
            className="districtServiceBanner"
            src="/assets/reludcir-limpieza-simple.webp"
            alt={`Servicio de limpieza de Reludcir en ${page.name}`}
            width={1_865}
            height={100}
          />
          <aside className="notice service-page__duration" aria-label="Duración del servicio">
            <h3>¿Cuántas horas puedo contratar?</h3>
            <p>
              Puedes reservar planes de 4, 6 y 8 horas por día, para una sola visita o
              con la recurrencia que necesites.
            </p>
          </aside>
        </div>
      </section>

      <section className="page-section page-section--muted" aria-labelledby="control-title">
        <div className="content-shell">
          <header className="section-heading">
            <h2 id="control-title">Tienes el control</h2>
            <p>Administra el servicio desde tu cuenta y mantente al tanto de cada visita.</p>
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
            <h2 id="faq-title">Preguntas sobre la limpieza en {page.name}</h2>
            <p>Información sobre precios, cobertura y cambios en una reserva.</p>
          </header>
          <div className="accordion faq-list">
            {serviceFaq.map((faq) => (
              <details className="accordion__item" key={faq.question}>
                <summary>{faq.question}</summary>
                <div className="accordion__content">
                  <p>{faq.answer}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="page-section page-section--accent" aria-labelledby="quality-title">
        <div className="content-shell districtQualityLayout">
          <div>
            <header className="section-heading">
              <h2 id="quality-title">Calidad del servicio</h2>
              <p>
                Verificamos, capacitamos y acompañamos al personal para ofrecer una visita
                confiable de inicio a fin.
              </p>
            </header>
            <ol className="process-list">
              <li>
                <h3>Verificación</h3>
                <p>Revisamos la identidad, experiencia y antecedentes de cada postulante.</p>
              </li>
              <li>
                <h3>Capacitación</h3>
                <p>El personal participa en una inducción y capacitaciones de servicio.</p>
              </li>
              <li>
                <h3>Seguimiento</h3>
                <p>Usamos la opinión de los clientes para mantener y mejorar la calidad.</p>
              </li>
            </ol>
            <div className="section-cta">
              <Link className="button button--primary" href="/#form">
                Reservar un servicio en {page.name}
              </Link>
              <Link className="text-link" href="/contactar-con-servicios-de-limpieza">
                Contactar a Reludcir
              </Link>
            </div>
          </div>
          <Image
            className="districtRecruitmentImage"
            src="/assets/reclutamiento-reludcir.webp"
            alt="Selección y capacitación del personal de limpieza Reludcir"
            width={600}
            height={600}
          />
        </div>
      </section>
    </main>
  );
}
