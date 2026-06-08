import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, isAdminInitialized, verifyIdToken } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import {
  REPORT_REASONS,
  submitUserReportAdmin,
} from "../../lib/submit-report.server";

const REPORT_REASON_SET = new Set<string>(REPORT_REASONS);
const COOLDOWN_MS = 10 * 60 * 1000;

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

    let decoded: { uid: string; email?: string };
    try {
      decoded = await verifyIdToken(authHeader.slice(7));
    } catch {
      return NextResponse.json({ error: "Invalid or expired session" }, { status: 401 });
    }

    const reporterUserId = decoded.uid;
    const reporterUserEmail = decoded.email?.trim() || "";
    if (!reporterUserEmail) {
      return NextResponse.json({ error: "Could not determine your account email" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const type = body.type === "listing" ? "listing" : body.type === "user" ? "user" : "";
    if (!type) {
      return NextResponse.json({ error: "Invalid report type" }, { status: 400 });
    }

    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!reason || !REPORT_REASON_SET.has(reason)) {
      return NextResponse.json({ error: "Please select a valid reason" }, { status: 400 });
    }

    const reportedUserId = typeof body.reportedUserId === "string" ? body.reportedUserId.trim() : "";
    const reportedUserEmail = typeof body.reportedUserEmail === "string" ? body.reportedUserEmail.trim() : "";
    const reportedUsername =
      typeof body.reportedUsername === "string" ? body.reportedUsername.trim() : "";
    const listingId = typeof body.listingId === "string" ? body.listingId.trim() : "";
    const details = typeof body.details === "string" ? body.details.trim().slice(0, 2000) : "";

    if (type === "listing" && !listingId) {
      return NextResponse.json({ error: "Listing id is required" }, { status: 400 });
    }

    if (type === "user") {
      const result = await submitUserReportAdmin({
        reporterUserId,
        reporterUserEmail,
        reportedUserId,
        reportedUserEmail,
        reportedUsername: reportedUsername || undefined,
        reason,
        details,
      });
      if (!result.ok) {
        return NextResponse.json({ error: (result as { error: string }).error }, { status: (result as { status: number }).status });
      }
      return NextResponse.json({ ok: true, id: result.id });
    }

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Reporting is temporarily unavailable" }, { status: 503 });
    }

    const db = getAdminDb();
    const reports = db.collection("reports");

    const recent = await reports
      .where("reporterUserId", "==", reporterUserId)
      .where("type", "==", "listing")
      .where("listingId", "==", listingId)
      .orderBy("createdAt", "desc")
      .limit(1)
      .get();

    if (!recent.empty) {
      const last = recent.docs[0].data();
      const lastMs = last.createdAt?.toMillis?.() ?? 0;
      if (lastMs && Date.now() - lastMs < COOLDOWN_MS) {
        return NextResponse.json(
          { error: "Please wait a few minutes before reporting this again" },
          { status: 429 }
        );
      }
    }

    const docRef = await reports.add({
      type: "listing",
      listingId,
      reportedUserId: reportedUserId || null,
      reportedUserEmail: reportedUserEmail || null,
      reporterUserId,
      reporterUserEmail,
      reason,
      details: details || null,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ ok: true, id: docRef.id });
  } catch (e) {
    console.error("[submit-report]", e);
    return NextResponse.json({ error: "Failed to submit report" }, { status: 500 });
  }
}
