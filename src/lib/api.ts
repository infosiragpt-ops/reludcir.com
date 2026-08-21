import { NextResponse } from "next/server";

export function apiError(message: string, status = 400, code = "BAD_REQUEST") {
  return NextResponse.json({ error: { code, message } }, { status });
}

export function postgresErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return undefined;
  }

  return typeof error.code === "string" ? error.code : undefined;
}

export function normalizeEmail(email: string) {
  return email.trim().toLocaleLowerCase("en-US");
}

export function normalizePeruvianPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("51") && digits.length === 11) {
    return `+${digits}`;
  }
  if (digits.length === 9) {
    return `+51${digits}`;
  }
  return phone.trim();
}
