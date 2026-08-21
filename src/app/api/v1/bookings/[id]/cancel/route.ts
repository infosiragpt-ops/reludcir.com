import { and, eq, gt, inArray, sql } from "drizzle-orm";
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
import { apiError } from "@/lib/api";
import { getAuthenticatedUser } from "@/lib/auth";
import { processNextPaymentOperation } from "@/lib/payment-operations";
import { expireStripeCheckoutSession } from "@/lib/payments";

const cancelSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

const manageableStatuses = ["pending_payment", "confirmed", "assigned"];

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return apiError("Inicia sesión para gestionar la reserva.", 401, "UNAUTHENTICATED");
  }

  const { id } = await context.params;
  const bookingId = Number(id);
  const parsed = cancelSchema.safeParse(await request.json().catch(() => null));
  if (!Number.isSafeInteger(bookingId) || bookingId <= 0 || !parsed.success) {
    return apiError("La solicitud de cancelación no es válida.", 422, "INVALID_REQUEST");
  }

  try {
    const updated = await getDb().transaction(async (transaction) => {
      const [booking] = await transaction
        .select()
        .from(bookings)
        .where(and(eq(bookings.id, bookingId), eq(bookings.userId, user.id)))
        .limit(1)
        .for("update");

      if (!booking) {
        throw new Error("NOT_FOUND");
      }
      if (!manageableStatuses.includes(booking.status)) {
        throw new Error("NOT_MANAGEABLE");
      }
      if (booking.scheduledStart.getTime() <= Date.now()) {
        throw new Error("ALREADY_STARTED");
      }

      const now = new Date();
      const refundEligible = now.getTime() <= booking.refundEligibleUntil.getTime();
      const cancelWholeOrder = booking.status === "pending_payment";
      const cancellableBookings = cancelWholeOrder
        ? await transaction
            .select({
              id: bookings.id,
              publicId: bookings.publicId,
              status: bookings.status,
            })
            .from(bookings)
            .where(
              and(
                eq(bookings.orderId, booking.orderId),
                eq(bookings.status, "pending_payment"),
                gt(bookings.scheduledStart, now),
              ),
            )
            .for("update")
        : [
            {
              id: booking.id,
              publicId: booking.publicId,
              status: booking.status,
            },
          ];
      const cancelledBookingIds = cancellableBookings.map((item) => item.id);

      const cancelledBookings = await transaction
        .update(bookings)
        .set({
          status: "cancelled",
          cancelledAt: now,
          cancellationReason: parsed.data.reason,
          updatedAt: now,
        })
        .where(inArray(bookings.id, cancelledBookingIds))
        .returning();

      await transaction
        .update(bookingAssignments)
        .set({ status: "cancelled", releasedAt: now, updatedAt: now })
        .where(
          and(
            inArray(bookingAssignments.bookingId, cancelledBookingIds),
            inArray(bookingAssignments.status, ["assigned", "confirmed"]),
          ),
        );

      if (cancelWholeOrder) {
        await transaction
          .update(bookingOrders)
          .set({ status: "cancelled", updatedAt: now })
          .where(eq(bookingOrders.id, booking.orderId));
      } else {
        const [remainingActive] = await transaction
          .select({ id: bookings.id })
          .from(bookings)
          .where(
            and(
              eq(bookings.orderId, booking.orderId),
              inArray(bookings.status, [
                "pending_payment",
                "confirmed",
                "assigned",
                "in_progress",
              ]),
            ),
          )
          .limit(1);
        if (!remainingActive) {
          const [completedVisit] = await transaction
            .select({ id: bookings.id })
            .from(bookings)
            .where(
              and(
                eq(bookings.orderId, booking.orderId),
                eq(bookings.status, "completed"),
              ),
            )
            .limit(1);
          await transaction
            .update(bookingOrders)
            .set({
              status: completedVisit ? "completed" : "cancelled",
              updatedAt: now,
            })
            .where(eq(bookingOrders.id, booking.orderId));
        }
      }

      await transaction.insert(bookingStatusEvents).values(
        cancellableBookings.map((item) => ({
          bookingId: item.id,
          actorUserId: user.id,
          fromStatus: item.status,
          toStatus: "cancelled",
          reason: parsed.data.reason,
        })),
      );

      const [orderPayment] = await transaction
        .select({
          id: payments.id,
          provider: payments.provider,
          providerPaymentId: payments.providerPaymentId,
          status: payments.status,
          metadata: payments.metadata,
        })
        .from(payments)
        .where(
          eq(payments.orderId, booking.orderId),
        )
        .limit(1);

      if (cancelWholeOrder) {
        await transaction
          .update(payments)
          .set({ status: "cancelled", updatedAt: now })
          .where(
            and(
              eq(payments.orderId, booking.orderId),
              inArray(payments.status, ["pending", "requires_action"]),
            ),
          );
      }

      const paidPayments = refundEligible
        ? await transaction
            .update(payments)
            .set({
              metadata: sql`${payments.metadata} || ${JSON.stringify({
                refundReviewRequired: true,
                cancelledBookingIds,
                refundAmount: booking.unitPriceSnapshot,
              })}::jsonb`,
              updatedAt: now,
            })
            .where(
              and(
                eq(payments.orderId, booking.orderId),
                inArray(payments.status, ["paid", "partially_refunded"]),
              ),
            )
            .returning({ id: payments.id })
        : [];

      await transaction.insert(notificationOutbox).values({
        userId: user.id,
        bookingId: booking.id,
        channel: "email",
        templateKey: "booking-cancelled",
        recipient: user.email,
        deduplicationKey: cancelWholeOrder
          ? `booking-order-cancelled:${booking.orderId}`
          : `booking-cancelled:${booking.publicId}`,
        payload: {
          bookingPublicId: booking.publicId,
          cancelledBookingIds,
          refundReviewRequired: paidPayments.length > 0,
          refundEligible,
          scope: cancelWholeOrder ? "order" : "visit",
        },
      });

      if (paidPayments.length > 0 && process.env.PAYMENTS_OPERATIONS_EMAIL) {
        await transaction.insert(notificationOutbox).values({
          userId: user.id,
          bookingId: booking.id,
          channel: "email",
          templateKey: "refund-review-required",
          recipient: process.env.PAYMENTS_OPERATIONS_EMAIL,
          deduplicationKey: `refund-review-required:${booking.publicId}`,
          payload: {
            orderId: booking.orderId,
            cancelledBookingIds,
            requestedAmount: booking.unitPriceSnapshot,
          },
        });
      }

      const paymentIntentId =
        typeof orderPayment?.metadata.paymentIntentId === "string"
          ? orderPayment.metadata.paymentIntentId
          : null;
      const [automaticRefundOperation] =
        refundEligible &&
        orderPayment?.provider === "stripe" &&
        ["paid", "partially_refunded"].includes(orderPayment.status) &&
        paymentIntentId
          ? await transaction
              .insert(paymentOperations)
              .values({
                paymentId: orderPayment.id,
                operationType: "refund",
                source: "booking_cancellation",
                amount: booking.unitPriceSnapshot,
                currency: booking.currency,
                idempotencyKey: `booking-cancellation:${booking.publicId}`,
                metadata: {
                  paymentIntentId,
                  bookingPublicId: booking.publicId,
                  notificationKey: `refund-review-required:${booking.publicId}`,
                },
              })
              .onConflictDoNothing()
              .returning({ id: paymentOperations.id })
          : [];
      const [manualRefundOperation] =
        refundEligible &&
        orderPayment &&
        ["yape", "bank_transfer"].includes(orderPayment.provider) &&
        ["paid", "partially_refunded"].includes(orderPayment.status)
          ? await transaction
              .insert(paymentOperations)
              .values({
                paymentId: orderPayment.id,
                operationType: "refund",
                source: "manual",
                amount: booking.unitPriceSnapshot,
                currency: booking.currency,
                idempotencyKey: `manual-refund-request:${booking.publicId}`,
                metadata: {
                  bookingPublicId: booking.publicId,
                  notificationKey: `refund-review-required:${booking.publicId}`,
                },
              })
              .onConflictDoNothing()
              .returning({ id: paymentOperations.id })
          : [];

      return {
        booking:
          cancelledBookings.find((item) => item.id === booking.id) ??
          cancelledBookings[0],
        cancelledBookingIds,
        stripeSessionId:
          cancelWholeOrder && orderPayment?.provider === "stripe"
            ? (orderPayment.providerPaymentId ?? null)
            : null,
        scope: cancelWholeOrder ? "order" : "visit",
        refundEligible,
        refundOperationId:
          automaticRefundOperation?.id ?? manualRefundOperation?.id ?? null,
        automaticRefundOperationId: automaticRefundOperation?.id ?? null,
        refundReviewRequired: paidPayments.length > 0,
      };
    });

    if (updated.stripeSessionId) {
      await expireStripeCheckoutSession(updated.stripeSessionId);
    }

    let refundStatus = updated.refundEligible
      ? updated.refundReviewRequired
        ? "review_required"
        : "not_required"
      : "not_eligible";
    if (updated.refundOperationId) {
      refundStatus = "initiated";
    }
    if (updated.automaticRefundOperationId) {
      try {
        const processed = await processNextPaymentOperation(
          updated.automaticRefundOperationId,
        );
        if (processed.outcome === "completed") refundStatus = "refunded";
        if (processed.outcome === "failed") refundStatus = "review_required";
      } catch (refundError) {
        console.error("Stripe refund queued after cancellation", refundError);
      }
    }

    return NextResponse.json({
      booking: updated.booking,
      cancelledBookingIds: updated.cancelledBookingIds,
      scope: updated.scope,
      refundStatus,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return apiError("Reserva no encontrada.", 404, "NOT_FOUND");
    }
    if (error instanceof Error && error.message === "NOT_MANAGEABLE") {
      return apiError("Esta reserva ya no se puede cancelar.", 409, "INVALID_STATUS");
    }
    if (error instanceof Error && error.message === "ALREADY_STARTED") {
      return apiError("El servicio ya inició y no puede cancelarse.", 409, "ALREADY_STARTED");
    }

    console.error("Booking cancellation failed", error);
    return apiError("No pudimos cancelar la reserva.", 500, "INTERNAL_ERROR");
  }
}
