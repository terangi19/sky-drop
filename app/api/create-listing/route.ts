import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { sanitizeListingContent } from "../../lib/sanitize";

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

function sellerHasVerifiedPhone(profile: Record<string, unknown>): boolean {
  const phone = String(profile.phone || profile.phoneNumber || "").trim();
  return !!phone && profile.phoneVerified === true;
}



function toFirestoreValue(val: unknown): Record<string, unknown> {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "string") return { stringValue: val };
  if (typeof val === "number") return { doubleValue: val };
  if (typeof val === "boolean") return { booleanValue: val };
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toFirestoreValue) } };
  if (typeof val === "object") {
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

async function createListingViaRest(idToken: string, listingData: Record<string, unknown>): Promise<string> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "sky-drop-de459";
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/listings`;

  const fields: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(listingData)) {
    fields[key] = toFirestoreValue(val);
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Firestore REST API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  const docPath: string = data.name || "";
  const docId = docPath.split("/").pop() || "";
  return docId;
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`create-listing:${ip}`, 5, 60_000);
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
      token = await verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const body = await req.json();
    const { title, description, price, category, listingType } = body;

    const allowedFields: string[] = [
      "images", "sellerUsername", "expiresInDays",
      "condition", "location", "pickupAvailable", "shippingAvailable",
      "pickupArea", "shippingFee", "freeShipping", "shipsWithinDays",
      "stockQuantity", "saleType", "acceptOffers",
      "startingBid", "reservePrice", "auctionEndsAt",
      "digitalStoragePath", "digitalFileName",
      "serviceDuration", "rentalPriceWeekly", "rentalPriceMonthly", "rentalDeposit",
      "eventDate", "eventTime", "venue", "ticketQuantity", "ticketType",
      "vehicleMake", "vehicleModel", "vehicleYear", "vehicleOdometer",
      "vehicleFuelType", "vehicleTransmission", "vehicleBodyType", "vehicleColour",
      "jobCompany", "jobEmploymentType", "salaryMin", "salaryMax",
      "propertyType", "bedrooms", "bathrooms", "landArea", "floorArea", "parking",
    ];
    const clientData: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in body) {
        if (key === "stockQuantity") {
          const val = body[key];
          if (val === undefined || val === null || val === "" || Number(val) <= 0) continue;
          clientData[key] = Number(val);
        } else {
          clientData[key] = body[key];
        }
      }
    }

    if (!title || !description) {
      return NextResponse.json({ error: "Title and description are required" }, { status: 400 });
    }

    const sanitizedTitle = sanitizeListingContent(title);
    const sanitizedDesc = sanitizeListingContent(description);

    if (sanitizedTitle.length < 3) {
      return NextResponse.json({ error: "Title must be at least 3 characters" }, { status: 400 });
    }

    const scamCheck = detectScam(`${sanitizedTitle} ${sanitizedDesc}`);
    if (scamCheck.isScam) {
      return NextResponse.json({
        error: "Listing flagged for scam language. Remove the following: " + scamCheck.keywords.join(", "),
        scamKeywords: scamCheck.keywords,
      }, { status: 400 });
    }

    const numericPrice = Number(price) || 0;
    let salesCount = 0;

    if (isAdminInitialized()) {
      // Fetch seller profile once and reuse
      const sellerProfileSnap = await getAdminDb().collection("profiles")
        .where("email", "==", token.email).limit(1).get();
      let reportsCount = 0;
      let sellerProfile: FirebaseFirestore.DocumentData | null = null;
      if (!sellerProfileSnap.empty) {
        sellerProfile = sellerProfileSnap.docs[0].data();
        salesCount = sellerProfile.salesCount || 0;
        reportsCount = sellerProfile.reportsCount || 0;
        if (sellerProfile.restricted) {
          return NextResponse.json({ error: "Your account is restricted. Contact support." }, { status: 403 });
        }
        // Require email verified to sell
        if (!token.email_verified) {
          return NextResponse.json({ error: "Please verify your email address before creating a listing." }, { status: 403 });
        }
        if (!sellerHasVerifiedPhone(sellerProfile)) {
          return NextResponse.json({ error: "Please add and verify your phone number in Profile to create listings." }, { status: 403 });
        }
      } else {
        return NextResponse.json({ error: "Please complete your profile before creating a listing." }, { status: 403 });
      }

      if (numericPrice > 0 && isPriceSuspicious(numericPrice, category)) {
        if (salesCount < 3 || reportsCount > 0) {
          return NextResponse.json({
            error: `Price seems unusually low for "${category}". Please set a realistic price or contact support.`,
            priceFlagged: true,
          }, { status: 400 });
        }
      }

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

      const activeListings = await getAdminDb().collection("listings")
        .where("sellerEmail", "==", token.email)
        .where("status", "==", "live")
        .get();

      const maxListings = salesCount >= 10 ? 100 : salesCount >= 3 ? 25 : 5;
      if (activeListings.size >= maxListings) {
        return NextResponse.json({
          error: `You can only have ${maxListings} active listings. Complete some sales to unlock more.`,
        }, { status: 400 });
      }
    }

    let status: string;
    if (listingType === "digital" || (salesCount < 3 && isAdminInitialized())) {
      status = "pending_review";
    } else {
      status = "live";
    }

    const saleType = String(clientData.saleType || body.saleType || "buy_now");
    const now = new Date();
    const expiresAt = clientData.expiresInDays
      ? new Date(Date.now() + Number(clientData.expiresInDays) * 86400000)
      : new Date(Date.now() + 60 * 86400000);

    let auctionEndsAt: Date | null = null;
    if (body.auctionEndsAt) {
      auctionEndsAt = new Date(body.auctionEndsAt);
    } else if (
      (saleType === "auction" || saleType === "auction_buy_now") &&
      clientData.auctionEndsAt
    ) {
      auctionEndsAt = new Date(clientData.auctionEndsAt as string);
    }

    const finalData: Record<string, unknown> = {
      title: sanitizedTitle,
      description: sanitizedDesc,
      price: String(numericPrice),
      category: category || "Other",
      images: clientData.images || [],
      imageUrl: (Array.isArray(clientData.images) ? clientData.images[0] : "") || "",
      sellerEmail: token.email,
      sellerUsername: clientData.sellerUsername || token.email?.split("@")[0] || "",
      sellerId: token.uid,
      type: listingType || "physical",
      status,
      views: 0,
      bidCount: 0,
      stockQuantity: clientData.stockQuantity ?? 1,
      createdAt: now,
      expiresAt,
      ...clientData,
      saleType,
    };

    if (auctionEndsAt && !isNaN(auctionEndsAt.getTime())) {
      finalData.auctionEndsAt = auctionEndsAt;
    }

    delete finalData.expiresInDays;
    delete finalData.listingType;

    let listingId: string;

    if (isAdminInitialized()) {
      const ref = await getAdminDb().collection("listings").add(finalData);
      listingId = ref.id;
    } else {
      listingId = await createListingViaRest(idToken, finalData);
    }

    return NextResponse.json({
      success: true,
      listingId,
    });
  } catch (e: any) {
    console.error("[create-listing] Error:", e?.message || e);
    const message = e instanceof Error ? e.message : "Failed to create listing";
    const safeMessage =
      message.includes("Firestore") || message.includes("PERMISSION_DENIED")
        ? "Could not save listing. Try again or contact support."
        : message.length < 200
          ? message
          : "Failed to create listing";
    return NextResponse.json({ error: safeMessage }, { status: 500 });
  }
}

