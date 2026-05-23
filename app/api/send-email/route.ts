import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "../../lib/rate-limit";

const transport = {
  host: process.env.SMTP_HOST || "",
  port: Number(process.env.SMTP_PORT) || 587,
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },
};

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
    const { allowed } = rateLimit(`email:${ip}`, 20, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { to, subject, html } = await req.json();
    if (!to || !subject || !html) {
      return NextResponse.json({ error: "Missing to, subject, or html" }, { status: 400 });
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json({ error: "Invalid recipient email" }, { status: 400 });
    }

    // If SMTP is configured, send real email
    if (transport.host && transport.auth.user) {
      const nodemailer = await import("nodemailer");
      const transporter = nodemailer.default.createTransport(transport);
      await transporter.sendMail({ from: process.env.SMTP_FROM || "noreply@skydrop.nz", to, subject, html });
    }

    // Log as fallback
    // email sent

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("Email send error:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
