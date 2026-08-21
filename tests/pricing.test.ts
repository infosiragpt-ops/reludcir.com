import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateBookingPrice,
  decimalToMinorUnits,
  getPackageAmountMinor,
  minorUnitsToDecimal,
} from "../src/lib/pricing";

test("uses the published one-time prices for 4, 6, and 8 hours", () => {
  assert.equal(getPackageAmountMinor(4, "one_time"), 6_700);
  assert.equal(getPackageAmountMinor(6, "one_time"), 9_900);
  assert.equal(getPackageAmountMinor(8, "one_time"), 12_700);
});

test("recurring service starts at S/ 61 for four hours", () => {
  const quote = calculateBookingPrice({
    hours: 4,
    mode: "recurring",
    visits: 4,
  });

  assert.equal(quote.unitAmount, "61.00");
  assert.equal(quote.totalAmount, "244.00");
  assert.equal(quote.currency, "PEN");
  assert.equal(quote.visits, 4);
});

test("adds coordinated extra hours to every visit using integer minor units", () => {
  const quote = calculateBookingPrice({
    hours: 6,
    mode: "recurring",
    visits: 3,
    extraHoursPerVisit: 1,
  });

  assert.equal(quote.durationMinutes, 420);
  assert.equal(quote.extrasAmountMinor, 1_500);
  assert.equal(quote.unitAmount, "106.00");
  assert.equal(quote.totalAmount, "318.00");
});

test("rejects invalid visit counts", () => {
  assert.throws(
    () =>
      calculateBookingPrice({
        hours: 4,
        mode: "one_time",
        visits: 2,
      }),
    /exactly one visit/,
  );

  assert.throws(
    () =>
      calculateBookingPrice({
        hours: 4,
        mode: "recurring",
        visits: 1,
      }),
    /at least two visits/,
  );
});

test("formats minor units without floating-point arithmetic", () => {
  assert.equal(minorUnitsToDecimal(0), "0.00");
  assert.equal(minorUnitsToDecimal(61), "0.61");
  assert.equal(minorUnitsToDecimal(12_700), "127.00");
  assert.throws(() => minorUnitsToDecimal(10.5), /safe integer/);
});

test("parses persisted decimal amounts back to integer minor units", () => {
  assert.equal(decimalToMinorUnits("61.00"), 6_100);
  assert.equal(decimalToMinorUnits("127.5"), 12_750);
  assert.throws(() => decimalToMinorUnits("12.345"), RangeError);
});
