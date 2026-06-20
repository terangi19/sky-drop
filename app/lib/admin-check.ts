export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const emailLower = email.toLowerCase();
  
  // Hardcoded admin emails as fallback
  const hardcodedAdmins = ["rangitr16@gmail.com"];
  
  if (typeof process !== "undefined" && process.env?.ADMIN_EMAILS) {
    return process.env.ADMIN_EMAILS.split(",")
      .map(e => e.trim().toLowerCase())
      .includes(emailLower) || hardcodedAdmins.includes(emailLower);
  }
  
  return hardcodedAdmins.includes(emailLower);
}
