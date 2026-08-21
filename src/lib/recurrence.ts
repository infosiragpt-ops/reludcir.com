export type RecurrenceTime = {
  dayOfWeek: number;
  time: string;
};

export type RecurrencePattern = {
  startsOn: string;
  endsOn: string;
  times: RecurrenceTime[];
};

export type RecurrenceOccurrence = {
  date: string;
  dayOfWeek: number;
  time: string;
};

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const hourPattern = /^(0[7-9]|1\d):00$/;
const maximumRecurrenceSpanMs = 180 * 24 * 60 * 60 * 1_000;

export function buildRecurrenceOccurrences(
  pattern: RecurrencePattern,
  maximumVisits = 60,
): RecurrenceOccurrence[] {
  if (
    !isoDatePattern.test(pattern.startsOn) ||
    !isoDatePattern.test(pattern.endsOn) ||
    pattern.endsOn < pattern.startsOn ||
    pattern.times.length < 1 ||
    pattern.times.length > 7 ||
    !Number.isSafeInteger(maximumVisits) ||
    maximumVisits < 1
  ) {
    return [];
  }

  const timeByDay = new Map<number, string>();
  for (const item of pattern.times) {
    if (
      !Number.isInteger(item.dayOfWeek) ||
      item.dayOfWeek < 0 ||
      item.dayOfWeek > 6 ||
      !hourPattern.test(item.time) ||
      timeByDay.has(item.dayOfWeek)
    ) {
      return [];
    }
    timeByDay.set(item.dayOfWeek, item.time);
  }

  const cursor = new Date(`${pattern.startsOn}T12:00:00Z`);
  const end = new Date(`${pattern.endsOn}T12:00:00Z`);
  if (
    Number.isNaN(cursor.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end.getTime() - cursor.getTime() > maximumRecurrenceSpanMs
  ) {
    return [];
  }

  const occurrences: RecurrenceOccurrence[] = [];
  while (cursor <= end) {
    const dayOfWeek = cursor.getUTCDay();
    const time = timeByDay.get(dayOfWeek);
    if (time) {
      occurrences.push({
        date: cursor.toISOString().slice(0, 10),
        dayOfWeek,
        time,
      });
      if (occurrences.length > maximumVisits) return [];
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return occurrences;
}
