import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminPaymentsPanel } from "@/components/admin/AdminPaymentsPanel";
import { getAuthenticatedUser } from "@/lib/auth";
import { isPrivilegedStaff } from "@/lib/staff";

export const metadata: Metadata = {
  title: "Operaciones de pago",
  description: "Conciliación de Yape, transferencias y reembolsos de Reludcir.",
  robots: { index: false, follow: false },
};

export default async function AdminPaymentsPage() {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) {
    redirect("/mi-cuenta-2");
  }
  if (!isPrivilegedStaff(user.role)) {
    redirect("/mis-reservas");
  }

  return (
    <main className="content-page bookings-page">
      <AdminPaymentsPanel />
    </main>
  );
}
