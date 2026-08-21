import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import { apiError, normalizeEmail } from "@/lib/api";
import { createSession, hashPassword, verifyPassword } from "@/lib/auth";
import { claimGuestBookings } from "@/lib/booking-claims";
import { consumeRateLimit, getClientIp, rateLimitError } from "@/lib/rate-limit";

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
  remember: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("Correo o contraseña incorrectos.", 401, "INVALID_CREDENTIALS");
  }

  const email = normalizeEmail(parsed.data.email);

  try {
    const clientIp = getClientIp(request);
    const ipLimit = await consumeRateLimit(
      "auth:login:ip",
      clientIp,
      30,
      15 * 60 * 1_000,
    );
    if (!ipLimit.allowed) return rateLimitError(ipLimit);
    const accountLimit = await consumeRateLimit(
      "auth:login:account",
      email,
      10,
      15 * 60 * 1_000,
    );
    if (!accountLimit.allowed) return rateLimitError(accountLimit);
    const pairLimit = await consumeRateLimit(
      "auth:login:pair",
      `${clientIp}:${email}`,
      8,
      15 * 60 * 1_000,
    );
    if (!pairLimit.allowed) return rateLimitError(pairLimit);

    const [user] = await getDb()
      .select({
        id: users.id,
        email: users.email,
        passwordHash: users.passwordHash,
        isActive: users.isActive,
      })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`)
      .limit(1);

    const passwordMatches = user
      ? await verifyPassword(parsed.data.password, user.passwordHash)
      : Boolean(await hashPassword(parsed.data.password)) && false;

    if (!user || !user.isActive || !passwordMatches) {
      return apiError("Correo o contraseña incorrectos.", 401, "INVALID_CREDENTIALS");
    }

    let claimedBookings = 0;
    try {
      claimedBookings = await claimGuestBookings(user.id, email);
    } catch (claimError) {
      console.error("Guest booking claim failed after login", claimError);
    }
    const session = await createSession(user.id, parsed.data.remember);
    return NextResponse.json({
      user: { id: user.id, email: user.email },
      session: { expiresAt: session.expiresAt.toISOString() },
      claimedBookings,
    });
  } catch (error) {
    console.error("Login failed", error);
    return apiError("No pudimos iniciar sesión en este momento.", 500, "INTERNAL_ERROR");
  }
}
