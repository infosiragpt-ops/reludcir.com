import { Facebook, Instagram, Twitter } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="siteFooter">
      <div className="footerGrid contentWidth">
        <div className="footerBrand">
          <Image
            src="/assets/logo-reludcir.webp"
            alt="Reludcir"
            width={165}
            height={41}
          />
          <p>
            Proveemos servicios de limpieza usando tecnología con la finalidad de
            servir mejor a nuestros usuarios.
          </p>
          <Link href="/privacidad">Privacy Policy</Link>
        </div>
        <div>
          <h2>Contáctanos</h2>
          <Link href="/contactar-con-servicios-de-limpieza">Contáctanos</Link>
        </div>
        <div>
          <h2>Mis reservas</h2>
          <Link href="/mis-reservas">Administrar reservas</Link>
        </div>
        <div>
          <h2>Síguenos</h2>
          <div className="socialLinks" aria-label="Redes sociales">
            <a href="https://www.instagram.com/reludcir" aria-label="Instagram">
              <Instagram aria-hidden="true" />
            </a>
            <a href="https://www.facebook.com/reludcir" aria-label="Facebook">
              <Facebook aria-hidden="true" />
            </a>
            <a href="https://twitter.com/reludcir" aria-label="Twitter">
              <Twitter aria-hidden="true" />
            </a>
          </div>
        </div>
      </div>
      <div className="footerBottom">
        Copyright © {new Date().getFullYear()} Reludcir | Con ♥ desde Perú.
      </div>
    </footer>
  );
}
