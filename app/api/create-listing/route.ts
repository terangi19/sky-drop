import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDb } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";

const SCAM_KEYWORDS = [
  "bank transfer only", "crypto only", "pay outside", "whatsapp",
  "telegram", "gift card", "urgent payment", "friends and family",
  "shipping agent", "wire transfer", "cashapp", "western union",
  "send money first", "pay before viewing", "urgent sale",
  "too good to be true", "dm privately", "no refunds",
];

const CATEGORY_PRICE_THRESHOLDS: Record<string, number> = {
  Cars: 1000, Tech: 50, Gaming: 30, Fashion: 20, Home: 20,
  Sports: 20, Property: 10000, Electronics: 20, Phones: 50,
  Clothing: 10, Books: 5, Jewellery: 20, Furniture: 30,
};

function detectScam(text: string): { isScam: boolean; keywords: string[] } {
  const lower = text.toLowerCase();
  const found = SCAM_KEYWORDS.filter((kw) => lower.includes(kw));
  return { isScam: found.length > 0, keywords: found };
}

function isPriceSuspicious(price: number, category?: string): boolean {
  if (!category || !CATEGORY_PRICE_THRESHOLDS[category]) return false;
  return price < CATEGORY_PRICE_THRESHOLDS[category];
}

function sanitize(input: string): string {
  return input ? input.replace(/[<>]/g, "").slice(0, 5000).trim() : "";
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = rateLimit(`create-listing:${ip}`, 5, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    let token;
    try {
      token = await getAdminAuth().verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    if (!token.email_verified) {
      return NextResponse.json({ error: "Please verify your email before creating a listing." }, { status: 403 });
    }

    const body = await req.json();
    const { title, description, price, category, listingType, ...rest } = body;

    if (!title || !description) {
      return NextResponse.json({ error: "Title and description are required" }, { status: 400 });
    }

    const sanitizedTitle = sanitize(title);
    const sanitizedDesc = sanitize(description);

    if (sanitizedTitle.length < 3) {
      return NextResponse.json({ error: "Title must be at least 3 characters" }, { status: 400 });
    }

    // Server-side scam detection
    const scamCheck = detectScam(`${sanitizedTitle} ${sanitizedDesc}`);
    if (scamCheck.isScam) {
      return NextResponse.json({
        error: "Listing flagged for scam language. Remove the following: " + scamCheck.keywords.join(", "),
        scamKeywords: scamCheck.keywords,
      }, { status: 400 });
    }

    // Server-side price check
    const numericPrice = Number(price) || 0;
    if (numericPrice > 0 && isPriceSuspicious(numericPrice, category)) {
      // Check seller reputation before blocking price
      const sellerProfiles = await getAdminDb().collection("profiles")
        .where("email", "==", token.email).limit(1).get();

      let salesCount = 0;
      let reportsCount = 0;
      if (!sellerProfiles.empty) {
        const profile = sellerProfiles.docs[0].data();
        salesCount = profile.salesCount || 0;
        reportsCount = profile.reportsCount || 0;
        if (profile.restricted) {
          return NextResponse.json({ error: "Your account is restricted. Contact support." }, { status: 403 });
        }
      }

      // Block suspicious price if new seller with no sales OR has reports
      if (salesCount < 3 || reportsCount > 0) {
        return NextResponse.json({
          error: `Price seems unusually low for "${category}". Please set a realistic price or contact support.`,
          priceFlagged: true,
        }, { status: 400 });
      }
    }

    // Duplicate check: same title by same seller in last 30 days
    const recentDupes = await getAdminDb().collection("listings")
      .where("sellerEmail", "==", token.email)
      .where("title", "==", sanitizedTitle)
      .limit(1).get();

    if (!recentDupes.empty) {
      const existing = recentDupes.docs[0].data();
      if (existing.status !== "sold") {
        return NextResponse.json({ error: "You already have an active listing with this title." }, { status: 400 });
      }
    }

    // Check max active listings based on seller tier
    const activeListings = await getAdminDb().collection("listings")
      .where("sellerEmail", "==", token.email)
      .where("status", "==", "live")
      .get();

    const sellerProfiles = await getAdminDb().collection("profiles")
      .where("email", "==", token.email).limit(1).get();

    let salesCount = 0;
    if (!sellerProfiles.empty) {
      salesCount = sellerProfiles.docs[0].data().salesCount || 0;
    }

    const maxListings = salesCount >= 10 ? 100 : salesCount >= 3 ? 25 : 5;
    if (activeListings.size >= maxListings) {
      return NextResponse.json({
        error: `You can only have ${maxListings} active listings. Complete some sales to unlock more.`,
      }, { status: 400 });
    }

    // Write listing to Firestore with sanitized data
    const listingData: Record<string, unknown> = {
      title: sanitizedTitle,
      description: sanitizedDesc,
      price: String(numericPrice),
      category: category || "Other",
      images: rest.images || [],
      imageUrl: (rest.images || [])[0] || "",
      sellerEmail: token.email,
      sellerUsername: rest.sellerUsername || token.email?.split("@")[0] || "",
      sellerId: token.uid,
      createdAt: new Date(),
      type: listingType || "physical",
      status: salesCount < 3 ? "pending_review" : "live",
      views: 0,
      bidCount: 0,
      ...rest,
    };

    // Remove client-sent timestamps, use server time
    delete listingData.createdAt;
    delete listingData.expiresAt;
    delete listingData.auctionEndsAt;

    const ref = await getAdminDb().collection("listings").add({
      ...listingData,
      createdAt: new Date(),
      expiresAt: rest.expiresInDays
        ? new Date(Date.now() + Number(rest.expiresInDays) * 86400000)
        : new Date(Date.now() + 60 * 86400000),
    });

    return NextResponse.json({
      success: true,
      listingId: ref.id,
    });
  } catch (e: any) {
    console.error("[create-listing] Error:", e?.message || e);
    return NextResponse.json({ error: "Failed to create listing" }, { status: 500 });
  }
}
