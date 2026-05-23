import { getDocs, collection, query, orderBy, limit } from "firebase/firestore";
import { db } from "./lib/firebase";

const BASE_URL = "https://skydrop.nz";

export const dynamic = "force-dynamic";

export default async function sitemap() {
  const staticPages = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "daily" as const, priority: 1 },
    { url: `${BASE_URL}/trade-feed`, lastModified: new Date(), changeFrequency: "hourly" as const, priority: 0.9 },
    { url: `${BASE_URL}/about`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.3 },
    { url: `${BASE_URL}/faqs`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.3 },
    { url: `${BASE_URL}/terms`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.1 },
    { url: `${BASE_URL}/privacy`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.1 },
  ];

  try {
    const snap = await getDocs(query(collection(db, "listings"), orderBy("createdAt", "desc"), limit(1000)));
    const listingPages = snap.docs.map((d) => ({
      url: `${BASE_URL}/post/listing/${d.id}`,
      lastModified: d.data().createdAt?.toDate?.() || new Date(),
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));
    return [...staticPages, ...listingPages];
  } catch {
    return staticPages;
  }
}
