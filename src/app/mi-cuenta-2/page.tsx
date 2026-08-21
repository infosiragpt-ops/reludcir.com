import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthPanel } from "@/components/account/AuthPanel";
import { getAuthenticatedUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Mi cuenta",
  description: "Accede a tu cuenta o regístrate para administrar tus reservas de Reludcir.",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const user = await getAuthenticatedUser().catch(() => null);
  if (user) {
    redirect("/mis-reservas");
  }

  return (
    <main className="content-page account-page">
      <AuthPanel />
    </main>
  );
}
