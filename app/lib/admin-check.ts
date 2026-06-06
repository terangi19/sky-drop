export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const adminEmails = typeof process !== "undefined" ? process.env?.ADMIN_EMAILS : undefined;
  if (!adminEmails) return false;
  return adminEmails.split(",").map(e => e.trim().toLowerCase()).includes(email.toLowerCase());
}
