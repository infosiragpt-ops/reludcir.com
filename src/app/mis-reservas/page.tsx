import type { Metadata } from "next";

import { BookingsDashboard } from "@/components/account/BookingsDashboard";

export const metadata: Metadata = {
  title: "Mis reservas",
  description:
    "Consulta, reprograma, cancela o reporta incidencias de tus reservas de limpieza.",
  robots: { index: false, follow: false },
};

export default function BookingsPage() {
  return (
    <main className="content-page bookings-page">
      <BookingsDashboard />
    </main>
  );
}
