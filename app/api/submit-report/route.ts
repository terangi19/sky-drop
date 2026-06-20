import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "../../lib/firebase-admin";
import {
  decide, applyDecisionDelay, persistRiskFlag, recordTurnstileAttempt,
  type DecisionInput,
} from "../../lib/abuse-decision-engine";
import { submitReportAdmin } from "../../lib/submit-report.server";
import { verifyTurnstileToken, isTurnstileConfigured } from "../../lib/turnstile";
import { parseIpFromRequest } from "../../lib/geo-check";
import { rateLimit } from "../../lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const ip = parseIpFromRequest(req.headers);
    
    // Rate limit: 5 reports per hour per IP
    const { allowed } = await rateLimit(`submit-report:${ip}`, 5, 3600_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many reports. Please try again later." }, { status: 429 });
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

    const decisionInput: DecisionInput = { uid: decoded.uid, ip, email: decoded.email, action: "report" };
    const decision = await decide(decisionInput);
    await applyDecisionDelay(decision);

    const body = await req.json().catch(() => ({}));

    if (decision.captchaRequired && isTurnstileConfigured()) {
      const turnstileToken = typeof body.turnstileToken === "string" ? body.turnstileToken : "";
      if (!turnstileToken || !(await verifyTurnstileToken(turnstileToken))) {
        recordTurnstileAttempt(decoded.uid, false);
        return NextResponse.json({ error: "Security check failed" }, { status: 403 });
      }
      recordTurnstileAttempt(decoded.uid, true);
    }

    if (decision.verdict === "block") {
      await persistRiskFlag(decoded.uid || "", `report_blocked:${decision.reason}`);
      return NextResponse.json({ error: "Report could not be submitted" }, { status: 403 });
    }

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
