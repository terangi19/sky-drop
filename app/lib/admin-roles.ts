export type AdminRole = "super_admin" | "admin" | "moderator" | "support";

function getSuperAdminEmails(): string[] {
  if (typeof process !== "undefined" && process.env?.SUPER_ADMIN_EMAILS) {
    return process.env.SUPER_ADMIN_EMAILS.split(",").map(e => e.trim().toLowerCase());
  }
  if (typeof process !== "undefined" && process.env?.ADMIN_EMAILS) {
    const first = process.env.ADMIN_EMAILS.split(",")[0]?.trim().toLowerCase();
    return first ? [first] : [];
  }
  return [];
}

export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  return getSuperAdminEmails().includes(email.toLowerCase());
}

export function defaultRoleForEmail(email: string): AdminRole {
  return isSuperAdminEmail(email) ? "super_admin" : "admin";
}
