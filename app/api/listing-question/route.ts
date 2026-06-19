import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyIdToken, getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { parseIpFromRequest } from "../../lib/geo-check";

export async function POST(req: NextRequest) {
  try {
    const ip = parseIpFromRequest(req.headers);
    const { allowed } = await rateLimit(`listing-question:${ip}`, 20, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await verifyIdToken(authHeader.slice(7));
    } catch {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const askerEmail = decoded.email || "";
    if (!askerEmail) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action === "answer" ? "answer" : "ask";
    const db = getAdminDb();

    if (action === "ask") {
      const listingId = typeof body.listingId === "string" ? body.listingId.trim() : "";
      const question = typeof body.question === "string" ? body.question.trim() : "";
      if (!listingId || !question) {
        return NextResponse.json({ error: "Missing listingId or question" }, { status: 400 });
      }
      if (question.length > 500) {
        return NextResponse.json({ error: "Question too long" }, { status: 400 });
      }

      const listingSnap = await db.collection("listings").doc(listingId).get();
      if (!listingSnap.exists) {
        return NextResponse.json({ error: "Listing not found" }, { status: 404 });
      }
      const listing = listingSnap.data()!;
      const sellerEmail = String(listing.sellerEmail || "");
      if (sellerEmail === askerEmail) {
        return NextResponse.json({ error: "Cannot ask on your own listing" }, { status: 400 });
      }

      const askerName =
        typeof body.askerName === "string" && body.askerName.trim()
          ? body.askerName.trim().slice(0, 80)
          : askerEmail.split("@")[0] || "Someone";

      const ref = await db.collection("listingQuestions").add({
        listingId,
        listingSellerEmail: sellerEmail,
        askerEmail,
        askerName,
        question,
        createdAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true, id: ref.id, sellerEmail });
    }

    const questionId = typeof body.questionId === "string" ? body.questionId.trim() : "";
    const answer = typeof body.answer === "string" ? body.answer.trim() : "";
    if (!questionId || !answer) {
      return NextResponse.json({ error: "Missing questionId or answer" }, { status: 400 });
    }
    if (answer.length > 500) {
      return NextResponse.json({ error: "Answer too long" }, { status: 400 });
    }

    const qRef = db.collection("listingQuestions").doc(questionId);
    const qSnap = await qRef.get();
    if (!qSnap.exists) {
      return NextResponse.json({ error: "Question not found" }, { status: 404 });
    }

    const qData = qSnap.data()!;
    const sellerEmail = String(qData.listingSellerEmail || "");
    if (sellerEmail !== askerEmail) {
      return NextResponse.json({ error: "Only the seller can answer" }, { status: 403 });
    }

    await qRef.update({
      answer,
      answeredAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    console.error("[listing-question]", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
