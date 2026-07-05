import { getAdminDb } from "./firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import {
  extractMatchKeywords,
  isWantedListingMatch,
  type MatchmakingListingLike,
} from "./wanted-listing-match";

interface MatchmakingListing extends MatchmakingListingLike {
  id: string;
  sellerEmail?: string;
  sellerId?: string;
  status?: string;
  images?: string[];
  imageUrl?: string;
}

interface MatchmakingOwner {
  email?: string;
  sellerId?: string;
}

export function normalizeMarketplaceEmail(email: string | undefined | null): string {
  return String(email || "").trim().toLowerCase();
}

/** True when two listings belong to the same marketplace user. */
export function isSameMarketplaceUser(
  a: MatchmakingOwner,
  b: MatchmakingOwner,
): boolean {
  const emailA = normalizeMarketplaceEmail(a.email);
  const emailB = normalizeMarketplaceEmail(b.email);
  if (emailA && emailB && emailA === emailB) return true;

  const idA = String(a.sellerId || "").trim();
  const idB = String(b.sellerId || "").trim();
  if (idA && idB && idA === idB) return true;

  return false;
}

/** Search active listings matching a wanted post. */
async function searchMatchingListings(
  wanted: MatchmakingListing,
  exclude: MatchmakingOwner,
): Promise<MatchmakingListing[]> {
  const db = getAdminDb();
  const matched = new Map<string, MatchmakingListing>();

  try {
    const snap = await db
      .collection("listings")
      .where("type", "in", ["physical", "vehicle", "service", "rental", "digital"])
      .where("status", "==", "live")
      .limit(100)
      .get();

    for (const doc of snap.docs) {
      const data = doc.data() as MatchmakingListing;
      if (isSameMarketplaceUser(data, exclude)) continue;
      if (data.status === "sold") continue;

      const listing = { id: doc.id, ...data };
      if (isWantedListingMatch(wanted, listing)) {
        matched.set(doc.id, listing);
      }
    }
  } catch (e) {
    console.error("[matchmaking] Failed to search listings:", e);
  }

  return [...matched.values()].slice(0, 10);
}

/** Search wanted posts matching a supply listing. */
async function searchMatchingWanted(
  listing: MatchmakingListing,
  exclude: MatchmakingOwner,
): Promise<MatchmakingListing[]> {
  const db = getAdminDb();
  const matched = new Map<string, MatchmakingListing>();

  try {
    const snap = await db
      .collection("listings")
      .where("type", "==", "wanted")
      .where("status", "==", "live")
      .limit(100)
      .get();

    for (const doc of snap.docs) {
      const data = doc.data() as MatchmakingListing;
      if (isSameMarketplaceUser(data, exclude)) continue;
      if (data.status === "sold") continue;

      const wanted = { id: doc.id, ...data, type: "wanted" };
      if (isWantedListingMatch(wanted, listing)) {
        matched.set(doc.id, wanted);
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

/** Log a match for the activity feed and admin dashboard. */
async function logMatch(match: {
  sourceListingId: string;
  sourceListingSellerEmail: string;
  sourceType: string;
  matchedListingId: string;
  matchedSellerEmail: string;
  keyword: string;
}): Promise<void> {
  const db = getAdminDb();
  const payload = {
    ...match,
    timestamp: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  };
  try {
    await db.collection("matches").add(payload);
  } catch (e) {
    console.error("[matchmaking] Failed to log match:", e);
  }
  try {
    await db.collection("matchmakingLogs").add(payload);
  } catch (e) {
    console.error("[matchmaking] Failed to log matchmakingLogs:", e);
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

  const keywords = extractMatchKeywords(listing);
  if (keywords.length === 0) {
    console.warn("[matchmaking] No keywords extracted for listing:", listing.id);
    return;
  }

  console.log(`[matchmaking] Listing ${listing.id} (${listing.type}): keywords=${keywords.join(", ")}`);

  const owner: MatchmakingOwner = {
    email: listing.sellerEmail,
    sellerId: String(listing.sellerId || ""),
  };

  if (listing.type === "wanted") {
    const wanted = { ...listing, type: "wanted" as const };
    console.log("[matchmaking] Searching for matching active listings for wanted post:", listing.id);
    const matches = await searchMatchingListings(wanted, owner);
    console.log(`[matchmaking] Found ${matches.length} matching listings for wanted post ${listing.id}`);

    for (const match of matches) {
      if (isSameMarketplaceUser(match, owner)) continue;

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
        sourceListingSellerEmail: listing.sellerEmail,
        sourceType: "wanted",
        matchedListingId: match.id,
        matchedSellerEmail: match.sellerEmail || "",
        keyword: keywords[0],
      });
    }
  } else {
    console.log("[matchmaking] Searching for matching wanted posts for listing:", listing.id);
    const matches = await searchMatchingWanted(listing, owner);
    console.log(`[matchmaking] Found ${matches.length} matching wanted posts for listing ${listing.id}`);

    for (const match of matches) {
      if (isSameMarketplaceUser(match, owner)) continue;

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
        sourceListingSellerEmail: listing.sellerEmail,
        sourceType: listing.type || "unknown",
        matchedListingId: match.id,
        matchedSellerEmail: match.sellerEmail || "",
        keyword: keywords[0],
      });
    }
  }
}
