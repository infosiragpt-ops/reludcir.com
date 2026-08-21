import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { bookings, customerProfiles, users } from "@/db/schema";
import { requireAdmin } from "@/lib/admin-auth";
import { apiError } from "@/lib/api";

const updateSchema = z.object({
  isActive: z.boolean(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const userId = Number((await context.params).id);
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return apiError("Cliente no válido.", 422, "INVALID_REQUEST");
  }

  try {
    const [customer] = await getDb()
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        firstName: customerProfiles.firstName,
        lastName: customerProfiles.lastName,
        phoneE164: customerProfiles.phoneE164,
      })
      .from(users)
      .leftJoin(customerProfiles, eq(customerProfiles.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);
    if (!customer || customer.role !== "customer") {
      return apiError("No encontramos al cliente.", 404, "NOT_FOUND");
    }

    const customerBookings = await getDb()
      .select({
        id: bookings.id,
        status: bookings.status,
        scheduledStart: bookings.scheduledStart,
        serviceNameSnapshot: bookings.serviceNameSnapshot,
        totalPriceSnapshot: bookings.totalPriceSnapshot,
        currency: bookings.currency,
      })
      .from(bookings)
      .where(eq(bookings.userId, userId))
      .orderBy(desc(bookings.scheduledStart))
      .limit(100);

    return NextResponse.json({
      customer,
      bookings: customerBookings.map((row) => ({
        ...row,
        scheduledStart: row.scheduledStart.toISOString(),
      })),
    });
  } catch (error) {
    console.error("Admin customer detail failed", error);
    return apiError("No pudimos cargar el cliente.", 500, "INTERNAL_ERROR");
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const userId = Number((await context.params).id);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!Number.isSafeInteger(userId) || userId <= 0 || !parsed.success) {
    return apiError("La solicitud no es válida.", 422, "INVALID_REQUEST");
  }

  try {
    const [updated] = await getDb()
      .update(users)
      .set({ isActive: parsed.data.isActive, updatedAt: new Date() })
      .where(eq(users.id, userId))
      .returning({ id: users.id, isActive: users.isActive });
    if (!updated) return apiError("No encontramos al cliente.", 404, "NOT_FOUND");
    return NextResponse.json({ customer: updated });
  } catch (error) {
    console.error("Admin customer update failed", error);
    return apiError("No pudimos actualizar el cliente.", 500, "INTERNAL_ERROR");
  }
}
