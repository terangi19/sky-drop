import { NextRequest, NextResponse } from "next/server";
import { getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import {
  pickPublicProfileFields,
  resolvePublicProfileUid,
} from "../../lib/public-profile-fields";

export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug");
    if (!slug) {
      return NextResponse.json({ error: "Missing slug parameter" }, { status: 400 });
    }

    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const { allowed } = await rateLimit(`public-profile:${ip}`, 60, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const db = getAdminDb();
    const uid = await resolvePublicProfileUid(db as Parameters<typeof resolvePublicProfileUid>[0], slug);
    if (!uid) {
      return NextResponse.json({ profile: null }, { status: 200 });
    }

    const profileSnap = await db.collection("profiles").doc(uid).get();
    if (!profileSnap.exists) {
      return NextResponse.json({ profile: null }, { status: 200 });
    }

    const profile = pickPublicProfileFields(uid, profileSnap.data() || {});
    return NextResponse.json({ profile });
  } catch {
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }
}
