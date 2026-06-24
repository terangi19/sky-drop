import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "../../lib/firebase-admin";

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

    // Fetch seller's listings
    const listingsSnap = await db
      .collection("listings")
      .where("sellerEmail", "==", userEmail)
      .get();

    const listings = listingsSnap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
    const sellerInsights: any[] = [];
    const wantedInsights: any[] = [];

    let totalViews = 0;
    let totalSaves = 0;
    const categoryCount = new Map<string, number>();

    // Track used listing IDs to prevent duplicates (max one insight per listing)
    const usedSellerListingIds = new Set<string>();
    const usedWantedListingIds = new Set<string>();
    const usedSellerTypes = new Set<string>();
    const usedWantedTypes = new Set<string>();

    // Separate listings and wanted posts for different recommendation engines
    const regularListings = listings.filter(l => (l.type as string) !== "wanted");
    const wantedPosts = listings.filter(l => (l.type as string) === "wanted");

    // Analyze regular listings (seller-focused recommendations)
    for (const listing of regularListings) {
      totalViews += (listing.views as number) || 0;
      totalSaves += (listing.saves as number) || 0;
      
      const category = (listing.type as string) || "other";
      categoryCount.set(category, (categoryCount.get(category) || 0) + 1);

      const listingInsights: any[] = [];
      const createdAt = listing.createdAt?.toMillis?.() || Date.now();
      const daysSinceCreation = (Date.now() - createdAt) / (1000 * 60 * 60 * 24);
      const watchers = (listing.watchers as number) || 0;
      const messages = (listing.messages as number) || 0;

      // Check for watchers but no messages (high interest but no engagement)
      if (watchers >= 3 && messages === 0) {
        listingInsights.push({
          type: "watchers-no-messages",
          listingId: listing.id,
          listingTitle: listing.title as string,
          recommendation: `${watchers} people are watching but no one has messaged. Consider lowering your price or adding more details.`,
          impact: "high",
          confidence: 85,
        });
      }

      // Check for messages but no sale (engagement but no conversion)
      if (messages >= 3 && listing.status === "live") {
        listingInsights.push({
          type: "messages-no-sale",
          listingId: listing.id,
          listingTitle: listing.title as string,
          recommendation: `${messages} people have messaged but no sale yet. Consider offering a discount to active buyers.`,
          impact: "high",
          confidence: 80,
        });
      }

      // Check for old listings (stale inventory)
      if (daysSinceCreation > 21 && listing.status === "live") {
        listingInsights.push({
          type: "old-listing",
          listingId: listing.id,
          listingTitle: listing.title as string,
          recommendation: `This listing has been active for ${Math.floor(daysSinceCreation)} days. Refresh it with new photos or a price drop.`,
          impact: "medium",
          confidence: 75,
        });
      }

      // Check for missing images (reduced priority)
      if (!(listing.images as string[]) || (listing.images as string[]).length < 4) {
        listingInsights.push({
          type: "images",
          listingId: listing.id,
          listingTitle: listing.title as string,
          recommendation: "Add more images (4+) to increase visibility",
          impact: "low",
          confidence: 60,
        });
      }

      // Check for missing or short description
      if (!(listing.description as string) || (listing.description as string).length < 100) {
        listingInsights.push({
          type: "description",
          listingId: listing.id,
          listingTitle: listing.title as string,
          recommendation: "Add a detailed description with keywords to improve search visibility",
          impact: "medium",
          confidence: 70,
        });
      }

      // Check price competitiveness (simple heuristic)
      const price = Number(listing.price as string);
      if (price > 0) {
        const sameCategoryListings = regularListings.filter(l => (l.type as string) === (listing.type as string) && l.id !== listing.id && Number(l.price as string) > 0);
        if (sameCategoryListings.length > 2) {
          const avgPrice = sameCategoryListings.reduce((sum, l) => sum + (Number(l.price as string) || 0), 0) / sameCategoryListings.length;
          if (price > avgPrice * 1.3) {
            listingInsights.push({
              type: "price",
              listingId: listing.id,
              listingTitle: listing.title as string,
              recommendation: `Price is ${Math.round((price / avgPrice - 1) * 100)}% above average. Consider lowering to compete better`,
              impact: "high",
              confidence: 85,
            });
          } else if (price < avgPrice * 0.7) {
            listingInsights.push({
              type: "price-low",
              listingId: listing.id,
              listingTitle: listing.title as string,
              recommendation: "Your price is below market average. You could increase it to maximize profit.",
              impact: "medium",
              confidence: 75,
            });
          }
        }
      }

      // Check title quality
      if ((listing.title as string) && (listing.title as string).length < 20) {
        listingInsights.push({
          type: "title",
          listingId: listing.id,
          listingTitle: listing.title as string,
          recommendation: "Add more detail to your title to help buyers find your listing",
          impact: "medium",
          confidence: 65,
        });
      }

      // Check for missing offers enabled
      if (!listing.offersEnabled) {
        listingInsights.push({
          type: "offers",
          listingId: listing.id,
          listingTitle: listing.title as string,
          recommendation: "Enable offers to let buyers make price proposals. This increases engagement.",
          impact: "medium",
          confidence: 70,
        });
      }

      // Check for missing delivery options (for physical items)
      if (category === "physical" && !listing.deliveryAvailable) {
        listingInsights.push({
          type: "delivery",
          listingId: listing.id,
          listingTitle: listing.title as string,
          recommendation: "Add delivery options to reach buyers outside your area.",
          impact: "medium",
          confidence: 75,
        });
      }

      // Check category accuracy (basic heuristic)
      const title = (listing.title as string).toLowerCase();
      const desc = (listing.description as string).toLowerCase();
      const keywords = {
        "vehicle": ["car", "truck", "suv", "van", "motorcycle", "bike"],
        "rental": ["rent", "lease", "hire"],
        "service": ["service", "cleaning", "repair", "install", "consult"],
        "digital": ["digital", "download", "ebook", "course", "template"],
      };
      
      for (const [cat, words] of Object.entries(keywords)) {
        if (category !== cat && words.some(w => title.includes(w) || desc.includes(w))) {
          listingInsights.push({
            type: "category",
            listingId: listing.id,
            listingTitle: listing.title as string,
            recommendation: `Consider changing category to "${cat}" for better visibility.`,
            impact: "medium",
            confidence: 60,
          });
          break;
        }
      }

      // Only add the highest-impact insight for this listing (min confidence 65, max one per listing)
      if (listingInsights.length > 0 && !usedSellerListingIds.has(listing.id)) {
        const impactOrder = { high: 0, medium: 1, low: 2 };
        const sortedInsights = listingInsights.sort((a, b) => {
          if (a.impact !== b.impact) return impactOrder[a.impact] - impactOrder[b.impact];
          return (b.confidence || 0) - (a.confidence || 0);
        });

        const bestInsight = sortedInsights[0];
        if (bestInsight.confidence >= 65) {
          sellerInsights.push(bestInsight);
          usedSellerListingIds.add(listing.id);
          usedSellerTypes.add(bestInsight.type);
        }
      }
    }

    // Analyze wanted posts (buyer-focused recommendations)
    for (const wanted of wantedPosts) {
      totalViews += (wanted.views as number) || 0;
      totalSaves += (wanted.saves as number) || 0;

      const wantedPostInsights: any[] = [];
      const createdAt = wanted.createdAt?.toMillis?.() || Date.now();
      const daysSinceCreation = (Date.now() - createdAt) / (1000 * 60 * 60 * 24);
      const description = (wanted.description as string) || "";
      const budget = Number(wanted.price as string) || 0;

      // Check for short or missing description
      if (description.length < 50) {
        wantedPostInsights.push({
          type: "wanted-description",
          listingId: wanted.id,
          listingTitle: wanted.title as string,
          recommendation: "Add more details about what you're looking for (condition, location, timeline) to attract better responses.",
          impact: "high",
          confidence: 85,
        });
      }

      // Check for budget too low (no responses)
      if (budget > 0 && daysSinceCreation > 7) {
        wantedPostInsights.push({
          type: "wanted-budget",
          listingId: wanted.id,
          listingTitle: wanted.title as string,
          recommendation: "Your wanted post has been active for a week. Consider increasing your budget to attract more responses.",
          impact: "medium",
          confidence: 70,
        });
      }

      // Check for missing reference photos
      if (!(wanted.images as string[]) || (wanted.images as string[]).length === 0) {
        wantedPostInsights.push({
          type: "wanted-photos",
          listingId: wanted.id,
          listingTitle: wanted.title as string,
          recommendation: "Add reference photos to help sellers understand exactly what you're looking for.",
          impact: "medium",
          confidence: 75,
        });
      }

      // Check for old wanted post (stale)
      if (daysSinceCreation > 14 && wanted.status === "live") {
        wantedPostInsights.push({
          type: "wanted-old",
          listingId: wanted.id,
          listingTitle: wanted.title as string,
          recommendation: `This wanted post has been active for ${Math.floor(daysSinceCreation)} days. Refresh it with new details or expand your search criteria.`,
          impact: "medium",
          confidence: 70,
        });
      }

      // Check for location specificity
      if (!wanted.location || (wanted.location as string).length < 5) {
        wantedPostInsights.push({
          type: "wanted-location",
          listingId: wanted.id,
          listingTitle: wanted.title as string,
          recommendation: "Add your city or region to help local sellers find your wanted post.",
          impact: "medium",
          confidence: 65,
        });
      }

      // Only add the highest-impact insight for this wanted post (min confidence 65, max one per listing)
      if (wantedPostInsights.length > 0 && !usedWantedListingIds.has(wanted.id)) {
        const impactOrder = { high: 0, medium: 1, low: 2 };
        const sortedInsights = wantedPostInsights.sort((a, b) => {
          if (a.impact !== b.impact) return impactOrder[a.impact] - impactOrder[b.impact];
          return (b.confidence || 0) - (a.confidence || 0);
        });

        const bestInsight = sortedInsights[0];
        if (bestInsight.confidence >= 65) {
          wantedInsights.push(bestInsight);
          usedWantedListingIds.add(wanted.id);
          usedWantedTypes.add(bestInsight.type);
        }
      }
    }

    // Check for similar listings across all wanted posts (outside the loop to avoid async issues)
    if (wantedPosts.length > 0 && !usedWantedTypes.has("wanted-matches")) {
      try {
        const similarListings = await db
          .collection("listings")
          .where("type", "!=", "wanted")
          .where("status", "==", "live")
          .limit(20)
          .get();

        if (!similarListings.empty) {
          for (const wanted of wantedPosts) {
            if (usedWantedListingIds.has(wanted.id)) continue;

            const title = (wanted.title as string).toLowerCase();
            const matchingCount = similarListings.docs.filter(doc => {
              const data = doc.data();
              const listingTitle = (data.title as string).toLowerCase();
              return title.split(" ").some(word => word.length > 3 && listingTitle.includes(word));
            }).length;

            if (matchingCount >= 2) {
              wantedInsights.push({
                type: "wanted-matches",
                listingId: wanted.id,
                listingTitle: wanted.title as string,
                recommendation: `${matchingCount} similar listings have recently appeared. Browse them to find what you're looking for.`,
                impact: "high",
                confidence: 80,
              });
              usedWantedListingIds.add(wanted.id);
              usedWantedTypes.add("wanted-matches");
              break;
            }
          }
        }
      } catch (e) {
        console.error("Error fetching similar listings for wanted posts:", e);
      }
    }

    // Combine seller and wanted insights, but only return seller insights for Seller Insights endpoint
    // This ensures wanted post recommendations don't appear in the seller insights
    const allInsights = [...sellerInsights];

    // Sort insights by impact and confidence
    const impactOrder = { high: 0, medium: 1, low: 2 };
    allInsights.sort((a, b) => {
      if (a.impact !== b.impact) return impactOrder[a.impact] - impactOrder[b.impact];
      return (b.confidence || 0) - (a.confidence || 0);
    });

    // Limit to top 5 insights
    const limitedInsights = allInsights.slice(0, 5);

    // Get seller stats from profile
    const profileDoc = await db.collection("profiles").doc(decoded.uid).get();
    const profileData = profileDoc.data();
    
    const averageResponseTime = profileData?.averageResponseTime || 0;
    const totalSales = profileData?.totalSales || 0;

    // Calculate conversion rate (saves / views)
    const conversionRate = totalViews > 0 ? Math.round((totalSaves / totalViews) * 100) : 0;

    // Find top performing category
    let topPerformingCategory = "N/A";
    let maxCount = 0;
    for (const [cat, count] of categoryCount.entries()) {
      if (count > maxCount) {
        maxCount = count;
        topPerformingCategory = cat;
      }
    }

    const stats = {
      totalListings: listings.length,
      totalViews,
      totalSaves,
      averageResponseTime,
      conversionRate,
      topPerformingCategory,
    };

    return NextResponse.json({ insights: limitedInsights, stats });
  } catch (e: any) {
    console.error("Error fetching seller insights:", e);
    return NextResponse.json({ error: "Failed to fetch seller insights" }, { status: 500 });
  }
}
