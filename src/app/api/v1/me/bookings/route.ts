import { and, desc, eq, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { bookingAssignments, bookingOrders, bookings } from "@/db/schema";
import { apiError } from "@/lib/api";
import { getAuthenticatedUser } from "@/lib/auth";
import { getVerifiedBookingClaims } from "@/lib/booking-claims";

export async function GET() {
  try {
    const user = await getAuthenticatedUser();
    const claims = await getVerifiedBookingClaims();
    if (!user && claims.length === 0) {
      return apiError("Inicia sesión para ver tus reservas.", 401, "UNAUTHENTICATED");
    }

    const claimFilters =
      claims.length > 0
        ? claims.map((claim) =>
            and(
              eq(bookings.publicId, claim.bookingPublicId),
              eq(bookingOrders.reference, claim.orderReference),
            ),
          )
        : [];

    const ownershipFilter = user
      ? claimFilters.length > 0
        ? or(eq(bookings.userId, user.id), ...claimFilters)
        : eq(bookings.userId, user.id)
      : or(...claimFilters);

    const rows = await getDb()
      .select({
        id: bookings.id,
        publicId: bookings.publicId,
        orderId: bookings.orderId,
        orderReference: bookingOrders.reference,
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
        claimedByUser: bookings.userId,
      })
      .from(bookings)
      .innerJoin(bookingOrders, eq(bookingOrders.id, bookings.orderId))
      .leftJoin(
        bookingAssignments,
        and(
          eq(bookingAssignments.bookingId, bookings.id),
          inArray(bookingAssignments.status, ["assigned", "confirmed", "in_progress"]),
        ),
      )
      .where(ownershipFilter)
      .orderBy(desc(bookings.scheduledStart));

    return NextResponse.json({
      user: user
        ? { id: user.id, email: user.email, role: user.role }
        : null,
      guestAccess: !user,
      bookings: rows.map(({ agentId, assignmentStatus, claimedByUser, ...booking }) => ({
        ...booking,
        scheduledStart: booking.scheduledStart.toISOString(),
        scheduledEnd: booking.scheduledEnd.toISOString(),
        manageable: Boolean(user && claimedByUser === user.id),
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
