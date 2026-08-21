"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import styles from "./account.module.css";

type PaymentStatusPayload = {
  reference?: string;
  orderStatus?: string;
  paymentStatus?: string;
  amount?: string;
  currency?: string;
  error?: { message?: string };
};

type ViewState = "loading" | "paid" | "pending" | "error";

export function PaymentReturnStatus({ sessionId }: { sessionId: string }) {
  const [viewState, setViewState] = useState<ViewState>(
    sessionId ? "loading" : "error",
  );
  const [payload, setPayload] = useState<PaymentStatusPayload | null>(null);
  const [message, setMessage] = useState(
    sessionId ? "Estamos verificando la confirmación de Stripe." : "Falta la referencia del pago.",
  );

  useEffect(() => {
    if (!sessionId) return;
    const controller = new AbortController();
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function checkPayment() {
      try {
        const response = await fetch(
          `/api/v1/payments/stripe/session?session_id=${encodeURIComponent(sessionId)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const result = (await response.json()) as PaymentStatusPayload;
        if (!response.ok) {
          throw new Error(result.error?.message ?? "No pudimos verificar el pago.");
        }
        setPayload(result);
        if (result.paymentStatus === "paid" && result.orderStatus === "confirmed") {
          setViewState("paid");
          setMessage("Tu pago fue confirmado y la reserva quedó registrada.");
          return;
        }
        if (["cancelled", "expired"].includes(result.orderStatus ?? "")) {
          setViewState("error");
          setMessage("El pedido venció o fue cancelado. Si ves un cargo, contáctanos para revisarlo.");
          return;
        }

        attempt += 1;
        if (attempt < 6) {
          timer = setTimeout(checkPayment, 2_000);
          return;
        }
        setViewState("pending");
        setMessage("Stripe aún está procesando la confirmación. Puedes volver a revisar en unos minutos.");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setViewState("error");
        setMessage(error instanceof Error ? error.message : "No pudimos verificar el pago.");
      }
    }

    void checkPayment();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [sessionId]);

  return (
    <div className={styles.authCard} aria-live="polite" aria-busy={viewState === "loading"}>
      <p className={styles.eyebrow}>
        {viewState === "paid" ? "Pago confirmado" : "Estado del pedido"}
      </p>
      <h2 className={styles.formTitle}>
        {viewState === "paid"
          ? "¡Todo listo!"
          : viewState === "loading"
            ? "Verificando pago…"
            : "Revisa tu pedido"}
      </h2>
      <p className={viewState === "error" ? styles.errorMessage : styles.successMessage}>
        {message}
      </p>
      {payload?.reference ? (
        <p className={styles.formDescription}>
          Pedido <strong>{payload.reference}</strong>
          {payload.amount ? ` · S/ ${payload.amount}` : ""}
        </p>
      ) : null}
      <div className={styles.form}>
        <Link className={styles.primaryLink} href="/mi-cuenta-2">
          Crear cuenta o iniciar sesión
        </Link>
        <Link className={styles.secondaryButton} href="/">
          Volver al inicio
        </Link>
      </div>
      <p className={styles.legalCopy}>
        Si reservaste como invitado, usa el mismo navegador y correo para vincular el pedido de forma segura.
      </p>
    </div>
  );
}
