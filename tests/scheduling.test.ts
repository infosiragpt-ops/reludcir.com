import assert from "node:assert/strict";
import test from "node:test";

import {
  agentRulesCoverSchedule,
  buildScheduleOccurrences,
  hoursFromAvailabilityPayload,
  startHoursForDuration,
  type AvailabilityRuleSnapshot,
} from "../src/lib/scheduling";

const allWeekRule = (dayOfWeek: number): AvailabilityRuleSnapshot => ({
  agentId: 1,
  districtId: 1,
  dayOfWeek,
  startsAt: "07:00:00",
  endsAt: "19:00:00",
  validFrom: null,
  validUntil: null,
});

test("reads open hours from the availability payload and ignores invalid values", () => {
  assert.deepEqual(hoursFromAvailabilityPayload({ hours: [7, 9, 15] }), [7, 9, 15]);
  assert.deepEqual(hoursFromAvailabilityPayload({ hours: [6, 7, "09", 19, 9.5] }), [7]);
  assert.deepEqual(hoursFromAvailabilityPayload({}), []);
});

test("offers on-the-hour starts from 07:00 that still finish by 19:00", () => {
  assert.deepEqual(startHoursForDuration(4), [7, 8, 9, 10, 11, 12, 13, 14, 15]);
  assert.deepEqual(startHoursForDuration(8), [7, 8, 9, 10, 11]);
});

test("covers a visit only when it fits the agent district and working hours", () => {
  const rules = Array.from({ length: 7 }, (_, day) => allWeekRule(day));
  const valid = buildScheduleOccurrences(
    [new Date("2026-08-12T15:00:00-05:00")],
    4,
  );
  const tooLate = buildScheduleOccurrences(
    [new Date("2026-08-12T12:00:00-05:00")],
    8,
  );

  assert.equal(agentRulesCoverSchedule(rules, 1, 1, valid), true);
  assert.equal(agentRulesCoverSchedule(rules, 1, 2, valid), false);
  assert.equal(agentRulesCoverSchedule(rules, 1, 1, tooLate), false);
});

test("requires every occurrence in a recurring schedule to be covered", () => {
  const wednesdayRule = allWeekRule(3);
  const occurrences = buildScheduleOccurrences(
    [
      new Date("2026-08-12T07:00:00-05:00"),
      new Date("2026-08-13T07:00:00-05:00"),
    ],
    4,
  );

  assert.equal(
    agentRulesCoverSchedule([wednesdayRule], 1, 1, occurrences),
    false,
  );
});
