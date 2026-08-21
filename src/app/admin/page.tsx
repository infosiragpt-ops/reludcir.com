import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AdminPanel } from "@/components/admin/AdminPanel";
import { getAuthenticatedUser } from "@/lib/auth";
import { isPrivilegedStaff } from "@/lib/staff";

export const metadata: Metadata = {
  title: "Operaciones",
  description: "Panel interno de reservas, personal, pagos y catálogo de Reludcir.",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const user = await getAuthenticatedUser().catch(() => null);
  if (!user) {
    redirect("/mi-cuenta-2");
  }
  if (!isPrivilegedStaff(user.role)) {
    redirect("/mis-reservas");
  }

  return (
    <main className="content-page bookings-page">
      <AdminPanel role={user.role} />
    </main>
  );
}
