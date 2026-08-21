import { desc, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { bookings, customerProfiles, users } from "@/db/schema";
import { requireAdmin } from "@/lib/admin-auth";
import { apiError } from "@/lib/api";

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const rows = await getDb()
      .select({
        id: users.id,
        email: users.email,
        role: users.role,
        isActive: users.isActive,
        firstName: customerProfiles.firstName,
        lastName: customerProfiles.lastName,
        phoneE164: customerProfiles.phoneE164,
        createdAt: users.createdAt,
        bookingsCount: sql<number>`(
          select count(*) from ${bookings} where ${bookings.userId} = ${users.id}
        )`,
      })
      .from(users)
      .leftJoin(customerProfiles, eq(customerProfiles.userId, users.id))
      .where(eq(users.role, "customer"))
      .orderBy(desc(users.createdAt))
      .limit(300);

    return NextResponse.json({
      customers: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        name: [row.firstName, row.lastName].filter(Boolean).join(" ") || row.email,
      })),
    });
  } catch (error) {
    console.error("Admin customers list failed", error);
    return apiError("No pudimos cargar los clientes.", 500, "INTERNAL_ERROR");
  }
}
