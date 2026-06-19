import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyIdToken, getAdminDb, isAdminInitialized } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { parseIpFromRequest } from "../../lib/geo-check";

export async function POST(req: NextRequest) {
  try {
    const ip = parseIpFromRequest(req.headers);
    const { allowed } = await rateLimit(`submit-job-application:${ip}`, 10, 60_000);
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

    const applicantEmail = decoded.email || "";
    if (!applicantEmail) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Server not configured" }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const listingId = typeof body.listingId === "string" ? body.listingId.trim() : "";
    const listingTitle = typeof body.listingTitle === "string" ? body.listingTitle.trim() : "";
    const employerEmail = typeof body.employerEmail === "string" ? body.employerEmail.trim() : "";
    const employerId = typeof body.employerId === "string" ? body.employerId.trim() : "";
    const applicantName = typeof body.applicantName === "string" ? body.applicantName.trim() : "";
    const applicantPhone = typeof body.applicantPhone === "string" ? body.applicantPhone.trim() : "";
    const coverLetter = typeof body.coverLetter === "string" ? body.coverLetter.trim() : "";
    const resumeURL = typeof body.resumeURL === "string" ? body.resumeURL.trim() : "";
    const resumeName = typeof body.resumeName === "string" ? body.resumeName.trim() : "";

    if (!listingId || !listingTitle || !employerEmail || !applicantName || !coverLetter) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const db = getAdminDb();

    const existing = await db
      .collection("jobApplications")
      .where("listingId", "==", listingId)
      .where("applicantEmail", "==", applicantEmail)
      .limit(1)
      .get();
    if (!existing.empty) {
      return NextResponse.json({ error: "You already applied for this job" }, { status: 409 });
    }

    const ref = await db.collection("jobApplications").add({
      listingId,
      listingTitle: listingTitle.slice(0, 200),
      employerEmail,
      employerId,
      applicantEmail,
      applicantName: applicantName.slice(0, 120),
      applicantPhone: applicantPhone.slice(0, 40),
      coverLetter: coverLetter.slice(0, 5000),
      resumeURL: resumeURL || null,
      resumeName: resumeName || null,
      status: "pending",
      createdAt: FieldValue.serverTimestamp(),
    });

    await db.collection("notifications").add({
      type: "job_application",
      targetEmail: employerEmail.toLowerCase(),
      fromEmail: applicantEmail.toLowerCase(),
      title: `New application for "${listingTitle.slice(0, 80)}"`,
      message: `${applicantName} has applied for your job listing.`,
      listingId,
      listingTitle: listingTitle.slice(0, 200),
      read: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, id: ref.id });
  } catch (e: unknown) {
    console.error("[submit-job-application]", e);
    return NextResponse.json({ error: "Failed to submit application" }, { status: 500 });
  }
}
