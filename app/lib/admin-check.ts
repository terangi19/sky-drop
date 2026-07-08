export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const emailLower = email.toLowerCase();

  // No hardcoded fallback — ADMIN_EMAILS must be set in environment.
  // If unset, no one is an admin (logged in dev/staging below).
  if (typeof process === "undefined" || !process.env?.ADMIN_EMAILS) {
    if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") {
      console.warn("[admin-check] ADMIN_EMAILS is not set — no admin access granted");
    }
    return false;
  }

  return process.env.ADMIN_EMAILS.split(",")
    .map(e => e.trim().toLowerCase())
    .includes(emailLower);
}
