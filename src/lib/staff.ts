export function isAdmin(role: string | null | undefined) {
  return role === "admin";
}

export function isPrivilegedStaff(role: string | null | undefined) {
  return role === "admin" || role === "support";
}

export type AdminSection =
  | "bookings"
  | "agents"
  | "customers"
  | "payments"
  | "catalog"
  | "calendar"
  | "staff";

export function canAccessAdminSection(
  role: string | null | undefined,
  section: AdminSection,
) {
  if (section === "payments") return isPrivilegedStaff(role);
  return isAdmin(role);
}

export function staffAuthorization(
  user: { role: string } | null | undefined,
  access: "staff" | "admin",
) {
  if (!user) {
    return { status: 401 as const, code: "UNAUTHENTICATED" as const };
  }
  if (access === "staff" && !isPrivilegedStaff(user.role)) {
    return { status: 403 as const, code: "FORBIDDEN" as const };
  }
  if (access === "admin" && !isAdmin(user.role)) {
    return { status: 403 as const, code: "FORBIDDEN" as const };
  }
  return null;
}

export function canListAdminBookings(role: string | null | undefined) {
  return isAdmin(role);
}
