import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { agents, availabilityRules, scheduleExceptions } from "@/db/schema";
import { requireAdmin } from "@/lib/admin-auth";
import { apiError } from "@/lib/api";

const updateSchema = z.object({
  firstName: z.string().trim().min(2).max(80).optional(),
  lastName: z.string().trim().max(80).optional(),
  profession: z.string().trim().min(2).max(120).optional(),
  avatarUrl: z.string().trim().max(400).optional(),
  isActive: z.boolean().optional(),
  availability: z
    .array(
      z.object({
        districtId: z.number().int().positive(),
        dayOfWeek: z.number().int().min(0).max(6),
        startsAt: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
        endsAt: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
        isActive: z.boolean().optional().default(true),
      }),
    )
    .optional(),
  exception: z
    .object({
      startsAt: z.string().datetime({ offset: true }),
      endsAt: z.string().datetime({ offset: true }),
      reason: z.string().trim().max(200).optional(),
    })
    .optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const agentId = Number((await context.params).id);
  if (!Number.isSafeInteger(agentId) || agentId <= 0) {
    return apiError("Agente no válido.", 422, "INVALID_REQUEST");
  }

  try {
    const [agent] = await getDb().select().from(agents).where(eq(agents.id, agentId)).limit(1);
    if (!agent) return apiError("No encontramos al agente.", 404, "NOT_FOUND");
    const [rules, exceptions] = await Promise.all([
      getDb().select().from(availabilityRules).where(eq(availabilityRules.agentId, agentId)),
      getDb().select().from(scheduleExceptions).where(eq(scheduleExceptions.agentId, agentId)),
    ]);
    return NextResponse.json({
      agent: { ...agent, name: [agent.firstName, agent.lastName].filter(Boolean).join(" ") },
      availability: rules,
      exceptions,
    });
  } catch (error) {
    console.error("Admin agent detail failed", error);
    return apiError("No pudimos cargar el agente.", 500, "INTERNAL_ERROR");
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const agentId = Number((await context.params).id);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!Number.isSafeInteger(agentId) || agentId <= 0 || !parsed.success) {
    return apiError("Los datos del agente no son válidos.", 422, "INVALID_REQUEST");
  }

  try {
    await getDb().transaction(async (transaction) => {
      const [agent] = await transaction
        .select({ id: agents.id })
        .from(agents)
        .where(eq(agents.id, agentId))
        .limit(1);
      if (!agent) throw new Error("NOT_FOUND");

      const profile = parsed.data;
      await transaction
        .update(agents)
        .set({
          firstName: profile.firstName,
          lastName: profile.lastName === undefined ? undefined : profile.lastName || null,
          profession: profile.profession,
          avatarUrl: profile.avatarUrl,
          isActive: profile.isActive,
          updatedAt: new Date(),
        })
        .where(eq(agents.id, agentId));

      if (profile.availability && profile.availability.length > 0) {
        await transaction
          .insert(availabilityRules)
          .values(
            profile.availability.map((rule) => ({
              agentId,
              districtId: rule.districtId,
              dayOfWeek: rule.dayOfWeek,
              startsAt: rule.startsAt.length === 5 ? `${rule.startsAt}:00` : rule.startsAt,
              endsAt: rule.endsAt.length === 5 ? `${rule.endsAt}:00` : rule.endsAt,
              timezone: "America/Lima",
              isActive: rule.isActive,
            })),
          )
          .onConflictDoUpdate({
            target: [
              availabilityRules.agentId,
              availabilityRules.districtId,
              availabilityRules.dayOfWeek,
              availabilityRules.startsAt,
              availabilityRules.endsAt,
            ],
            set: { isActive: true, updatedAt: new Date() },
          });
      }

      if (profile.exception) {
        const startsAt = new Date(profile.exception.startsAt);
        const endsAt = new Date(profile.exception.endsAt);
        if (endsAt <= startsAt) throw new Error("INVALID_RANGE");
        await transaction.insert(scheduleExceptions).values({
          agentId,
          kind: "unavailable",
          startsAt,
          endsAt,
          reason: profile.exception.reason,
        });
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return apiError("No encontramos al agente.", 404, "NOT_FOUND");
    }
    if (error instanceof Error && error.message === "INVALID_RANGE") {
      return apiError("El bloqueo de fechas no es válido.", 422, "INVALID_REQUEST");
    }
    console.error("Admin agent update failed", error);
    return apiError("No pudimos actualizar el agente.", 500, "INTERNAL_ERROR");
  }
}
