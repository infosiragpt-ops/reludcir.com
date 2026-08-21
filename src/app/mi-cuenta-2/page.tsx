import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthPanel } from "@/components/account/AuthPanel";
import { getAuthenticatedUser } from "@/lib/auth";
import { isPrivilegedStaff } from "@/lib/staff";

export const metadata: Metadata = {
  title: "Mi cuenta",
  description: "Accede a tu cuenta o regístrate para administrar tus reservas de Reludcir.",
  robots: { index: false, follow: false },
};

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const user = await getAuthenticatedUser().catch(() => null);
  if (user && isPrivilegedStaff(user.role)) {
    redirect("/admin");
  }
  if (user) {
    redirect("/mis-reservas");
  }

  const { error } = await searchParams;

  return (
    <main className="content-page account-page">
      <AuthPanel initialError={typeof error === "string" ? error : error?.[0]} />
    </main>
  );
}
