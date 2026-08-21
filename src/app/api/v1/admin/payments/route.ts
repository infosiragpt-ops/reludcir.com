import { and, asc, eq, gte, inArray, ne, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { bookingOrders, paymentOperations, payments } from "@/db/schema";
import { apiError } from "@/lib/api";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user || !["admin", "support"].includes(user.role)) {
    return apiError("No autorizado.", 403, "FORBIDDEN");
  }

  try {
    const pendingPayments = await getDb()
      .select({
        id: payments.id,
        provider: payments.provider,
        status: payments.status,
        amount: payments.amount,
        currency: payments.currency,
        createdAt: payments.createdAt,
        orderId: bookingOrders.id,
        reference: bookingOrders.reference,
        customerName: bookingOrders.customerName,
        customerEmail: bookingOrders.customerEmail,
        customerPhoneE164: bookingOrders.customerPhoneE164,
        expiresAt: bookingOrders.expiresAt,
        orderStatus: bookingOrders.status,
      })
      .from(payments)
      .innerJoin(bookingOrders, eq(payments.orderId, bookingOrders.id))
      .where(
        and(
          inArray(payments.provider, ["yape", "bank_transfer"]),
          or(
            and(
              eq(payments.status, "pending"),
              eq(bookingOrders.status, "pending_payment"),
            ),
            and(
              eq(payments.status, "cancelled"),
              inArray(bookingOrders.status, ["expired", "cancelled"]),
              gte(payments.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000)),
            ),
          ),
        ),
      )
      .orderBy(asc(payments.createdAt))
      .limit(100);

    const refundReviews = await getDb()
      .select({
        operationId: paymentOperations.id,
        operationSource: paymentOperations.source,
        paymentId: payments.id,
        provider: payments.provider,
        operationStatus: paymentOperations.status,
        requestedAmount: paymentOperations.amount,
        paymentAmount: payments.amount,
        refundedAmount: payments.refundedAmount,
        currency: payments.currency,
        requestedAt: paymentOperations.createdAt,
        lastError: paymentOperations.lastError,
        orderId: bookingOrders.id,
        reference: bookingOrders.reference,
        customerName: bookingOrders.customerName,
        customerEmail: bookingOrders.customerEmail,
        customerPhoneE164: bookingOrders.customerPhoneE164,
      })
      .from(paymentOperations)
      .innerJoin(payments, eq(payments.id, paymentOperations.paymentId))
      .innerJoin(bookingOrders, eq(payments.orderId, bookingOrders.id))
      .where(
        or(
          and(
            eq(paymentOperations.source, "manual"),
            inArray(paymentOperations.status, ["pending", "failed"]),
          ),
          and(
            ne(paymentOperations.source, "manual"),
            eq(paymentOperations.status, "failed"),
          ),
        ),
      )
      .orderBy(asc(paymentOperations.createdAt))
      .limit(100);

    return NextResponse.json({ payments: pendingPayments, refundReviews });
  } catch (error) {
    console.error("Manual payments list failed", error);
    return apiError("No pudimos cargar los pagos.", 500, "INTERNAL_ERROR");
  }
}
