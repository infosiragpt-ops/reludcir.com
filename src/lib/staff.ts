export function isPrivilegedStaff(role: string | null | undefined) {
  return role === "admin" || role === "support";
}
