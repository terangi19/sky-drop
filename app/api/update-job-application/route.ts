import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyIdToken, getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { parseIpFromRequest } from "../../lib/geo-check";

const STATUSES = new Set(["pending", "reviewed", "accepted", "rejected"]);

export async function POST(req: NextRequest) {
  try {
    const ip = parseIpFromRequest(req.headers);
    const { allowed } = await rateLimit(`update-job-application:${ip}`, 20, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let decoded;
    try {
      decoded = await verifyIdToken(authHeader.slice(7));
    } catch {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const employerEmail = decoded.email || "";
    if (!employerEmail) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const applicationId = typeof body.applicationId === "string" ? body.applicationId.trim() : "";
    if (!applicationId) {
      return NextResponse.json({ error: "Missing applicationId" }, { status: 400 });
    }

    const db = getAdminDb();
    const appRef = db.collection("jobApplications").doc(applicationId);
    const appSnap = await appRef.get();
    if (!appSnap.exists) {
      return NextResponse.json({ error: "Application not found" }, { status: 404 });
    }

    const appData = appSnap.data()!;
    if (String(appData.employerEmail || "") !== employerEmail) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const update: Record<string, unknown> = {};
    if (typeof body.status === "string" && STATUSES.has(body.status)) {
      update.status = body.status;
      update.reviewedAt = FieldValue.serverTimestamp();
    }
    if (typeof body.employerNotes === "string") {
      update.employerNotes = body.employerNotes.trim().slice(0, 2000);
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    await appRef.update(update);

    const status = typeof body.status === "string" ? body.status : "";
    const applicantEmail = String(appData.applicantEmail || "");
    const listingTitle = String(appData.listingTitle || "");
    if ((status === "accepted" || status === "rejected") && applicantEmail && listingTitle) {
      const employerNotes =
        typeof body.employerNotes === "string" ? body.employerNotes.trim() : "";
      await db.collection("notifications").add({
        type: status === "accepted" ? "verification" : "warning",
        targetEmail: applicantEmail.toLowerCase(),
        fromEmail: employerEmail.toLowerCase(),
        title: status === "accepted" ? "Application Accepted! 🎉" : "Application Status Update",
        message:
          status === "accepted"
            ? `Your application for "${listingTitle}" has been accepted! The employer will be in touch soon.`
            : `Your application for "${listingTitle}" has been updated.${employerNotes ? ` Notes: ${employerNotes}` : ""}`,
        listingTitle: listingTitle.slice(0, 200),
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    console.error("[update-job-application]", e);
    return NextResponse.json({ error: "Failed to update application" }, { status: 500 });
  }
}
