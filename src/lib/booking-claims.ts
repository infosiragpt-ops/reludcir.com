import { createHmac, timingSafeEqual } from "node:crypto";

import { and, eq, isNull, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

import { getDb } from "@/db";
import { bookingOrders, bookings } from "@/db/schema";

const CLAIM_COOKIE = "reludcir_booking_claims";
const CLAIM_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAX_CLAIMS = 5;

type ClaimPayload = {
  bookingPublicId: string;
  orderReference: string;
  expiresAt: number;
};

function signingSecret() {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") {
    return "reludcir-development-booking-claim-secret";
  }
  throw new Error("AUTH_SECRET is required in production.");
}

function sign(encodedPayload: string) {
  return createHmac("sha256", signingSecret())
    .update(encodedPayload)
    .digest("base64url");
}

export function createClaimToken(
  bookingPublicId: string,
  orderReference: string,
  nowSeconds = Math.floor(Date.now() / 1_000),
) {
  const payload: ClaimPayload = {
    bookingPublicId,
    orderReference,
    expiresAt: nowSeconds + CLAIM_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

export function verifyClaimToken(token: string): ClaimPayload | null {
  const [encoded, receivedSignature] = token.split(".");
  if (!encoded || !receivedSignature) return null;
  const expectedSignature = sign(encoded);
  const expected = Buffer.from(expectedSignature);
  const received = Buffer.from(receivedSignature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as ClaimPayload;
    if (
      typeof payload.bookingPublicId !== "string" ||
      typeof payload.orderReference !== "string" ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= Math.floor(Date.now() / 1_000)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function attachGuestBookingClaim(
  response: NextResponse,
  bookingPublicId: string,
  orderReference: string,
) {
  const cookieStore = await cookies();
  const existing = (cookieStore.get(CLAIM_COOKIE)?.value ?? "")
    .split("~")
    .filter((token) => {
      const claim = verifyClaimToken(token);
      return claim && claim.bookingPublicId !== bookingPublicId;
    });
  const nextToken = createClaimToken(bookingPublicId, orderReference);
  const claims = [...existing, nextToken].slice(-MAX_CLAIMS);

  response.cookies.set(CLAIM_COOKIE, claims.join("~"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CLAIM_TTL_SECONDS,
  });
}

export async function getVerifiedBookingClaims(): Promise<ClaimPayload[]> {
  return ((await cookies()).get(CLAIM_COOKIE)?.value ?? "")
    .split("~")
    .slice(-MAX_CLAIMS)
    .map(verifyClaimToken)
    .filter((claim): claim is ClaimPayload => claim !== null);
}

export async function claimGuestBookings(userId: number, email: string) {
  const claims = await getVerifiedBookingClaims();
  if (claims.length === 0) return 0;

  return getDb().transaction(async (transaction) => {
    let claimedCount = 0;
    for (const claim of claims) {
      const [order] = await transaction
        .select({ id: bookingOrders.id })
        .from(bookings)
        .innerJoin(bookingOrders, eq(bookings.orderId, bookingOrders.id))
        .where(
          and(
            eq(bookings.publicId, claim.bookingPublicId),
            eq(bookingOrders.reference, claim.orderReference),
            sql`lower(${bookingOrders.customerEmail}) = ${email}`,
            isNull(bookingOrders.userId),
          ),
        )
        .limit(1)
        .for("update");
      if (!order) continue;

      const [claimedOrder] = await transaction
        .update(bookingOrders)
        .set({ userId, updatedAt: new Date() })
        .where(
          and(
            eq(bookingOrders.id, order.id),
            isNull(bookingOrders.userId),
          ),
        )
        .returning({ id: bookingOrders.id });
      if (!claimedOrder) continue;

      await transaction
        .update(bookings)
        .set({ userId, updatedAt: new Date() })
        .where(
          and(
            eq(bookings.orderId, order.id),
            isNull(bookings.userId),
          ),
        );
      claimedCount += 1;
    }
    return claimedCount;
  });
}
