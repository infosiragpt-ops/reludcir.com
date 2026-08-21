import { and, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import {
  agents,
  availabilityRules,
  bookingAssignments,
  bookingOrders,
  bookings,
  bookingStatusEvents,
  incidents,
  payments,
} from "@/db/schema";
import { requireAdmin } from "@/lib/admin-auth";
import { apiError, postgresErrorCode } from "@/lib/api";
import { agentRulesCoverSchedule, buildScheduleOccurrences } from "@/lib/scheduling";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("cancel"),
    reason: z.string().trim().min(3).max(500),
  }),
  z.object({
    action: z.literal("reschedule"),
    scheduledStart: z.string().datetime({ offset: true }),
  }),
  z.object({
    action: z.literal("assign"),
    agentId: z.number().int().positive(),
  }),
  z.object({
    action: z.literal("incident"),
    type: z.enum(["late", "no_show", "damage", "service_quality", "other"]),
    description: z.string().trim().min(8).max(2_000),
  }),
]);

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const bookingId = Number((await context.params).id);
  if (!Number.isSafeInteger(bookingId) || bookingId <= 0) {
    return apiError("Reserva no válida.", 422, "INVALID_REQUEST");
  }

  try {
    const [booking] = await getDb()
      .select({
        booking: bookings,
        order: bookingOrders,
        paymentProvider: payments.provider,
        paymentStatus: payments.status,
        paymentAmount: payments.amount,
      })
      .from(bookings)
      .innerJoin(bookingOrders, eq(bookingOrders.id, bookings.orderId))
      .leftJoin(payments, eq(payments.orderId, bookingOrders.id))
      .where(eq(bookings.id, bookingId))
      .limit(1);
    if (!booking) return apiError("No encontramos la reserva.", 404, "NOT_FOUND");

    const [assignment] = await getDb()
      .select({
        agentId: bookingAssignments.agentId,
        status: bookingAssignments.status,
        firstName: agents.firstName,
        lastName: agents.lastName,
      })
      .from(bookingAssignments)
      .innerJoin(agents, eq(agents.id, bookingAssignments.agentId))
      .where(
        and(
          eq(bookingAssignments.bookingId, bookingId),
          inArray(bookingAssignments.status, ["assigned", "confirmed", "in_progress"]),
        ),
      )
      .limit(1);

    const notes = await getDb()
      .select()
      .from(incidents)
      .where(eq(incidents.bookingId, bookingId));

    return NextResponse.json({
      booking: {
        ...booking.booking,
        scheduledStart: booking.booking.scheduledStart.toISOString(),
        scheduledEnd: booking.booking.scheduledEnd.toISOString(),
      },
      order: {
        reference: booking.order.reference,
        customerName: booking.order.customerName,
        customerEmail: booking.order.customerEmail,
        customerPhoneE164: booking.order.customerPhoneE164,
        status: booking.order.status,
      },
      payment: {
        provider: booking.paymentProvider,
        status: booking.paymentStatus,
        amount: booking.paymentAmount,
      },
      assignment: assignment
        ? {
            agentId: assignment.agentId,
            status: assignment.status,
            name: [assignment.firstName, assignment.lastName].filter(Boolean).join(" "),
          }
        : null,
      incidents: notes,
    });
  } catch (error) {
    console.error("Admin booking detail failed", error);
    return apiError("No pudimos cargar la reserva.", 500, "INTERNAL_ERROR");
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const bookingId = Number((await context.params).id);
  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!Number.isSafeInteger(bookingId) || bookingId <= 0 || !parsed.success) {
    return apiError("La solicitud no es válida.", 422, "INVALID_REQUEST");
  }

  try {
    const result = await getDb().transaction(async (transaction) => {
      const [booking] = await transaction
        .select()
        .from(bookings)
        .where(eq(bookings.id, bookingId))
        .limit(1)
        .for("update");
      if (!booking) throw new Error("NOT_FOUND");
      const now = new Date();

      if (parsed.data.action === "cancel") {
        if (["cancelled", "completed", "no_show"].includes(booking.status)) {
          throw new Error("NOT_MANAGEABLE");
        }
        await transaction
          .update(bookings)
          .set({
            status: "cancelled",
            cancelledAt: now,
            cancellationReason: parsed.data.reason,
            updatedAt: now,
          })
          .where(eq(bookings.id, bookingId));
        await transaction
          .update(bookingAssignments)
          .set({ status: "cancelled", releasedAt: now, updatedAt: now })
          .where(
            and(
              eq(bookingAssignments.bookingId, bookingId),
              inArray(bookingAssignments.status, ["assigned", "confirmed", "in_progress"]),
            ),
          );
        await transaction.insert(bookingStatusEvents).values({
          bookingId,
          actorUserId: auth.user.id,
          fromStatus: booking.status,
          toStatus: "cancelled",
          reason: parsed.data.reason,
        });
        return { ok: true };
      }

      if (parsed.data.action === "reschedule") {
        const newStart = new Date(parsed.data.scheduledStart);
        const durationHours = booking.durationMinutesSnapshot / 60;
        const newEnd = new Date(newStart.getTime() + durationHours * 60 * 60 * 1_000);
        const schedule = buildScheduleOccurrences([newStart], durationHours);
        const [assignment] = await transaction
          .select({ agentId: bookingAssignments.agentId })
          .from(bookingAssignments)
          .where(
            and(
              eq(bookingAssignments.bookingId, bookingId),
              inArray(bookingAssignments.status, ["assigned", "confirmed", "in_progress"]),
            ),
          )
          .limit(1);
        if (assignment) {
          const rules = await transaction
            .select()
            .from(availabilityRules)
            .where(
              and(
                eq(availabilityRules.agentId, assignment.agentId),
                eq(availabilityRules.isActive, true),
              ),
            );
          if (!agentRulesCoverSchedule(rules, assignment.agentId, booking.districtId, schedule)) {
            throw new Error("UNAVAILABLE");
          }
        }
        await transaction
          .update(bookings)
          .set({
            scheduledStart: newStart,
            scheduledEnd: newEnd,
            rescheduleCount: booking.rescheduleCount + 1,
            updatedAt: now,
          })
          .where(eq(bookings.id, bookingId));
        if (assignment) {
          await transaction
            .update(bookingAssignments)
            .set({ startsAt: newStart, endsAt: newEnd, updatedAt: now })
            .where(
              and(
                eq(bookingAssignments.bookingId, bookingId),
                eq(bookingAssignments.agentId, assignment.agentId),
              ),
            );
        }
        await transaction.insert(bookingStatusEvents).values({
          bookingId,
          actorUserId: auth.user.id,
          fromStatus: booking.status,
          toStatus: booking.status,
          reason: "Reprogramación administrativa",
        });
        return { ok: true };
      }

      if (parsed.data.action === "assign") {
        const [agent] = await transaction
          .select({ id: agents.id })
          .from(agents)
          .where(and(eq(agents.id, parsed.data.agentId), eq(agents.isActive, true)))
          .limit(1);
        if (!agent) throw new Error("UNAVAILABLE");
        await transaction
          .update(bookingAssignments)
          .set({ status: "cancelled", releasedAt: now, updatedAt: now })
          .where(
            and(
              eq(bookingAssignments.bookingId, bookingId),
              inArray(bookingAssignments.status, ["assigned", "confirmed", "in_progress"]),
            ),
          );
        await transaction.insert(bookingAssignments).values({
          bookingId,
          agentId: agent.id,
          status: "assigned",
          startsAt: booking.scheduledStart,
          endsAt: booking.scheduledEnd,
        });
        if (booking.status === "confirmed" || booking.status === "pending_payment") {
          await transaction
            .update(bookings)
            .set({ status: "assigned", updatedAt: now })
            .where(eq(bookings.id, bookingId));
        }
        return { ok: true };
      }

      await transaction.insert(incidents).values({
        bookingId,
        reportedByUserId: auth.user.id,
        type: parsed.data.type,
        description: parsed.data.description,
      });
      return { ok: true };
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return apiError("No encontramos la reserva.", 404, "NOT_FOUND");
    }
    if (error instanceof Error && error.message === "NOT_MANAGEABLE") {
      return apiError("Esta reserva ya no se puede cancelar.", 409, "NOT_MANAGEABLE");
    }
    if (error instanceof Error && error.message === "UNAVAILABLE") {
      return apiError("El agente no está disponible en ese horario.", 409, "UNAVAILABLE");
    }
    if (postgresErrorCode(error) === "23P01") {
      return apiError("Ese horario ya está ocupado.", 409, "DOUBLE_BOOKED");
    }
    console.error("Admin booking update failed", error);
    return apiError("No pudimos actualizar la reserva.", 500, "INTERNAL_ERROR");
  }
}
