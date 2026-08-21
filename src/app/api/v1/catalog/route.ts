import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { agents, districts, servicePackages, services } from "@/db/schema";
import { apiError } from "@/lib/api";

export async function GET() {
  try {
    const [availableDistricts, availableAgents, packages] = await Promise.all([
      getDb()
        .select({ id: districts.id, slug: districts.slug, name: districts.name })
        .from(districts)
        .where(eq(districts.isActive, true))
        .orderBy(asc(districts.id)),
      getDb()
        .select({
          id: agents.id,
          slug: agents.slug,
          firstName: agents.firstName,
          lastName: agents.lastName,
          profession: agents.profession,
          avatarUrl: agents.avatarUrl,
          rating: agents.rating,
        })
        .from(agents)
        .where(eq(agents.isActive, true))
        .orderBy(asc(agents.id)),
      getDb()
        .select({
          id: servicePackages.id,
          serviceId: services.id,
          serviceSlug: services.slug,
          name: servicePackages.name,
          durationMinutes: servicePackages.durationMinutes,
          oneTimePrice: servicePackages.oneTimePrice,
          recurringPrice: servicePackages.recurringPrice,
          currency: servicePackages.currency,
        })
        .from(servicePackages)
        .innerJoin(services, eq(servicePackages.serviceId, services.id))
        .where(and(eq(services.isActive, true), eq(servicePackages.isActive, true)))
        .orderBy(asc(servicePackages.sortOrder)),
    ]);

    return NextResponse.json({
      districts: availableDistricts,
      agents: availableAgents.map((agent) => ({
        ...agent,
        name: [agent.firstName, agent.lastName].filter(Boolean).join(" "),
      })),
      packages,
      bookingModes: [
        { id: 5, slug: "one_time", name: "Limpieza por horas [único]" },
        { id: 7, slug: "recurring", name: "Limpieza por horas [recurrente]" },
      ],
    });
  } catch (error) {
    console.error("Catalog load failed", error);
    return apiError("No pudimos cargar la disponibilidad.", 503, "CATALOG_UNAVAILABLE");
  }
}
