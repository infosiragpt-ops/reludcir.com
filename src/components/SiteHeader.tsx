"use client";

import { CalendarDays, Menu, PhoneCall, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const links = [
  { href: "/", label: "Inicio" },
  { href: "/limpieza-de-casas", label: "Servicios" },
  {
    href: "/contactar-con-servicios-de-limpieza",
    label: "Contáctanos",
  },
  { href: "/mi-cuenta-2", label: "Mi cuenta" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="siteHeader">
      <div className="headerInner">
        <Link href="/" className="brand" aria-label="Reludcir, inicio">
          <Image
            src="/assets/logo-reludcir.svg"
            alt="Reludcir"
            width={165}
            height={41}
            priority
            unoptimized
          />
        </Link>

        <button
          className="mobileMenuButton"
          type="button"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>

        <nav className={open ? "mainNav isOpen" : "mainNav"} aria-label="Principal">
          {links.map((link) => (
            <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>
              {link.label}
            </Link>
          ))}
          <Link className="navButton" href="/mis-reservas" onClick={() => setOpen(false)}>
            <CalendarDays aria-hidden="true" />
            Mis reservas
          </Link>
          <a
            className="navButton navButtonWide"
            href="https://calendly.com/reludcir/15min"
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpen(false)}
          >
            <PhoneCall aria-hidden="true" />
            Agendar una llamada
          </a>
        </nav>
      </div>
    </header>
  );
}
