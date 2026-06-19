import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "../../../lib/firebase-admin";
import { AdminAuthError, requireAdminFromRequest } from "../../../lib/admin-request";
import { writeAuditLog } from "../../../lib/admin-utils";

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const listingId = typeof body.listingId === "string" ? body.listingId.trim() : "";
    const action = body.action as "approve" | "reject";
    const type = body.type as "listing" | "digital";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!listingId || !action || !type) {
      return NextResponse.json({ error: "listingId, action, and type required" }, { status: 400 });
    }
    if (action === "reject" && !reason) {
      return NextResponse.json({ error: "Rejection reason required" }, { status: 400 });
    }

    const db = getAdminDb();
    const collectionName = type === "digital" ? "tradePosts" : "listings";
    const ref = db.collection(collectionName).doc(listingId);
    const snap = await ref.get();
    if (!snap.exists) {
      return NextResponse.json({ error: "Listing not found" }, { status: 404 });
    }

    const data = snap.data()!;
    const newStatus = action === "approve" ? "live" : "rejected";

    await ref.set({ status: newStatus, reviewedAt: new Date(), reviewedBy: admin.email }, { merge: true });

    const targetEmail = String(data.sellerEmail || "");
    if (targetEmail) {
      const title = String(data.title || "Listing");
      if (action === "approve") {
        await db.collection("notifications").add({
          type: "verification",
          targetEmail,
          fromEmail: admin.email!,
          title: type === "digital" ? "Digital Listing Approved" : "Listing Approved",
          message: `Your listing "${title}" has been approved and is now live on the marketplace.`,
          listingTitle: title,
          listingId,
          read: false,
          createdAt: new Date(),
        });
      } else {
        await db.collection("notifications").add({
          type: "listing_rejected",
          targetEmail,
          fromEmail: admin.email!,
          title: type === "digital" ? "Digital Listing Rejected" : "Listing Rejected",
          message: `Your listing "${title}" was rejected. Reason: ${reason}`,
          listingTitle: title,
          listingId,
          read: false,
          createdAt: new Date(),
        });
      }
    }

    await writeAuditLog({
      action: `${type}_${action}`,
      actorEmail: admin.email!,
      actorUid: admin.uid,
      listingId,
      metadata: { collection: collectionName, reason: reason || undefined },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[admin/verify-listing]", e);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
