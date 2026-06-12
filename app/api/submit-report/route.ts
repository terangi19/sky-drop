import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { submitReportAdmin } from "../../lib/submit-report.server";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`submit-report:${ip}`, 20, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Please log in to submit a report" }, { status: 401 });
    }

    const idToken = authHeader.slice(7);
    let decoded: { uid: string; email?: string };
    try {
      decoded = await verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const type = body.type === "listing" ? "listing" : body.type === "user" ? "user" : null;
    if (!type) {
      return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
    }

    const result = await submitReportAdmin(
      {
        type,
        reporterUserId: decoded.uid,
        reporterUserEmail: decoded.email || "",
        reportedUserId: typeof body.reportedUserId === "string" ? body.reportedUserId : "",
        reportedUserEmail: typeof body.reportedUserEmail === "string" ? body.reportedUserEmail : "",
        reportedUsername: typeof body.reportedUsername === "string" ? body.reportedUsername : "",
        listingId: typeof body.listingId === "string" ? body.listingId : "",
        reason: typeof body.reason === "string" ? body.reason : "",
        details:
          typeof body.details === "string"
            ? body.details
            : typeof body.description === "string"
              ? body.description
              : "",
      },
      idToken
    );

    if (result.ok === false) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ success: true, ok: true, id: result.id });
  } catch (e) {
    console.error("[submit-report]", e);
    return NextResponse.json({ error: "Failed to submit report" }, { status: 500 });
  }
}
