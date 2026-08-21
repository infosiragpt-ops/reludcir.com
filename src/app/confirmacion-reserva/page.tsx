import type { Metadata } from "next";

import accountStyles from "@/components/account/account.module.css";
import { PaymentReturnStatus } from "@/components/account/PaymentReturnStatus";

export const metadata: Metadata = {
  title: "Confirmación de reserva",
  robots: { index: false, follow: false },
};

type ConfirmationPageProps = {
  searchParams: Promise<{ session_id?: string | string[] }>;
};

export default async function ConfirmationPage({ searchParams }: ConfirmationPageProps) {
  const params = await searchParams;
  const sessionId = typeof params.session_id === "string" ? params.session_id : "";

  return (
    <main className="content-page account-page">
      <section className={accountStyles.authPanel} aria-labelledby="payment-return-title">
        <div className={accountStyles.authIntro}>
          <h1 id="payment-return-title">Confirmación de tu reserva</h1>
          <p>
            Esta pantalla consulta el estado registrado por el webhook seguro de Stripe;
            no confirma el servicio hasta recibir el pago del proveedor.
          </p>
        </div>
        <PaymentReturnStatus sessionId={sessionId} />
      </section>
    </main>
  );
}
