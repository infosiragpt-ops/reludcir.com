import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { bookingOrders, payments } from "@/db/schema";
import { apiError } from "@/lib/api";
import { consumeRateLimit, getClientIp, rateLimitError } from "@/lib/rate-limit";

const sessionSchema = z
  .string()
  .min(20)
  .max(255)
  .regex(/^cs_(?:test_|live_)?[A-Za-z0-9_]+$/);

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("session_id");
  const parsed = sessionSchema.safeParse(sessionId);
  if (!parsed.success) {
    return apiError("La referencia de pago no es válida.", 422, "INVALID_SESSION");
  }

  try {
    const limit = await consumeRateLimit(
      "payment:status",
      getClientIp(request),
      30,
      60 * 1_000,
    );
    if (!limit.allowed) return rateLimitError(limit);

    const [result] = await getDb()
      .select({
        reference: bookingOrders.reference,
        orderStatus: bookingOrders.status,
        paymentStatus: payments.status,
        amount: payments.amount,
        currency: payments.currency,
        expiresAt: bookingOrders.expiresAt,
        confirmedAt: bookingOrders.confirmedAt,
      })
      .from(payments)
      .innerJoin(bookingOrders, eq(payments.orderId, bookingOrders.id))
      .where(
        and(
          eq(payments.provider, "stripe"),
          eq(payments.providerPaymentId, parsed.data),
        ),
      )
      .limit(1);

    if (!result) {
      return apiError("Pago no encontrado.", 404, "NOT_FOUND");
    }

    return NextResponse.json({
      ...result,
      expiresAt: result.expiresAt?.toISOString() ?? null,
      confirmedAt: result.confirmedAt?.toISOString() ?? null,
    });
  } catch (error) {
    console.error("Payment status lookup failed", error);
    return apiError("No pudimos verificar el pago.", 503, "UNAVAILABLE");
  }
}
