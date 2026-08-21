import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { districts, servicePackages, services } from "@/db/schema";
import { requireAdmin } from "@/lib/admin-auth";
import { apiError } from "@/lib/api";

const updateSchema = z.object({
  districts: z
    .array(
      z.object({
        id: z.number().int().positive(),
        isActive: z.boolean(),
      }),
    )
    .optional(),
  packages: z
    .array(
      z.object({
        id: z.number().int().positive(),
        oneTimePrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
        recurringPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
        isActive: z.boolean().optional(),
      }),
    )
    .optional(),
});

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const [districtRows, packageRows, serviceRows] = await Promise.all([
      getDb().select().from(districts).orderBy(asc(districts.id)),
      getDb().select().from(servicePackages).orderBy(asc(servicePackages.sortOrder)),
      getDb().select().from(services).orderBy(asc(services.id)),
    ]);
    return NextResponse.json({
      districts: districtRows,
      packages: packageRows,
      services: serviceRows,
    });
  } catch (error) {
    console.error("Admin catalog load failed", error);
    return apiError("No pudimos cargar el catálogo.", 500, "INTERNAL_ERROR");
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("Los cambios del catálogo no son válidos.", 422, "INVALID_REQUEST");
  }

  try {
    await getDb().transaction(async (transaction) => {
      for (const district of parsed.data.districts ?? []) {
        await transaction
          .update(districts)
          .set({ isActive: district.isActive, updatedAt: new Date() })
          .where(eq(districts.id, district.id));
      }
      for (const item of parsed.data.packages ?? []) {
        await transaction
          .update(servicePackages)
          .set({
            oneTimePrice: item.oneTimePrice,
            recurringPrice: item.recurringPrice,
            isActive: item.isActive,
            updatedAt: new Date(),
          })
          .where(eq(servicePackages.id, item.id));
      }
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Admin catalog update failed", error);
    return apiError("No pudimos guardar el catálogo.", 500, "INTERNAL_ERROR");
  }
}
