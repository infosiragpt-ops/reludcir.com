import { eq, inArray, sql } from "drizzle-orm";

import { closeDb, withTransaction } from "../src/db";
import {
  agents,
  availabilityRules,
  customerProfiles,
  districts,
  servicePackages,
  services,
  users,
} from "../src/db/schema";
import { hashPassword } from "../src/lib/auth";
import { normalizeEmail } from "../src/lib/api";
import { minorUnitsToDecimal, PACKAGE_PRICES } from "../src/lib/pricing";

const districtSeed = [
  { slug: "miraflores", name: "Miraflores" },
  { slug: "san-borja", name: "San Borja" },
  { slug: "san-isidro", name: "San Isidro" },
  { slug: "surco", name: "Santiago de Surco" },
  { slug: "surquillo", name: "Surquillo" },
  { slug: "jesus-maria", name: "Jesús María" },
  { slug: "san-miguel", name: "San Miguel" },
  { slug: "barranco", name: "Barranco" },
  { slug: "magdalena-del-mar", name: "Magdalena del Mar" },
] as const;

const agentSeed = [
  {
    slug: "juan",
    firstName: "Juan",
    lastName: null,
    profession: "Agente de Limpieza",
    rating: "4.50",
    ratingCount: 1,
  },
  {
    slug: "alex-reategui",
    firstName: "Alex",
    lastName: "Reategui",
    profession: "Agente de Limpieza",
    rating: "5.00",
    ratingCount: 1,
  },
  {
    slug: "alan",
    firstName: "Alan",
    lastName: null,
    profession: "Agente de Limpieza",
    rating: null,
    ratingCount: 0,
  },
] as const;

async function seed(): Promise<void> {
  await withTransaction(async (transaction) => {
    await transaction
      .insert(districts)
      .values(
        districtSeed.map((district) => ({
          ...district,
          province: "Lima",
          currency: "PEN",
          deliveryFee: "0.00",
          isActive: true,
        })),
      )
      .onConflictDoUpdate({
        target: districts.slug,
        set: {
          name: sql`excluded.name`,
          province: sql`excluded.province`,
          isActive: sql`excluded.is_active`,
          updatedAt: sql`now()`,
        },
      });

    const [homeService] = await transaction
      .insert(services)
      .values({
        slug: "limpieza-hogar",
        name: "Limpieza para hogares",
        description:
          "Limpieza por horas para casas y departamentos, disponible de forma puntual o recurrente.",
        category: "home",
        isActive: true,
      })
      .onConflictDoUpdate({
        target: services.slug,
        set: {
          name: sql`excluded.name`,
          description: sql`excluded.description`,
          category: sql`excluded.category`,
          isActive: sql`excluded.is_active`,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: services.id });

    await transaction
      .insert(services)
      .values({
        slug: "limpieza-empresas",
        name: "Limpieza para empresas",
        description:
          "Limpieza de oficinas, depósitos y otras instalaciones. Servicio próximamente disponible.",
        category: "business",
        isActive: false,
      })
      .onConflictDoUpdate({
        target: services.slug,
        set: {
          name: sql`excluded.name`,
          description: sql`excluded.description`,
          category: sql`excluded.category`,
          isActive: sql`excluded.is_active`,
          updatedAt: sql`now()`,
        },
      });

    if (!homeService) {
      throw new Error("The home cleaning service could not be seeded.");
    }

    const packageSeed = ([4, 6, 8] as const).map((hours, index) => {
      const selectedPackage = PACKAGE_PRICES[hours];

      return {
        serviceId: homeService.id,
        slug: `${hours}-horas`,
        name: `${hours} horas`,
        description: `Servicio de limpieza de ${hours} horas.`,
        durationMinutes: selectedPackage.durationMinutes,
        maxAreaSqm: selectedPackage.maxAreaSqm,
        oneTimePrice: minorUnitsToDecimal(selectedPackage.oneTimeAmountMinor),
        recurringPrice: minorUnitsToDecimal(selectedPackage.recurringAmountMinor),
        currency: "PEN" as const,
        sortOrder: index + 1,
        isActive: true,
      };
    });

    await transaction
      .insert(servicePackages)
      .values(packageSeed)
      .onConflictDoUpdate({
        target: [servicePackages.serviceId, servicePackages.slug],
        set: {
          name: sql`excluded.name`,
          description: sql`excluded.description`,
          durationMinutes: sql`excluded.duration_minutes`,
          maxAreaSqm: sql`excluded.max_area_sqm`,
          oneTimePrice: sql`excluded.one_time_price`,
          recurringPrice: sql`excluded.recurring_price`,
          currency: sql`excluded.currency`,
          sortOrder: sql`excluded.sort_order`,
          isActive: sql`excluded.is_active`,
          updatedAt: sql`now()`,
        },
      });

    await transaction
      .insert(agents)
      .values(
        agentSeed.map((agent) => ({
          ...agent,
          isActive: true,
        })),
      )
      .onConflictDoUpdate({
        target: agents.slug,
        set: {
          firstName: sql`excluded.first_name`,
          lastName: sql`excluded.last_name`,
          profession: sql`excluded.profession`,
          rating: sql`excluded.rating`,
          ratingCount: sql`excluded.rating_count`,
          isActive: sql`excluded.is_active`,
          updatedAt: sql`now()`,
        },
      });

    const [seededAgents, seededDistricts] = await Promise.all([
      transaction
        .select({ id: agents.id })
        .from(agents)
        .where(inArray(agents.slug, agentSeed.map((agent) => agent.slug))),
      transaction
        .select({ id: districts.id })
        .from(districts)
        .where(inArray(districts.slug, districtSeed.map((district) => district.slug))),
    ]);

    const availabilitySeed = seededAgents.flatMap((agent) =>
      seededDistricts.flatMap((district) =>
        Array.from({ length: 7 }, (_, dayOfWeek) => ({
          agentId: agent.id,
          districtId: district.id,
          dayOfWeek,
          startsAt: "07:00:00",
          endsAt: "19:00:00",
          timezone: "America/Lima",
          isActive: true,
        })),
      ),
    );

    const adminEmail = process.env.SEED_ADMIN_EMAIL?.trim();
    const adminPassword = process.env.SEED_ADMIN_PASSWORD;
    if (adminEmail && adminPassword && adminPassword.length >= 8) {
      const email = normalizeEmail(adminEmail);
      const passwordHash = await hashPassword(adminPassword);
      const [existingAdmin] = await transaction
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)
        .limit(1);
      const admin = existingAdmin
        ? (
            await transaction
              .update(users)
              .set({
                passwordHash,
                role: "admin",
                isActive: true,
                updatedAt: new Date(),
              })
              .where(eq(users.id, existingAdmin.id))
              .returning({ id: users.id })
          )[0]
        : (
            await transaction
              .insert(users)
              .values({
                email,
                passwordHash,
                role: "admin",
              })
              .returning({ id: users.id })
          )[0];
      if (admin) {
        await transaction
          .insert(customerProfiles)
          .values({
            userId: admin.id,
            firstName: "Operaciones",
            lastName: "Reludcir",
          })
          .onConflictDoNothing();
      }
    }

    if (availabilitySeed.length > 0) {
      await transaction
        .insert(availabilityRules)
        .values(availabilitySeed)
        .onConflictDoUpdate({
          target: [
            availabilityRules.agentId,
            availabilityRules.districtId,
            availabilityRules.dayOfWeek,
            availabilityRules.startsAt,
            availabilityRules.endsAt,
          ],
          set: {
            timezone: sql`excluded.timezone`,
            isActive: true,
            updatedAt: sql`now()`,
          },
        });
    }
  });

  console.info(
    `Seed completed: ${districtSeed.length} districts, 2 services, 3 packages, ${agentSeed.length} agents and weekly availability.`,
  );
}

seed()
  .catch((error: unknown) => {
    console.error("Database seed failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDb();
  });
