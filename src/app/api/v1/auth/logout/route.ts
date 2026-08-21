import { NextResponse } from "next/server";

import { apiError } from "@/lib/api";
import { destroySession } from "@/lib/auth";

export async function POST() {
  try {
    await destroySession();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Logout failed", error);
    return apiError("No pudimos cerrar la sesión.", 500, "INTERNAL_ERROR");
  }
}
