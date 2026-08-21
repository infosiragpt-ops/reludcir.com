import type { Metadata } from "next";
import accountStyles from "@/components/account/account.module.css";
import { RecoverPasswordForm } from "@/components/account/RecoverPasswordForm";

export const metadata: Metadata = {
  title: "Recuperar contraseña",
  description: "Recupera el acceso a tu cuenta de Reludcir mediante tu correo electrónico.",
  robots: { index: false, follow: false },
};

export default function RecoverPasswordPage() {
  return (
    <main className="content-page account-page">
      <section className={accountStyles.authPanel} aria-labelledby="recover-title">
        <div className={accountStyles.authIntro}>
          <h1 id="recover-title">Has olvidado tu contraseña</h1>
          <p>
            Ingresa el correo electrónico con el que creaste tu cuenta. Te enviaremos un
            enlace para que puedas crear una nueva contraseña.
          </p>
        </div>

        <RecoverPasswordForm />
      </section>
    </main>
  );
}
