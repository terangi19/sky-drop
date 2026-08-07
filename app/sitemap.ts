import { getAdminDb, isAdminInitialized } from "./lib/firebase-admin";

const BASE_URL = process.env.NEXT_PUBLIC_URL || "https://skydrop.co.nz";

export const dynamic = "force-dynamic";

const NON_PUBLIC = new Set([
  "draft",
  "deleted",
  "hidden",
  "flagged",
  "pending_review",
  "removed",
  "archived",
]);

/**
 * Static marketing + category URLs plus public live listings for SEO.
 * Messaging-first product: /buyer-protection = Stay Safe; /payments soft-blocks to how-to-buy copy.
 */
export default async function sitemap() {
  const staticPages = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "daily" as const, priority: 1 },
    { url: `${BASE_URL}/search`, lastModified: new Date(), changeFrequency: "daily" as const, priority: 0.9 },
    { url: `${BASE_URL}/trade-feed`, lastModified: new Date(), changeFrequency: "hourly" as const, priority: 0.9 },
    { url: `${BASE_URL}/about`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.3 },
    { url: `${BASE_URL}/faqs`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.3 },
    { url: `${BASE_URL}/buyer-protection`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.4 },
    { url: `${BASE_URL}/seller-guidelines`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.4 },
    { url: `${BASE_URL}/payments`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.3 },
    { url: `${BASE_URL}/terms`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.1 },
    { url: `${BASE_URL}/privacy`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.1 },
    { url: `${BASE_URL}/digital`, lastModified: new Date(), changeFrequency: "daily" as const, priority: 0.6 },
    { url: `${BASE_URL}/services`, lastModified: new Date(), changeFrequency: "daily" as const, priority: 0.6 },
    { url: `${BASE_URL}/rentals`, lastModified: new Date(), changeFrequency: "daily" as const, priority: 0.6 },
    { url: `${BASE_URL}/vehicles`, lastModified: new Date(), changeFrequency: "daily" as const, priority: 0.6 },
    { url: `${BASE_URL}/property`, lastModified: new Date(), changeFrequency: "daily" as const, priority: 0.6 },
    { url: `${BASE_URL}/events`, lastModified: new Date(), changeFrequency: "daily" as const, priority: 0.6 },
    { url: `${BASE_URL}/jobs`, lastModified: new Date(), changeFrequency: "daily" as const, priority: 0.6 },
  ];

  const listingPages: {
    url: string;
    lastModified: Date;
    changeFrequency: "daily";
    priority: number;
  }[] = [];

  if (isAdminInitialized()) {
    try {
      const snap = await getAdminDb()
        .collection("listings")
        .orderBy("createdAt", "desc")
        .limit(5000)
        .get();

      for (const doc of snap.docs) {
        const data = doc.data() as Record<string, unknown>;
        const status = String(data.status || "active").toLowerCase();
        if (NON_PUBLIC.has(status)) continue;
        if (data.hidden === true || data.isDraft === true) continue;
        if (data.isDemo === true) continue;

        let lastModified = new Date();
        const createdAt = data.createdAt as { toDate?: () => Date; seconds?: number } | undefined;
        if (createdAt?.toDate) lastModified = createdAt.toDate();
        else if (typeof createdAt?.seconds === "number") lastModified = new Date(createdAt.seconds * 1000);
        const updatedAt = data.updatedAt as { toDate?: () => Date; seconds?: number } | undefined;
        if (updatedAt?.toDate) lastModified = updatedAt.toDate();
        else if (typeof updatedAt?.seconds === "number") lastModified = new Date(updatedAt.seconds * 1000);

        listingPages.push({
          url: `${BASE_URL}/post/listing/${doc.id}`,
          lastModified,
          changeFrequency: "daily",
          priority: 0.7,
        });
      }
    } catch (e) {
      console.error("[sitemap] Failed to enumerate listings:", e);
    }
  }

  return [...staticPages, ...listingPages];
}
