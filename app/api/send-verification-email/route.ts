import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_URL || "https://skydrop.co.nz";
    const verificationLink = `${baseUrl}/verify-email?email=${encodeURIComponent(email)}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
      </head>
      <body style="margin:0;padding:0;background:linear-gradient(135deg,#0a0a0a,#0f0f0f);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,#0a0a0a,#0f0f0f);">
          <tr>
            <td align="center" style="padding:32px 16px;">
              <table width="540" cellpadding="0" cellspacing="0" style="max-width:540px;width:100%;">
                <tr>
                  <td align="center" style="padding:0 0 18px;">
                    <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                      <tr>
                        <td style="text-align:center;padding:12px 24px;border-radius:14px;background:linear-gradient(135deg, rgba(56,189,248,0.08), rgba(129,140,248,0.05));border:1px solid rgba(56,189,248,0.15);">
                          <span style="font-size:20px;font-weight:700;color:#e0e0e0;letter-spacing:1px;">SKY</span>
                          <span style="font-size:20px;font-weight:700;color:#38bdf8;letter-spacing:1px;">DROP</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:20px 0 16px;">
                    <span style="font-size:28px;font-weight:900;color:#ffffff;line-height:1.3;">Verify Your Email</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 20px;">
                    <p style="font-size:14px;color:#bbb;line-height:1.6;margin:0;">
                      Thanks for joining Sky Drop! Please verify your email address to complete your account setup.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 24px;">
                    <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                      <tr>
                        <td style="border-radius:12px;background:linear-gradient(135deg, #38bdf8, #818cf8);">
                          <a href="${verificationLink}" style="display:inline-block;background:linear-gradient(135deg, #38bdf8, #818cf8);color:#0a0a0a;font-weight:800;font-size:16px;padding:16px 36px;border-radius:12px;text-decoration:none;letter-spacing:0.3px;">Verify Email</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 12px;">
                    <p style="font-size:12px;color:#888;line-height:1.5;margin:0;">
                      Or copy and paste this link into your browser:
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 32px;">
                    <p style="font-size:11px;color:#666;line-height:1.4;margin:0;word-break:break-all;">
                      ${verificationLink}
                    </p>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:24px 0 0;">
                    <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                      <tr>
                        <td style="font-size:11px;color:#555;">
                          <a href="${baseUrl}" style="color:#555;text-decoration:none;font-weight:600;">Sky Drop</a>
                          &nbsp;·&nbsp;
                          <span style="color:#444;">${new Date().getFullYear()}</span>
                          &nbsp;·&nbsp;
                          <span style="color:#444;">New Zealand</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0 0;font-size:10px;color:#3a3a3a;text-align:center;line-height:1.5;">
                          You're receiving this because you have a Sky Drop account.
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
      </html>
    `;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Sky Drop <noreply@skydrop.co.nz>",
        to: email,
        subject: "Verify your email for Sky Drop",
        html,
      }),
    });

    if (!resendRes.ok) {
      const error = await resendRes.text();
      console.error("[send-verification-email] Resend error:", error);
      return NextResponse.json({ error: "Failed to send verification email" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("[send-verification-email]", e);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
