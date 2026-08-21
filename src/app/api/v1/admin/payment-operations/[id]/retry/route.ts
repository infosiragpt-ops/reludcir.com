import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/db";
import { paymentOperations } from "@/db/schema";
import { apiError } from "@/lib/api";
import { getAuthenticatedUser } from "@/lib/auth";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getAuthenticatedUser();
  if (!user || !["admin", "support"].includes(user.role)) {
    return apiError("No autorizado.", 403, "FORBIDDEN");
  }

  const { id } = await context.params;
  const operationId = Number(id);
  if (!Number.isSafeInteger(operationId) || operationId <= 0) {
    return apiError("Operación no válida.", 422, "INVALID_INPUT");
  }

  try {
    const operation = await getDb().transaction(async (transaction) => {
      const [failedOperation] = await transaction
        .select()
        .from(paymentOperations)
        .where(
          and(
            eq(paymentOperations.id, operationId),
            eq(paymentOperations.status, "failed"),
            ne(paymentOperations.source, "manual"),
          ),
        )
        .limit(1)
        .for("update");
      if (!failedOperation) return null;

      const providerStatus = failedOperation.metadata.providerRefundStatus;
      const terminalProviderFailure =
        ["failed", "canceled", "cancelled"].includes(
          typeof providerStatus === "string" ? providerStatus : "",
        ) || failedOperation.lastError?.startsWith("Stripe devolvió estado ");
      const previousHistory = Array.isArray(
        failedOperation.metadata.providerOperationHistory,
      )
        ? failedOperation.metadata.providerOperationHistory.filter(
            (value): value is string => typeof value === "string",
          )
        : [];
      const retryGeneration =
        typeof failedOperation.metadata.retryGeneration === "number" &&
        Number.isSafeInteger(failedOperation.metadata.retryGeneration)
          ? failedOperation.metadata.retryGeneration
          : 0;

      const [updated] = await transaction
        .update(paymentOperations)
        .set({
          status: "pending",
          attempts: 0,
          availableAt: new Date(),
          lockedAt: null,
          lastError: null,
          providerOperationId: terminalProviderFailure
            ? null
            : failedOperation.providerOperationId,
          metadata: terminalProviderFailure
            ? {
                ...failedOperation.metadata,
                providerOperationHistory: failedOperation.providerOperationId
                  ? [...previousHistory, failedOperation.providerOperationId]
                  : previousHistory,
                providerRefundStatus: null,
                retryGeneration: retryGeneration + 1,
              }
            : failedOperation.metadata,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(paymentOperations.id, failedOperation.id),
            eq(paymentOperations.status, "failed"),
          ),
        )
        .returning({ id: paymentOperations.id, status: paymentOperations.status });
      return updated ?? null;
    });

    if (!operation) {
      return apiError(
        "La operación no existe o no admite reintento automático.",
        409,
        "INVALID_STATUS",
      );
    }
    return NextResponse.json({ operation });
  } catch (error) {
    console.error("Payment operation retry failed", error);
    return apiError("No pudimos reactivar el reembolso.", 500, "INTERNAL_ERROR");
  }
}
