import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "../../../lib/firebase-admin";
import { isAdminEmail } from "../../../lib/admin-utils";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ isAdmin: false, error: "No token provided" }, { status: 401 });
    }

    const idToken = authHeader.slice(7);
    const decoded = await verifyIdToken(idToken);

    if (!decoded.email || !isAdminEmail(decoded.email)) {
      return NextResponse.json({ isAdmin: false, error: "Not authorized" }, { status: 403 });
    }

    return NextResponse.json({ isAdmin: true, email: decoded.email });
  } catch {
    return NextResponse.json({ isAdmin: false, error: "Invalid or expired token" }, { status: 401 });
  }
}
