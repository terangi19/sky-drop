import { NextRequest, NextResponse } from "next/server";
import { applyRateLimit, authenticateRequest, isErrorResponse } from "../../lib/api-helpers";
import { isAdminEmail } from "../../lib/admin-check";
import { sendSmtpEmail } from "../../lib/smtp";

export async function POST(req: NextRequest) {
  try {
    const limited = await applyRateLimit(req, "email", 20);
    if (limited) return limited;

    const auth = await authenticateRequest(req);
    if (isErrorResponse(auth)) return auth;

    const { to, subject, html } = await req.json();
    if (!to || !subject || !html) {
      return NextResponse.json({ error: "Missing to, subject, or html" }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json({ error: "Invalid recipient email" }, { status: 400 });
    }

    if (to !== auth.email && !isAdminEmail(auth.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await sendSmtpEmail({ to, subject, html });

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[send-email] Error:", msg);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
