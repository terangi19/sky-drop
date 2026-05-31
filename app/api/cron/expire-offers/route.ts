import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expectedToken = process.env.CRON_SECRET;
  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getAdminDb();
    const now = new Date();
    const expired = await db.collection("purchases")
      .where("status", "==", "offer_accepted")
      .where("paymentDeadline", "<", now)
      .get();

    let expiredCount = 0;
    const batch = db.batch();

    for (const doc of expired.docs) {
      const data = doc.data();
      batch.update(doc.ref, {
        status: "expired",
        expiredAt: now,
      });

      if (data.offerMessageId) {
        const offerMsgRef = db.collection("messages").doc(data.offerMessageId);
        batch.update(offerMsgRef, {
          offerStatus: "expired",
          updatedAt: now,
        });
      }

      const msgRef = db.collection("messages").doc();
      batch.set(msgRef, {
        type: "order",
        sender: "system",
        receiver: data.buyerEmail,
        participants: [data.buyerEmail, data.sellerEmail],
        listingId: data.listingId,
        listingTitle: data.listingTitle || "",
        orderStatus: "expired",
        text: "Offer payment deadline has passed. This offer has expired.",
        read: false,
        createdAt: now,
      });

      expiredCount++;
    }

    if (expiredCount > 0) {
      await batch.commit();
    }

    return NextResponse.json({ expired: expiredCount });
  } catch (e: any) {
    console.error("[cron-expire-offers] Error:", e);
    return NextResponse.json({ error: e.message || "Unknown error" }, { status: 500 });
  }
}
