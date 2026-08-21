import { NextResponse } from "next/server";
import { lte } from "drizzle-orm";

import { getDb } from "@/db";
import {
  idempotencyKeys,
  passwordResetTokens,
  rateLimitBuckets,
  sessions,
} from "@/db/schema";
import { apiError } from "@/lib/api";
import { expireStaleBookingOrders } from "@/lib/booking-expiration";
import { authorizeCron } from "@/lib/cron";

export async function POST(request: Request) {
  const unauthorized = authorizeCron(request);
  if (unauthorized) return unauthorized;

  try {
    const now = new Date();
    const expiredOrders = await expireStaleBookingOrders(now);
    const [expiredSessions, expiredResetTokens, expiredIdempotencyKeys, expiredRateLimits] =
      await Promise.all([
        getDb()
          .delete(sessions)
          .where(lte(sessions.expiresAt, now))
          .returning({ id: sessions.id }),
        getDb()
          .delete(passwordResetTokens)
          .where(lte(passwordResetTokens.expiresAt, now))
          .returning({ id: passwordResetTokens.id }),
        getDb()
          .delete(idempotencyKeys)
          .where(lte(idempotencyKeys.expiresAt, now))
          .returning({ id: idempotencyKeys.id }),
        getDb()
          .delete(rateLimitBuckets)
          .where(lte(rateLimitBuckets.expiresAt, now))
          .returning({ id: rateLimitBuckets.id }),
      ]);
    return NextResponse.json({
      expiredOrders,
      pruned: {
        sessions: expiredSessions.length,
        passwordResetTokens: expiredResetTokens.length,
        idempotencyKeys: expiredIdempotencyKeys.length,
        rateLimitBuckets: expiredRateLimits.length,
      },
    });
  } catch (error) {
    console.error("Booking expiration failed", error);
    return apiError("No pudimos liberar las reservas vencidas.", 500, "INTERNAL_ERROR");
  }
}

export const GET = POST;
