import { and, eq, gte, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { bookingAssignments, bookings, incidents, notificationOutbox } from "@/db/schema";
import { apiError } from "@/lib/api";
import { getAuthenticatedUser } from "@/lib/auth";
import { consumeRateLimit, rateLimitError } from "@/lib/rate-limit";

const incidentSchema = z.object({
  type: z.enum(["incident", "late_arrival", "no_show"]),
  description: z.string().trim().min(10).max(2_000),
});

const reportableStatuses = [
  "confirmed",
  "assigned",
  "in_progress",
  "completed",
  "no_show",
];

const incidentType = {
  incident: "other",
  late_arrival: "late",
  no_show: "no_show",
} as const;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return apiError("Inicia sesión para reportar una incidencia.", 401, "UNAUTHENTICATED");
  }

  const { id } = await context.params;
  const bookingId = Number(id);
  const parsed = incidentSchema.safeParse(await request.json().catch(() => null));
  if (!Number.isSafeInteger(bookingId) || bookingId <= 0 || !parsed.success) {
    return apiError("Completa el tipo y la descripción del reporte.", 422, "INVALID_REQUEST");
  }

  try {
    const userLimit = await consumeRateLimit(
      "booking:incident:user",
      String(user.id),
      20,
      60 * 60 * 1_000,
    );
    if (!userLimit.allowed) return rateLimitError(userLimit);
    const bookingLimit = await consumeRateLimit(
      "booking:incident:booking",
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
        .limit(1);

      if (!booking) {
        throw new Error("NOT_FOUND");
      }
      if (!reportableStatuses.includes(booking.status)) {
        throw new Error("NOT_REPORTABLE");
      }

      const normalizedIncidentType = incidentType[parsed.data.type];
      const [existingIncident] = await transaction
        .select({ id: incidents.id })
        .from(incidents)
        .where(
          and(
            eq(incidents.bookingId, booking.id),
            eq(incidents.reportedByUserId, user.id),
            eq(incidents.type, normalizedIncidentType),
            eq(incidents.description, parsed.data.description),
            inArray(incidents.status, ["open", "investigating"]),
            gte(incidents.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1_000)),
          ),
        )
        .limit(1);

      let incidentId = existingIncident?.id;
      if (!incidentId) {
        const [incident] = await transaction
          .insert(incidents)
          .values({
            bookingId: booking.id,
            reportedByUserId: user.id,
            type: normalizedIncidentType,
            description: parsed.data.description,
          })
          .returning({ id: incidents.id });
        incidentId = incident?.id;

        const incidentKey = incidentId ?? crypto.randomUUID();
        const supportEmail = process.env.SUPPORT_OPERATIONS_EMAIL;
        await transaction.insert(notificationOutbox).values([
          {
            userId: user.id,
            bookingId: booking.id,
            channel: "email",
            templateKey: "incident-received",
            recipient: user.email,
            deduplicationKey: `incident-received:${incidentKey}`,
            payload: { incidentId, type: parsed.data.type },
          },
          ...(supportEmail
            ? [
                {
                  userId: user.id,
                  bookingId: booking.id,
                  channel: "email" as const,
                  templateKey: "incident-alert",
                  recipient: supportEmail,
                  deduplicationKey: `incident-alert:${incidentKey}`,
                  payload: {
                    incidentId,
                    bookingId: booking.id,
                    type: parsed.data.type,
                  },
                },
              ]
            : []),
        ]);
      }

      const [assignment] = await transaction
        .select({ agentId: bookingAssignments.agentId, status: bookingAssignments.status })
        .from(bookingAssignments)
        .where(
          and(
            eq(bookingAssignments.bookingId, booking.id),
            inArray(bookingAssignments.status, ["assigned", "confirmed", "in_progress"]),
          ),
        )
        .limit(1);

      return {
        booking: { ...booking, assignment: assignment ?? null },
        incidentId,
        deduplicated: Boolean(existingIncident),
      };
    });

    return NextResponse.json({
      ok: true,
      incidentId: result.incidentId,
      deduplicated: result.deduplicated,
      booking: result.booking,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return apiError("Reserva no encontrada.", 404, "NOT_FOUND");
    }
    if (error instanceof Error && error.message === "NOT_REPORTABLE") {
      return apiError("Esta reserva todavía no admite reportes.", 409, "INVALID_STATUS");
    }

    console.error("Incident creation failed", error);
    return apiError("No pudimos registrar el reporte.", 500, "INTERNAL_ERROR");
  }
}
