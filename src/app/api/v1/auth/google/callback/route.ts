import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { customerProfiles, users } from "@/db/schema";
import { normalizeEmail } from "@/lib/api";
import { createSession } from "@/lib/auth";
import { claimGuestBookings } from "@/lib/booking-claims";
import {
  GOOGLE_OAUTH_COOKIE,
  exchangeGoogleAuthorizationCode,
  googleAccountNames,
  googlePostLoginPath,
  resolveSiteOrigin,
  verifyGoogleOAuthState,
} from "@/lib/google-oauth";
import { consumeRateLimit, getClientIp } from "@/lib/rate-limit";

async function clearOAuthCookie() {
  const store = await cookies();
  store.set(GOOGLE_OAUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const siteOrigin = resolveSiteOrigin(requestUrl);
  const loginUrl = new URL("/mi-cuenta-2", siteOrigin);

  try {
    const ipLimit = await consumeRateLimit(
      "auth:google-callback:ip",
      getClientIp(request),
      30,
      15 * 60 * 1_000,
    );
    if (!ipLimit.allowed) {
      loginUrl.searchParams.set("error", "google_failed");
      await clearOAuthCookie();
      return NextResponse.redirect(loginUrl);
    }

    if (requestUrl.searchParams.get("error")) {
      loginUrl.searchParams.set(
        "error",
        requestUrl.searchParams.get("error") === "access_denied"
          ? "google_denied"
          : "google_failed",
      );
      await clearOAuthCookie();
      return NextResponse.redirect(loginUrl);
    }

    const code = requestUrl.searchParams.get("code");
    const returnedState = requestUrl.searchParams.get("state");
    const cookieStore = await cookies();
    const stored = verifyGoogleOAuthState(cookieStore.get(GOOGLE_OAUTH_COOKIE)?.value ?? "");
    await clearOAuthCookie();

    if (!code || !returnedState || !stored || stored.nonce !== returnedState) {
      loginUrl.searchParams.set("error", "google_failed");
      return NextResponse.redirect(loginUrl);
    }

    const profile = await exchangeGoogleAuthorizationCode({
      code,
      codeVerifier: stored.codeVerifier,
      siteOrigin,
    });
    const email = normalizeEmail(profile.email);
    const names = googleAccountNames(profile);

    const user = await getDb().transaction(async (transaction) => {
      const [existing] = await transaction
        .select({
          id: users.id,
          email: users.email,
          role: users.role,
          isActive: users.isActive,
        })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)
        .limit(1);

      if (existing && !existing.isActive) {
        return null;
      }

      if (existing) {
        await transaction
          .update(users)
          .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
          .where(eq(users.id, existing.id));
        await transaction
          .insert(customerProfiles)
          .values({
            userId: existing.id,
            firstName: names.firstName,
            lastName: names.lastName,
          })
          .onConflictDoNothing({ target: customerProfiles.userId });
        return existing;
      }

      const [created] = await transaction
        .insert(users)
        .values({
          email,
          passwordHash: null,
          role: "customer",
          emailVerifiedAt: new Date(),
        })
        .returning({
          id: users.id,
          email: users.email,
          role: users.role,
          isActive: users.isActive,
        });
      if (!created) {
        throw new Error("No se pudo crear el usuario de Google.");
      }
      await transaction.insert(customerProfiles).values({
        userId: created.id,
        firstName: names.firstName,
        lastName: names.lastName,
      });
      return created;
    });

    if (!user) {
      loginUrl.searchParams.set("error", "google_inactive");
      return NextResponse.redirect(loginUrl);
    }

    try {
      await claimGuestBookings(user.id, email);
    } catch (claimError) {
      console.error("Guest booking claim failed after Google login", claimError);
    }

    await createSession(user.id, true);
    return NextResponse.redirect(new URL(googlePostLoginPath(user.role, stored.returnTo), siteOrigin));
  } catch (error) {
    console.error("Google OAuth callback failed", error);
    loginUrl.searchParams.set("error", "google_failed");
    return NextResponse.redirect(loginUrl);
  }
}
