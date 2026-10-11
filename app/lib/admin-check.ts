/** Warn about a missing ADMIN_EMAILS at most once per server process (not per call / per render). */
let warnedAdminEmailsUnset = false;

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const emailLower = email.toLowerCase();

  // No hardcoded fallback — ADMIN_EMAILS must be set in environment.
  // If unset, no one is an admin (logged in dev/staging below).
  if (typeof process === "undefined" || !process.env?.ADMIN_EMAILS) {
    // ADMIN_EMAILS is a server-only env var: it is never inlined into the browser bundle, so in the
    // browser it is always "unset" and the answer is always false. That is expected, not a
    // misconfiguration, so stay quiet there (this used to log on every call in every logged-in
    // page). On the server, warn once. The return value is unchanged either way.
    if (
      typeof window === "undefined" &&
      typeof process !== "undefined" &&
      process.env?.NODE_ENV === "production" &&
      !warnedAdminEmailsUnset
    ) {
      warnedAdminEmailsUnset = true;
      console.warn("[admin-check] ADMIN_EMAILS is not set — no admin access granted");
    }
    return false;
  }

  return process.env.ADMIN_EMAILS.split(",")
    .map(e => e.trim().toLowerCase())
    .includes(emailLower);
}
