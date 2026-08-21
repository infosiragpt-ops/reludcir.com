import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { authorizeCron } from "@/lib/cron";
import {
  processNextPaymentOperation,
  recoverStalePaymentOperations,
} from "@/lib/payment-operations";

const BATCH_SIZE = 10;

export async function POST(request: Request) {
  const unauthorized = authorizeCron(request);
  if (unauthorized) return unauthorized;

  try {
    const recovery = await recoverStalePaymentOperations();
    const outcomes: string[] = [];
    for (let index = 0; index < BATCH_SIZE; index += 1) {
      const result = await processNextPaymentOperation();
      if (result.outcome === "empty") break;
      outcomes.push(result.outcome);
    }
    return NextResponse.json({
      processed: outcomes.length,
      completed: outcomes.filter((outcome) => outcome === "completed").length,
      pending: outcomes.filter((outcome) => outcome === "pending").length,
      retrying: outcomes.filter((outcome) => outcome === "retrying").length,
      failed: outcomes.filter((outcome) => outcome === "failed").length,
      recovery,
    });
  } catch (error) {
    console.error("Payment operation processing failed", error);
    return apiError("No pudimos procesar las operaciones de pago.", 500, "INTERNAL_ERROR");
  }
}

export const GET = POST;
