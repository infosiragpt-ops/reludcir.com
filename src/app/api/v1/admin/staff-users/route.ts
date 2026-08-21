import { asc, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { customerProfiles, users } from "@/db/schema";
import { requireAdmin } from "@/lib/admin-auth";
import { apiError, normalizeEmail } from "@/lib/api";
import { hashPassword } from "@/lib/auth";

const createSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(128),
  role: z.enum(["admin", "support"]),
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
});

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
      })
      .from(users)
      .leftJoin(customerProfiles, eq(customerProfiles.userId, users.id))
      .where(inArray(users.role, ["admin", "support"]))
      .orderBy(asc(users.id));
    return NextResponse.json({ staff: rows });
  } catch (error) {
    console.error("Admin staff list failed", error);
    return apiError("No pudimos cargar el equipo interno.", 500, "INTERNAL_ERROR");
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("Completa correo, contraseña y rol.", 422, "INVALID_REQUEST");
  }

  const email = normalizeEmail(parsed.data.email);
  try {
    const passwordHash = await hashPassword(parsed.data.password);
    const created = await getDb().transaction(async (transaction) => {
      const [existing] = await transaction
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)
        .limit(1);
      const user = existing
        ? (
            await transaction
              .update(users)
              .set({
                passwordHash,
                role: parsed.data.role,
                isActive: true,
                updatedAt: new Date(),
              })
              .where(eq(users.id, existing.id))
              .returning({ id: users.id, email: users.email, role: users.role })
          )[0]
        : (
            await transaction
              .insert(users)
              .values({
                email,
                passwordHash,
                role: parsed.data.role,
              })
              .returning({ id: users.id, email: users.email, role: users.role })
          )[0];
      if (!user) throw new Error("insert failed");
      await transaction
        .insert(customerProfiles)
        .values({
          userId: user.id,
          firstName: parsed.data.firstName,
          lastName: parsed.data.lastName,
        })
        .onConflictDoUpdate({
          target: customerProfiles.userId,
          set: {
            firstName: parsed.data.firstName,
            lastName: parsed.data.lastName,
            updatedAt: new Date(),
          },
        });
      return user;
    });
    return NextResponse.json({ user: created }, { status: 201 });
  } catch (error) {
    console.error("Admin staff create failed", error);
    return apiError("No pudimos crear el usuario interno.", 500, "INTERNAL_ERROR");
  }
}
