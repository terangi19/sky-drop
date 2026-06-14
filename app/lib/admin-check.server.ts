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

export async function syncAdminCustomClaim(uid: string, email: string): Promise<void> {
  try {
    const { getAdminAuth } = await import("./firebase-admin");
    const isAdmin = await isAdminUser(email, uid);
    await getAdminAuth().setCustomUserClaims(uid, { admin: isAdmin });
  } catch (e) {
    console.warn("[admin-check] Custom claim sync failed:", e);
  }
}
