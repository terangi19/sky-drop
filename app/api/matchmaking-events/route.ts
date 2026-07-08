import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "../../lib/firebase-admin";
import { isSameMarketplaceUser } from "../../lib/sky-ai-matchmaking";

function isSelfMatchRecord(data: {
  sourceListingSellerEmail?: string;
  matchedSellerEmail?: string;
}): boolean {
  return isSameMarketplaceUser(
    { email: data.sourceListingSellerEmail },
    { email: data.matchedSellerEmail },
  );
}

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

    // Fetch matchmaking events (sort in memory — avoids composite index)
    const matchesSnap = await db
      .collection("matches")
      .where("sourceListingSellerEmail", "==", userEmail)
      .limit(50)
      .get();

    const events: any[] = [];
    
    for (const doc of matchesSnap.docs) {
      const data = doc.data();
      if (isSelfMatchRecord(data)) continue;
      
      // Get listing details
      let listingTitle = "Unknown listing";
      let listingImage = "";
      
      try {
        const listingDoc = await db.collection("listings").doc(data.sourceListingId).get();
        if (listingDoc.exists) {
          const listingData = listingDoc.data() || {};
          listingTitle = listingData.title || "Unknown listing";
          listingImage = listingData.images?.[0] || listingData.imageUrl || listingData.image || "";
        }
      } catch (e) {
        console.error("Error fetching listing details:", e);
      }

      events.push({
        id: doc.id,
        type: data.sourceType === "wanted" ? "match_found" : "match_received",
        listingId: data.sourceListingId,
        listingTitle,
        listingImage,
        matchedWith: data.matchedListingId,
        matchedWithEmail: data.matchedSellerEmail,
        timestamp: data.timestamp?.toMillis?.() || Date.now(),
        keyword: data.keyword,
      });
    }

    // Also fetch matches where user is the matched seller
    const receivedMatchesSnap = await db
      .collection("matches")
      .where("matchedSellerEmail", "==", userEmail)
      .limit(50)
      .get();

    for (const doc of receivedMatchesSnap.docs) {
      const data = doc.data();
      if (isSelfMatchRecord(data)) continue;
      
      // Skip if already added
      if (events.find(e => e.id === doc.id)) continue;

      let listingTitle = "Unknown listing";
      let listingImage = "";
      
      try {
        const listingDoc = await db.collection("listings").doc(data.sourceListingId).get();
        if (listingDoc.exists) {
          const listingData = listingDoc.data() || {};
          listingTitle = listingData.title || "Unknown listing";
          listingImage = listingData.images?.[0] || listingData.imageUrl || listingData.image || "";
        }
      } catch (e) {
        console.error("Error fetching listing details:", e);
      }

      events.push({
        id: doc.id,
        type: "match_sent",
        listingId: data.sourceListingId,
        listingTitle,
        listingImage,
        matchedWith: data.matchedListingId,
        matchedWithEmail: data.sourceListingSellerEmail,
        timestamp: data.timestamp?.toMillis?.() || Date.now(),
        keyword: data.keyword,
      });
    }

    // Sort by timestamp and limit
    const sortedEvents = events
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 20);

    // Calculate unread count (events from last 24 hours)
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const unreadCount = sortedEvents.filter(e => e.timestamp > oneDayAgo).length;

    return NextResponse.json({ events: sortedEvents, unreadCount });
  } catch (e: any) {
    console.error("Error fetching matchmaking events:", e);
    return NextResponse.json({ error: "Failed to fetch matchmaking events" }, { status: 500 });
  }
}
