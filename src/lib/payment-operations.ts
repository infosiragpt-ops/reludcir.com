import { and, asc, eq, lt, lte, ne, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  notificationOutbox,
  paymentOperations,
  payments,
} from "@/db/schema";
import { createStripeRefund, getStripeRefund } from "@/lib/payments";
import { decimalToMinorUnits, minorUnitsToDecimal } from "@/lib/pricing";

const LOCK_TIMEOUT_MS = 10 * 60 * 1_000;

function metadataText(metadata: Record<string, unknown>, key: string) {
  return typeof metadata[key] === "string" ? metadata[key] : null;
}

function metadataInteger(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : 0;
}

async function claimPaymentOperation(operationId?: number) {
  const now = new Date();
  return getDb().transaction(async (transaction) => {
    const conditions = [
      eq(paymentOperations.status, "pending"),
      ne(paymentOperations.source, "manual"),
      lte(paymentOperations.availableAt, now),
      sql`${paymentOperations.attempts} < ${paymentOperations.maxAttempts}`,
    ];
    if (operationId) conditions.push(eq(paymentOperations.id, operationId));

    const [candidate] = await transaction
      .select()
      .from(paymentOperations)
      .where(and(...conditions))
      .orderBy(asc(paymentOperations.availableAt), asc(paymentOperations.id))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!candidate) return null;

    const [claimed] = await transaction
      .update(paymentOperations)
      .set({
        status: "processing",
        lockedAt: now,
        attempts: sql`${paymentOperations.attempts} + 1`,
      })
      .where(
        and(
          eq(paymentOperations.id, candidate.id),
          eq(paymentOperations.status, "pending"),
        ),
      )
      .returning();
    return claimed ?? null;
  });
}

async function rescheduleOrFail(
  operation: typeof paymentOperations.$inferSelect,
  message: string,
) {
  const exhausted = operation.attempts >= operation.maxAttempts;
  const delayMinutes = Math.min(60, 2 ** Math.min(operation.attempts, 6));
  const [updated] = await getDb()
    .update(paymentOperations)
    .set({
      status: exhausted ? "failed" : "pending",
      lockedAt: null,
      lastError: message.slice(0, 500),
      availableAt: new Date(Date.now() + delayMinutes * 60 * 1_000),
    })
    .where(
      and(
        eq(paymentOperations.id, operation.id),
        eq(paymentOperations.status, "processing"),
      ),
    )
    .returning({ id: paymentOperations.id });
  return updated ? (exhausted ? "failed" : "retrying") : "superseded";
}

export async function recoverStalePaymentOperations() {
  const staleBefore = new Date(Date.now() - LOCK_TIMEOUT_MS);
  const failed = await getDb()
    .update(paymentOperations)
    .set({ status: "failed", lockedAt: null, lastError: "Worker agotó sus reintentos." })
    .where(
      and(
        eq(paymentOperations.status, "processing"),
        lt(paymentOperations.lockedAt, staleBefore),
        sql`${paymentOperations.attempts} >= ${paymentOperations.maxAttempts}`,
      ),
    )
    .returning({ id: paymentOperations.id });
  const recovered = await getDb()
    .update(paymentOperations)
    .set({ status: "pending", lockedAt: null, availableAt: new Date() })
    .where(
      and(
        eq(paymentOperations.status, "processing"),
        lt(paymentOperations.lockedAt, staleBefore),
        sql`${paymentOperations.attempts} < ${paymentOperations.maxAttempts}`,
      ),
    )
    .returning({ id: paymentOperations.id });
  return { recovered: recovered.length, failed: failed.length };
}

export async function processNextPaymentOperation(operationId?: number) {
  const operation = await claimPaymentOperation(operationId);
  if (!operation) return { outcome: "empty" as const };

  const paymentIntentId = metadataText(operation.metadata, "paymentIntentId");
  const notificationKey = metadataText(operation.metadata, "notificationKey");
  if (!paymentIntentId) {
    const [failed] = await getDb()
      .update(paymentOperations)
      .set({
        status: "failed",
        lockedAt: null,
        lastError: "Falta paymentIntentId para ejecutar el reembolso.",
      })
      .where(
        and(
          eq(paymentOperations.id, operation.id),
          eq(paymentOperations.status, "processing"),
        ),
      )
      .returning({ id: paymentOperations.id });
    return {
      outcome: failed ? ("failed" as const) : ("superseded" as const),
      operationId: operation.id,
    };
  }

  try {
    const retryGeneration = metadataInteger(operation.metadata, "retryGeneration");
    const providerIdempotencyKey = retryGeneration
      ? `${operation.idempotencyKey}:retry:${retryGeneration}`
      : operation.idempotencyKey;
    const stripeRefund = operation.providerOperationId
      ? await getStripeRefund(operation.providerOperationId)
      : await createStripeRefund({
          paymentIntentId,
          amountMinor: decimalToMinorUnits(operation.amount),
          idempotencyKey: providerIdempotencyKey,
          paymentOperationId: operation.id,
        });

    if (!stripeRefund.configured) {
      const outcome = await rescheduleOrFail(operation, "Stripe no está configurado.");
      return { outcome, operationId: operation.id };
    }

    if (["failed", "canceled", "cancelled"].includes(stripeRefund.status)) {
      const [failed] = await getDb()
        .update(paymentOperations)
        .set({
          status: "failed",
          providerOperationId: stripeRefund.refundId,
          metadata: sql`${paymentOperations.metadata} || ${JSON.stringify({
            providerRefundStatus: stripeRefund.status,
          })}::jsonb`,
          lockedAt: null,
          lastError: `Stripe devolvió estado ${stripeRefund.status}.`,
        })
        .where(
          and(
            eq(paymentOperations.id, operation.id),
            eq(paymentOperations.status, "processing"),
          ),
        )
        .returning({ id: paymentOperations.id });
      return {
        outcome: failed ? ("failed" as const) : ("superseded" as const),
        operationId: operation.id,
      };
    }

    if (stripeRefund.status !== "succeeded") {
      const exhausted = operation.attempts >= operation.maxAttempts;
      const [rescheduled] = await getDb()
        .update(paymentOperations)
        .set({
          status: exhausted ? "failed" : "pending",
          providerOperationId: stripeRefund.refundId,
          metadata: sql`${paymentOperations.metadata} || ${JSON.stringify({
            providerRefundStatus: stripeRefund.status,
          })}::jsonb`,
          lockedAt: null,
          lastError: exhausted
            ? `Stripe mantuvo el reembolso en estado ${stripeRefund.status}.`
            : null,
          availableAt: new Date(Date.now() + 5 * 60 * 1_000),
        })
        .where(
          and(
            eq(paymentOperations.id, operation.id),
            eq(paymentOperations.status, "processing"),
          ),
        )
        .returning({ id: paymentOperations.id });
      if (!rescheduled) {
        return { outcome: "superseded" as const, operationId: operation.id };
      }
      return {
        outcome: exhausted ? ("failed" as const) : ("pending" as const),
        operationId: operation.id,
      };
    }

    const ledgerApplied = await getDb().transaction(async (transaction) => {
      const amount = minorUnitsToDecimal(decimalToMinorUnits(operation.amount));
      const [completedOperation] = await transaction
        .update(paymentOperations)
        .set({
          status: "completed",
          providerOperationId: stripeRefund.refundId,
          metadata: sql`${paymentOperations.metadata} || ${JSON.stringify({
            providerRefundStatus: stripeRefund.status,
          })}::jsonb`,
          lockedAt: null,
          completedAt: new Date(),
          lastError: null,
        })
        .where(
          and(
            eq(paymentOperations.id, operation.id),
            eq(paymentOperations.status, "processing"),
          ),
        )
        .returning({ id: paymentOperations.id });
      if (!completedOperation) return false;
      const [remainingOperation] = await transaction
        .select({ id: paymentOperations.id })
        .from(paymentOperations)
        .where(
          and(
            eq(paymentOperations.paymentId, operation.paymentId),
            sql`${paymentOperations.id} <> ${operation.id}`,
            sql`${paymentOperations.status} in ('pending', 'processing', 'failed')`,
          ),
        )
        .limit(1);
      await transaction
        .update(payments)
        .set({
          refundedAmount: sql`least(${payments.amount}, ${payments.refundedAmount} + ${amount}::numeric)`,
          status: sql`case when ${payments.refundedAmount} + ${amount}::numeric >= ${payments.amount} then 'refunded' else 'partially_refunded' end`,
          metadata: sql`${payments.metadata} || ${JSON.stringify({
            refundId: stripeRefund.refundId,
            refundStatus: stripeRefund.status,
            refundReviewRequired: Boolean(remainingOperation),
          })}::jsonb`,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, operation.paymentId));
      if (notificationKey) {
        await transaction
          .update(notificationOutbox)
          .set({ status: "cancelled", lockedAt: null })
          .where(eq(notificationOutbox.deduplicationKey, notificationKey));
      }
      return true;
    });

    return {
      outcome: ledgerApplied ? ("completed" as const) : ("superseded" as const),
      operationId: operation.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido de Stripe.";
    const outcome = await rescheduleOrFail(operation, message);
    return { outcome, operationId: operation.id };
  }
}
