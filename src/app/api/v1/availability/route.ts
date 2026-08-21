import { and, eq, gt, inArray, isNull, lt, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import {
  agents,
  availabilityRules,
  bookingAssignments,
  districts,
  scheduleExceptions,
} from "@/db/schema";
import { apiError } from "@/lib/api";
import { expireStaleBookingOrders } from "@/lib/booking-expiration";
import { buildRecurrenceOccurrences } from "@/lib/recurrence";
import { consumeRateLimit, getClientIp, rateLimitError } from "@/lib/rate-limit";
import {
  agentRulesCoverSchedule,
  buildScheduleOccurrences,
  isWithinBookingWindow,
  limaDateTime,
  startHoursForDuration,
} from "@/lib/scheduling";

const hourValue = (hour: number) => `${String(hour).padStart(2, "0")}:00`;

const availabilitySchema = z.object({
  districtId: z.number().int().positive(),
  durationHours: z.union([z.literal(4), z.literal(6), z.literal(8)]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^(0[7-9]|1\d):00$/).optional(),
  recurrence: z
    .object({
      times: z
        .array(
          z.object({
            dayOfWeek: z.number().int().min(0).max(6),
            time: z.string().regex(/^(0[7-9]|1\d):00$/),
          }),
        )
        .min(1)
        .max(7),
      startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .optional(),
});

function buildStarts(data: z.infer<typeof availabilitySchema>, time: string) {
  if (!data.recurrence) {
    return [limaDateTime(data.date, time)];
  }

  return buildRecurrenceOccurrences(data.recurrence, 60).map((occurrence) =>
    limaDateTime(occurrence.date, occurrence.time),
  );
}

export async function POST(request: Request) {
  const parsed = availabilitySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("El horario no es válido.", 422, "INVALID_SCHEDULE");
  }

  try {
    const limit = await consumeRateLimit(
      "availability:check",
      getClientIp(request),
      60,
      60 * 1_000,
    );
    if (!limit.allowed) return rateLimitError(limit);

    const timesToCheck = parsed.data.time
      ? [parsed.data.time]
      : startHoursForDuration(parsed.data.durationHours).map(hourValue);

    await expireStaleBookingOrders();

    const [[district], activeAgents] = await Promise.all([
      getDb()
        .select({ id: districts.id })
        .from(districts)
        .where(
          and(
            eq(districts.id, parsed.data.districtId),
            eq(districts.isActive, true),
          ),
        )
        .limit(1),
      getDb()
        .select({ id: agents.id })
        .from(agents)
        .where(eq(agents.isActive, true)),
    ]);

    if (!district || activeAgents.length === 0) {
      return NextResponse.json({
        hours: [],
        agentIds: [],
        visits: 0,
      });
    }

    const activeAgentIds = activeAgents.map((agent) => agent.id);
    const windowStarts = timesToCheck.flatMap((time) => buildStarts(parsed.data, time));
    const validWindowStarts = windowStarts.filter((start) => isWithinBookingWindow(start));
    if (validWindowStarts.length === 0) {
      return NextResponse.json({ hours: [], agentIds: [], visits: 0 });
    }

    const windowOccurrences = buildScheduleOccurrences(
      validWindowStarts,
      parsed.data.durationHours,
    );
    const windowEnds = windowOccurrences.map((occurrence) => occurrence.end);
    const overlapConditions = validWindowStarts.map((start, index) =>
      and(
        lt(bookingAssignments.startsAt, windowEnds[index]!),
        gt(bookingAssignments.endsAt, start),
      ),
    );
    const exceptionConditions = validWindowStarts.map((start, index) =>
      and(
        lt(scheduleExceptions.startsAt, windowEnds[index]!),
        gt(scheduleExceptions.endsAt, start),
      ),
    );

    const [rules, busyAssignments, unavailableExceptions] = await Promise.all([
      getDb()
        .select({
          agentId: availabilityRules.agentId,
          districtId: availabilityRules.districtId,
          dayOfWeek: availabilityRules.dayOfWeek,
          startsAt: availabilityRules.startsAt,
          endsAt: availabilityRules.endsAt,
          validFrom: availabilityRules.validFrom,
          validUntil: availabilityRules.validUntil,
        })
        .from(availabilityRules)
        .where(
          and(
            eq(availabilityRules.isActive, true),
            inArray(availabilityRules.agentId, activeAgentIds),
            or(
              isNull(availabilityRules.districtId),
              eq(availabilityRules.districtId, district.id),
            ),
          ),
        ),
      getDb()
        .select({
          agentId: bookingAssignments.agentId,
          startsAt: bookingAssignments.startsAt,
          endsAt: bookingAssignments.endsAt,
        })
        .from(bookingAssignments)
        .where(
          and(
            inArray(bookingAssignments.agentId, activeAgentIds),
            inArray(bookingAssignments.status, ["assigned", "confirmed", "in_progress"]),
            or(...overlapConditions),
          ),
        ),
      getDb()
        .select({
          agentId: scheduleExceptions.agentId,
          startsAt: scheduleExceptions.startsAt,
          endsAt: scheduleExceptions.endsAt,
        })
        .from(scheduleExceptions)
        .where(
          and(
            eq(scheduleExceptions.kind, "unavailable"),
            inArray(scheduleExceptions.agentId, activeAgentIds),
            or(...exceptionConditions),
          ),
        ),
    ]);

    const agentIdsForStarts = (starts: Date[]) => {
      if (
        starts.length === 0 ||
        starts.length > 60 ||
        starts.some((start) => !isWithinBookingWindow(start))
      ) {
        return [];
      }
      const occurrences = buildScheduleOccurrences(starts, parsed.data.durationHours);
      return activeAgentIds.filter((agentId) => {
        const busy = busyAssignments.some(
          (row) =>
            row.agentId === agentId &&
            occurrences.some(
              (occurrence) => row.startsAt < occurrence.end && row.endsAt > occurrence.start,
            ),
        );
        const blocked = unavailableExceptions.some(
          (row) =>
            row.agentId === agentId &&
            occurrences.some(
              (occurrence) => row.startsAt < occurrence.end && row.endsAt > occurrence.start,
            ),
        );
        return (
          !busy &&
          !blocked &&
          agentRulesCoverSchedule(rules, agentId, district.id, occurrences)
        );
      });
    };

    if (!parsed.data.time) {
      const hours = startHoursForDuration(parsed.data.durationHours).filter((hour) => {
        const starts = buildStarts(parsed.data, hourValue(hour));
        return agentIdsForStarts(starts).length > 0;
      });
      return NextResponse.json({ hours, agentIds: [], visits: 0 });
    }

    const starts = buildStarts(parsed.data, parsed.data.time);
    const agentIds = agentIdsForStarts(starts);
    return NextResponse.json({
      hours: agentIds.length > 0 ? [Number(parsed.data.time.slice(0, 2))] : [],
      agentIds,
      visits: starts.length,
    });
  } catch (error) {
    console.error("Availability check failed", error);
    return apiError("No pudimos consultar la disponibilidad.", 503, "UNAVAILABLE");
  }
}
