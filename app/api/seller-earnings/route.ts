import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, isAdminInitialized, verifyIdToken } from "../../lib/firebase-admin";
import { isAdminUser } from "../../lib/admin-check.server";

const EARNING_STATUSES = ["paid", "delivered", "confirmed"] as const;

type SalesSnap = {
  empty: boolean;
  docs: Array<{ data: () => { total?: unknown; price?: unknown } }>;
};

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = await verifyIdToken(authHeader.slice(7));
    const uidParam = req.nextUrl.searchParams.get("uid")?.trim() || "";
    const emailParam = req.nextUrl.searchParams.get("email")?.trim() || ""; // legacy

    const requesterEmailRaw = (token.email || "").trim();
    const requesterEmail = requesterEmailRaw.toLowerCase();
    const isAdmin = requesterEmail
      ? await isAdminUser(requesterEmail, token.uid)
      : false;

    let targetUid = uidParam;
    let targetEmail = emailParam.toLowerCase();
    // Firestore equality is case-sensitive. Auth compares lowercase; the legacy
    // sellerEmail query keeps the caller's stored casing (token.email / raw param).
    let queryEmail = emailParam;

    if (!targetUid && !targetEmail) {
      // default: caller's own earnings
      targetUid = token.uid;
      targetEmail = requesterEmail;
      queryEmail = requesterEmailRaw;
    }

    if (!isAdmin) {
      // non-admin may only query self (uid or legacy email)
      if (targetUid && targetUid !== token.uid) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (!targetUid && targetEmail && targetEmail !== requesterEmail) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      targetUid = token.uid;
      targetEmail = requesterEmail;
      queryEmail = requesterEmailRaw;
    }

    if (!isAdminInitialized()) {
      return NextResponse.json({ total: 0 });
    }

    // Prefer sellerId when present. Purchase writes today stamp sellerEmail only
    // (create-purchase / purchase-service / expire-auctions), so an empty or
    // failed sellerId query falls back once to sellerEmail.
    const db = getAdminDb();
    let salesDocs: SalesSnap;
    if (targetUid) {
      try {
        salesDocs = await db.collection("purchases")
          .where("sellerId", "==", targetUid)
          .where("status", "in", [...EARNING_STATUSES])
          .get();
      } catch (queryErr) {
        console.error("[seller-earnings] sellerId query failed", queryErr);
        salesDocs = { empty: true, docs: [] };
      }
      if (salesDocs.empty && queryEmail) {
        salesDocs = await db.collection("purchases")
          .where("sellerEmail", "==", queryEmail)
          .where("status", "in", [...EARNING_STATUSES])
          .get();
      }
    } else if (queryEmail) {
      salesDocs = await db.collection("purchases")
        .where("sellerEmail", "==", queryEmail)
        .where("status", "in", [...EARNING_STATUSES])
        .get();
    } else {
      return NextResponse.json({ error: "email required" }, { status: 400 });
    }

    let total = 0;
    let count = 0;
    for (const doc of salesDocs.docs) {
      if (count >= 3) break;
      total += Number(doc.data().total || doc.data().price || 0);
      count++;
    }

    return NextResponse.json({ total });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
