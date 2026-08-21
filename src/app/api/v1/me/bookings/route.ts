import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { bookingAssignments, bookings } from "@/db/schema";
import { apiError } from "@/lib/api";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return apiError("Inicia sesión para ver tus reservas.", 401, "UNAUTHENTICATED");
    }

    const rows = await getDb()
      .select({
        id: bookings.id,
        orderId: bookings.orderId,
        status: bookings.status,
        bookingMode: bookings.bookingMode,
        recurrenceGroupId: bookings.recurrenceGroupId,
        scheduledStart: bookings.scheduledStart,
        scheduledEnd: bookings.scheduledEnd,
        serviceNameSnapshot: bookings.serviceNameSnapshot,
        packageNameSnapshot: bookings.packageNameSnapshot,
        durationMinutesSnapshot: bookings.durationMinutesSnapshot,
        unitPriceSnapshot: bookings.unitPriceSnapshot,
        totalPriceSnapshot: bookings.totalPriceSnapshot,
        currency: bookings.currency,
        districtId: bookings.districtId,
        addressSnapshot: bookings.addressSnapshot,
        agentId: bookingAssignments.agentId,
        assignmentStatus: bookingAssignments.status,
      })
      .from(bookings)
      .leftJoin(
        bookingAssignments,
        and(
          eq(bookingAssignments.bookingId, bookings.id),
          inArray(bookingAssignments.status, ["assigned", "confirmed", "in_progress"]),
        ),
      )
      .where(eq(bookings.userId, user.id))
      .orderBy(desc(bookings.scheduledStart));

    return NextResponse.json({
      bookings: rows.map(({ agentId, assignmentStatus, ...booking }) => ({
        ...booking,
        scheduledStart: booking.scheduledStart.toISOString(),
        scheduledEnd: booking.scheduledEnd.toISOString(),
        assignment:
          agentId && assignmentStatus
            ? { agentId, status: assignmentStatus }
            : null,
      })),
    });
  } catch (error) {
    console.error("Bookings load failed", error);
    return apiError("No pudimos cargar tus reservas.", 500, "INTERNAL_ERROR");
  }
}
