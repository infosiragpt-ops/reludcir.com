import type { Metadata } from "next";

import accountStyles from "@/components/account/account.module.css";
import { ResetPasswordForm } from "@/components/account/ResetPasswordForm";

export const metadata: Metadata = {
  title: "Crear nueva contraseña",
  robots: { index: false, follow: false },
};

type ResetPasswordPageProps = {
  searchParams: Promise<{ token?: string | string[] }>;
};

export default async function ResetPasswordPage({
  searchParams,
}: ResetPasswordPageProps) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";

  return (
    <main className="content-page account-page">
      <section className={accountStyles.authPanel} aria-labelledby="reset-title">
        <div className={accountStyles.authIntro}>
          <h1 id="reset-title">Crea una nueva contraseña</h1>
          <p>
            Usa al menos 8 caracteres. Al guardar el cambio cerraremos las sesiones
            anteriores para proteger tu cuenta.
          </p>
        </div>
        <ResetPasswordForm token={token} />
      </section>
    </main>
  );
}
