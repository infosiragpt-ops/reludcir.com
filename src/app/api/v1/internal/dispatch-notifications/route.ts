import { and, asc, eq, lt, lte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { notificationOutbox } from "@/db/schema";
import { apiError } from "@/lib/api";
import { authorizeCron } from "@/lib/cron";
import { deliverNotification } from "@/lib/notifications";

const BATCH_SIZE = 20;

export async function POST(request: Request) {
  const unauthorized = authorizeCron(request);
  if (unauthorized) return unauthorized;

  try {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - 10 * 60 * 1_000);
    await getDb()
      .update(notificationOutbox)
      .set({
        status: "failed",
        lockedAt: null,
        lastError: "Worker agotó sus reintentos.",
      })
      .where(
        and(
          eq(notificationOutbox.status, "processing"),
          lt(notificationOutbox.lockedAt, staleBefore),
          sql`${notificationOutbox.attempts} >= ${notificationOutbox.maxAttempts}`,
        ),
      );
    await getDb()
      .update(notificationOutbox)
      .set({ status: "pending", lockedAt: null })
      .where(
        and(
          eq(notificationOutbox.status, "processing"),
          lt(notificationOutbox.lockedAt, staleBefore),
          sql`${notificationOutbox.attempts} < ${notificationOutbox.maxAttempts}`,
        ),
      );

    let sent = 0;
    let failed = 0;
    for (let index = 0; index < BATCH_SIZE; index += 1) {
      const job = await getDb().transaction(async (transaction) => {
        const [candidate] = await transaction
          .select()
          .from(notificationOutbox)
          .where(
            and(
              eq(notificationOutbox.status, "pending"),
              lte(notificationOutbox.availableAt, now),
              sql`${notificationOutbox.attempts} < ${notificationOutbox.maxAttempts}`,
            ),
          )
          .orderBy(asc(notificationOutbox.availableAt), asc(notificationOutbox.id))
          .limit(1)
          .for("update", { skipLocked: true });
        if (!candidate) return null;

        const [claimed] = await transaction
          .update(notificationOutbox)
          .set({
            status: "processing",
            lockedAt: now,
            attempts: sql`${notificationOutbox.attempts} + 1`,
          })
          .where(
            and(
              eq(notificationOutbox.id, candidate.id),
              eq(notificationOutbox.status, "pending"),
            ),
          )
          .returning();
        return claimed ?? null;
      });

      if (!job) break;
      const delivery = await deliverNotification({
        channel: job.channel,
        templateKey: job.templateKey,
        recipient: job.recipient,
        payload: job.payload,
      });
      if (delivery.sent) {
        await getDb()
          .update(notificationOutbox)
          .set({ status: "sent", sentAt: new Date(), lockedAt: null, lastError: null })
          .where(eq(notificationOutbox.id, job.id));
        sent += 1;
      } else {
        const exhausted =
          delivery.reason === "not_configured" || job.attempts >= job.maxAttempts;
        await getDb()
          .update(notificationOutbox)
          .set({
            status: exhausted ? "failed" : "pending",
            lockedAt: null,
            lastError: delivery.reason,
            availableAt: new Date(Date.now() + Math.min(60, 2 ** job.attempts) * 60 * 1_000),
          })
          .where(eq(notificationOutbox.id, job.id));
        failed += 1;
      }
    }

    return NextResponse.json({ sent, failed });
  } catch (error) {
    console.error("Notification dispatch failed", error);
    return apiError("No pudimos despachar las notificaciones.", 500, "INTERNAL_ERROR");
  }
}

export const GET = POST;
