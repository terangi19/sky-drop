import { getAdminDb } from "./firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

interface MatchmakingListing {
  id: string;
  title?: string;
  description?: string;
  category?: string;
  type?: string;
  price?: string;
  sellerEmail?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  images?: string[];
  imageUrl?: string;
  [key: string]: unknown;
}

const MIN_KEYWORD_LENGTH = 3;

/** Extract meaningful search keywords from a listing. */
function extractKeywords(listing: MatchmakingListing): string[] {
  const words = new Set<string>();

  const sources = [
    listing.title,
    listing.description,
    listing.category,
    listing.vehicleMake,
    listing.vehicleModel,
  ];

  for (const source of sources) {
    if (!source) continue;
    const tokens = String(source)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .split(/\s+/)
      .filter((w) => w.length >= MIN_KEYWORD_LENGTH);

    for (const token of tokens) {
      words.add(token);
    }
  }

  // Add vehicle combinations for better matching
  if (listing.vehicleMake && listing.vehicleModel) {
    words.add(`${listing.vehicleMake} ${listing.vehicleModel}`);
    words.add(listing.vehicleModel);
  }

  return [...words];
}

/** Search active listings matching given keywords, excluding a seller email. */
async function searchMatchingListings(
  keywords: string[],
  excludeEmail: string,
): Promise<MatchmakingListing[]> {
  const db = getAdminDb();
  const matched = new Map<string, MatchmakingListing>();
  const seen = new Set<string>();

  try {
    // Fetch all active listings of relevant types (no composite index needed for single where clause)
    const snap = await db
      .collection("listings")
      .where("type", "in", ["physical", "vehicle", "service", "rental", "digital"])
      .where("status", "==", "live")
      .limit(100)
      .get();

    const keywordSet = new Set(keywords.map(k => k.toLowerCase()));

    for (const doc of snap.docs) {
      const data = doc.data() as MatchmakingListing;
      if (data.sellerEmail === excludeEmail) continue;
      if (data.status === "sold") continue;
      if (seen.has(doc.id)) continue;

      // Check if title contains any keyword
      const titleLower = (data.title || "").toLowerCase();
      const descriptionLower = (data.description || "").toLowerCase();
      const hasMatch = Array.from(keywordSet).some(keyword => 
        titleLower.includes(keyword) || descriptionLower.includes(keyword)
      );

      if (hasMatch) {
        seen.add(doc.id);
        matched.set(doc.id, { id: doc.id, ...data });
      }
    }
  } catch (e) {
    console.error("[matchmaking] Failed to search listings:", e);
  }

  return [...matched.values()].slice(0, 10);
}

/** Search wanted posts matching given keywords, excluding the poster. */
async function searchMatchingWanted(
  keywords: string[],
  excludeEmail: string,
): Promise<MatchmakingListing[]> {
  const db = getAdminDb();
  const matched = new Map<string, MatchmakingListing>();
  const seen = new Set<string>();

  try {
    // Fetch all wanted posts (no composite index needed for single where clause)
    const snap = await db
      .collection("listings")
      .where("type", "==", "wanted")
      .where("status", "==", "live")
      .limit(100)
      .get();

    const keywordSet = new Set(keywords.map(k => k.toLowerCase()));

    for (const doc of snap.docs) {
      const data = doc.data() as MatchmakingListing;
      if (data.sellerEmail === excludeEmail) continue;
      if (data.status === "sold") continue;
      if (seen.has(doc.id)) continue;

      // Check if title contains any keyword
      const titleLower = (data.title || "").toLowerCase();
      const descriptionLower = (data.description || "").toLowerCase();
      const hasMatch = Array.from(keywordSet).some(keyword => 
        titleLower.includes(keyword) || descriptionLower.includes(keyword)
      );

      if (hasMatch) {
        seen.add(doc.id);
        matched.set(doc.id, { id: doc.id, ...data });
      }
    }
  } catch (e) {
    console.error("[matchmaking] Failed to search wanted posts:", e);
  }

  return [...matched.values()].slice(0, 10);
}

/** Send a match notification via Admin SDK Firestore write. */
async function sendMatchNotification(input: {
  targetEmail: string;
  fromEmail: string;
  type: string;
  title: string;
  message: string;
  listingId?: string;
  listingTitle?: string;
  listingImage?: string;
}): Promise<void> {
  const db = getAdminDb();
  try {
    await db.collection("notifications").add({
      type: input.type,
      targetEmail: input.targetEmail,
      fromEmail: input.fromEmail,
      title: input.title,
      message: input.message,
      listingId: input.listingId || null,
      listingTitle: input.listingTitle || null,
      listingImage: input.listingImage || null,
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error("[matchmaking] Failed to send notification:", e);
  }
}

/** Log a match for debugging. */
async function logMatch(match: {
  sourceListingId: string;
  sourceType: string;
  matchedListingId: string;
  matchedSellerEmail: string;
  keyword: string;
}): Promise<void> {
  try {
    const db = getAdminDb();
    await db.collection("matchmakingLogs").add({
      ...match,
      createdAt: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.error("[matchmaking] Failed to log match:", e);
  }
}

/**
 * Run matchmaking for a newly created listing.
 *
 * If the listing is "wanted", find matching active listings and notify sellers.
 * If the listing is any other type, find matching wanted posts and notify those buyers.
 */
export async function runMatchmaking(listing: MatchmakingListing): Promise<void> {
  if (!listing.id || !listing.sellerEmail) {
    console.error("[matchmaking] Missing required fields: id or sellerEmail");
    return;
  }
  if (!listing.title) {
    console.error("[matchmaking] Missing title for listing:", listing.id);
    return;
  }

  const keywords = extractKeywords(listing);
  if (keywords.length === 0) {
    console.warn("[matchmaking] No keywords extracted for listing:", listing.id);
    return;
  }

  console.log(`[matchmaking] Listing ${listing.id} (${listing.type}): keywords=${keywords.join(", ")}`);

  if (listing.type === "wanted") {
    // Wanted → find matching active listings
    console.log("[matchmaking] Searching for matching active listings for wanted post:", listing.id);
    const matches = await searchMatchingListings(keywords, listing.sellerEmail);
    console.log(`[matchmaking] Found ${matches.length} matching listings for wanted post ${listing.id}`);

    for (const match of matches) {
      console.log("[matchmaking] Sending notification to seller:", match.sellerEmail, "for listing:", match.id);
      await sendMatchNotification({
        targetEmail: match.sellerEmail || "",
        fromEmail: "system@skydrop.co.nz",
        type: "matchmaking",
        title: "New Wanted Request Match",
        message: `New wanted request may match your listing: ${listing.title}`,
        listingId: listing.id,
        listingTitle: listing.title,
        listingImage: (listing.images?.[0] as string) || listing.imageUrl || "",
      });

      await logMatch({
        sourceListingId: listing.id,
        sourceType: "wanted",
        matchedListingId: match.id,
        matchedSellerEmail: match.sellerEmail || "",
        keyword: keywords[0],
      });
    }
  } else {
    // Regular listing → find matching wanted posts
    console.log("[matchmaking] Searching for matching wanted posts for listing:", listing.id);
    const matches = await searchMatchingWanted(keywords, listing.sellerEmail);
    console.log(`[matchmaking] Found ${matches.length} matching wanted posts for listing ${listing.id}`);

    for (const match of matches) {
      console.log("[matchmaking] Sending notification to buyer:", match.sellerEmail, "for wanted post:", match.id);
      await sendMatchNotification({
        targetEmail: match.sellerEmail || "",
        fromEmail: "system@skydrop.co.nz",
        type: "matchmaking",
        title: "New Listing Match",
        message: `New listing may match your wanted request: ${listing.title}`,
        listingId: listing.id,
        listingTitle: listing.title,
        listingImage: (listing.images?.[0] as string) || listing.imageUrl || "",
      });

      await logMatch({
        sourceListingId: listing.id,
        sourceType: listing.type || "unknown",
        matchedListingId: match.id,
        matchedSellerEmail: match.sellerEmail || "",
        keyword: keywords[0],
      });
    }
  }
}
