"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import styles from "@/components/account/account.module.css";

type PendingPayment = {
  id: number;
  provider: string;
  status: string;
  amount: string;
  currency: string;
  createdAt: string;
  reference: string;
  customerName: string;
  customerEmail: string;
  customerPhoneE164: string;
  expiresAt: string | null;
  orderStatus: string;
};

type RefundReview = {
  operationId: number;
  operationSource: string;
  paymentId: number;
  provider: string;
  operationStatus: string;
  requestedAmount: string;
  paymentAmount: string;
  refundedAmount: string;
  currency: string;
  requestedAt: string;
  lastError: string | null;
  reference: string;
  customerName: string;
  customerEmail: string;
};

type AdminPayload = {
  payments?: PendingPayment[];
  refundReviews?: RefundReview[];
  error?: string | { message?: string };
};

function getError(payload: AdminPayload | null, fallback: string) {
  if (typeof payload?.error === "string") return payload.error;
  if (payload?.error && typeof payload.error.message === "string") {
    return payload.error.message;
  }
  return fallback;
}

function formatMoney(amount: string, currency: string) {
  const numeric = Number(amount);
  return Number.isFinite(numeric)
    ? new Intl.NumberFormat("es-PE", { style: "currency", currency }).format(numeric)
    : `${amount} ${currency}`;
}

function formatDate(value: string | null) {
  if (!value) return "Sin vencimiento";
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Lima",
  }).format(new Date(value));
}

export function AdminPaymentsPanel({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [refunds, setRefunds] = useState<RefundReview[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string }>();
  const [pending, setPending] = useState<string>();

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoadState("loading");
    try {
      const response = await fetch("/api/v1/admin/payments", {
        credentials: "include",
        headers: { Accept: "application/json" },
        signal,
      });
      const payload = (await response.json()) as AdminPayload;
      if (!response.ok) {
        throw new Error(getError(payload, "No pudimos cargar las operaciones."));
      }
      setPayments(payload.payments ?? []);
      setRefunds(payload.refundReviews ?? []);
      setLoadState("ready");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "No pudimos cargar las operaciones.",
      });
      setLoadState("error");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const requestId = window.setTimeout(() => {
      void load(controller.signal);
    }, 0);
    return () => {
      window.clearTimeout(requestId);
      controller.abort();
    };
  }, [load]);

  async function confirmPayment(event: FormEvent<HTMLFormElement>, payment: PendingPayment) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const key = `confirm:${payment.id}`;
    setPending(key);
    setMessage(undefined);
    try {
      const paidAt = String(form.get("paidAt") ?? "").trim();
      const response = await fetch(`/api/v1/admin/payments/${payment.id}/confirm`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          externalReference: String(form.get("externalReference") ?? "").trim(),
          notes: String(form.get("notes") ?? "").trim() || undefined,
          paidAt: paidAt ? new Date(paidAt).toISOString() : undefined,
        }),
      });
      const payload = (await response.json()) as AdminPayload & {
        refundReviewRequired?: boolean;
      };
      if (!response.ok) {
        throw new Error(getError(payload, "No pudimos confirmar el pago."));
      }
      setMessage({
        kind: "success",
        text: payload.refundReviewRequired
          ? `Pago ${payment.reference} registrado. El cupo ya no está activo; revisa el reembolso manual.`
          : `Pago ${payment.reference} conciliado y reserva confirmada.`,
      });
      await load();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "No pudimos confirmar el pago.",
      });
    } finally {
      setPending(undefined);
    }
  }

  async function closeRefund(event: FormEvent<HTMLFormElement>, review: RefundReview) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const key = `refund:${review.operationId}`;
    setPending(key);
    setMessage(undefined);
    try {
      const response = await fetch(`/api/v1/admin/payments/${review.paymentId}/refund`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          operationId: review.operationId,
          externalReference: String(form.get("externalReference") ?? "").trim(),
          notes: String(form.get("notes") ?? "").trim() || undefined,
        }),
      });
      const payload = (await response.json()) as AdminPayload;
      if (!response.ok) {
        throw new Error(getError(payload, "No pudimos registrar el reembolso."));
      }
      setMessage({
        kind: "success",
        text: `Reembolso de ${review.reference} cerrado con la constancia externa.`,
      });
      await load();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "No pudimos registrar el reembolso.",
      });
    } finally {
      setPending(undefined);
    }
  }

  async function retryOperation(review: RefundReview) {
    const key = `retry:${review.operationId}`;
    setPending(key);
    setMessage(undefined);
    try {
      const response = await fetch(
        `/api/v1/admin/payment-operations/${review.operationId}/retry`,
        {
          method: "POST",
          credentials: "include",
          headers: { Accept: "application/json" },
        },
      );
      const payload = (await response.json()) as AdminPayload;
      if (!response.ok) {
        throw new Error(getError(payload, "No pudimos reintentar la operación."));
      }
      setMessage({
        kind: "success",
        text: `La operación ${review.operationId} volvió a la cola de reembolsos Stripe.`,
      });
      await load();
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "No pudimos reintentar la operación.",
      });
    } finally {
      setPending(undefined);
    }
  }

  if (loadState === "loading") {
    return (
      <section className={styles.dashboardState} aria-live="polite" aria-busy="true">
        <div className={styles.loader} aria-hidden="true" />
        <h2>Cargando operaciones</h2>
        <p>Consultamos pagos manuales y reembolsos pendientes.</p>
      </section>
    );
  }

  if (loadState === "error") {
    return (
      <section className={styles.dashboardState}>
        <h2>No pudimos abrir operaciones</h2>
        <p role="alert">{message?.text}</p>
        <button className={styles.primaryButton} type="button" onClick={() => load()}>
          Volver a intentar
        </button>
      </section>
    );
  }

  return (
    <section className={styles.dashboard} aria-labelledby={embedded ? undefined : "admin-title"}>
      {embedded ? null : (
        <header className={styles.dashboardHeader}>
          <div>
            <p className={styles.eyebrow}>Soporte y administración</p>
            <h1 id="admin-title">Conciliación de pagos</h1>
            <p>
              Confirma Yape o transferencias con la constancia externa, cierra reembolsos
              manuales y reintenta devoluciones Stripe fallidas.
            </p>
          </div>
          <div className={styles.dashboardHeaderActions}>
            <Link className={styles.secondaryButton} href="/mis-reservas">
              Mis reservas
            </Link>
          </div>
        </header>
      )}

      {message ? (
        <p
          className={message.kind === "error" ? styles.errorMessage : styles.successMessage}
          role={message.kind === "error" ? "alert" : "status"}
        >
          {message.text}
        </p>
      ) : null}

      <article className={styles.bookingCard}>
        <header className={styles.bookingCardHeader}>
          <div>
            <p className={styles.bookingReference}>Yape y transferencia</p>
            <h2>Pagos por conciliar</h2>
          </div>
        </header>
        {payments.length === 0 ? (
          <p className={styles.policyNote}>No hay pagos manuales pendientes.</p>
        ) : (
          <div className={styles.bookingList}>
            {payments.map((payment) => (
              <form
                className={styles.actionForm}
                key={payment.id}
                onSubmit={(event) => confirmPayment(event, payment)}
              >
                <h3>
                  {payment.reference} · {formatMoney(payment.amount, payment.currency)}
                </h3>
                <p className={styles.policyNote}>
                  {payment.customerName} · {payment.customerEmail} · {payment.customerPhoneE164}
                  <br />
                  {payment.provider === "yape" ? "Yape" : "Transferencia"} · pedido{" "}
                  {payment.orderStatus} · vence {formatDate(payment.expiresAt)}
                </p>
                <label className={styles.field}>
                  <span>Constancia externa</span>
                  <input name="externalReference" required minLength={3} maxLength={160} />
                </label>
                <label className={styles.field}>
                  <span>Fecha efectiva del pago</span>
                  <input name="paidAt" type="datetime-local" />
                </label>
                <label className={styles.field}>
                  <span>Notas internas</span>
                  <textarea name="notes" rows={2} maxLength={500} />
                </label>
                <button
                  className={styles.primaryButton}
                  type="submit"
                  disabled={pending === `confirm:${payment.id}`}
                >
                  {pending === `confirm:${payment.id}` ? "Confirmando…" : "Confirmar pago"}
                </button>
              </form>
            ))}
          </div>
        )}
      </article>

      <article className={styles.bookingCard}>
        <header className={styles.bookingCardHeader}>
          <div>
            <p className={styles.bookingReference}>Reembolsos</p>
            <h2>Revisión y reintentos</h2>
          </div>
        </header>
        {refunds.length === 0 ? (
          <p className={styles.policyNote}>No hay reembolsos en revisión.</p>
        ) : (
          <div className={styles.bookingList}>
            {refunds.map((review) => (
              <div className={styles.actionForm} key={review.operationId}>
                <h3>
                  {review.reference} · operación #{review.operationId}
                </h3>
                <p className={styles.policyNote}>
                  {review.customerName} · {review.provider} · {review.operationSource} ·{" "}
                  {review.operationStatus}
                  <br />
                  Solicitado {formatMoney(review.requestedAmount, review.currency)} de{" "}
                  {formatMoney(review.paymentAmount, review.currency)}. Ya devuelto{" "}
                  {formatMoney(review.refundedAmount, review.currency)}.
                  {review.lastError ? ` Error: ${review.lastError}` : ""}
                </p>
                {review.operationSource === "manual" ? (
                  <form onSubmit={(event) => closeRefund(event, review)}>
                    <label className={styles.field}>
                      <span>Constancia de devolución</span>
                      <input name="externalReference" required minLength={3} maxLength={160} />
                    </label>
                    <label className={styles.field}>
                      <span>Notas</span>
                      <textarea name="notes" rows={2} maxLength={500} />
                    </label>
                    <button
                      className={styles.primaryButton}
                      type="submit"
                      disabled={pending === `refund:${review.operationId}`}
                    >
                      {pending === `refund:${review.operationId}`
                        ? "Registrando…"
                        : "Cerrar reembolso"}
                    </button>
                  </form>
                ) : (
                  <button
                    className={styles.primaryButton}
                    type="button"
                    onClick={() => retryOperation(review)}
                    disabled={pending === `retry:${review.operationId}`}
                  >
                    {pending === `retry:${review.operationId}`
                      ? "Reactivando…"
                      : "Reintentar Stripe"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}
