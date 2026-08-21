import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { customerProfiles, users } from "@/db/schema";
import { apiError, normalizeEmail, normalizePeruvianPhone, postgresErrorCode } from "@/lib/api";
import { createSession, hashPassword } from "@/lib/auth";
import { claimGuestBookings } from "@/lib/booking-claims";
import { consumeRateLimit, getClientIp, rateLimitError } from "@/lib/rate-limit";

const registerSchema = z.object({
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(100),
  phoneE164: z.string().trim().max(24).optional(),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
});

export async function POST(request: Request) {
  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(
      "Revisa tus datos. La contraseña debe tener al menos 8 caracteres.",
      422,
      "INVALID_INPUT",
    );
  }

  const email = normalizeEmail(parsed.data.email);

  try {
    const clientIp = getClientIp(request);
    const ipLimit = await consumeRateLimit(
      "auth:register:ip",
      clientIp,
      8,
      60 * 60 * 1_000,
    );
    if (!ipLimit.allowed) return rateLimitError(ipLimit);
    const emailLimit = await consumeRateLimit(
      "auth:register:email",
      email,
      3,
      60 * 60 * 1_000,
    );
    if (!emailLimit.allowed) return rateLimitError(emailLimit);
    const pairLimit = await consumeRateLimit(
      "auth:register:pair",
      `${clientIp}:${email}`,
      3,
      60 * 60 * 1_000,
    );
    if (!pairLimit.allowed) return rateLimitError(pairLimit);

    const passwordHash = await hashPassword(parsed.data.password);
    const userId = await getDb().transaction(async (transaction) => {
      const [user] = await transaction
        .insert(users)
        .values({ email, passwordHash })
        .returning({ id: users.id });

      if (!user) {
        throw new Error("No se pudo crear el usuario.");
      }

      await transaction.insert(customerProfiles).values({
        userId: user.id,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        phoneE164: parsed.data.phoneE164
          ? normalizePeruvianPhone(parsed.data.phoneE164)
          : null,
      });

      return user.id;
    });

    let claimedBookings = 0;
    try {
      claimedBookings = await claimGuestBookings(userId, email);
    } catch (claimError) {
      console.error("Guest booking claim failed after registration", claimError);
    }
    const session = await createSession(userId, false);
    return NextResponse.json(
      {
        user: { id: userId, email },
        session: { expiresAt: session.expiresAt.toISOString() },
        claimedBookings,
      },
      { status: 201 },
    );
  } catch (error) {
    if (postgresErrorCode(error) === "23505") {
      return apiError(
        "Ya existe una cuenta con ese correo electrónico.",
        409,
        "EMAIL_EXISTS",
      );
    }

    console.error("Registration failed", error);
    return apiError("No pudimos crear la cuenta en este momento.", 500, "INTERNAL_ERROR");
  }
}
