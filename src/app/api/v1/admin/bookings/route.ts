import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import {
  bookingAssignments,
  bookingOrders,
  bookings,
  districts,
  payments,
} from "@/db/schema";
import { requireAdmin } from "@/lib/admin-auth";
import { apiError } from "@/lib/api";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  const districtId = Number(url.searchParams.get("districtId"));
  const agentId = Number(url.searchParams.get("agentId"));
  const paymentStatus = url.searchParams.get("payment");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  try {
    const filters = [
      status ? eq(bookings.status, status) : undefined,
      Number.isSafeInteger(districtId) && districtId > 0
        ? eq(bookings.districtId, districtId)
        : undefined,
      Number.isSafeInteger(agentId) && agentId > 0
        ? eq(bookingAssignments.agentId, agentId)
        : undefined,
      paymentStatus ? eq(payments.status, paymentStatus) : undefined,
      from ? gte(bookings.scheduledStart, new Date(`${from}T00:00:00-05:00`)) : undefined,
      to ? lte(bookings.scheduledStart, new Date(`${to}T23:59:59-05:00`)) : undefined,
    ].filter(Boolean);

    const rows = await getDb()
      .select({
        id: bookings.id,
        publicId: bookings.publicId,
        status: bookings.status,
        bookingMode: bookings.bookingMode,
        recurrenceGroupId: bookings.recurrenceGroupId,
        scheduledStart: bookings.scheduledStart,
        scheduledEnd: bookings.scheduledEnd,
        serviceNameSnapshot: bookings.serviceNameSnapshot,
        packageNameSnapshot: bookings.packageNameSnapshot,
        totalPriceSnapshot: bookings.totalPriceSnapshot,
        currency: bookings.currency,
        districtName: districts.name,
        orderReference: bookingOrders.reference,
        customerName: bookingOrders.customerName,
        customerEmail: bookingOrders.customerEmail,
        paymentProvider: payments.provider,
        paymentStatus: payments.status,
        paymentAmount: payments.amount,
        agentId: bookingAssignments.agentId,
      })
      .from(bookings)
      .innerJoin(bookingOrders, eq(bookingOrders.id, bookings.orderId))
      .innerJoin(districts, eq(districts.id, bookings.districtId))
      .leftJoin(payments, eq(payments.orderId, bookingOrders.id))
      .leftJoin(
        bookingAssignments,
        and(
          eq(bookingAssignments.bookingId, bookings.id),
          sql`${bookingAssignments.status} in ('assigned', 'confirmed', 'in_progress')`,
        ),
      )
      .where(filters.length > 0 ? and(...filters) : undefined)
      .orderBy(desc(bookings.scheduledStart))
      .limit(200);

    return NextResponse.json({
      bookings: rows.map((row) => ({
        ...row,
        scheduledStart: row.scheduledStart.toISOString(),
        scheduledEnd: row.scheduledEnd.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Admin bookings list failed", error);
    return apiError("No pudimos cargar las reservas.", 500, "INTERNAL_ERROR");
  }
}
