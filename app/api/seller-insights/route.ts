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
    const insights: any[] = [];

    let totalViews = 0;
    let totalSaves = 0;
    const categoryCount = new Map<string, number>();

    // Analyze each listing for improvement opportunities
    for (const listing of listings) {
      totalViews += (listing.views as number) || 0;
      totalSaves += (listing.saves as number) || 0;
      
      const category = (listing.type as string) || "other";
      categoryCount.set(category, (categoryCount.get(category) || 0) + 1);

      // Check for missing images
      if (!(listing.images as string[]) || (listing.images as string[]).length < 4) {
        insights.push({
          type: "images",
          listingId: listing.id,
          listingTitle: listing.title as string,
          recommendation: "Add more images (4+) to increase visibility by 3x",
          impact: "high",
          estimatedImprovement: "+200% saves",
        });
      }

      // Check for missing or short description
      if (!(listing.description as string) || (listing.description as string).length < 100) {
        insights.push({
          type: "description",
          listingId: listing.id,
          listingTitle: listing.title as string,
          recommendation: "Add a detailed description with keywords to improve search visibility",
          impact: "medium",
          estimatedImprovement: "+50% views",
        });
      }

      // Check price competitiveness (simple heuristic)
      const price = Number(listing.price as string);
      if (price > 0) {
        const sameCategoryListings = listings.filter(l => (l.type as string) === (listing.type as string) && l.id !== listing.id);
        if (sameCategoryListings.length > 2) {
          const avgPrice = sameCategoryListings.reduce((sum, l) => sum + (Number(l.price as string) || 0), 0) / sameCategoryListings.length;
          if (price > avgPrice * 1.3) {
            insights.push({
              type: "price",
              listingId: listing.id,
              listingTitle: listing.title as string,
              recommendation: `Price is ${Math.round((price / avgPrice - 1) * 100)}% above average. Consider lowering to compete better`,
              impact: "high",
              estimatedImprovement: "+80% faster sale",
            });
          }
        }
      }

      // Check title quality
      if ((listing.title as string) && (listing.title as string).length < 20) {
        insights.push({
          type: "title",
          listingId: listing.id,
          listingTitle: listing.title as string,
          recommendation: "Add more detail to your title to help buyers find your listing",
          impact: "medium",
          estimatedImprovement: "+30% views",
        });
      }
    }

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

    // Sort insights by impact
    const impactOrder = { high: 0, medium: 1, low: 2 };
    insights.sort((a, b) => impactOrder[a.impact] - impactOrder[b.impact]);

    return NextResponse.json({ insights, stats });
  } catch (e: any) {
    console.error("Error fetching seller insights:", e);
    return NextResponse.json({ error: "Failed to fetch seller insights" }, { status: 500 });
  }
}
