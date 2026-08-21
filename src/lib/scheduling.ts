export type ScheduleOccurrence = {
  start: Date;
  end: Date;
  localDate: string;
  dayOfWeek: number;
  startsAtMinute: number;
  endsAtMinute: number;
};

export type AvailabilityRuleSnapshot = {
  agentId: number;
  districtId: number | null;
  dayOfWeek: number;
  startsAt: string;
  endsAt: string;
  validFrom: Date | null;
  validUntil: Date | null;
};

function limaDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  const localDate = `${part("year")}-${part("month")}-${part("day")}`;

  return {
    localDate,
    minuteOfDay: Number(part("hour")) * 60 + Number(part("minute")),
    dayOfWeek: new Date(`${localDate}T12:00:00Z`).getUTCDay(),
  };
}

function dateOnly(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function timeToMinute(value: string) {
  const [hour = "0", minute = "0"] = value.split(":");
  return Number(hour) * 60 + Number(minute);
}

export const BOOKING_LEAD_TIME_MS = 10 * 60 * 60 * 1_000;
export const SERVICE_DAY_START_HOUR = 7;
export const SERVICE_DAY_END_HOUR = 19;

export function startHoursForDuration(durationHours: number) {
  const lastStart = SERVICE_DAY_END_HOUR - durationHours;
  if (lastStart < SERVICE_DAY_START_HOUR) return [];
  return Array.from(
    { length: lastStart - SERVICE_DAY_START_HOUR + 1 },
    (_, index) => SERVICE_DAY_START_HOUR + index,
  );
}

export function hoursFromAvailabilityPayload(payload: { hours?: unknown }) {
  if (!Array.isArray(payload.hours)) return [];
  return payload.hours.filter(
    (hour): hour is number =>
      Number.isInteger(hour) &&
      hour >= SERVICE_DAY_START_HOUR &&
      hour < SERVICE_DAY_END_HOUR,
  );
}

export function limaDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00-05:00`);
}

export function isWithinBookingWindow(start: Date, now = new Date()) {
  return (
    start.getTime() >= now.getTime() + BOOKING_LEAD_TIME_MS &&
    start.getTime() <= now.getTime() + 180 * 24 * 60 * 60 * 1_000
  );
}

export function buildScheduleOccurrences(
  starts: Date[],
  durationHours: number,
): ScheduleOccurrence[] {
  return starts.map((start) => {
    const local = limaDateParts(start);
    return {
      start,
      end: new Date(start.getTime() + durationHours * 60 * 60 * 1_000),
      localDate: local.localDate,
      dayOfWeek: local.dayOfWeek,
      startsAtMinute: local.minuteOfDay,
      endsAtMinute: local.minuteOfDay + durationHours * 60,
    };
  });
}

export function agentRulesCoverSchedule(
  rules: AvailabilityRuleSnapshot[],
  agentId: number,
  districtId: number,
  occurrences: ScheduleOccurrence[],
) {
  const agentRules = rules.filter(
    (rule) =>
      rule.agentId === agentId &&
      (rule.districtId === null || rule.districtId === districtId),
  );

  return occurrences.every((occurrence) =>
    agentRules.some((rule) => {
      const validFrom = dateOnly(rule.validFrom);
      const validUntil = dateOnly(rule.validUntil);
      return (
        rule.dayOfWeek === occurrence.dayOfWeek &&
        (!validFrom || validFrom <= occurrence.localDate) &&
        (!validUntil || validUntil >= occurrence.localDate) &&
        timeToMinute(rule.startsAt) <= occurrence.startsAtMinute &&
        timeToMinute(rule.endsAt) >= occurrence.endsAtMinute
      );
    }),
  );
}
