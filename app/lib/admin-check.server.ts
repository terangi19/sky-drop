import { getAdminDb } from "./firebase-admin";
import { isAdminEmail } from "./admin-check";

export async function isAdminUser(email?: string | null, uid?: string): Promise<boolean> {
  if (!email) return false;
  const normalized = email.toLowerCase();
  if (isAdminEmail(normalized)) return true;

  try {
    const db = getAdminDb();
    const rolesSnap = await db.collection("config").doc("adminRoles").get();
    if (rolesSnap.exists) {
      const admins = rolesSnap.data()?.admins as Array<{ email?: string }> | undefined;
      if (admins?.some((a) => String(a.email || "").toLowerCase() === normalized)) {
        return true;
      }
    }

    if (uid) {
      const legacy = await db.collection("admin-users").doc(uid).get();
      if (legacy.exists && legacy.data()?.role === "admin") return true;
    }
  } catch (e) {
    console.warn("[admin-check] Firestore admin lookup failed:", e);
  }

  return false;
}

/** Decoded ID token fields the admin checks need (verifyIdToken result or firebase-admin DecodedIdToken). */
export type AdminTokenLike = {
  uid?: string | null;
  email?: string | null;
  email_verified?: boolean | null;
};

/**
 * PROMPT-14: an email only proves identity once Firebase has verified it. Anyone can create an
 * email/password account for an address nobody has registered yet (e.g. a newly added admin, or an
 * ADMIN_EMAILS entry that signs in with Google later), so email-based admin lists must only match
 * verified emails. Returns the lower-cased email when verified, otherwise null.
 */
export function verifiedTokenEmail(token: AdminTokenLike | null | undefined): string | null {
  if (!token || token.email_verified !== true) return null;
  const email = typeof token.email === "string" ? token.email.trim().toLowerCase() : "";
  return email || null;
}

/** Legacy uid-keyed admin record (admin-users/{uid}.role == "admin"). A uid cannot be claimed by someone else. */
export async function isLegacyUidAdmin(uid?: string | null): Promise<boolean> {
  if (!uid) return false;
  try {
    const legacy = await getAdminDb().collection("admin-users").doc(uid).get();
    return legacy.exists && legacy.data()?.role === "admin";
  } catch (e) {
    console.warn("[admin-check] Firestore admin lookup failed:", e);
    return false;
  }
}

/**
 * Server-side admin decision for a verified ID token. Fails closed:
 * - email lists (ADMIN_EMAILS, config/adminRoles) only for a verified email;
 * - otherwise only the uid-keyed legacy record.
 */
export async function isAdminToken(token: AdminTokenLike | null | undefined): Promise<boolean> {
  if (!token) return false;
  const email = verifiedTokenEmail(token);
  if (email) return isAdminUser(email, token.uid || undefined);
  return isLegacyUidAdmin(token.uid);
}

/** Sync variant for routes that only consult ADMIN_EMAILS (isAdminEmail). Verified emails only. */
export function isAdminEmailToken(token: AdminTokenLike | null | undefined): boolean {
  return isAdminEmail(verifiedTokenEmail(token));
}

export async function syncAdminCustomClaim(uid: string, email: string): Promise<void> {
  try {
    const { getAdminAuth } = await import("./firebase-admin");
    const isAdmin = await isAdminUser(email, uid);
    await getAdminAuth().setCustomUserClaims(uid, { admin: isAdmin });
  } catch (e) {
    console.warn("[admin-check] Custom claim sync failed:", e);
  }
}
