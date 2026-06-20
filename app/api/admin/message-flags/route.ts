import { NextRequest, NextResponse } from "next/server";
import { requireAdminFromRequest } from "../../../lib/admin-request";
import { getAdminDb } from "../../../lib/firebase-admin";

export async function GET(req: NextRequest) {
  try {
    await requireAdminFromRequest(req);
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || "pending_review";

    const db = getAdminDb();
    const snapshot = await db
      .collection("messageFlags")
      .where("status", "==", status)
      .orderBy("createdAt", "desc")
      .limit(100)
      .get();

    const flags = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toMillis?.() || null,
    }));

    return NextResponse.json({ flags });
  } catch (e: any) {
    const status = e?.status || e?.code || 500;
    return NextResponse.json({ error: e?.message || "Failed to load flags" }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdminFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { flagId, action } = body;

    if (!flagId || !["reviewed", "dismissed"].includes(action)) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const db = getAdminDb();
    await db.collection("messageFlags").doc(flagId).update({
      status: action,
      reviewedAt: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    const status = e?.status || e?.code || 500;
    return NextResponse.json({ error: e?.message || "Failed to update flag" }, { status });
  }
}
