import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";

export async function GET(req: NextRequest) {
  try {
    const email = req.nextUrl.searchParams.get("email");
    if (!email) {
      return NextResponse.json({ error: "email required" }, { status: 400 });
    }
    if (!isAdminInitialized()) {
      return NextResponse.json({ total: 0 });
    }
    const db = getAdminDb();
    const salesDocs = await db.collection("purchases")
      .where("sellerEmail", "==", email)
      .where("status", "in", ["paid", "delivered", "confirmed"])
      .get();
    let total = 0;
    let count = 0;
    for (const doc of salesDocs.docs) {
      if (count >= 3) break;
      total += Number(doc.data().total || doc.data().price || 0);
      count++;
    }
    return NextResponse.json({ total });
  } catch {
    return NextResponse.json({ total: 0 });
  }
}
