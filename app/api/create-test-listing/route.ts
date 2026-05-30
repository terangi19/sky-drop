import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "sky-drop-de459";
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/listings`;

    const now = new Date();
    const expiresAt = new Date(Date.now() + 60 * 86400000);

    const fields: Record<string, unknown> = {
      title: { stringValue: "Test Item - Buy Me" },
      description: { stringValue: "A test listing for testing the purchase and bid flow. Please ignore." },
      price: { stringValue: "25.00" },
      category: { stringValue: "Tech" },
      type: { stringValue: "physical" },
      status: { stringValue: "live" },
      saleType: { stringValue: "buy_now" },
      condition: { stringValue: "New" },
      location: { stringValue: "Auckland" },
      pickupAvailable: { booleanValue: true },
      shippingAvailable: { booleanValue: true },
      shippingFee: { doubleValue: 8 },
      freeShipping: { booleanValue: false },
      sellerEmail: { stringValue: "test@skydrop.nz" },
      sellerUsername: { stringValue: "test" },
      sellerId: { stringValue: "test" },
      views: { doubleValue: 0 },
      bidCount: { doubleValue: 0 },
      images: { arrayValue: { values: [] } },
      imageUrl: { stringValue: "" },
      createdAt: { timestampValue: now.toISOString() },
      expiresAt: { timestampValue: expiresAt.toISOString() },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `Firestore error (${res.status}): ${errText}` }, { status: 500 });
    }

    const data = await res.json();
    const docPath: string = data.name || "";
    const docId = docPath.split("/").pop() || "";

    return NextResponse.json({ success: true, listingId: docId, url: `/post/listing/${docId}` });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed" }, { status: 500 });
  }
}
