import { createHash } from "node:crypto";

import { and, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import {
  notificationOutbox,
  passwordResetTokens,
  sessions,
  users,
} from "@/db/schema";
import { apiError } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { consumeRateLimit, getClientIp, rateLimitError } from "@/lib/rate-limit";

const confirmSchema = z.object({
  token: z.string().min(40).max(160),
  password: z.string().min(8).max(128),
});

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function POST(request: Request) {
  const parsed = confirmSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError(
      "El enlace no es válido o la contraseña tiene menos de 8 caracteres.",
      422,
      "INVALID_INPUT",
    );
  }

  const tokenHash = hashToken(parsed.data.token);
  const now = new Date();

  try {
    const ipLimit = await consumeRateLimit(
      "auth:password-reset:confirm:ip",
      getClientIp(request),
      20,
      60 * 60 * 1_000,
    );
    if (!ipLimit.allowed) return rateLimitError(ipLimit);
    const tokenLimit = await consumeRateLimit(
      "auth:password-reset:confirm:token",
      tokenHash,
      5,
      60 * 60 * 1_000,
    );
    if (!tokenLimit.allowed) return rateLimitError(tokenLimit);

    const passwordHash = await hashPassword(parsed.data.password);
    const changed = await getDb().transaction(async (transaction) => {
      const [claimed] = await transaction
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(passwordResetTokens.tokenHash, tokenHash),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, now),
          ),
        )
        .returning({ userId: passwordResetTokens.userId });

      if (!claimed) {
        return false;
      }

      const [user] = await transaction
        .update(users)
        .set({ passwordHash, updatedAt: now })
        .where(and(eq(users.id, claimed.userId), eq(users.isActive, true)))
        .returning({ id: users.id, email: users.email });

      if (!user) {
        throw new Error("La cuenta asociada ya no está activa.");
      }

      await transaction.delete(sessions).where(eq(sessions.userId, user.id));
      await transaction
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(
          and(
            eq(passwordResetTokens.userId, user.id),
            isNull(passwordResetTokens.usedAt),
          ),
        );
      await transaction.insert(notificationOutbox).values({
        userId: user.id,
        channel: "email",
        templateKey: "password_changed",
        recipient: user.email,
        deduplicationKey: `password-changed:${tokenHash}`,
        payload: { changedAt: now.toISOString() },
      });

      return true;
    });

    if (!changed) {
      return apiError(
        "El enlace ya fue usado o ha caducado. Solicita uno nuevo.",
        410,
        "RESET_TOKEN_EXPIRED",
      );
    }

    return NextResponse.json({
      message: "Tu contraseña fue actualizada. Ya puedes iniciar sesión.",
    });
  } catch (error) {
    console.error("Password reset confirmation failed", error);
    return apiError(
      "No pudimos actualizar la contraseña en este momento.",
      500,
      "INTERNAL_ERROR",
    );
  }
}
