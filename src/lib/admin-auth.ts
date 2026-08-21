import { apiError } from "@/lib/api";
import { getAuthenticatedUser, type AuthenticatedUser } from "@/lib/auth";
import { staffAuthorization } from "@/lib/staff";

export async function requireStaff(): Promise<
  { user: AuthenticatedUser; error: null } | { user: null; error: Response }
> {
  const user = await getAuthenticatedUser();
  const denied = staffAuthorization(user, "staff");
  if (denied) {
    return {
      user: null,
      error: apiError(
        denied.status === 401
          ? "Inicia sesión para continuar."
          : "No autorizado.",
        denied.status,
        denied.code,
      ),
    };
  }
  return { user: user!, error: null };
}

export async function requireAdmin(): Promise<
  { user: AuthenticatedUser; error: null } | { user: null; error: Response }
> {
  const user = await getAuthenticatedUser();
  const denied = staffAuthorization(user, "admin");
  if (denied) {
    return {
      user: null,
      error: apiError(
        denied.status === 401
          ? "Inicia sesión para continuar."
          : "No autorizado.",
        denied.status,
        denied.code,
      ),
    };
  }
  return { user: user!, error: null };
}
