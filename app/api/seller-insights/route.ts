import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "../../lib/firebase-admin";

export async function GET(req: NextRequest) {
  try {
    console.log('[Seller Insights API] Request received');
    const auth = getAuth(getAdminApp());
    const db = getFirestore(getAdminApp());

    const authHeader = req.headers.get("authorization");
    console.log('[Seller Insights API] Auth header:', authHeader ? 'present' : 'missing');
    if (!authHeader?.startsWith("Bearer ")) {
      console.error('[Seller Insights API] Invalid auth header format');
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "");
    console.log('[Seller Insights API] Verifying token...');
    const decoded = await auth.verifyIdToken(token);
    const userEmail = decoded.email;
    console.log('[Seller Insights API] User email:', userEmail);

    if (!userEmail) {
      console.error('[Seller Insights API] No email in decoded token');
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch all user listings (both seller and wanted)
    console.log('[Seller Insights API] Fetching listings for seller:', userEmail);
    const listingsSnap = await db
      .collection("listings")
      .where("sellerEmail", "==", userEmail)
      .get();

    console.log('[Seller Insights API] Total listings count:', listingsSnap.docs.length);
    const allListings = listingsSnap.docs.map(doc => {
      const data = doc.data() as any;
      // Normalize type field — trim whitespace/newlines that may have been saved by Firebase Console
      if (typeof data.type === 'string') data.type = data.type.trim();
      return { id: doc.id, ...data };
    });
    
    // Log specific problematic listings for audit
    const problematicIds = [
      "VrU6tTAxNRJVJvAPbZ42", // "Wanted: BMW 335i"
      "Uq99yYW6QnK00WZcPtTM", // "Bmw chrome rims" 1
      "mkP7sEixMcXpQ4PnWqPG", // "Bmw chrome rims" 2
      "sL0VHPsUy78ywXEuQHcm", // "Bmw chrome rims" 3
    ];
    
    console.log('[Seller Insights API] Audit - Checking problematic listings:');
    for (const id of problematicIds) {
      const listing = allListings.find(l => l.id === id);
      if (listing) {
        console.log('[Seller Insights API] Listing found:', {
          listingId: listing.id,
          title: listing.title,
          type: listing.type,
          status: listing.status,
          sellerEmail: listing.sellerEmail,
          updatedAt: listing.updatedAt?.toMillis?.() || listing.createdAt?.toMillis?.() || null,
        });
      } else {
        console.log('[Seller Insights API] Listing NOT found:', id);
      }
    }
    
    // Separate seller and wanted listings (type already normalized above)
    const sellerListings = allListings.filter(l => l.type !== "wanted");
    const wantedListings = allListings.filter(l => l.type === "wanted");
    
    console.log('[Seller Insights API] Seller listings:', sellerListings.length, 'Wanted listings:', wantedListings.length);
    
    // Generate insights separately for each type
    const sellerInsights = generateSellerInsights(sellerListings);
    const wantedInsights = generateWantedInsights(wantedListings);
    
    const allInsights = [...sellerInsights, ...wantedInsights];
    
    // Sort by impact and confidence
    const impactOrder: Record<"high" | "medium" | "low", number> = { high: 0, medium: 1, low: 2 };
    allInsights.sort((a, b) => {
      const aImpact = a.impact as keyof typeof impactOrder;
      const bImpact = b.impact as keyof typeof impactOrder;
      if (aImpact !== bImpact) return impactOrder[aImpact] - impactOrder[bImpact];
      return (b.confidence || 0) - (a.confidence || 0);
    });

    // Limit to top 5 insights
    const limitedInsights = allInsights.slice(0, 5);

    // Get seller stats from profile
    const profileDoc = await db.collection("profiles").doc(decoded.uid).get();
    const profileData = profileDoc.data();
    
    const averageResponseTime = profileData?.averageResponseTime || 0;
    const totalSales = profileData?.totalSales || 0;

    // Calculate stats for seller listings only
    let totalViews = 0;
    let totalSaves = 0;
    const categoryCount = new Map<string, number>();

    for (const listing of sellerListings) {
      totalViews += (listing.views as number) || 0;
      totalSaves += (listing.saves as number) || 0;
      const category = (listing.type as string) || "other";
      categoryCount.set(category, (categoryCount.get(category) || 0) + 1);
    }

    const saveRate = totalViews > 0 ? Math.round((totalSaves / totalViews) * 100) : 0;

    let topPerformingCategory = "N/A";
    let maxCount = 0;
    for (const [cat, count] of categoryCount.entries()) {
      if (count > maxCount) {
        maxCount = count;
        topPerformingCategory = cat;
      }
    }

    const stats = {
      totalListings: sellerListings.length,
      totalViews,
      totalSaves,
      averageResponseTime,
      saveRate,
      topPerformingCategory,
    };

    return NextResponse.json({ insights: limitedInsights, stats });
  } catch (e: any) {
    console.error("Error fetching seller insights:", e);
    return NextResponse.json({ error: "Failed to fetch seller insights" }, { status: 500 });
  }
}

// Priority order for seller insight types — lower index = higher priority
const SELLER_INSIGHT_PRIORITY = [
  "views-no-messages",
  "watchers-no-messages",
  "messages-no-sale",
  "old-listing",
  "shipping-disabled",
  "offers-disabled",
  "description",
  "images",
];

function sellerInsightPriority(type: string): number {
  const idx = SELLER_INSIGHT_PRIORITY.indexOf(type);
  return idx === -1 ? SELLER_INSIGHT_PRIORITY.length : idx;
}

function generateSellerInsights(listings: any[]): any[] {
  const candidates: any[] = [];

  console.log('[Seller Insights Engine] Processing', listings.length, 'seller listings');

  for (const listing of listings) {
    console.log('[Seller Insights Engine] Processing listing:', {
      listingId: listing.id,
      title: listing.title,
      type: listing.type,
      isWanted: listing.type === "wanted",
      recommendationEngine: "seller"
    });

    const views    = (listing.views    as number) || 0;
    const watchers = (listing.watchers as number) || 0;
    const messages = (listing.messages as number) || 0;
    const createdAt = listing.createdAt?.toMillis?.() || Date.now();
    const days = Math.floor((Date.now() - createdAt) / (1000 * 60 * 60 * 24));
    const isPhysical = listing.type === "physical";
    const hasShipping = !!(listing.shippingAvailable || listing.freeShipping);
    const hasOffers = !!(listing.acceptOffers);
    const imageCount = Array.isArray(listing.images) ? listing.images.length : 0;
    const descLen = typeof listing.description === "string" ? listing.description.length : 0;

    const listingInsights: any[] = [];

    // 1. High views but no messages — strongest signal
    if (views >= 10 && messages === 0) {
      listingInsights.push({
        type: "views-no-messages",
        listingId: listing.id,
        listingTitle: listing.title as string,
        recommendation: `This listing has ${views} views but no messages yet. Try adding more photos or adjusting the price to encourage enquiries.`,
        impact: "high",
        confidence: 90,
      });
    }

    // 2. Watchers but no messages — high intent, no contact
    if (watchers >= 3 && messages === 0) {
      listingInsights.push({
        type: "watchers-no-messages",
        listingId: listing.id,
        listingTitle: listing.title as string,
        recommendation: `${watchers} people have saved this listing but haven't reached out. A small price reduction or more detail in the description may prompt them to message.`,
        impact: "high",
        confidence: 85,
      });
    }

    // 3. Messages but no sale — conversion problem
    if (messages >= 3 && listing.status === "live") {
      listingInsights.push({
        type: "messages-no-sale",
        listingId: listing.id,
        listingTitle: listing.title as string,
        recommendation: `${messages} buyers have enquired but the listing is still active. Consider following up with interested buyers or adjusting your asking price.`,
        impact: "high",
        confidence: 80,
      });
    }

    // 4. Old listing — stale inventory
    if (days > 21 && listing.status === "live") {
      listingInsights.push({
        type: "old-listing",
        listingId: listing.id,
        listingTitle: listing.title as string,
        recommendation: `This listing has been active for ${days} days. Refreshing the photos or dropping the price slightly can bring it back to the top of search results.`,
        impact: "medium",
        confidence: 75,
      });
    }

    // 5. Shipping disabled for physical items
    if (isPhysical && !hasShipping) {
      listingInsights.push({
        type: "shipping-disabled",
        listingId: listing.id,
        listingTitle: listing.title as string,
        recommendation: "This listing is pickup-only. Enabling shipping makes it visible to buyers outside your local area.",
        impact: "medium",
        confidence: 75,
      });
    }

    // 6. Offers disabled
    if (!hasOffers) {
      listingInsights.push({
        type: "offers-disabled",
        listingId: listing.id,
        listingTitle: listing.title as string,
        recommendation: "Accepting offers gives buyers a way to engage without committing to the full price, which often leads to more conversations.",
        impact: "medium",
        confidence: 68,
      });
    }

    // 7. Short description
    if (descLen < 80) {
      listingInsights.push({
        type: "description",
        listingId: listing.id,
        listingTitle: listing.title as string,
        recommendation: "Your description is quite short. Adding more detail — condition, history, what's included — helps buyers feel confident enough to message.",
        impact: "medium",
        confidence: 70,
      });
    }

    // 8. Few images
    if (imageCount < 3) {
      listingInsights.push({
        type: "images",
        listingId: listing.id,
        listingTitle: listing.title as string,
        recommendation: `You have ${imageCount === 0 ? "no" : "only " + imageCount} photo${imageCount === 1 ? "" : "s"}. Adding more clear photos helps buyers see what they're getting.`,
        impact: imageCount === 0 ? "high" : "low",
        confidence: imageCount === 0 ? 90 : 60,
      });
    }

    // Select highest-priority insight for this listing
    if (listingInsights.length > 0) {
      listingInsights.sort((a, b) => sellerInsightPriority(a.type) - sellerInsightPriority(b.type));
      const best = listingInsights[0];
      console.log('[Seller Insights Engine] Adding insight for listing:', listing.id, 'Type:', best.type);
      candidates.push(best);
    }
  }

  // Sort all candidates by priority, return top 5
  candidates.sort((a, b) => sellerInsightPriority(a.type) - sellerInsightPriority(b.type));
  const results = candidates.slice(0, 5);
  console.log('[Seller Insights Engine] Generated', results.length, 'insights from seller listings');
  return results;
}

// Priority order for wanted insight types — lower index = higher priority
const WANTED_INSIGHT_PRIORITY = [
  "wanted-old",
  "wanted-no-responses",
  "wanted-photos",
  "wanted-location",
  "wanted-condition",
  "wanted-budget",
  "wanted-timeline",
];

function wantedInsightPriority(type: string): number {
  const idx = WANTED_INSIGHT_PRIORITY.indexOf(type);
  return idx === -1 ? WANTED_INSIGHT_PRIORITY.length : idx;
}

function generateWantedInsights(listings: any[]): any[] {
  const candidates: any[] = [];

  console.log('[Wanted Insights Engine] Processing', listings.length, 'wanted listings');

  // Group by normalised title — show one insight per unique item being searched
  const titleGroups = new Map<string, any[]>();
  for (const listing of listings) {
    const key = listing.title.toLowerCase().trim();
    if (!titleGroups.has(key)) titleGroups.set(key, []);
    titleGroups.get(key)!.push(listing);
  }

  console.log('[Wanted Insights Engine] Grouped', listings.length, 'listings into', titleGroups.size, 'unique titles');

  for (const [normalizedTitle, groupListings] of titleGroups.entries()) {
    // Representative listing = most recent in group
    const listing = groupListings.sort((a, b) => {
      const aTime = a.createdAt?.toMillis?.() || 0;
      const bTime = b.createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    })[0];

    console.log('[Wanted Insights Engine] Processing title group:', {
      normalizedTitle,
      groupSize: groupListings.length,
      selectedListingId: listing.id,
    });

    const createdAt = listing.createdAt?.toMillis?.() || Date.now();
    const days = Math.floor((Date.now() - createdAt) / (1000 * 60 * 60 * 24));
    const messages = (listing.messages as number) || 0;
    const imageCount = Array.isArray(listing.images) ? listing.images.length : 0;
    const price = Number(listing.price as string) || 0;

    const listingInsights: any[] = [];

    // 1. Old with no responses — strongest signal
    if (days > 14 && messages === 0) {
      listingInsights.push({
        type: "wanted-old",
        listingId: listing.id,
        listingTitle: listing.title as string,
        recommendation: `This wanted post has been active for ${days} days with no responses. Increasing your budget or adding more detail may attract more sellers.`,
        impact: "high",
        confidence: 85,
      });
    }

    // 2. Has responses but no match yet
    if (messages >= 2 && listing.status === "live") {
      listingInsights.push({
        type: "wanted-no-responses",
        listingId: listing.id,
        listingTitle: listing.title as string,
        recommendation: `${messages} sellers have responded but you haven't found a match yet. Consider expanding your budget or relaxing your condition requirements.`,
        impact: "high",
        confidence: 80,
      });
    }

    // 3. No reference photos
    if (imageCount === 0) {
      listingInsights.push({
        type: "wanted-photos",
        listingId: listing.id,
        listingTitle: listing.title as string,
        recommendation: "Reference photos help potential sellers understand the style or condition you're after. Adding one or two images can lead to much more relevant responses.",
        impact: "high",
        confidence: 85,
      });
    }

    // 4. No location set
    if (!listing.location) {
      listingInsights.push({
        type: "wanted-location",
        listingId: listing.id,
        listingTitle: listing.title as string,
        recommendation: "Adding your preferred location helps nearby sellers find your post. Without it, you may miss local matches.",
        impact: "medium",
        confidence: 78,
      });
    }

    // 5. No condition preference
    if (!listing.condition) {
      listingInsights.push({
        type: "wanted-condition",
        listingId: listing.id,
        listingTitle: listing.title as string,
        recommendation: "Specifying your preferred condition — New, Like New, or Good — helps sellers know whether their item is a good fit before reaching out.",
        impact: "medium",
        confidence: 75,
      });
    }

    // 6. Budget present but possibly low (flag only when no responses after 7+ days)
    if (price > 0 && days > 7 && messages === 0) {
      listingInsights.push({
        type: "wanted-budget",
        listingId: listing.id,
        listingTitle: listing.title as string,
        recommendation: `Your budget is $${price} and this post hasn't received any responses yet. Increasing your budget may attract more sellers.`,
        impact: "medium",
        confidence: 70,
      });
    }

    // 7. No buying timeframe
    if (!listing.timeline) {
      listingInsights.push({
        type: "wanted-timeline",
        listingId: listing.id,
        listingTitle: listing.title as string,
        recommendation: "Let sellers know your buying timeframe — whether you need it urgently or are happy to wait — so they can prioritise responding.",
        impact: "low",
        confidence: 65,
      });
    }

    if (listingInsights.length > 0) {
      listingInsights.sort((a, b) => wantedInsightPriority(a.type) - wantedInsightPriority(b.type));
      const best = listingInsights[0];
      if (groupListings.length > 1) {
        best.groupSize = groupListings.length;
        best.groupListingIds = groupListings.map((l: any) => l.id);
      }
      console.log('[Wanted Insights Engine] Adding insight for title group:', normalizedTitle, 'Type:', best.type, 'Group size:', groupListings.length);
      candidates.push(best);
    }
  }

  // Sort by priority, cap at 5
  candidates.sort((a, b) => wantedInsightPriority(a.type) - wantedInsightPriority(b.type));
  const results = candidates.slice(0, 5);
  console.log('[Wanted Insights Engine] Generated', results.length, 'insights from', titleGroups.size, 'unique title groups');
  return results;
}
