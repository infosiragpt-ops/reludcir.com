import { and, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import {
  agents,
  availabilityRules,
  bookingAssignments,
  bookings,
  bookingStatusEvents,
  notificationOutbox,
  scheduleExceptions,
} from "@/db/schema";
import { apiError, postgresErrorCode } from "@/lib/api";
import { getAuthenticatedUser } from "@/lib/auth";
import { consumeRateLimit, rateLimitError } from "@/lib/rate-limit";
import { agentRulesCoverSchedule, buildScheduleOccurrences } from "@/lib/scheduling";

const rescheduleSchema = z.object({
  scheduledStart: z.string().datetime({ offset: true }),
  timeZone: z.literal("America/Lima"),
});

const manageableStatuses = ["pending_payment", "confirmed", "assigned"];
const MAX_RESCHEDULES_PER_BOOKING = 3;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return apiError("Inicia sesión para gestionar la reserva.", 401, "UNAUTHENTICATED");
  }

  const { id } = await context.params;
  const bookingId = Number(id);
  const parsed = rescheduleSchema.safeParse(await request.json().catch(() => null));
  if (!Number.isSafeInteger(bookingId) || bookingId <= 0 || !parsed.success) {
    return apiError("La nueva fecha no es válida.", 422, "INVALID_REQUEST");
  }

  const newStart = new Date(parsed.data.scheduledStart);
  const minimum = Date.now() + 12 * 60 * 60 * 1000;
  const maximum = Date.now() + 180 * 24 * 60 * 60 * 1000;
  if (newStart.getTime() < minimum || newStart.getTime() > maximum) {
    return apiError(
      "La nueva fecha debe tener al menos 12 horas de anticipación.",
      422,
      "DATE_OUT_OF_RANGE",
    );
  }

  try {
    const userLimit = await consumeRateLimit(
      "booking:reschedule:user",
      String(user.id),
      12,
      60 * 60 * 1_000,
    );
    if (!userLimit.allowed) return rateLimitError(userLimit);
    const bookingLimit = await consumeRateLimit(
      "booking:reschedule:booking",
      `${user.id}:${bookingId}`,
      5,
      24 * 60 * 60 * 1_000,
    );
    if (!bookingLimit.allowed) return rateLimitError(bookingLimit);

    const result = await getDb().transaction(async (transaction) => {
      const [booking] = await transaction
        .select()
        .from(bookings)
        .where(and(eq(bookings.id, bookingId), eq(bookings.userId, user.id)))
        .limit(1)
        .for("update");

      if (!booking) {
        throw new Error("NOT_FOUND");
      }
      if (!manageableStatuses.includes(booking.status)) {
        throw new Error("NOT_MANAGEABLE");
      }
      if (booking.rescheduleCount >= MAX_RESCHEDULES_PER_BOOKING) {
        throw new Error("RESCHEDULE_LIMIT");
      }
      if (booking.scheduledStart.getTime() < minimum) {
        throw new Error("TOO_LATE");
      }

      const newEnd = new Date(
        newStart.getTime() + booking.durationMinutesSnapshot * 60 * 1000,
      );
      const schedule = buildScheduleOccurrences(
        [newStart],
        booking.durationMinutesSnapshot / 60,
      );
      if (schedule[0]?.startsAtMinute % 60 !== 0) {
        throw new Error("OUTSIDE_AVAILABILITY");
      }

      const [assignment] = await transaction
        .select({
          id: bookingAssignments.id,
          agentId: bookingAssignments.agentId,
          status: bookingAssignments.status,
          agentIsActive: agents.isActive,
        })
        .from(bookingAssignments)
        .innerJoin(agents, eq(agents.id, bookingAssignments.agentId))
        .where(
          and(
            eq(bookingAssignments.bookingId, booking.id),
            inArray(bookingAssignments.status, ["assigned", "confirmed"]),
          ),
        )
        .limit(1)
        .for("update");

      if (!assignment) {
        throw new Error("NO_ASSIGNMENT");
      }
      if (!assignment.agentIsActive) {
        throw new Error("AGENT_UNAVAILABLE");
      }

      const [rules, unavailableExceptions] = await Promise.all([
        transaction
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
              eq(availabilityRules.agentId, assignment.agentId),
              eq(availabilityRules.isActive, true),
              or(
                isNull(availabilityRules.districtId),
                eq(availabilityRules.districtId, booking.districtId),
              ),
            ),
          ),
        transaction
          .select({ id: scheduleExceptions.id })
          .from(scheduleExceptions)
          .where(
            and(
              eq(scheduleExceptions.agentId, assignment.agentId),
              eq(scheduleExceptions.kind, "unavailable"),
              lt(scheduleExceptions.startsAt, newEnd),
              gt(scheduleExceptions.endsAt, newStart),
            ),
          )
          .limit(1),
      ]);

      if (
        unavailableExceptions.length > 0 ||
        !agentRulesCoverSchedule(
          rules,
          assignment.agentId,
          booking.districtId,
          schedule,
        )
      ) {
        throw new Error("OUTSIDE_AVAILABILITY");
      }

      await transaction
        .update(bookingAssignments)
        .set({ startsAt: newStart, endsAt: newEnd, updatedAt: new Date() })
        .where(eq(bookingAssignments.id, assignment.id));

      const [updated] = await transaction
        .update(bookings)
        .set({
          scheduledStart: newStart,
          scheduledEnd: newEnd,
          refundEligibleUntil: new Date(
            Math.min(
              booking.refundEligibleUntil.getTime(),
              newStart.getTime() - 24 * 60 * 60 * 1_000,
            ),
          ),
          rescheduleCount: sql`${bookings.rescheduleCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, booking.id))
        .returning();

      await transaction.insert(bookingStatusEvents).values({
        bookingId: booking.id,
        actorUserId: user.id,
        fromStatus: booking.status,
        toStatus: booking.status,
        reason: "Reserva reprogramada por el cliente",
        metadata: {
          previousStart: booking.scheduledStart.toISOString(),
          scheduledStart: newStart.toISOString(),
          timeZone: parsed.data.timeZone,
        },
      });

      await transaction.insert(notificationOutbox).values({
        userId: user.id,
        bookingId: booking.id,
        channel: "email",
        templateKey: "booking-rescheduled",
        recipient: user.email,
        deduplicationKey: `booking-rescheduled:${booking.publicId}:${newStart.toISOString()}`,
        payload: { scheduledStart: newStart.toISOString() },
      });

      return {
        booking: updated,
        assignment: { agentId: assignment.agentId, status: assignment.status },
      };
    });

    return NextResponse.json({
      booking: { ...result.booking, assignment: result.assignment },
    });
  } catch (error) {
    if (postgresErrorCode(error) === "23P01") {
      return apiError(
        "El agente ya tiene otra reserva en ese horario.",
        409,
        "SCHEDULE_CONFLICT",
      );
    }
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return apiError("Reserva no encontrada.", 404, "NOT_FOUND");
    }
    if (error instanceof Error && error.message === "NOT_MANAGEABLE") {
      return apiError("Esta reserva ya no puede reprogramarse.", 409, "INVALID_STATUS");
    }
    if (error instanceof Error && error.message === "TOO_LATE") {
      return apiError("Debes reprogramar con al menos 12 horas de anticipación.", 409, "TOO_LATE");
    }
    if (error instanceof Error && error.message === "RESCHEDULE_LIMIT") {
      return apiError(
        "Esta reserva alcanzó el máximo de tres reprogramaciones.",
        409,
        "RESCHEDULE_LIMIT",
      );
    }
    if (error instanceof Error && error.message === "NO_ASSIGNMENT") {
      return apiError("La reserva todavía no tiene un agente asignado.", 409, "NO_ASSIGNMENT");
    }
    if (error instanceof Error && error.message === "AGENT_UNAVAILABLE") {
      return apiError(
        "El agente asignado ya no está disponible. Contáctanos para reasignar la visita.",
        409,
        "AGENT_UNAVAILABLE",
      );
    }
    if (error instanceof Error && error.message === "OUTSIDE_AVAILABILITY") {
      return apiError(
        "El agente no trabaja en ese distrito u horario.",
        409,
        "OUTSIDE_AVAILABILITY",
      );
    }

    console.error("Booking reschedule failed", error);
    return apiError("No pudimos reprogramar la reserva.", 500, "INTERNAL_ERROR");
  }
}
