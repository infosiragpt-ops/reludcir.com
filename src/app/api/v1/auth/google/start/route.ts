import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  GOOGLE_OAUTH_COOKIE,
  GOOGLE_OAUTH_TTL_SECONDS,
  buildGoogleAuthorizationUrl,
  createGoogleOAuthState,
  isGoogleOAuthConfigured,
  resolveSiteOrigin,
  sanitizeGoogleReturnTo,
} from "@/lib/google-oauth";
import { consumeRateLimit, getClientIp } from "@/lib/rate-limit";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const siteOrigin = resolveSiteOrigin(requestUrl);
  const loginUrl = new URL("/mi-cuenta-2", siteOrigin);
  const returnTo = sanitizeGoogleReturnTo(requestUrl.searchParams.get("returnTo"));

  try {
    const ipLimit = await consumeRateLimit(
      "auth:google-start:ip",
      getClientIp(request),
      20,
      15 * 60 * 1_000,
    );
    if (!ipLimit.allowed) {
      loginUrl.searchParams.set("error", "google_failed");
      return NextResponse.redirect(loginUrl);
    }

    if (!isGoogleOAuthConfigured()) {
      loginUrl.searchParams.set("error", "google_unavailable");
      return NextResponse.redirect(loginUrl);
    }

    const { stateToken, authorizationState, codeChallenge } = createGoogleOAuthState(returnTo);
    const cookieStore = await cookies();
    cookieStore.set(GOOGLE_OAUTH_COOKIE, stateToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: GOOGLE_OAUTH_TTL_SECONDS,
    });

    return NextResponse.redirect(
      buildGoogleAuthorizationUrl({
        siteOrigin,
        state: authorizationState,
        codeChallenge,
      }),
    );
  } catch (error) {
    console.error("Google OAuth start failed", error);
    loginUrl.searchParams.set("error", "google_failed");
    return NextResponse.redirect(loginUrl);
  }
}
