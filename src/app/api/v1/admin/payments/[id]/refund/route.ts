import { and, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { paymentOperations, payments } from "@/db/schema";
import { apiError, postgresErrorCode } from "@/lib/api";
import { getAuthenticatedUser } from "@/lib/auth";
import { decimalToMinorUnits, minorUnitsToDecimal } from "@/lib/pricing";

const refundSchema = z.object({
  operationId: z.number().int().positive(),
  externalReference: z.string().trim().min(3).max(160),
  notes: z.string().trim().max(500).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser();
  if (!user || !["admin", "support"].includes(user.role)) {
    return apiError("No autorizado.", 403, "FORBIDDEN");
  }

  const { id } = await context.params;
  const paymentId = Number(id);
  const parsed = refundSchema.safeParse(await request.json().catch(() => null));
  if (!Number.isSafeInteger(paymentId) || paymentId <= 0 || !parsed.success) {
    return apiError("Datos de reembolso no válidos.", 422, "INVALID_INPUT");
  }

  const externalReference = parsed.data.externalReference
    .replace(/\s+/g, "")
    .toUpperCase();

  try {
    const result = await getDb().transaction(async (transaction) => {
      const [refundRequest] = await transaction
        .select({
          operationId: paymentOperations.id,
          operationStatus: paymentOperations.status,
          operationSource: paymentOperations.source,
          requestedAmount: paymentOperations.amount,
          paymentId: payments.id,
          paymentProvider: payments.provider,
          paymentStatus: payments.status,
          paymentAmount: payments.amount,
          refundedAmount: payments.refundedAmount,
          currency: payments.currency,
        })
        .from(paymentOperations)
        .innerJoin(payments, eq(payments.id, paymentOperations.paymentId))
        .where(
          and(
            eq(paymentOperations.id, parsed.data.operationId),
            eq(payments.id, paymentId),
          ),
        )
        .limit(1)
        .for("update");
      if (!refundRequest) throw new Error("NOT_FOUND");
      if (
        refundRequest.operationSource !== "manual" ||
        !["yape", "bank_transfer"].includes(refundRequest.paymentProvider)
      ) {
        throw new Error("INVALID_PROVIDER");
      }
      if (
        !["pending", "failed"].includes(refundRequest.operationStatus) ||
        !["paid", "partially_refunded"].includes(refundRequest.paymentStatus)
      ) {
        throw new Error("INVALID_STATUS");
      }

      const amountMinor = decimalToMinorUnits(refundRequest.requestedAmount);
      const outstandingMinor =
        decimalToMinorUnits(refundRequest.paymentAmount) -
        decimalToMinorUnits(refundRequest.refundedAmount);
      if (amountMinor > outstandingMinor) throw new Error("AMOUNT_EXCEEDED");

      const now = new Date();
      const nextRefundedAmount = minorUnitsToDecimal(
        decimalToMinorUnits(refundRequest.refundedAmount) + amountMinor,
      );
      const nextStatus = amountMinor === outstandingMinor ? "refunded" : "partially_refunded";

      await transaction
        .update(paymentOperations)
        .set({
          status: "completed",
          providerOperationId: `manual:${refundRequest.paymentProvider}:${externalReference}`,
          metadata: sql`${paymentOperations.metadata} || ${JSON.stringify({
            externalReference,
            notes: parsed.data.notes,
            confirmedByUserId: user.id,
          })}::jsonb`,
          attempts: sql`least(${paymentOperations.maxAttempts}, ${paymentOperations.attempts} + 1)`,
          lockedAt: null,
          completedAt: now,
          lastError: null,
          updatedAt: now,
        })
        .where(eq(paymentOperations.id, refundRequest.operationId));

      const [remainingRequest] = await transaction
        .select({ id: paymentOperations.id })
        .from(paymentOperations)
        .where(
          and(
            eq(paymentOperations.paymentId, refundRequest.paymentId),
            eq(paymentOperations.source, "manual"),
            inArray(paymentOperations.status, ["pending", "processing", "failed"]),
          ),
        )
        .limit(1);

      await transaction
        .update(payments)
        .set({
          status: nextStatus,
          refundedAmount: nextRefundedAmount,
          metadata: sql`${payments.metadata} || ${JSON.stringify({
            externalReference,
            latestManualRefundReference: externalReference,
            latestManualRefundNotes: parsed.data.notes,
            refundReviewRequired: Boolean(remainingRequest),
          })}::jsonb`,
          updatedAt: now,
        })
        .where(
          and(
            eq(payments.id, refundRequest.paymentId),
            inArray(payments.status, ["paid", "partially_refunded"]),
          ),
        );

      return {
        operationId: refundRequest.operationId,
        paymentId: refundRequest.paymentId,
        status: nextStatus,
        refundedNow: refundRequest.requestedAmount,
        refundedAmount: nextRefundedAmount,
        remainingRefundRequests: Boolean(remainingRequest),
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    if (postgresErrorCode(error) === "23505") {
      return apiError(
        "Esta constancia de reembolso ya fue registrada.",
        409,
        "REFERENCE_ALREADY_USED",
      );
    }
    const code = error instanceof Error ? error.message : "";
    if (code === "NOT_FOUND") return apiError("Pago no encontrado.", 404, "NOT_FOUND");
    if (code === "INVALID_PROVIDER") {
      return apiError("Este reembolso se procesa mediante Stripe.", 409, "INVALID_PROVIDER");
    }
    if (code === "INVALID_STATUS") {
      return apiError("El pago no admite otro reembolso.", 409, "INVALID_STATUS");
    }
    if (code === "AMOUNT_EXCEEDED") {
      return apiError("El monto supera el saldo reembolsable.", 409, "AMOUNT_EXCEEDED");
    }
    console.error("Manual refund confirmation failed", error);
    return apiError("No pudimos registrar el reembolso.", 500, "INTERNAL_ERROR");
  }
}
