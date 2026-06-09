import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken, getAdminAuth, isAdminInitialized } from "../../lib/firebase-admin";

export async function POST(req: NextRequest) {
  try {
    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Admin SDK not initialized" }, { status: 500 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = await verifyIdToken(authHeader.slice(7));
    await getAdminAuth().updateUser(token.uid, { emailVerified: true });

    return NextResponse.json({ success: true, message: "Email verified" });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Failed to verify email";
    console.error("verify-me error:", e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
