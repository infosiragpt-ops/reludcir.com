import type { Metadata } from "next";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { WhatsAppWidget } from "@/components/WhatsAppWidget";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://reludcir.com"),
  title: {
    default: "Servicios de limpieza a domicilio - Reludcir",
    template: "%s - Reludcir",
  },
  description:
    "Reserva servicios de limpieza para tu casa o departamento en Lima. Elige distrito, duración, fecha y personal en pocos minutos.",
  applicationName: "Reludcir",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/reludcir-fav.png", type: "image/png" }],
    apple: [{ url: "/reludcir-fav.png", type: "image/png" }],
  },
  openGraph: {
    type: "website",
    locale: "es_ES",
    siteName: "Reludcir",
    images: ["/assets/businesswoman-disinfecting-office.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    site: "@reludcir",
    images: ["/assets/businesswoman-disinfecting-office.jpg"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>
        <SiteHeader />
        {children}
        <SiteFooter />
        <WhatsAppWidget />
      </body>
    </html>
  );
}
