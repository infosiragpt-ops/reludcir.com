import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import {
  bookingAssignments,
  bookingOrders,
  bookings,
  bookingStatusEvents,
  notificationOutbox,
  paymentOperations,
  payments,
  paymentWebhookEvents,
} from "@/db/schema";
import { apiError } from "@/lib/api";
import { processNextPaymentOperation } from "@/lib/payment-operations";
import { getStripeRefund } from "@/lib/payments";
import { minorUnitsToDecimal } from "@/lib/pricing";

type StripeEvent = {
  id: string;
  type: string;
  created?: number;
  data?: {
    object?: {
      id?: string;
      status?: string;
      amount?: number;
      failure_reason?: string;
      payment_status?: string;
      payment_intent?: string;
      client_reference_id?: string;
      metadata?: Record<string, string | undefined>;
    };
  };
};

function verifyStripeSignature(payload: string, signatureHeader: string, secret: string) {
  const values = signatureHeader.split(",").map((part) => part.split("=", 2));
  const timestamp = values.find(([key]) => key === "t")?.[1];
  const signatures = values
    .filter(([key]) => key === "v1")
    .map(([, value]) => value)
    .filter((value): value is string => Boolean(value));

  if (!timestamp || signatures.length === 0) return false;
  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
    return false;
  }

  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`)
    .digest();

  return signatures.some((signature) => {
    if (!/^[a-f0-9]{64}$/i.test(signature)) return false;
    const received = Buffer.from(signature, "hex");
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return apiError("Webhook de Stripe no configurado.", 503, "NOT_CONFIGURED");
  }

  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature || !verifyStripeSignature(rawBody, signature, webhookSecret)) {
    return apiError("Firma de Stripe no válida.", 400, "INVALID_SIGNATURE");
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(rawBody) as StripeEvent;
  } catch {
    return apiError("Evento no válido.", 400, "INVALID_EVENT");
  }

  if (!event.id || !event.type) {
    return apiError("Evento incompleto.", 400, "INVALID_EVENT");
  }

  const isRefundEvent = ["refund.created", "refund.updated", "refund.failed"].includes(
    event.type,
  );
  if (isRefundEvent && !process.env.STRIPE_SECRET_KEY) {
    return apiError(
      "Reconciliación de Stripe no configurada.",
      503,
      "NOT_CONFIGURED",
    );
  }

  try {
    const outcome = await getDb().transaction(async (transaction) => {
      const [webhookEvent] = await transaction
        .insert(paymentWebhookEvents)
        .values({
          provider: "stripe",
          providerEventId: event.id,
          eventType: event.type,
          status: "processing",
          attempts: 1,
          payload: {
            objectId: event.data?.object?.id,
            refundStatus: event.data?.object?.status,
            refundAmount: event.data?.object?.amount,
            refundFailureReason: event.data?.object?.failure_reason,
            paymentStatus: event.data?.object?.payment_status,
            paymentIntentId: event.data?.object?.payment_intent,
            orderReference:
              event.data?.object?.client_reference_id ??
              event.data?.object?.metadata?.order_reference,
            eventCreated: event.created,
          },
        })
        .onConflictDoNothing()
        .returning({ id: paymentWebhookEvents.id });

      if (!webhookEvent) {
        return "duplicate" as const;
      }

      if (
        ["refund.created", "refund.updated", "refund.failed"].includes(event.type) &&
        event.data?.object?.id
      ) {
        const refund = event.data.object;
        const refundId = refund.id;
        if (!refundId) {
          throw new Error("Stripe refund event is missing its id.");
        }
        let normalizedRefundStatus =
          refund.status ?? (event.type === "refund.failed" ? "failed" : null);
        const refundOperationColumns = {
          id: paymentOperations.id,
          paymentId: paymentOperations.paymentId,
          operationStatus: paymentOperations.status,
          amount: paymentOperations.amount,
          metadata: paymentOperations.metadata,
          idempotencyKey: paymentOperations.idempotencyKey,
          providerOperationId: paymentOperations.providerOperationId,
          paymentAmount: payments.amount,
          refundedAmount: payments.refundedAmount,
        };
        let [operation] = await transaction
          .select({
            ...refundOperationColumns,
          })
          .from(paymentOperations)
          .innerJoin(payments, eq(payments.id, paymentOperations.paymentId))
          .where(eq(paymentOperations.providerOperationId, refundId))
          .limit(1)
          .for("update");

        const correlatedOperationId = Number(
          refund.metadata?.reludcir_payment_operation_id,
        );
        const correlatedIdempotencyKey =
          refund.metadata?.reludcir_idempotency_key;
        if (
          !operation &&
          Number.isSafeInteger(correlatedOperationId) &&
          correlatedOperationId > 0
        ) {
          const [candidate] = await transaction
            .select({ ...refundOperationColumns })
            .from(paymentOperations)
            .innerJoin(payments, eq(payments.id, paymentOperations.paymentId))
            .where(eq(paymentOperations.id, correlatedOperationId))
            .limit(1)
            .for("update");
          if (candidate) {
            const retryGeneration =
              typeof candidate.metadata.retryGeneration === "number" &&
              Number.isSafeInteger(candidate.metadata.retryGeneration)
                ? candidate.metadata.retryGeneration
                : 0;
            const expectedIdempotencyKey = retryGeneration
              ? `${candidate.idempotencyKey}:retry:${retryGeneration}`
              : candidate.idempotencyKey;
            const providerHistory = Array.isArray(
              candidate.metadata.providerOperationHistory,
            )
              ? candidate.metadata.providerOperationHistory.filter(
                  (value): value is string => typeof value === "string",
                )
              : [];

            if (providerHistory.includes(refundId)) {
              await transaction
                .update(paymentWebhookEvents)
                .set({ status: "processed", processedAt: new Date() })
                .where(eq(paymentWebhookEvents.id, webhookEvent.id));
              return "historical_refund_event" as const;
            }
            if (
              !candidate.providerOperationId &&
              correlatedIdempotencyKey === expectedIdempotencyKey
            ) {
              const [adopted] = await transaction
                .update(paymentOperations)
                .set({ providerOperationId: refundId, updatedAt: new Date() })
                .where(
                  and(
                    eq(paymentOperations.id, candidate.id),
                    isNull(paymentOperations.providerOperationId),
                  ),
                )
                .returning({ id: paymentOperations.id });
              if (adopted) {
                operation = { ...candidate, providerOperationId: refundId };
              }
            }
          }
        }

        if (
          !operation &&
          typeof refund.payment_intent === "string" &&
          Number.isSafeInteger(refund.amount) &&
          Number(refund.amount) > 0
        ) {
          const [localPayment] = await transaction
            .select({ id: payments.id, currency: payments.currency })
            .from(payments)
            .where(
              and(
                eq(payments.provider, "stripe"),
                sql`${payments.metadata} ->> 'paymentIntentId' = ${refund.payment_intent}`,
              ),
            )
            .limit(1)
            .for("update");
          if (localPayment) {
            await transaction
              .insert(paymentOperations)
              .values({
                paymentId: localPayment.id,
                operationType: "refund",
                source: "external",
                status: "pending",
                amount: minorUnitsToDecimal(Number(refund.amount)),
                currency: localPayment.currency,
                idempotencyKey: `stripe-external-refund:${refundId}`,
                providerOperationId: refundId,
                metadata: {
                  paymentIntentId: refund.payment_intent,
                  importedByStripeEventId: event.id,
                  providerRefundStatus: normalizedRefundStatus,
                },
              })
              .onConflictDoNothing();
            [operation] = await transaction
              .select({ ...refundOperationColumns })
              .from(paymentOperations)
              .innerJoin(payments, eq(payments.id, paymentOperations.paymentId))
              .where(eq(paymentOperations.providerOperationId, refundId))
              .limit(1)
              .for("update");
          }
        }

        if (!operation) {
          if (process.env.PAYMENTS_OPERATIONS_EMAIL) {
            await transaction
              .insert(notificationOutbox)
              .values({
                channel: "email",
                templateKey: "refund-review-required",
                recipient: process.env.PAYMENTS_OPERATIONS_EMAIL,
                deduplicationKey: `unmatched-stripe-refund:${refundId}`,
                payload: {
                  refundId,
                  paymentIntentId: refund.payment_intent,
                  refundStatus: normalizedRefundStatus,
                  stripeEventId: event.id,
                },
              })
              .onConflictDoNothing();
          }
          await transaction
            .update(paymentWebhookEvents)
            .set({ status: "ignored", processedAt: new Date() })
            .where(eq(paymentWebhookEvents.id, webhookEvent.id));
          return "unmatched_refund" as const;
        }

        // Query Stripe only after locking the local operation. This serializes
        // concurrent/out-of-order webhooks and prevents stale success from
        // overwriting a newer terminal failure (or vice versa).
        const currentRefund = await getStripeRefund(refundId);
        if (!currentRefund.configured) {
          throw new Error("Stripe refund reconciliation is not configured.");
        }
        normalizedRefundStatus = currentRefund.status;

        const now = new Date();
        const terminalFailure = ["failed", "canceled", "cancelled"].includes(
          normalizedRefundStatus,
        );
        const notificationKey =
          typeof operation.metadata.notificationKey === "string"
            ? operation.metadata.notificationKey
            : null;

        if (terminalFailure) {
          const ledgerWasApplied = operation.operationStatus === "completed";
          await transaction
            .update(paymentOperations)
            .set({
              status: "failed",
              completedAt: null,
              lockedAt: null,
              lastError:
                refund.failure_reason ??
                `Stripe actualizó el reembolso a ${normalizedRefundStatus}.`,
              metadata: sql`${paymentOperations.metadata} || ${JSON.stringify({
                providerRefundStatus: normalizedRefundStatus,
                providerFailureReason: refund.failure_reason,
                reconciledByEventId: event.id,
              })}::jsonb`,
              updatedAt: now,
            })
            .where(eq(paymentOperations.id, operation.id));

          await transaction
            .update(payments)
            .set({
              refundedAmount: ledgerWasApplied
                ? sql`greatest(0, ${payments.refundedAmount} - ${operation.amount}::numeric)`
                : sql`${payments.refundedAmount}`,
              status: ledgerWasApplied
                ? sql`case when greatest(0, ${payments.refundedAmount} - ${operation.amount}::numeric) = 0 then 'paid' else 'partially_refunded' end`
                : sql`${payments.status}`,
              metadata: sql`${payments.metadata} || ${JSON.stringify({
                refundReviewRequired: true,
                failedRefundId: refundId,
                failedRefundStatus: normalizedRefundStatus,
                failedRefundReason: refund.failure_reason,
              })}::jsonb`,
              updatedAt: now,
            })
            .where(eq(payments.id, operation.paymentId));

          if (process.env.PAYMENTS_OPERATIONS_EMAIL) {
            await transaction
              .insert(notificationOutbox)
              .values({
                channel: "email",
                templateKey: "refund-review-required",
                recipient: process.env.PAYMENTS_OPERATIONS_EMAIL,
                deduplicationKey: `stripe-refund-failed:${operation.id}:${event.id}`,
                payload: {
                  paymentId: operation.paymentId,
                  refundOperationId: operation.id,
                  refundId,
                  refundStatus: normalizedRefundStatus,
                  failureReason: refund.failure_reason,
                },
              })
              .onConflictDoNothing();
          }
        } else if (
          normalizedRefundStatus === "succeeded" &&
          operation.operationStatus !== "completed"
        ) {
          const [completedOperation] = await transaction
            .update(paymentOperations)
            .set({
              status: "completed",
              completedAt: now,
              lockedAt: null,
              lastError: null,
              metadata: sql`${paymentOperations.metadata} || ${JSON.stringify({
                providerRefundStatus: normalizedRefundStatus,
                reconciledByEventId: event.id,
              })}::jsonb`,
              updatedAt: now,
            })
            .where(
              and(
                eq(paymentOperations.id, operation.id),
                inArray(paymentOperations.status, [
                  "pending",
                  "processing",
                  "failed",
                ]),
              ),
            )
            .returning({ id: paymentOperations.id });
          if (completedOperation) {
            const [remainingOperation] = await transaction
              .select({ id: paymentOperations.id })
              .from(paymentOperations)
              .where(
                and(
                  eq(paymentOperations.paymentId, operation.paymentId),
                  sql`${paymentOperations.id} <> ${operation.id}`,
                  inArray(paymentOperations.status, [
                    "pending",
                    "processing",
                    "failed",
                  ]),
                ),
              )
              .limit(1);
            await transaction
              .update(payments)
              .set({
                refundedAmount: sql`least(${payments.amount}, ${payments.refundedAmount} + ${operation.amount}::numeric)`,
                status: sql`case when ${payments.refundedAmount} + ${operation.amount}::numeric >= ${payments.amount} then 'refunded' else 'partially_refunded' end`,
                metadata: sql`${payments.metadata} || ${JSON.stringify({
                  refundId,
                  refundStatus: normalizedRefundStatus,
                  refundReviewRequired: Boolean(remainingOperation),
                })}::jsonb`,
                updatedAt: now,
              })
              .where(eq(payments.id, operation.paymentId));
            if (notificationKey) {
              await transaction
                .update(notificationOutbox)
                .set({ status: "cancelled", lockedAt: null })
                .where(eq(notificationOutbox.deduplicationKey, notificationKey));
            }
          }
        } else {
          await transaction
            .update(paymentOperations)
            .set({
              metadata: sql`${paymentOperations.metadata} || ${JSON.stringify({
                providerRefundStatus: normalizedRefundStatus,
                reconciledByEventId: event.id,
              })}::jsonb`,
              updatedAt: now,
            })
            .where(eq(paymentOperations.id, operation.id));
        }

        await transaction
          .update(paymentWebhookEvents)
          .set({ status: "processed", processedAt: now })
          .where(eq(paymentWebhookEvents.id, webhookEvent.id));
        return `refund_${normalizedRefundStatus}` as const;
      }

      if (
        event.type !== "checkout.session.completed" ||
        event.data?.object?.payment_status !== "paid" ||
        !event.data.object.id
      ) {
        await transaction
          .update(paymentWebhookEvents)
          .set({ status: "ignored", processedAt: new Date() })
          .where(eq(paymentWebhookEvents.id, webhookEvent.id));
        return "ignored" as const;
      }

      let [payment] = await transaction
        .select({
          id: payments.id,
          orderId: payments.orderId,
          amount: payments.amount,
          currency: payments.currency,
        })
        .from(payments)
        .where(
          and(
            eq(payments.provider, "stripe"),
            eq(payments.providerPaymentId, event.data.object.id),
          ),
        )
        .limit(1)
        .for("update");

      const orderReference =
        event.data.object.client_reference_id ??
        event.data.object.metadata?.order_reference;
      if (!payment && orderReference) {
        [payment] = await transaction
          .select({
            id: payments.id,
            orderId: payments.orderId,
            amount: payments.amount,
            currency: payments.currency,
          })
          .from(payments)
          .innerJoin(bookingOrders, eq(bookingOrders.id, payments.orderId))
          .where(
            and(
              eq(payments.provider, "stripe"),
              eq(bookingOrders.reference, orderReference),
            ),
          )
          .limit(1)
          .for("update");
        if (payment) {
          await transaction
            .update(payments)
            .set({
              providerPaymentId: event.data.object.id,
              updatedAt: new Date(),
            })
            .where(eq(payments.id, payment.id));
        }
      }

      if (!payment) {
        throw new Error("Stripe payment not found for checkout session.");
      }

      const now = new Date();
      const paymentOccurredAt =
        Number.isSafeInteger(event.created) && Number(event.created) > 0
          ? new Date(Number(event.created) * 1_000)
          : now;
      const [order] = await transaction
        .update(bookingOrders)
        .set({ status: "confirmed", confirmedAt: now, updatedAt: now })
        .where(
          and(
            eq(bookingOrders.id, payment.orderId),
            eq(bookingOrders.status, "pending_payment"),
            or(
              isNull(bookingOrders.expiresAt),
              gt(bookingOrders.expiresAt, paymentOccurredAt),
            ),
          ),
        )
        .returning({ id: bookingOrders.id, email: bookingOrders.customerEmail });

      if (!order) {
        const [staleOrder] = await transaction
          .select({
            id: bookingOrders.id,
            email: bookingOrders.customerEmail,
            status: bookingOrders.status,
          })
          .from(bookingOrders)
          .where(eq(bookingOrders.id, payment.orderId))
          .limit(1);

        await transaction
          .update(payments)
          .set({
            status: "paid",
            paidAt: now,
            updatedAt: now,
            metadata: sql`${payments.metadata} || ${JSON.stringify({
              requiresRefundReview: true,
              receivedAfterOrderStatus: staleOrder?.status ?? "missing",
              paymentIntentId: event.data.object.payment_intent,
            })}::jsonb`,
          })
          .where(eq(payments.id, payment.id));

        const operationsEmail = process.env.PAYMENTS_OPERATIONS_EMAIL;
        if (operationsEmail) {
          await transaction.insert(notificationOutbox).values({
            channel: "email",
            templateKey: "late-payment-refund-review",
            recipient: operationsEmail,
            deduplicationKey: `late-payment-refund-review:${event.id}`,
            payload: {
              orderId: payment.orderId,
              orderStatus: staleOrder?.status ?? "missing",
              stripeSessionId: event.data.object.id,
              paymentIntentId: event.data.object.payment_intent,
            },
          });
        }

        const [refundOperation] = event.data.object.payment_intent
          ? await transaction
              .insert(paymentOperations)
              .values({
                paymentId: payment.id,
                operationType: "refund",
                source: "late_payment",
                amount: payment.amount,
                currency: payment.currency,
                idempotencyKey: `late-payment:${event.id}`,
                metadata: {
                  paymentIntentId: event.data.object.payment_intent,
                  stripeEventId: event.id,
                  notificationKey: `late-payment-refund-review:${event.id}`,
                },
              })
              .onConflictDoNothing()
              .returning({ id: paymentOperations.id })
          : [];

        await transaction
          .update(paymentWebhookEvents)
          .set({ status: "processed", processedAt: now })
          .where(eq(paymentWebhookEvents.id, webhookEvent.id));
        return {
          status: "late_payment" as const,
          refundOperationId: refundOperation?.id ?? null,
        };
      }

      await transaction
        .update(payments)
        .set({
          status: "paid",
          paidAt: now,
          updatedAt: now,
          metadata: sql`${payments.metadata} || ${JSON.stringify({
            paymentIntentId: event.data.object.payment_intent,
          })}::jsonb`,
        })
        .where(
          and(
            eq(payments.id, payment.id),
            inArray(payments.status, ["pending", "requires_action"]),
          ),
        );

      const orderBookings = await transaction
        .select({ id: bookings.id, publicId: bookings.publicId, status: bookings.status })
        .from(bookings)
        .where(eq(bookings.orderId, payment.orderId));

      await transaction
        .update(bookings)
        .set({ status: "confirmed", updatedAt: now })
        .where(
          and(
            eq(bookings.orderId, payment.orderId),
            eq(bookings.status, "pending_payment"),
          ),
        );

      for (const booking of orderBookings) {
        await transaction
          .update(bookingAssignments)
          .set({ status: "confirmed", updatedAt: now })
          .where(
            and(
              eq(bookingAssignments.bookingId, booking.id),
              eq(bookingAssignments.status, "assigned"),
            ),
          );
      }

      if (orderBookings.length > 0) {
        await transaction.insert(bookingStatusEvents).values(
          orderBookings.map((booking) => ({
            bookingId: booking.id,
            fromStatus: booking.status,
            toStatus: "confirmed",
            reason: "Pago confirmado por Stripe",
          })),
        );
      }

      if (order && orderBookings[0]) {
        await transaction.insert(notificationOutbox).values({
          bookingId: orderBookings[0].id,
          channel: "email",
          templateKey: "payment-confirmed",
          recipient: order.email,
          deduplicationKey: `payment-confirmed:${event.id}`,
          payload: { orderId: order.id, visits: orderBookings.length },
        });
      }

      await transaction
        .update(paymentWebhookEvents)
        .set({ status: "processed", processedAt: now })
        .where(eq(paymentWebhookEvents.id, webhookEvent.id));

      return "processed" as const;
    });

    if (typeof outcome === "object" && outcome.status === "late_payment") {
      let refundStatus = outcome.refundOperationId ? "initiated" : "review_required";
      if (outcome.refundOperationId) {
        try {
          const processed = await processNextPaymentOperation(
            outcome.refundOperationId,
          );
          if (processed.outcome === "completed") refundStatus = "refunded";
          if (processed.outcome === "failed") refundStatus = "review_required";
        } catch (refundError) {
          console.error("Late Stripe payment refund remains queued", refundError);
        }
      }
      return NextResponse.json({
        received: true,
        outcome: outcome.status,
        refundStatus,
      });
    }

    return NextResponse.json({ received: true, outcome });
  } catch (error) {
    console.error("Stripe webhook processing failed", error);
    return apiError("No pudimos procesar el evento.", 500, "WEBHOOK_FAILED");
  }
}
