import assert from "node:assert/strict";
import test from "node:test";

import { buildRecurrenceOccurrences } from "../src/lib/recurrence";

test("builds each selected weekday inside an inclusive range", () => {
  const occurrences = buildRecurrenceOccurrences({
    startsOn: "2026-08-12",
    endsOn: "2026-09-11",
    times: [
      { dayOfWeek: 1, time: "07:00" },
      { dayOfWeek: 3, time: "09:00" },
    ],
  });

  assert.equal(occurrences.length, 9);
  assert.deepEqual(occurrences[0], {
    date: "2026-08-12",
    dayOfWeek: 3,
    time: "09:00",
  });
  assert.deepEqual(occurrences.at(-1), {
    date: "2026-09-09",
    dayOfWeek: 3,
    time: "09:00",
  });
});

test("rejects duplicate days and visit ranges beyond the safety limit", () => {
  assert.deepEqual(
    buildRecurrenceOccurrences({
      startsOn: "2026-08-12",
      endsOn: "2026-09-11",
      times: [
        { dayOfWeek: 3, time: "07:00" },
        { dayOfWeek: 3, time: "08:00" },
      ],
    }),
    [],
  );

  assert.deepEqual(
    buildRecurrenceOccurrences(
      {
        startsOn: "2026-08-12",
        endsOn: "2026-12-31",
        times: [
          { dayOfWeek: 0, time: "07:00" },
          { dayOfWeek: 1, time: "07:00" },
          { dayOfWeek: 2, time: "07:00" },
          { dayOfWeek: 3, time: "07:00" },
          { dayOfWeek: 4, time: "07:00" },
          { dayOfWeek: 5, time: "07:00" },
          { dayOfWeek: 6, time: "07:00" },
        ],
      },
      60,
    ),
    [],
  );
});
