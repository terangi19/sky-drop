import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "../../lib/firebase-admin";
import { isSameMarketplaceUser } from "../../lib/sky-ai-matchmaking";

export async function GET(req: NextRequest) {
  try {
    const auth = getAuth(getAdminApp());
    const db = getFirestore(getAdminApp());

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    const decoded = await auth.verifyIdToken(token);
    const userEmail = decoded.email;

    if (!userEmail) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's watchlist and viewed listings to understand preferences
    const userDoc = await db.collection("profiles").doc(decoded.uid).get();
    const userData = userDoc.data();
    const watchlist = userData?.watchlist || [];
    const viewedListings = userData?.recentlyViewed || [];

    // Extract keywords from user's activity
    const keywords: string[] = [];
    
    // Get titles from watchlist
    for (const listingId of watchlist.slice(0, 20)) {
      try {
        const listingDoc = await db.collection("listings").doc(listingId).get();
        if (listingDoc.exists) {
          const data = listingDoc.data() || {};
          if (data.title) {
            const words = data.title.split(/\s+/);
            keywords.push(...words.filter((w: string) => w.length > 3));
          }
        }
      } catch (e) {
        console.error("Error fetching watchlist listing:", e);
      }
    }

    // Get titles from viewed listings
    for (const viewed of viewedListings.slice(0, 20)) {
      if (viewed.title) {
        const words = viewed.title.split(/\s+/);
        keywords.push(...words.filter((w: string) => w.length > 3));
      }
    }

    // Count keyword frequency to find top interests
    const keywordCount = new Map<string, number>();
    keywords.forEach(k => {
      const lower = k.toLowerCase();
      keywordCount.set(lower, (keywordCount.get(lower) || 0) + 1);
    });

    const topKeywords = Array.from(keywordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([k]) => k);

    if (topKeywords.length === 0) {
      return NextResponse.json({ matches: [] });
    }

    // Search for listings matching user's interests
    const matches: any[] = [];
    const seen = new Set<string>();
    const keywordSet = new Set(topKeywords);

    // Fetch recent active listings
    const listingsSnap = await db
      .collection("listings")
      .where("status", "==", "live")
      .where("type", "in", ["physical", "vehicle", "service", "rental", "digital"])
      .limit(100)
      .get();

    for (const doc of listingsSnap.docs) {
      const data = doc.data();
      const listingId = doc.id;

      // Skip user's own listings and already viewed/watched
      if (
        isSameMarketplaceUser(
          { email: data.sellerEmail, sellerId: data.sellerId },
          { email: userEmail, sellerId: decoded.uid },
        )
      ) {
        continue;
      }
      if (watchlist.includes(listingId)) continue;
      if (viewedListings.some((v: any) => v.id === listingId)) continue;
      if (seen.has(listingId)) continue;

      // Calculate match score based on keyword matches
      const titleLower = (data.title || "").toLowerCase();
      const descriptionLower = (data.description || "").toLowerCase();
      
      let matchScore = 0;
      let matchedKeywords: string[] = [];

      for (const keyword of keywordSet) {
        if (titleLower.includes(keyword) || descriptionLower.includes(keyword)) {
          matchScore += keywordCount.get(keyword) || 1;
          matchedKeywords.push(keyword);
        }
      }

      if (matchScore > 0) {
        seen.add(listingId);
        const normalizedScore = Math.min(Math.round((matchScore / 10) * 100), 95);
        
        matches.push({
          id: listingId,
          title: data.title,
          price: data.price,
          imageUrl: data.images?.[0] || data.imageUrl || data.image,
          matchReason: `Matches your interest in: ${matchedKeywords.slice(0, 2).join(", ")}`,
          matchScore: normalizedScore,
          createdAt: data.createdAt,
          type: data.type,
        });
      }
    }

    // Sort by match score and return top matches
    const sortedMatches = matches
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 10);

    return NextResponse.json({ matches: sortedMatches });
  } catch (e: any) {
    console.error("Error fetching radar matches:", e);
    return NextResponse.json({ error: "Failed to fetch radar matches" }, { status: 500 });
  }
}
