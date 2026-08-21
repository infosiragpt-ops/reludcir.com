import assert from "node:assert/strict";
import test from "node:test";

import { newsletterSchema } from "../src/lib/newsletter";

test("newsletter signup accepts a normal email and rejects empty or invalid input", () => {
  assert.equal(newsletterSchema.safeParse({ email: "hola@reludcir.com" }).success, true);
  assert.equal(newsletterSchema.safeParse({ email: "  hola@reludcir.com  " }).success, true);
  assert.equal(newsletterSchema.safeParse({ email: "" }).success, false);
  assert.equal(newsletterSchema.safeParse({ email: "no-es-correo" }).success, false);
});
