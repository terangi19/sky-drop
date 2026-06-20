import { getAdminDb } from "./firebase-admin";

export async function requireKycApproved(uid: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await getAdminDb().collection("profiles").doc(uid).get();
  if (!profile.exists || profile.data()?.kycStatus !== "approved") {
    return {
      ok: false,
      error: "Complete verification in Profile → Verification to start selling.",
    };
  }
  return { ok: true };
}

export async function requireKycOrNoSales(uid: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const db = getAdminDb();
  const profile = await db.collection("profiles").doc(uid).get();
  if (profile.exists && profile.data()?.kycStatus === "approved") {
    return { ok: true };
  }
  const salesCount = Number(profile.data()?.salesCount || 0);
  if (salesCount > 0) {
    return {
      ok: false,
      error: "Complete verification in Profile → Verification to continue selling after your first sale.",
    };
  }
  return { ok: true };
}
