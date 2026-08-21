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
import { agentRulesCoverSchedule, buildScheduleOccurrences } from "@/lib/scheduling";

const availabilitySchema = z.object({
  districtId: z.number().int().min(1).max(9),
  durationHours: z.union([z.literal(4), z.literal(6), z.literal(8)]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^(0[7-9]|1\d):00$/),
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

function buildStarts(data: z.infer<typeof availabilitySchema>) {
  if (!data.recurrence) {
    return [new Date(`${data.date}T${data.time}:00-05:00`)];
  }

  return buildRecurrenceOccurrences(data.recurrence, 60).map(
    (occurrence) => new Date(`${occurrence.date}T${occurrence.time}:00-05:00`),
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

    const starts = buildStarts(parsed.data);
    if (
      starts.length === 0 ||
      starts.length > 60 ||
      starts.some(
        (start) =>
          Number.isNaN(start.getTime()) ||
          start.getTime() < Date.now() + 10 * 60 * 60 * 1_000,
      )
    ) {
      return apiError("El horario no está disponible.", 422, "INVALID_SCHEDULE");
    }
    const occurrences = buildScheduleOccurrences(
      starts,
      parsed.data.durationHours,
    );
    const ends = occurrences.map((occurrence) => occurrence.end);

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
      return NextResponse.json({ agentIds: [] });
    }

    const activeAgentIds = activeAgents.map((agent) => agent.id);

    const overlapConditions = starts.map((start, index) =>
      and(
        lt(bookingAssignments.startsAt, ends[index]!),
        gt(bookingAssignments.endsAt, start),
      ),
    );
    const exceptionConditions = starts.map((start, index) =>
      and(
        lt(scheduleExceptions.startsAt, ends[index]!),
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
        .select({ agentId: bookingAssignments.agentId })
        .from(bookingAssignments)
        .where(
          and(
            inArray(bookingAssignments.agentId, activeAgentIds),
            inArray(bookingAssignments.status, ["assigned", "confirmed", "in_progress"]),
            or(...overlapConditions),
          ),
        ),
      getDb()
        .select({ agentId: scheduleExceptions.agentId })
        .from(scheduleExceptions)
        .where(
          and(
            eq(scheduleExceptions.kind, "unavailable"),
            inArray(scheduleExceptions.agentId, activeAgentIds),
            or(...exceptionConditions),
          ),
        ),
    ]);

    const unavailable = new Set([
      ...busyAssignments.map((row) => row.agentId),
      ...unavailableExceptions.map((row) => row.agentId),
    ]);

    return NextResponse.json({
      agentIds: activeAgents
        .map((agent) => agent.id)
        .filter(
          (agentId) =>
            !unavailable.has(agentId) &&
            agentRulesCoverSchedule(
              rules,
              agentId,
              district.id,
              occurrences,
            ),
        ),
      visits: starts.length,
    });
  } catch (error) {
    console.error("Availability check failed", error);
    return apiError("No pudimos consultar la disponibilidad.", 503, "UNAVAILABLE");
  }
}
