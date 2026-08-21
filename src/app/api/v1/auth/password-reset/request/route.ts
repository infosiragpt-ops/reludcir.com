import { createHash, randomBytes } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import {
  notificationOutbox,
  passwordResetTokens,
  users,
} from "@/db/schema";
import { apiError, normalizeEmail } from "@/lib/api";
import { consumeRateLimit, getClientIp, rateLimitError } from "@/lib/rate-limit";
import { sealSensitiveValue } from "@/lib/sensitive-data";

const requestSchema = z.object({
  email: z.string().trim().email().max(254),
});

const RESET_TOKEN_TTL_MS = 60 * 60 * 1_000;
const GENERIC_MESSAGE =
  "Si existe una cuenta con ese correo, recibirás un enlace válido durante una hora.";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("Ingresa un correo electrónico válido.", 422, "INVALID_INPUT");
  }

  const email = normalizeEmail(parsed.data.email);
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  try {
    const configuredOrigin = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
    if (!configuredOrigin && process.env.NODE_ENV === "production") {
      throw new Error("NEXT_PUBLIC_SITE_URL is required in production.");
    }
    const siteOrigin = configuredOrigin ?? new URL(request.url).origin;
    const resetUrl = `${siteOrigin}/restablecer-contrasena?token=${encodeURIComponent(rawToken)}`;
    const ipLimit = await consumeRateLimit(
      "auth:password-reset:ip",
      getClientIp(request),
      10,
      60 * 60 * 1_000,
    );
    if (!ipLimit.allowed) return rateLimitError(ipLimit);
    const emailLimit = await consumeRateLimit(
      "auth:password-reset:email",
      email,
      5,
      60 * 60 * 1_000,
    );
    if (!emailLimit.allowed) return rateLimitError(emailLimit);

    const queued = await getDb().transaction(async (transaction) => {
      const [user] = await transaction
        .select({ id: users.id, email: users.email })
        .from(users)
        .where(
          and(
            sql`lower(${users.email}) = ${email}`,
            eq(users.isActive, true),
          ),
        )
        .limit(1);

      if (!user) {
        return null;
      }

      const [resetToken] = await transaction
        .insert(passwordResetTokens)
        .values({ userId: user.id, tokenHash, expiresAt })
        .returning({ id: passwordResetTokens.id });

      if (!resetToken) {
        throw new Error("No se pudo crear el token de recuperación.");
      }

      await transaction.insert(notificationOutbox).values({
        userId: user.id,
        channel: "email",
        templateKey: "password_reset",
        recipient: user.email,
        deduplicationKey: `password-reset:${resetToken.id}`,
        payload: {
          encryptedResetUrl: sealSensitiveValue(resetUrl),
          expiresAt: expiresAt.toISOString(),
        },
      });

      return { queued: true };
    });

    return NextResponse.json(
      {
        message: GENERIC_MESSAGE,
        ...(process.env.NODE_ENV === "development" && queued
          ? { previewUrl: resetUrl }
          : {}),
      },
      { status: 202 },
    );
  } catch (error) {
    console.error("Password reset request failed", error);
    return apiError(
      "No pudimos procesar la solicitud en este momento.",
      500,
      "INTERNAL_ERROR",
    );
  }
}
