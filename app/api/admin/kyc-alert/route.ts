import { NextRequest, NextResponse } from "next/server";
import { AdminAuthError, requireAdminFromRequest } from "../../../lib/admin-request";
import { notifyKycSubmittedToAdmins } from "../../../lib/admin-alerts";
import { rateLimit } from "../../../lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`kyc-alert:${ip}`, 5, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    await requireAdminFromRequest(req);

    const { uid, email, username } = await req.json();
    if (typeof uid !== "string" || typeof email !== "string") {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    await notifyKycSubmittedToAdmins({ uid, email, username });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    if (e instanceof AdminAuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[kyc-alert] Error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
