import { apiError } from "@/lib/api";

export function authorizeCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return apiError("Tarea programada no configurada.", 503, "NOT_CONFIGURED");
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return apiError("No autorizado.", 401, "UNAUTHORIZED");
  }
  return null;
}
