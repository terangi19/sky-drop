import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { enforceProtection } from "../../lib/enforce-protection";
import { parseIpFromRequest } from "../../lib/geo-check";

const BADGE_TYPES = new Set(["epic", "legendary"]);

export async function POST(req: NextRequest) {
  try {
    const ip = parseIpFromRequest(req.headers);
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let token;
    try {
      token = await verifyIdToken(authHeader.slice(7));
    } catch {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const sellerEmail = token.email || "";
    if (!sellerEmail) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : description;
    const price = typeof body.price === "string" ? body.price.trim() : "";
    const type = typeof body.type === "string" ? body.type.trim() : "WTS";
    const badgeForSale =
      typeof body.badgeForSale === "string" && BADGE_TYPES.has(body.badgeForSale)
        ? body.badgeForSale
        : null;

    if (!title) {
      return NextResponse.json({ error: "Title is required" }, { status: 400 });
    }

    const protection = await enforceProtection(req, {
      action: "trade_post",
      uid: token.uid,
      email: token.email,
      ip,
      requestId: typeof body.requestId === "string" ? body.requestId : undefined,
      turnstileToken: typeof body.turnstileToken === "string" ? body.turnstileToken : undefined,
    });

    if (protection.blocked) return protection.response!;

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const db = getAdminDb();

    if (badgeForSale) {
      const existing = await db
        .collection("tradePosts")
        .where("sellerEmail", "==", sellerEmail)
        .where("badgeForSale", "==", badgeForSale)
        .where("status", "==", "live")
        .limit(1)
        .get();
      if (!existing.empty) {
        return NextResponse.json(
          { error: "You already have an active listing for this badge." },
          { status: 409 }
        );
      }
    }

    const sellerUsername =
      typeof body.sellerUsername === "string" ? body.sellerUsername.trim() : sellerEmail;

    const postData: Record<string, unknown> = {
      title,
      description: message || description,
      message: message || description,
      price: price || null,
      type,
      sellerEmail,
      sellerId: token.uid,
      sellerUsername,
      createdAt: FieldValue.serverTimestamp(),
      replies: [],
      images: Array.isArray(body.images) ? body.images.filter((u: unknown) => typeof u === "string").slice(0, 8) : [],
      views: 1,
      offers: 0,
      status: typeof body.status === "string" ? body.status : "live",
    };

    if (badgeForSale) {
      postData.badgeForSale = badgeForSale;
      postData.saleType = "buy_now";
    } else {
      if (typeof body.world === "string" && body.world) postData.world = body.world;
      if (typeof body.category === "string" && body.category) postData.category = body.category;
      if (typeof body.saleType === "string" && body.saleType) postData.saleType = body.saleType;
      if (body.pickupAvailable === true) postData.pickupAvailable = true;
      if (body.shippingAvailable === true) postData.shippingAvailable = true;
      if (typeof body.pickupArea === "string" && body.pickupArea) postData.pickupArea = body.pickupArea.trim();
      if (body.shippingFee != null && Number.isFinite(Number(body.shippingFee))) {
        postData.shippingFee = Number(body.shippingFee);
      }
      if (body.freeShipping === true) postData.freeShipping = true;
    }

    const ref = await db.collection("tradePosts").add(postData);

    return NextResponse.json({ success: true, id: ref.id });
  } catch (e: unknown) {
    console.error("[create-trade-post]", e);
    return NextResponse.json({ error: "Failed to create post" }, { status: 500 });
  }
}
