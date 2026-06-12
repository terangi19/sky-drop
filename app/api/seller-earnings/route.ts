import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, isAdminInitialized, verifyIdToken } from "../../lib/firebase-admin";
import { isAdminUser } from "../../lib/admin-check.server";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = await verifyIdToken(authHeader.slice(7));
    const email = req.nextUrl.searchParams.get("email");
    if (!email) {
      return NextResponse.json({ error: "email required" }, { status: 400 });
    }

    const requesterEmail = token.email?.toLowerCase();
    const targetEmail = email.toLowerCase();
    const isAdmin = requesterEmail
      ? await isAdminUser(requesterEmail, token.uid)
      : false;

    if (!isAdmin && requesterEmail !== targetEmail) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
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
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
