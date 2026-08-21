import { and, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import {
  bookingAssignments,
  bookingOrders,
  bookings,
  bookingStatusEvents,
  notificationOutbox,
  paymentOperations,
  payments,
} from "@/db/schema";
import { apiError, postgresErrorCode } from "@/lib/api";
import { getAuthenticatedUser } from "@/lib/auth";
import { isPrivilegedStaff } from "@/lib/staff";

const confirmationSchema = z.object({
  externalReference: z.string().trim().min(3).max(160),
  paidAt: z.string().datetime({ offset: true }).optional(),
  notes: z.string().trim().max(500).optional(),
});

const RECONCILIATION_CLOCK_TOLERANCE_MS = 5 * 60 * 1_000;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser();
  if (!user || !isPrivilegedStaff(user.role)) {
    return apiError("No autorizado.", 403, "FORBIDDEN");
  }

  const { id } = await context.params;
  const paymentId = Number(id);
  const parsed = confirmationSchema.safeParse(await request.json().catch(() => null));
  if (!Number.isSafeInteger(paymentId) || paymentId <= 0 || !parsed.success) {
    return apiError("Datos de confirmación no válidos.", 422, "INVALID_INPUT");
  }
  const externalReference = parsed.data.externalReference
    .replace(/\s+/g, "")
    .toUpperCase();
  const effectivePaidAt = parsed.data.paidAt
    ? new Date(parsed.data.paidAt)
    : new Date();

  try {
    const result = await getDb().transaction(async (transaction) => {
      const [payment] = await transaction
        .select({
          id: payments.id,
          orderId: payments.orderId,
          provider: payments.provider,
          status: payments.status,
          amount: payments.amount,
          currency: payments.currency,
          metadata: payments.metadata,
          createdAt: payments.createdAt,
          orderStatus: bookingOrders.status,
          orderExpiresAt: bookingOrders.expiresAt,
          customerEmail: bookingOrders.customerEmail,
          customerPhone: bookingOrders.customerPhoneE164,
          reference: bookingOrders.reference,
        })
        .from(payments)
        .innerJoin(bookingOrders, eq(payments.orderId, bookingOrders.id))
        .where(eq(payments.id, paymentId))
        .limit(1)
        .for("update");

      if (!payment) throw new Error("NOT_FOUND");
      if (!["yape", "bank_transfer"].includes(payment.provider)) {
        throw new Error("INVALID_PROVIDER");
      }
      if (
        !["pending", "cancelled"].includes(payment.status) ||
        !["pending_payment", "expired", "cancelled"].includes(payment.orderStatus)
      ) {
        throw new Error("INVALID_STATUS");
      }

      const reconciliationTime = new Date();
      if (
        effectivePaidAt.getTime() <
          payment.createdAt.getTime() - RECONCILIATION_CLOCK_TOLERANCE_MS ||
        effectivePaidAt.getTime() >
          reconciliationTime.getTime() + RECONCILIATION_CLOCK_TOLERANCE_MS
      ) {
        throw new Error("INVALID_PAID_AT");
      }

      const arrivedWithinHold =
        !payment.orderExpiresAt || effectivePaidAt <= payment.orderExpiresAt;
      const holdIsStillActive =
        payment.status === "pending" && payment.orderStatus === "pending_payment";
      const canConfirmBooking = arrivedWithinHold && holdIsStillActive;

      await transaction
        .update(payments)
        .set({
          status: "paid",
          providerPaymentId: externalReference,
          paidAt: effectivePaidAt,
          updatedAt: reconciliationTime,
          metadata: sql`${payments.metadata} || ${JSON.stringify({
            externalReference,
            notes: parsed.data.notes,
            confirmedByUserId: user.id,
            reconciledAt: reconciliationTime.toISOString(),
            paymentEffectiveAt: effectivePaidAt.toISOString(),
            lateReconciliation: !canConfirmBooking,
            refundReviewRequired: !canConfirmBooking,
          })}::jsonb`,
        })
        .where(eq(payments.id, payment.id));

      const orderBookings = await transaction
        .select({ id: bookings.id, status: bookings.status })
        .from(bookings)
        .where(eq(bookings.orderId, payment.orderId))
        .for("update");
      const bookingIds = orderBookings.map((booking) => booking.id);

      if (canConfirmBooking) {
        const [order] = await transaction
          .update(bookingOrders)
          .set({
            status: "confirmed",
            confirmedAt: reconciliationTime,
            updatedAt: reconciliationTime,
          })
          .where(
            and(
              eq(bookingOrders.id, payment.orderId),
              eq(bookingOrders.status, "pending_payment"),
            ),
          )
          .returning({ id: bookingOrders.id });
        if (!order) throw new Error("INVALID_STATUS");

        await transaction
          .update(bookings)
          .set({ status: "confirmed", updatedAt: reconciliationTime })
          .where(
            and(
              eq(bookings.orderId, payment.orderId),
              eq(bookings.status, "pending_payment"),
            ),
          );
        if (bookingIds.length > 0) {
          await transaction
            .update(bookingAssignments)
            .set({ status: "confirmed", updatedAt: reconciliationTime })
            .where(
              and(
                inArray(bookingAssignments.bookingId, bookingIds),
                eq(bookingAssignments.status, "assigned"),
              ),
            );
          await transaction.insert(bookingStatusEvents).values(
            orderBookings
              .filter((booking) => booking.status === "pending_payment")
              .map((booking) => ({
                bookingId: booking.id,
                actorUserId: user.id,
                fromStatus: booking.status,
                toStatus: "confirmed",
                reason: `Pago ${payment.provider} conciliado manualmente`,
              })),
          );
          await transaction.insert(notificationOutbox).values([
            {
              bookingId: orderBookings[0]!.id,
              channel: "email",
              templateKey: "payment-confirmed",
              recipient: payment.customerEmail,
              deduplicationKey: `manual-payment-confirmed:email:${payment.id}`,
              payload: { reference: payment.reference, visits: orderBookings.length },
            },
            {
              bookingId: orderBookings[0]!.id,
              channel: "whatsapp",
              templateKey: "payment-confirmed",
              recipient: payment.customerPhone,
              deduplicationKey: `manual-payment-confirmed:whatsapp:${payment.id}`,
              payload: { reference: payment.reference, visits: orderBookings.length },
            },
          ]);
        }

        return {
          paymentId: payment.id,
          orderId: payment.orderId,
          status: "paid",
          bookingStatus: "confirmed",
          refundReviewRequired: false,
        };
      }

      if (payment.orderStatus === "pending_payment") {
        await transaction
          .update(bookingOrders)
          .set({ status: "expired", updatedAt: reconciliationTime })
          .where(
            and(
              eq(bookingOrders.id, payment.orderId),
              eq(bookingOrders.status, "pending_payment"),
            ),
          );
        const cancelledBookings = orderBookings.filter(
          (booking) => booking.status === "pending_payment",
        );
        await transaction
          .update(bookings)
          .set({
            status: "cancelled",
            cancelledAt: reconciliationTime,
            cancellationReason: "Pago conciliado después del vencimiento",
            updatedAt: reconciliationTime,
          })
          .where(
            and(
              eq(bookings.orderId, payment.orderId),
              eq(bookings.status, "pending_payment"),
            ),
          );
        if (bookingIds.length > 0) {
          await transaction
            .update(bookingAssignments)
            .set({
              status: "cancelled",
              releasedAt: reconciliationTime,
              updatedAt: reconciliationTime,
            })
            .where(
              and(
                inArray(bookingAssignments.bookingId, bookingIds),
                eq(bookingAssignments.status, "assigned"),
              ),
            );
          if (cancelledBookings.length > 0) {
            await transaction.insert(bookingStatusEvents).values(
              cancelledBookings.map((booking) => ({
                bookingId: booking.id,
                actorUserId: user.id,
                fromStatus: booking.status,
                toStatus: "cancelled",
                reason: "Pago conciliado después del vencimiento",
              })),
            );
          }
        }
      }

      const refundIdempotencyKey = `late-manual-payment-refund:${payment.id}`;
      const [createdRefundOperation] = await transaction
        .insert(paymentOperations)
        .values({
          paymentId: payment.id,
          operationType: "refund",
          source: "manual",
          amount: payment.amount,
          currency: payment.currency,
          idempotencyKey: refundIdempotencyKey,
          metadata: {
            reason: "late_payment",
            orderId: payment.orderId,
            reference: payment.reference,
            paymentEffectiveAt: effectivePaidAt.toISOString(),
            orderExpiresAt: payment.orderExpiresAt?.toISOString() ?? null,
          },
        })
        .onConflictDoNothing()
        .returning({ id: paymentOperations.id });
      const [existingRefundOperation] = createdRefundOperation
        ? [createdRefundOperation]
        : await transaction
            .select({ id: paymentOperations.id })
            .from(paymentOperations)
            .where(eq(paymentOperations.idempotencyKey, refundIdempotencyKey))
            .limit(1);

      if (orderBookings[0]) {
        await transaction.insert(notificationOutbox).values({
          bookingId: orderBookings[0].id,
          channel: "email",
          templateKey: "late-payment-refund-pending",
          recipient: payment.customerEmail,
          deduplicationKey: `late-manual-payment:customer:${payment.id}`,
          payload: { reference: payment.reference, amount: payment.amount },
        });
      }
      if (process.env.PAYMENTS_OPERATIONS_EMAIL) {
        await transaction.insert(notificationOutbox).values({
          bookingId: orderBookings[0]?.id,
          channel: "email",
          templateKey: "late-payment-refund-review",
          recipient: process.env.PAYMENTS_OPERATIONS_EMAIL,
          deduplicationKey: `late-manual-payment:operations:${payment.id}`,
          payload: {
            reference: payment.reference,
            amount: payment.amount,
            paymentId: payment.id,
            refundOperationId: existingRefundOperation?.id,
          },
        });
      }

      return {
        paymentId: payment.id,
        orderId: payment.orderId,
        status: "paid",
        bookingStatus:
          payment.orderStatus === "cancelled" ? "cancelled" : "expired",
        refundReviewRequired: true,
        refundOperationId: existingRefundOperation?.id ?? null,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (postgresErrorCode(error) === "23505") {
      return apiError(
        "Esta constancia ya fue usada para confirmar otro pago.",
        409,
        "REFERENCE_ALREADY_USED",
      );
    }
    if (code === "NOT_FOUND") return apiError("Pago no encontrado.", 404, "NOT_FOUND");
    if (code === "INVALID_PROVIDER") {
      return apiError("Este pago no admite conciliación manual.", 409, "INVALID_PROVIDER");
    }
    if (code === "INVALID_STATUS") {
      return apiError("El pago ya fue procesado.", 409, "INVALID_STATUS");
    }
    if (code === "INVALID_PAID_AT") {
      return apiError(
        "La fecha efectiva del pago no es válida.",
        422,
        "INVALID_PAID_AT",
      );
    }
    console.error("Manual payment confirmation failed", error);
    return apiError("No pudimos confirmar el pago.", 500, "INTERNAL_ERROR");
  }
}
