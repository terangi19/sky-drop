import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest, isErrorResponse } from "../../../lib/api-helpers";
import { isAdminEmail } from "../../../lib/admin-check";

export async function POST(req: NextRequest) {
  try {
    const auth = await authenticateRequest(req);
    if (isErrorResponse(auth)) {
      return NextResponse.json({ isAdmin: false, error: "No token provided" }, { status: 401 });
    }

    if (!auth.email || !isAdminEmail(auth.email)) {
      return NextResponse.json({ isAdmin: false, error: "Not authorized" }, { status: 403 });
    }

    return NextResponse.json({ isAdmin: true, email: auth.email });
  } catch {
    return NextResponse.json({ isAdmin: false, error: "Invalid or expired token" }, { status: 401 });
  }
}
