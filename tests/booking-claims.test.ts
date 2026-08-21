import assert from "node:assert/strict";
import test from "node:test";

import { createClaimToken, verifyClaimToken } from "../src/lib/booking-claims";

test("signs guest claim cookies and rejects email-only or tampered tokens", () => {
  const nowSeconds = Math.floor(Date.now() / 1_000);
  const token = createClaimToken(
    "11111111-1111-1111-1111-111111111111",
    "RLD-ABC1234567",
    nowSeconds,
  );

  const verified = verifyClaimToken(token);
  assert.deepEqual(verified, {
    bookingPublicId: "11111111-1111-1111-1111-111111111111",
    orderReference: "RLD-ABC1234567",
    expiresAt: nowSeconds + 30 * 24 * 60 * 60,
  });

  assert.equal(verifyClaimToken("not-a-token"), null);
  assert.equal(verifyClaimToken(`${token.slice(0, -2)}aa`), null);

  const [encoded] = token.split(".");
  assert.equal(verifyClaimToken(`${encoded}.forged-signature`), null);
});

test("expired claim tokens cannot be reused", () => {
  const token = createClaimToken("booking-public-id", "RLD-EXPIRED1", 10);
  assert.equal(verifyClaimToken(token), null);
});
