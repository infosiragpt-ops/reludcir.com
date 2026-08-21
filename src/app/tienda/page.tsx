import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Tienda",
  description: "Tienda de productos y servicios de Reludcir.",
  alternates: { canonical: "/tienda" },
  robots: { index: false, follow: false },
};

export default function StorePage() {
  return (
    <main className="content-page">
      <section className="page-hero" aria-labelledby="store-title">
        <div className="content-shell page-hero__content">
          <nav aria-label="Migas de pan">
            <Link className="text-link" href="/">
              Inicio
            </Link>{" "}
            / Tienda
          </nav>
          <h1 id="store-title">Tienda</h1>
        </div>
      </section>
      <section className="page-section" aria-label="Catálogo">
        <div className="content-shell content-shell--narrow">
          <p>No se han encontrado productos que coincidan con tu selección.</p>
        </div>
      </section>
    </main>
  );
}
