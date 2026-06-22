import { NextRequest, NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "../../lib/firebase-admin";

export async function POST(req: NextRequest) {
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

    const body = await req.json();
    const { currentPrice, originalPrice, listingTitle, listingId, conversationPartner } = body;

    const suggestions: any[] = [];

    // Calculate price difference percentage
    const priceDiff = originalPrice - currentPrice;
    const priceDiffPercent = (priceDiff / originalPrice) * 100;

    // Analyze the negotiation context
    if (priceDiffPercent > 30) {
      // Large discount - suggest it might be too aggressive
      suggestions.push({
        type: "price_suggestion",
        message: "The current offer is significantly below the original price",
        reasoning: "A 30%+ discount may be too aggressive. Consider meeting in the middle.",
        suggestedPrice: originalPrice - (originalPrice * 0.15),
        confidence: 75,
      });
    } else if (priceDiffPercent > 15 && priceDiffPercent <= 30) {
      // Moderate discount - reasonable negotiation
      suggestions.push({
        type: "deal_insight",
        message: "This is a reasonable negotiation range",
        reasoning: "A 15-30% discount is typical for marketplace negotiations.",
        confidence: 85,
      });
    } else if (priceDiffPercent <= 15) {
      // Small discount - close to original price
      suggestions.push({
        type: "counter_offer",
        message: "The offer is close to the original price",
        reasoning: "Consider accepting or making a small counter-offer to close the deal quickly.",
        suggestedPrice: currentPrice + (priceDiff * 0.5),
        confidence: 90,
      });
    }

    // Check if similar listings have sold for comparison
    try {
      const similarListings = await db
        .collection("listings")
        .where("type", "==", "physical")
        .where("status", "==", "sold")
        .limit(10)
        .get();

      if (!similarListings.empty) {
        const prices = similarListings.docs
          .map(doc => Number(doc.data().price) || 0)
          .filter(p => p > 0);

        if (prices.length > 0) {
          const avgPrice = prices.reduce((sum, p) => sum + p, 0) / prices.length;
          const priceRange = Math.max(...prices) - Math.min(...prices);

          if (currentPrice < avgPrice * 0.8) {
            suggestions.push({
              type: "price_suggestion",
              message: "Similar items have sold for higher prices",
              reasoning: `Average sale price for similar items is $${avgPrice.toFixed(2)}. You might be able to get a better deal.`,
              suggestedPrice: avgPrice * 0.9,
              confidence: 70,
            });
          } else if (currentPrice > avgPrice * 1.2) {
            suggestions.push({
              type: "deal_insight",
              message: "Current price is above market average",
              reasoning: `Similar items typically sell for around $${avgPrice.toFixed(2)}. This might be a fair price.`,
              confidence: 80,
            });
          }
        }
      }
    } catch (e) {
      console.error("Error fetching similar listings:", e);
    }

    // Check listing age for urgency
    try {
      const listingDoc = await db.collection("listings").doc(listingId).get();
      if (listingDoc.exists) {
        const data = listingDoc.data();
        const createdAt = data.createdAt?.toMillis?.() || Date.now();
        const daysSinceCreation = (Date.now() - createdAt) / (1000 * 60 * 60 * 24);

        if (daysSinceCreation > 30) {
          suggestions.push({
            type: "deal_insight",
            message: "This listing has been active for over 30 days",
            reasoning: "The seller may be more motivated to negotiate to close the deal.",
            confidence: 75,
          });
        } else if (daysSinceCreation < 7) {
          suggestions.push({
            type: "deal_insight",
            message: "This is a new listing",
            reasoning: "The seller may be less flexible on price for new listings.",
            confidence: 70,
          });
        }
      }
    } catch (e) {
      console.error("Error fetching listing details:", e);
    }

    // If no suggestions, provide general advice
    if (suggestions.length === 0) {
      suggestions.push({
        type: "deal_insight",
        message: "Proceed with standard negotiation",
        reasoning: "Be respectful and communicate clearly. Meet in person for high-value items.",
        confidence: 85,
      });
    }

    return NextResponse.json({ suggestions });
  } catch (e: any) {
    console.error("Error in negotiation assistant:", e);
    return NextResponse.json({ error: "Failed to generate suggestions" }, { status: 500 });
  }
}
