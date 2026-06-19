import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";
import { AdminAuthError, requireAdminFromRequest, serializeTimestamp } from "../../../lib/admin-request";
import { writeAuditLog } from "../../../lib/admin-utils";

function serializeListing(id: string, data: FirebaseFirestore.DocumentData) {
  const status = String(data.status || "live");
  const expiresMs = serializeTimestamp(data.expiresAt);
  const isExpired = expiresMs ? expiresMs < Date.now() : false;
  let bucket = status;
  if (status === "live" && isExpired) bucket = "expired";
  if (data.hidden) bucket = "hidden";
  if (data.flagged) bucket = "reported";

  return {
    id,
    title: data.title || "Untitled",
    sellerEmail: data.sellerEmail || "",
    sellerUsername: data.sellerUsername || "",
    sellerId: data.sellerId || "",
    type: data.type || "",
    price: data.price || "",
    status,
    bucket,
    flagged: !!data.flagged,
    hidden: !!data.hidden,
    createdAtMs: serializeTimestamp(data.createdAt),
    views: data.views || 0,
  };
}

export async function GET(req: NextRequest) {
  try {
    await requireAdminFromRequest(req);
    const filter = req.nextUrl.searchParams.get("filter") || "all";
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 80), 150);
    const db = getAdminDb();

    const snap = await db.collection("listings").orderBy("createdAt", "desc").limit(limit * 2).get();
    let listings = snap.docs.map((d) => serializeListing(d.id, d.data()));

    if (filter === "active") listings = listings.filter((l) => l.bucket === "live" || l.status === "live");
    else if (filter === "sold") listings = listings.filter((l) => l.status === "sold");
    else if (filter === "draft") listings = listings.filter((l) => l.status === "draft");
    else if (filter === "expired") listings = listings.filter((l) => l.bucket === "expired");
    else if (filter === "reported") listings = listings.filter((l) => l.flagged || l.bucket === "reported");

    return NextResponse.json({ listings: listings.slice(0, limit) });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[admin/listings GET]", e);
    return NextResponse.json({ error: "Failed to load listings" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdminFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const listingId = typeof body.listingId === "string" ? body.listingId.trim() : "";
    const action = body.action as "hide" | "restore" | "delete";

    if (!listingId || !action) {
      return NextResponse.json({ error: "listingId and action required" }, { status: 400 });
    }

    const ref = getAdminDb().collection("listings").doc(listingId);
    if (action === "delete") {
      await ref.delete();
    } else if (action === "hide") {
      await ref.set({ hidden: true, hiddenAt: new Date(), hiddenBy: admin.email }, { merge: true });
    } else if (action === "restore") {
      await ref.set({ hidden: false, flagged: false, hiddenAt: null, hiddenBy: null }, { merge: true });
    }

    await writeAuditLog({
      action: `listing_${action}`,
      actorEmail: admin.email!,
      actorUid: admin.uid,
      listingId,
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[admin/listings POST]", e);
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}
