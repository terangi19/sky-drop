export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  if (typeof process !== "undefined" && process.env?.ADMIN_EMAILS) {
    return process.env.ADMIN_EMAILS.split(",")
      .map(e => e.trim().toLowerCase())
      .includes(email.toLowerCase());
  }
  return false;
}
