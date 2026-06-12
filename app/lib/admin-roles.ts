export type AdminRole = "super_admin" | "admin" | "moderator" | "support";

export const SUPER_ADMIN_EMAILS = ["rangitr16@gmail.com"];

export function isSuperAdminEmail(email?: string | null): boolean {
  return !!email && SUPER_ADMIN_EMAILS.includes(email.toLowerCase());
}

export function defaultRoleForEmail(email: string): AdminRole {
  return isSuperAdminEmail(email) ? "super_admin" : "admin";
}
