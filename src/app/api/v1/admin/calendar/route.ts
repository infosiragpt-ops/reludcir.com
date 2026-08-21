import { and, asc, eq, gte, lte } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { agents, bookingAssignments, bookings, districts } from "@/db/schema";
import { requireAdmin } from "@/lib/admin-auth";
import { apiError } from "@/lib/api";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const from = url.searchParams.get("from") ?? new Date().toISOString().slice(0, 10);
  const toDefault = new Date();
  toDefault.setDate(toDefault.getDate() + 7);
  const to = url.searchParams.get("to") ?? toDefault.toISOString().slice(0, 10);
  const agentId = Number(url.searchParams.get("agentId"));

  try {
    const rows = await getDb()
      .select({
        bookingId: bookings.id,
        status: bookings.status,
        scheduledStart: bookings.scheduledStart,
        scheduledEnd: bookings.scheduledEnd,
        districtName: districts.name,
        agentId: bookingAssignments.agentId,
        agentFirstName: agents.firstName,
        agentLastName: agents.lastName,
      })
      .from(bookings)
      .innerJoin(districts, eq(districts.id, bookings.districtId))
      .leftJoin(
        bookingAssignments,
        and(
          eq(bookingAssignments.bookingId, bookings.id),
          eq(bookingAssignments.status, "assigned"),
        ),
      )
      .leftJoin(agents, eq(agents.id, bookingAssignments.agentId))
      .where(
        and(
          ...[
            gte(bookings.scheduledStart, new Date(`${from}T00:00:00-05:00`)),
            lte(bookings.scheduledStart, new Date(`${to}T23:59:59-05:00`)),
            Number.isSafeInteger(agentId) && agentId > 0
              ? eq(bookingAssignments.agentId, agentId)
              : undefined,
          ].filter((value): value is NonNullable<typeof value> => Boolean(value)),
        ),
      )
      .orderBy(asc(bookings.scheduledStart))
      .limit(400);

    return NextResponse.json({
      from,
      to,
      occupancy: rows.map((row) => ({
        ...row,
        scheduledStart: row.scheduledStart.toISOString(),
        scheduledEnd: row.scheduledEnd.toISOString(),
        agentName: [row.agentFirstName, row.agentLastName].filter(Boolean).join(" ") || "Sin asignar",
      })),
    });
  } catch (error) {
    console.error("Admin calendar failed", error);
    return apiError("No pudimos cargar el calendario.", 500, "INTERNAL_ERROR");
  }
}
