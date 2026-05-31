const BASE_URL = process.env.NEXT_PUBLIC_URL || "https://skydrop.nz";

export const dynamic = "force-dynamic";

export default async function sitemap() {
  const staticPages = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "daily" as const, priority: 1 },
    { url: `${BASE_URL}/trade-feed`, lastModified: new Date(), changeFrequency: "hourly" as const, priority: 0.9 },
    { url: `${BASE_URL}/about`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.3 },
    { url: `${BASE_URL}/faqs`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.3 },
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

  try {
    const { initializeApp, getApps, cert } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");

    if (!getApps().length) {
      const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (sa) {
        initializeApp({ credential: cert(JSON.parse(sa)) });
      } else {
        initializeApp({ projectId: "sky-drop-de459" });
      }
    }

    const adminDb = getFirestore();
    const snap = await adminDb.collection("listings").orderBy("createdAt", "desc").limit(1000).get();
    const listingPages = snap.docs.map((d) => {
      const data = d.data();
      return {
        url: `${BASE_URL}/post/listing/${d.id}`,
        lastModified: data.createdAt?.toDate?.() || new Date(),
        changeFrequency: "weekly" as const,
        priority: 0.7,
      };
    });
    return [...staticPages, ...listingPages];
  } catch {
    return staticPages;
  }
}
