import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminDb, getServerDb, isAdminInitialized } from "../../lib/firebase-admin";
import { parseIpFromRequest } from "../../lib/geo-check";
import { rateLimit } from "../../lib/rate-limit";
import {
  decide, applyDecisionDelay, persistRiskFlag, recordTurnstileAttempt,
  type DecisionInput,
} from "../../lib/abuse-decision-engine";
import { DEFAULT_MAX_JSON_BYTES, isContentLengthOverLimit, payloadTooLargeResponse } from "../../lib/request-body";
import { sanitizeListingContent } from "../../lib/sanitize";
import { kycRequiredBlockMessage } from "../../lib/seller-eligibility";
import { verifyTurnstileToken, isTurnstileConfigured } from "../../lib/turnstile";
import { trackAndCheckAbuse } from "../../lib/abuse-tracker";
import { createSystemNotification } from "../../lib/system-notifications";

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

async function getSellerProfileForUid(uid: string, email?: string | null) {
  const db = getAdminDb();
  const byUid = await db.collection("profiles").doc(uid).get();
  if (byUid.exists) {
    return byUid.data() as Record<string, unknown>;
  }
  if (email) {
    const byEmail = await db.collection("profiles").where("email", "==", email).limit(1).get();
    if (!byEmail.empty) {
      return byEmail.docs[0].data() as Record<string, unknown>;
    }
  }
  return null;
}





export async function POST(req: NextRequest) {
  try {
    const ip = parseIpFromRequest(req.headers);

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    let token;
    try {
      token = await verifyIdToken(idToken);
    } catch (authErr: unknown) {
      const message =
        authErr instanceof Error ? authErr.message : "Invalid or expired token";
      return NextResponse.json({ error: message }, { status: 401 });
    }

    const decisionInput: DecisionInput = {
      uid: token.uid,
      ip,
      email: token.email,
      action: "listing",
      accountAgeSec: token.auth_time ? Math.floor((Date.now() / 1000) - token.auth_time) : undefined,
    };

    const decision = await decide(decisionInput);
    await applyDecisionDelay(decision);

    if (isContentLengthOverLimit(req, 512 * 1024)) return payloadTooLargeResponse();

    if (!token.email_verified) {
      return NextResponse.json({ error: "Please verify your email before creating a listing" }, { status: 403 });
    }

    if (!(await trackAndCheckAbuse(token.uid, token.email || "", "listing", ip))) {
      return NextResponse.json({ error: "You've reached the maximum number of listings. Please try again later." }, { status: 429 });
    }

    const body = await req.json();

    if (decision.captchaRequired && isTurnstileConfigured()) {
      const turnstileToken = typeof body.turnstileToken === "string" ? body.turnstileToken : "";
      if (!turnstileToken || !(await verifyTurnstileToken(turnstileToken))) {
        recordTurnstileAttempt(token.uid, false);
        return NextResponse.json({ error: "Security check failed. Please refresh and try again." }, { status: 403 });
      }
      recordTurnstileAttempt(token.uid, true);
    }

    if (decision.verdict === "block") {
      await persistRiskFlag(token.uid, `listing_blocked:${decision.reason}`);
      return NextResponse.json({ error: "Listing could not be created. Please try again later." }, { status: 403 });
    }

    if (decision.verdict === "shadow_degrade") {
      // Shadow suppressed listings get a reduced visibility rank but still appear
      // Will be set on the listing doc below
    }

    const { title, description, price, category, listingType } = body;

    const allowedFields: string[] = [
      "images", "sellerUsername", "expiresInDays",
      "condition", "location", "pickupAvailable", "shippingAvailable",
      "pickupArea", "shippingFee", "freeShipping", "shipsWithinDays",
      "stockQuantity", "saleType", "acceptOffers",
      "startingBid", "reservePrice", "auctionEndsAt",
      "digitalStoragePath", "digitalFileName",
      "serviceDuration", "rentalSubType", "rentalPriceWeekly", "rentalPriceMonthly", "rentalDeposit",
      "rentalBedrooms", "rentalBathrooms", "rentalParkingSpaces", "rentalPropertyType", "rentalFurnishedStatus", "rentalPetsPolicy", "rentalMinTenancy", "rentalFeatures", "rentalAvailableDate",
      "rentalVehicleSeats",
      "eventDate", "eventTime", "venue", "ticketQuantity", "ticketType",
      "vehicleMake", "vehicleModel", "vehicleYear", "vehicleOdometer",
      "vehicleFuelType", "vehicleTransmission", "vehicleBodyType", "vehicleColour",
      "jobCompany", "jobEmploymentType", "salaryMin", "salaryMax",
      "propertyType", "bedrooms", "bathrooms", "landArea", "floorArea", "parking",
      "paymentType",
      "pricingType",
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

    const VALID_LISTING_TYPES = ["physical", "digital", "service", "rental", "event", "vehicle", "job", "property", "wanted"];
    if (listingType && !VALID_LISTING_TYPES.includes(listingType)) {
      return NextResponse.json({ error: "Invalid listing type" }, { status: 400 });
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
    let kycApproved = false;

    if (isAdminInitialized()) {
      const sellerProfile = await getSellerProfileForUid(token.uid, token.email);
      let reportsCount = 0;
      if (sellerProfile) {
        salesCount = Number(sellerProfile.salesCount) || 0;
        reportsCount = Number(sellerProfile.reportsCount) || 0;
        kycApproved = sellerProfile.kycStatus === "approved";
        if (sellerProfile.restricted) {
          return NextResponse.json({ error: "Your account is restricted. Contact support." }, { status: 403 });
        }
        if (!kycApproved) {
          return NextResponse.json({ error: kycRequiredBlockMessage() }, { status: 403 });
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

      const maxListings = kycApproved ? 9999 : 5;
      if (activeListings.size >= maxListings) {
        return NextResponse.json({
          error: kycApproved
            ? `You can only have ${maxListings} active listings.`
            : `You can only have ${maxListings} active listings. Complete KYC to unlock unlimited listings.`,
        }, { status: 400 });
      }

      // Price cap check
      if (numericPrice > 0 && !kycApproved && numericPrice > 600) {
        return NextResponse.json({
          error: "The maximum price for non-KYC sellers is $600. Verify your ID (KYC) to unlock unlimited pricing.",
        }, { status: 400 });
      }
    }

    let status: string;
    if (listingType === "digital") {
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

    const shadowRank = decision.verdict === "shadow_degrade" ? decision.shadowRank : "normal";

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
      createdAt: now,
      expiresAt,
      visibilityRank: shadowRank,
      ...clientData,
      saleType,
      paymentType: String(clientData.paymentType || "contact"),
    };

    if (clientData.stockQuantity != null) {
      finalData.stockQuantity = Number(clientData.stockQuantity);
    }

    if (auctionEndsAt && !isNaN(auctionEndsAt.getTime())) {
      finalData.auctionEndsAt = auctionEndsAt;
    }

    delete finalData.expiresInDays;
    delete finalData.listingType;

    // Strip undefined — Firestore rejects undefined field values
    for (const key of Object.keys(finalData)) {
      if (finalData[key] === undefined) delete finalData[key];
    }

    if (!isAdminInitialized()) {
      const isProd = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
      if (isProd) {
        console.error("[create-listing] FIREBASE_SERVICE_ACCOUNT missing in production");
        return NextResponse.json(
          { error: "Listing service is temporarily unavailable. Please try again shortly." },
          { status: 503 }
        );
      }
    }

    const db = isAdminInitialized() ? getAdminDb() : getServerDb(idToken);
    const ref = await db.collection("listings").add(finalData);
    const listingId = ref.id;

    // Saved-search alerts: notify users whose saved search matches this new listing
    if (isAdminInitialized()) {
      try {
        const searches = await getAdminDb().collection("savedSearches").get();
        const titleLower = sanitizedTitle.toLowerCase();
        const categoryLower = String(category || "Other").toLowerCase();
        for (const doc of searches.docs) {
          const s = doc.data();
          const userEmail = s.userEmail;
          if (!userEmail || typeof userEmail !== "string") continue;
          const q = String(s.query || "").toLowerCase();
          const cat = String(s.category || "All").toLowerCase();
          const matchesQuery = !q || titleLower.includes(q);
          const matchesCategory = cat === "all" || categoryLower === cat;
          if (matchesQuery && matchesCategory) {
            await createSystemNotification({
              targetEmail: userEmail,
              fromEmail: token.email || "system@skydrop.nz",
              type: "saved_search_match",
              title: "New listing matches your search",
              message: `New ${String(category || "listing")}: "${sanitizedTitle}"`,
              listingId,
              listingTitle: sanitizedTitle,
              listingImage: String((finalData.images as string[])?.[0] || ""),
            });
          }
        }
      } catch (e) {
        console.error("[create-listing] Saved-search notification failed:", e);
      }
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

