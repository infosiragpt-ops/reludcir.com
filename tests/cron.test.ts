import assert from "node:assert/strict";
import test from "node:test";

import { authorizeCron } from "../src/lib/cron";

test("internal cron routes require a configured bearer secret", async () => {
  const previous = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;

  const missing = authorizeCron(new Request("https://reludcir.com/api/v1/internal/expire-bookings"));
  assert.equal(missing?.status, 503);
  assert.deepEqual(await missing?.json(), {
    error: { code: "NOT_CONFIGURED", message: "Tarea programada no configurada." },
  });

  process.env.CRON_SECRET = "cron-test-secret";
  const unauthorized = authorizeCron(
    new Request("https://reludcir.com/api/v1/internal/expire-bookings"),
  );
  assert.equal(unauthorized?.status, 401);

  const authorized = authorizeCron(
    new Request("https://reludcir.com/api/v1/internal/expire-bookings", {
      headers: { authorization: "Bearer cron-test-secret" },
    }),
  );
  assert.equal(authorized, null);

  if (previous === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = previous;
  }
});
