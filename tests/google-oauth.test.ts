import assert from "node:assert/strict";
import test from "node:test";

import {
  createGoogleOAuthState,
  googleAccountNames,
  googlePostLoginPath,
  googleRedirectUri,
  resolveSiteOrigin,
  sanitizeGoogleReturnTo,
  verifyGoogleOAuthState,
} from "../src/lib/google-oauth";

test("google returnTo only allows the admin hub or home", () => {
  assert.equal(sanitizeGoogleReturnTo("/admin"), "/admin");
  assert.equal(sanitizeGoogleReturnTo("/"), "/");
  assert.equal(sanitizeGoogleReturnTo("https://evil.example/admin"), "/");
  assert.equal(sanitizeGoogleReturnTo("/mis-reservas"), "/");
  assert.equal(sanitizeGoogleReturnTo(null), "/");
});

test("site origin prefers NEXT_PUBLIC_SITE_URL over the request URL origin", () => {
  const previous = process.env.NEXT_PUBLIC_SITE_URL;
  process.env.NEXT_PUBLIC_SITE_URL = "https://reludcir.com/";
  try {
    const requestUrl = new URL("http://localhost:3000/api/v1/auth/google/start");
    assert.equal(resolveSiteOrigin(requestUrl), "https://reludcir.com");
    assert.equal(
      googleRedirectUri(resolveSiteOrigin(requestUrl)),
      "https://reludcir.com/api/v1/auth/google/callback",
    );
  } finally {
    if (previous === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = previous;
    }
  }
});

test("google oauth state is signed and rejects a colliding return path", () => {
  const created = createGoogleOAuthState("/admin");
  const verified = verifyGoogleOAuthState(created.stateToken);
  assert.ok(verified);
  assert.equal(verified.returnTo, "/admin");
  assert.equal(verified.nonce, created.authorizationState);
  assert.equal(verifyGoogleOAuthState("tampered.token"), null);
});

test("google post-login path keeps staff in /admin and customers in reservations", () => {
  assert.equal(googlePostLoginPath("admin", "/admin"), "/admin");
  assert.equal(googlePostLoginPath("support", "/"), "/admin");
  assert.equal(googlePostLoginPath("customer", "/admin"), "/mis-reservas");
});

test("google profile names fall back without inventing staff roles", () => {
  assert.deepEqual(
    googleAccountNames({
      givenName: "Operaciones",
      familyName: "Reludcir",
      fullName: "Operaciones Reludcir",
    }),
    { firstName: "Operaciones", lastName: "Reludcir" },
  );
  assert.deepEqual(
    googleAccountNames({ givenName: null, familyName: null, fullName: "Alex" }),
    { firstName: "Alex", lastName: "Google" },
  );
});
