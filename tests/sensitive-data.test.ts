import assert from "node:assert/strict";
import test from "node:test";

import {
  openSensitiveValue,
  sealSensitiveValue,
} from "../src/lib/sensitive-data";

test("encrypts sensitive queue payloads and detects tampering", () => {
  const original = "https://reludcir.com/restablecer-contrasena/?token=secret";
  const sealed = sealSensitiveValue(original);

  assert.notEqual(sealed, original);
  assert.equal(sealed.includes("secret"), false);
  assert.equal(openSensitiveValue(sealed), original);

  const tampered = `${sealed.slice(0, -1)}${sealed.endsWith("a") ? "b" : "a"}`;
  assert.throws(() => openSensitiveValue(tampered));
});
