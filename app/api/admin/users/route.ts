import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "../../../lib/firebase-admin";
import { AdminAuthError, requireAdminFromRequest, serializeTimestamp } from "../../../lib/admin-request";

function serializeUser(id: string, data: FirebaseFirestore.DocumentData) {
  return {
    id,
    username: data.username || "",
    displayName: data.displayName || data.name || data.username || "",
    email: data.email || "",
    joinDateMs: serializeTimestamp(data.memberSince || data.createdAt),
    lastActiveMs: serializeTimestamp(data.lastActive),
    restricted: !!data.restricted,
    suspended: !!data.suspended,
    bannedAt: data.bannedAt || null,
    kycStatus: data.kycStatus || "",
    warningCount: data.warningCount || 0,
    listingsCount: 0,
    salesCount: 0,
    purchasesCount: 0,
    status: data.bannedAt || data.kycStatus === "banned_fake"
      ? "Banned"
      : data.suspended
        ? "Suspended"
        : data.restricted
          ? "Restricted"
          : data.kycStatus === "approved"
            ? "Verified"
            : "Active",
  };
}

async function attachCounts(users: ReturnType<typeof serializeUser>[]) {
  const db = getAdminDb();
  await Promise.all(
    users.map(async (u) => {
      const [listings, sales, purchases] = await Promise.all([
        db.collection("listings").where("sellerId", "==", u.id).count().get(),
        db.collection("purchases").where("sellerEmail", "==", u.email).count().get(),
        db.collection("purchases").where("buyerEmail", "==", u.email).count().get(),
      ]);
      u.listingsCount = listings.data().count;
      u.salesCount = sales.data().count;
      u.purchasesCount = purchases.data().count;
    })
  );
  return users;
}

export async function GET(req: NextRequest) {
  try {
    await requireAdminFromRequest(req);
    const q = req.nextUrl.searchParams.get("q")?.trim().toLowerCase() || "";
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") || 50), 100);
    const db = getAdminDb();

    let users: ReturnType<typeof serializeUser>[] = [];

    if (q) {
      const byEmail = await db.collection("profiles").where("email", "==", q).limit(5).get();
      const byUsername = await db.collection("profiles").where("username", "==", q.replace(/^@/, "")).limit(5).get();
      const docSnap = q.length > 10 ? await db.collection("profiles").doc(q).get() : null;
      const seen = new Set<string>();
      const merged: Array<{ id: string; data: FirebaseFirestore.DocumentData }> = [
        ...byEmail.docs.map((d) => ({ id: d.id, data: d.data() })),
        ...byUsername.docs.map((d) => ({ id: d.id, data: d.data() })),
      ];
      if (docSnap?.exists) merged.push({ id: docSnap.id, data: docSnap.data()! });
      users = merged
        .filter((d) => {
          if (seen.has(d.id)) return false;
          seen.add(d.id);
          return true;
        })
        .map((d) => serializeUser(d.id, d.data));
    } else {
      const snap = await db.collection("profiles").orderBy("createdAt", "desc").limit(limit).get();
      users = snap.docs.map((d) => serializeUser(d.id, d.data()));
    }

    users = await attachCounts(users);
    return NextResponse.json({ users });
  } catch (e) {
    if (e instanceof AdminAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[admin/users GET]", e);
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }
}
