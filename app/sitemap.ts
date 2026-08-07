const BASE_URL = process.env.NEXT_PUBLIC_URL || "https://skydrop.co.nz";

export const dynamic = "force-dynamic";

/**
 * Static marketing + category URLs for SEO.
 * Messaging-first product: /buyer-protection = Stay Safe; /payments soft-blocks to how-to-buy copy.
 * Known debt: individual listing URLs are not enumerated here (would need Firestore query).
 */
export default async function sitemap() {
  const staticPages = [
    { url: BASE_URL, lastModified: new Date(), changeFrequency: "daily" as const, priority: 1 },
    { url: `${BASE_URL}/search`, lastModified: new Date(), changeFrequency: "daily" as const, priority: 0.9 },
    { url: `${BASE_URL}/trade-feed`, lastModified: new Date(), changeFrequency: "hourly" as const, priority: 0.9 },
    { url: `${BASE_URL}/about`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.3 },
    { url: `${BASE_URL}/faqs`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.3 },
    // Stay Safe (messaging-first safety guidance — not escrow / buyer-protection claims)
    { url: `${BASE_URL}/buyer-protection`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.4 },
    { url: `${BASE_URL}/seller-guidelines`, lastModified: new Date(), changeFrequency: "monthly" as const, priority: 0.4 },
    // How to buy — messaging-first; card checkout UI gated when disabled
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

  return staticPages;
}
