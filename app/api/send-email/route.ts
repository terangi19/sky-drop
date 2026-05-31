import { NextRequest, NextResponse } from "next/server";
import { verifyIdToken } from "../../lib/firebase-admin";
import { rateLimit } from "../../lib/rate-limit";
import { isAdminEmail } from "../../lib/admin-utils";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = await rateLimit(`email:${ip}`, 20, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    let decoded;
    try {
      decoded = await verifyIdToken(idToken);
    } catch {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const { to, subject, html } = await req.json();
    if (!to || !subject || !html) {
      return NextResponse.json({ error: "Missing to, subject, or html" }, { status: 400 });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json({ error: "Invalid recipient email" }, { status: 400 });
    }

    if (to !== decoded.email && !isAdminEmail(decoded.email)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const transport = {
      host: process.env.SMTP_HOST || "",
      port: Number(process.env.SMTP_PORT) || 587,
      auth: {
        user: process.env.SMTP_USER || "",
        pass: process.env.SMTP_PASS || "",
      },
    };

    if (transport.host && transport.auth.user) {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.default.createTransport(transport);
      await transporter.sendMail({
        from: { name: "Sky Drop", address: process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@skydrop.nz" },
        to, subject, html,
      });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error("[send-email] Error:", e?.code || e?.message || e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

