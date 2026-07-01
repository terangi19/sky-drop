const BASE_URL = process.env.NEXT_PUBLIC_URL || "https://skydrop.co.nz";

export const dynamic = "force-dynamic";

export async function GET() {
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
    const snap = await adminDb.collection("listings")
      .where("status", "==", "live")
      .orderBy("createdAt", "desc")
      .limit(50)
      .get();

    const items = snap.docs.map((d) => {
      const data = d.data();
      const title = data.title || "Untitled";
      const description = (data.description || "").slice(0, 200);
      const price = data.price ? `$${data.price}` : "Price on request";
      const category = data.category || "Other";
      const image = data.imageUrl || data.image || "";
      const createdAt = data.createdAt?.toDate?.() || new Date();
      
      return `    <item>
      <title>${title} - ${price}</title>
      <description>${description} - ${category}</description>
      <link>${BASE_URL}/post/listing/${d.id}</link>
      <guid isPermaLink="false">${d.id}</guid>
      <pubDate>${createdAt.toUTCString()}</pubDate>
      ${image ? `<enclosure url="${image}" type="image/jpeg" />` : ""}
    </item>`;
    }).join("\n");

    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Sky Drop NZ - Latest Listings</title>
    <description>New Zealand's community marketplace - latest listings</description>
    <link>${BASE_URL}</link>
    <atom:link href="${BASE_URL}/rss.xml" rel="self" type="application/rss+xml"/>
    <language>en-nz</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

    return new Response(feed, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch {
    // Return basic feed if Firestore fails
    const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Sky Drop NZ - Latest Listings</title>
    <description>New Zealand's community marketplace</description>
    <link>${BASE_URL}</link>
    <atom:link href="${BASE_URL}/rss.xml" rel="self" type="application/rss+xml"/>
    <language>en-nz</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  </channel>
</rss>`;

    return new Response(feed, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  }
}
