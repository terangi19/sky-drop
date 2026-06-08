import { NextRequest, NextResponse } from "next/server";
import { isPhoneBlacklisted } from "../../lib/ban-store";

export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json();
    if (!phone || typeof phone !== "string") {
      return NextResponse.json({ error: "Phone is required" }, { status: 400 });
    }
    const blacklisted = await isPhoneBlacklisted(phone);
    return NextResponse.json({ blacklisted });
  } catch {
    return NextResponse.json({ blacklisted: false });
  }
}
