import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { apiError, normalizeEmail } from "@/lib/api";
import { consumeRateLimit, getClientIp, rateLimitError } from "@/lib/rate-limit";

const newsletterSchema = z.object({
  email: z.string().trim().email().max(254),
});

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const acceptsJson = contentType.includes("application/json");
  const input = acceptsJson
    ? await request.json().catch(() => null)
    : Object.fromEntries(await request.formData().catch(() => new FormData()));
  const parsed = newsletterSchema.safeParse(input);

  if (!parsed.success) {
    return apiError("Ingresa un correo electrónico válido.", 422, "INVALID_EMAIL");
  }

  const email = normalizeEmail(parsed.data.email);

  try {
    const ipLimit = await consumeRateLimit(
      "newsletter:ip",
      getClientIp(request),
      25,
      60 * 60 * 1_000,
    );
    if (!ipLimit.allowed) return rateLimitError(ipLimit);
    const emailLimit = await consumeRateLimit(
      "newsletter:email",
      email,
      3,
      24 * 60 * 60 * 1_000,
    );
    if (!emailLimit.allowed) return rateLimitError(emailLimit);

    await getDb().execute(sql`
      insert into newsletter_subscriptions (email, status, consent_source)
      values (${email}, 'subscribed', 'website')
      on conflict (lower(email)) do update
      set status = 'subscribed', unsubscribed_at = null, updated_at = now()
    `);

    if (!acceptsJson) {
      return NextResponse.redirect(new URL("/#newsletter-suscrito", request.url), 303);
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("Newsletter subscription failed", error);
    return apiError("No pudimos completar la suscripción.", 500, "INTERNAL_ERROR");
  }
}
