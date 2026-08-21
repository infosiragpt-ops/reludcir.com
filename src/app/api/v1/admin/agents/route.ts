import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/db";
import { agents } from "@/db/schema";
import { requireAdmin } from "@/lib/admin-auth";
import { apiError } from "@/lib/api";

const createSchema = z.object({
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().max(80).optional().default(""),
  profession: z.string().trim().min(2).max(120).optional().default("Agente de Limpieza"),
  avatarUrl: z.string().trim().url().max(400).optional(),
  isActive: z.boolean().optional().default(true),
});

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  try {
    const rows = await getDb().select().from(agents).orderBy(asc(agents.id));
    return NextResponse.json({
      agents: rows.map((agent) => ({
        ...agent,
        name: [agent.firstName, agent.lastName].filter(Boolean).join(" "),
      })),
    });
  } catch (error) {
    console.error("Admin agents list failed", error);
    return apiError("No pudimos cargar el personal.", 500, "INTERNAL_ERROR");
  }
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("Completa el nombre del agente.", 422, "INVALID_REQUEST");
  }

  try {
    const baseSlug = slugify(`${parsed.data.firstName} ${parsed.data.lastName}`.trim()) || "agente";
    let slug = baseSlug;
    for (let attempt = 2; attempt < 20; attempt += 1) {
      const [existing] = await getDb()
        .select({ id: agents.id })
        .from(agents)
        .where(eq(agents.slug, slug))
        .limit(1);
      if (!existing) break;
      slug = `${baseSlug}-${attempt}`;
    }

    const [agent] = await getDb()
      .insert(agents)
      .values({
        slug,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName || null,
        profession: parsed.data.profession,
        avatarUrl: parsed.data.avatarUrl,
        isActive: parsed.data.isActive,
      })
      .returning();

    return NextResponse.json({ agent }, { status: 201 });
  } catch (error) {
    console.error("Admin agent create failed", error);
    return apiError("No pudimos crear el agente.", 500, "INTERNAL_ERROR");
  }
}
