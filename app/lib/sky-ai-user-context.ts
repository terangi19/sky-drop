import { getAdminDb, isAdminInitialized } from "./firebase-admin";

export type SkyAiUserContext = {
  activeListings: number;
  totalSales: number;
  avgRating: number | null;
  reviewCount: number;
  memberSince: string | null;
  verified: boolean;
};

/** Load lightweight user stats for Āwhina's system prompt (best-effort, never blocks chat) */
export async function loadUserContext(uid: string): Promise<SkyAiUserContext | null> {
  try {
    if (!isAdminInitialized()) return null;
    const db = getAdminDb();

    const userDoc = await db.collection("users").doc(uid).get();
    if (!userDoc.exists) return null;
    const user = userDoc.data() || {};

    const listingsSnap = await db
      .collection("listings")
      .where("sellerId", "==", uid)
      .where("status", "==", "active")
      .count()
      .get();

    const salesSnap = await db
      .collection("orders")
      .where("sellerId", "==", uid)
      .where("status", "in", ["confirmed", "shipped", "delivered"])
      .count()
      .get();

    const reviewsSnap = await db
      .collection("reviews")
      .where("sellerId", "==", uid)
      .get();

    let avgRating: number | null = null;
    const reviewCount = reviewsSnap.size;
    if (reviewCount > 0) {
      const total = reviewsSnap.docs.reduce((sum, doc) => {
        const r = doc.data().rating;
        return sum + (typeof r === "number" ? r : 0);
      }, 0);
      avgRating = Math.round((total / reviewCount) * 10) / 10;
    }

    const createdAt = user.createdAt?.toDate?.() ?? null;
    const memberSince = createdAt
      ? createdAt.toLocaleDateString("en-NZ", { month: "short", year: "numeric" })
      : null;

    return {
      activeListings: listingsSnap.data().count,
      totalSales: salesSnap.data().count,
      avgRating,
      reviewCount,
      memberSince,
      verified: !!user.phoneVerified || !!user.verified,
    };
  } catch (e) {
    console.warn("sky-ai: user context load failed (non-fatal):", e);
    return null;
  }
}

/** One-line summary for the system prompt */
export function formatUserContextLine(ctx: SkyAiUserContext): string {
  const parts: string[] = [];
  parts.push(`${ctx.activeListings} active listing${ctx.activeListings !== 1 ? "s" : ""}`);
  parts.push(`${ctx.totalSales} sale${ctx.totalSales !== 1 ? "s" : ""}`);
  if (ctx.avgRating !== null) {
    parts.push(`★ ${ctx.avgRating} (${ctx.reviewCount} review${ctx.reviewCount !== 1 ? "s" : ""})`);
  }
  if (ctx.memberSince) parts.push(`member since ${ctx.memberSince}`);
  if (ctx.verified) parts.push("verified");
  return parts.join(", ");
}
