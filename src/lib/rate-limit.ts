import { createHmac } from "node:crypto";

import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { rateLimitBuckets } from "@/db/schema";

type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

function rateLimitSecret() {
  const secret = process.env.RATE_LIMIT_SECRET ?? process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") {
    return "reludcir-development-rate-limit-secret";
  }
  throw new Error("RATE_LIMIT_SECRET or AUTH_SECRET is required in production.");
}

function hashSubject(scope: string, subject: string) {
  return createHmac("sha256", rateLimitSecret())
    .update(`${scope}\0${subject}`)
    .digest("hex");
}

export function getClientIp(request: Request) {
  const configuredHeader = process.env.RATE_LIMIT_IP_HEADER?.toLowerCase();
  const allowedConfiguredHeaders = new Set([
    "x-forwarded-for",
    "x-real-ip",
    "cf-connecting-ip",
  ]);
  const trustedHeader = process.env.VERCEL
    ? "x-vercel-forwarded-for"
    : configuredHeader && allowedConfiguredHeaders.has(configuredHeader)
      ? configuredHeader
      : null;
  const rawValue = trustedHeader ? request.headers.get(trustedHeader) : null;
  return (rawValue?.split(",")[0]?.trim() || "untrusted-client").slice(0, 100);
}

export async function consumeRateLimit(
  scope: string,
  subject: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs);
  const expiresAt = new Date(windowStartMs + windowMs * 2);
  const subjectHash = hashSubject(scope, subject);

  const [bucket] = await getDb()
    .insert(rateLimitBuckets)
    .values({ scope, subjectHash, windowStart, expiresAt })
    .onConflictDoUpdate({
      target: [
        rateLimitBuckets.scope,
        rateLimitBuckets.subjectHash,
        rateLimitBuckets.windowStart,
      ],
      set: {
        requestCount: sql`${rateLimitBuckets.requestCount} + 1`,
        updatedAt: new Date(),
      },
    })
    .returning({ requestCount: rateLimitBuckets.requestCount });

  const requestCount = bucket?.requestCount ?? limit + 1;
  return {
    allowed: requestCount <= limit,
    limit,
    remaining: Math.max(0, limit - requestCount),
    retryAfterSeconds: Math.max(1, Math.ceil((windowStartMs + windowMs - now) / 1_000)),
  };
}

export function rateLimitError(
  result: RateLimitResult,
  message = "Demasiadas solicitudes. Inténtalo nuevamente más tarde.",
) {
  return NextResponse.json(
    { error: { code: "RATE_LIMITED", message } },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
      },
    },
  );
}
