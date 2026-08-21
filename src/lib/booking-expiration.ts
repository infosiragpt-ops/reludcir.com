import { and, eq, inArray, lte, ne, or } from "drizzle-orm";

import { getDb } from "@/db";
import {
  bookingAssignments,
  bookingOrders,
  bookings,
  bookingStatusEvents,
  payments,
} from "@/db/schema";

export async function expireStaleBookingOrders(now = new Date()) {
  return getDb().transaction(async (transaction) => {
    const stripeGraceCutoff = new Date(now.getTime() - 10 * 60 * 1_000);
    const expirableOrders = await transaction
      .select({ id: bookingOrders.id })
      .from(bookingOrders)
      .innerJoin(payments, eq(payments.orderId, bookingOrders.id))
      .where(
        and(
          eq(bookingOrders.status, "pending_payment"),
          or(
            and(
              eq(payments.provider, "stripe"),
              lte(bookingOrders.expiresAt, stripeGraceCutoff),
            ),
            and(
              ne(payments.provider, "stripe"),
              lte(bookingOrders.expiresAt, now),
            ),
          ),
        ),
      )
      .limit(200)
      .for("update", { skipLocked: true });
    if (expirableOrders.length === 0) return 0;

    const expirableOrderIds = expirableOrders.map((order) => order.id);
    const expiredOrders = await transaction
      .update(bookingOrders)
      .set({ status: "expired", updatedAt: now })
      .where(
        and(
          inArray(bookingOrders.id, expirableOrderIds),
          eq(bookingOrders.status, "pending_payment"),
        ),
      )
      .returning({ id: bookingOrders.id });

    if (expiredOrders.length === 0) {
      return 0;
    }

    const orderIds = expiredOrders.map((order) => order.id);
    const expiredBookings = await transaction
      .update(bookings)
      .set({
        status: "cancelled",
        cancelledAt: now,
        cancellationReason: "Tiempo de pago vencido",
        updatedAt: now,
      })
      .where(
        and(
          inArray(bookings.orderId, orderIds),
          eq(bookings.status, "pending_payment"),
        ),
      )
      .returning({ id: bookings.id });

    const bookingIds = expiredBookings.map((booking) => booking.id);
    if (bookingIds.length > 0) {
      await transaction
        .update(bookingAssignments)
        .set({ status: "cancelled", releasedAt: now, updatedAt: now })
        .where(
          and(
            inArray(bookingAssignments.bookingId, bookingIds),
            eq(bookingAssignments.status, "assigned"),
          ),
        );
      await transaction.insert(bookingStatusEvents).values(
        bookingIds.map((bookingId) => ({
          bookingId,
          fromStatus: "pending_payment",
          toStatus: "cancelled",
          reason: "Tiempo de pago vencido",
        })),
      );
    }

    await transaction
      .update(payments)
      .set({ status: "cancelled", updatedAt: now })
      .where(
        and(
          inArray(payments.orderId, orderIds),
          inArray(payments.status, ["pending", "requires_action"]),
        ),
      );

    return expiredOrders.length;
  });
}
