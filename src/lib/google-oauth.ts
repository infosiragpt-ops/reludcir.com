import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { isPrivilegedStaff } from "@/lib/staff";

export const GOOGLE_OAUTH_COOKIE = "reludcir_google_oauth";
export const GOOGLE_OAUTH_TTL_SECONDS = 10 * 60;

export type GoogleReturnTo = "/" | "/admin";

export type GoogleOAuthState = {
  nonce: string;
  returnTo: GoogleReturnTo;
  codeVerifier: string;
  expiresAt: number;
};

export type GoogleProfile = {
  sub: string;
  email: string;
  emailVerified: boolean;
  givenName: string | null;
  familyName: string | null;
  fullName: string | null;
};

function signingSecret() {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") {
    return "reludcir-development-google-oauth-secret";
  }
  throw new Error("AUTH_SECRET is required in production.");
}

function sign(encodedPayload: string) {
  return createHmac("sha256", signingSecret())
    .update(encodedPayload)
    .digest("base64url");
}

export function sanitizeGoogleReturnTo(value: string | null | undefined): GoogleReturnTo {
  return value === "/admin" ? "/admin" : "/";
}

export function resolveSiteOrigin(requestUrl: URL) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (configured) {
    return configured;
  }
  return requestUrl.origin;
}

export function googleRedirectUri(siteOrigin: string) {
  return `${siteOrigin.replace(/\/$/, "")}/api/v1/auth/google/callback`;
}

export function isGoogleOAuthConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}

export function googlePostLoginPath(role: string, returnTo: GoogleReturnTo) {
  if (isPrivilegedStaff(role)) {
    return returnTo === "/" ? "/admin" : returnTo;
  }
  return "/mis-reservas";
}

export function createGoogleOAuthState(returnTo: GoogleReturnTo): {
  stateToken: string;
  authorizationState: string;
  codeChallenge: string;
} {
  const nonce = randomBytes(24).toString("base64url");
  const codeVerifier = randomBytes(32).toString("base64url");
  const payload: GoogleOAuthState = {
    nonce,
    returnTo,
    codeVerifier,
    expiresAt: Math.floor(Date.now() / 1_000) + GOOGLE_OAUTH_TTL_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return {
    stateToken: `${encoded}.${sign(encoded)}`,
    authorizationState: nonce,
    codeChallenge: createHash("sha256").update(codeVerifier).digest("base64url"),
  };
}

export function verifyGoogleOAuthState(token: string): GoogleOAuthState | null {
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
    ) as GoogleOAuthState;
    if (
      typeof payload.nonce !== "string" ||
      typeof payload.codeVerifier !== "string" ||
      typeof payload.expiresAt !== "number" ||
      (payload.returnTo !== "/" && payload.returnTo !== "/admin") ||
      payload.expiresAt <= Math.floor(Date.now() / 1_000)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function buildGoogleAuthorizationUrl(input: {
  siteOrigin: string;
  state: string;
  codeChallenge: string;
}) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID is not configured.");
  }

  const authorizeUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", googleRedirectUri(input.siteOrigin));
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "openid email profile");
  authorizeUrl.searchParams.set("state", input.state);
  authorizeUrl.searchParams.set("code_challenge", input.codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");
  authorizeUrl.searchParams.set("prompt", "select_account");
  return authorizeUrl;
}

export function googleAccountNames(profile: Pick<GoogleProfile, "givenName" | "familyName" | "fullName">) {
  const fullParts = profile.fullName?.trim().split(/\s+/).filter(Boolean) ?? [];
  const firstName = (profile.givenName?.trim() || fullParts[0] || "Cliente").slice(0, 80);
  const lastName = (
    profile.familyName?.trim() ||
    fullParts.slice(1).join(" ") ||
    "Google"
  ).slice(0, 100);
  return { firstName, lastName };
}

export async function exchangeGoogleAuthorizationCode(input: {
  code: string;
  codeVerifier: string;
  siteOrigin: string;
}): Promise<GoogleProfile> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured.");
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: input.code,
      code_verifier: input.codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: googleRedirectUri(input.siteOrigin),
    }),
  });
  const tokenPayload = (await tokenResponse.json().catch(() => null)) as {
    access_token?: string;
    error?: string;
  } | null;
  if (!tokenResponse.ok || !tokenPayload?.access_token) {
    throw new Error(tokenPayload?.error || "Google token exchange failed.");
  }

  const profileResponse = await fetch("https://openidconnect.googleapis.com/userinfo", {
    headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
  });
  const profilePayload = (await profileResponse.json().catch(() => null)) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    given_name?: string;
    family_name?: string;
    name?: string;
  } | null;
  if (
    !profileResponse.ok ||
    !profilePayload?.sub ||
    !profilePayload.email ||
    profilePayload.email_verified !== true
  ) {
    throw new Error("Google did not return a verified email.");
  }

  return {
    sub: profilePayload.sub,
    email: profilePayload.email,
    emailVerified: true,
    givenName: profilePayload.given_name ?? null,
    familyName: profilePayload.family_name ?? null,
    fullName: profilePayload.name ?? null,
  };
}
