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
        <style>
          @media only screen and (max-width:480px) {
            .email-container { padding:16px !important; }
            .email-inner { width:100% !important; }
          }
        </style>
      </head>
      <body style="margin:0;padding:0;background:linear-gradient(135deg,#0a0a0a,#0f0f0f);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,#0a0a0a,#0f0f0f);">
          <tr>
            <td align="center" style="padding:32px 16px;">
              <table width="540" cellpadding="0" cellspacing="0" class="email-inner" style="max-width:540px;width:100%;position:relative;">
                <tr>
                  <td align="center" style="padding:0 0 18px;">
                    <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                      <tr>
                        <td style="text-align:center;padding:12px 24px;border-radius:14px;background:linear-gradient(135deg, rgba(56,189,248,0.08), rgba(129,140,248,0.05));border:1px solid rgba(56,189,248,0.15);box-shadow:0 4px 20px rgba(56,189,248,0.1),inset 0 1px 0 rgba(255,255,255,0.05);">
                          <span style="font-size:20px;font-weight:700;color:#e0e0e0;letter-spacing:1px;">SKY</span>
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" style="display:inline-block;margin:0 5px;width:24px;height:24px;vertical-align:middle;">
                            <defs>
                              <linearGradient id="canopy" x1="24" y1="5" x2="24" y2="19" gradientUnits="userSpaceOnUse">
                                <stop stop-color="#7dd3fc" stop-opacity="0.5"/>
                                <stop offset="1" stop-color="#38bdf8" stop-opacity="0.2"/>
                              </linearGradient>
                              <linearGradient id="brand" x1="10" y1="6" x2="38" y2="40" gradientUnits="userSpaceOnUse">
                                <stop stop-color="#38bdf8"/>
                                <stop offset="1" stop-color="#818cf8"/>
                              </linearGradient>
                              <linearGradient id="box" x1="17" y1="28" x2="31" y2="38" gradientUnits="userSpaceOnUse">
                                <stop stop-color="#38bdf8"/>
                                <stop offset="1" stop-color="#6366f1"/>
                              </linearGradient>
                            </defs>
                            <path d="M8 17.5 C8 8.5 15.5 4.5 24 4.5 C32.5 4.5 40 8.5 40 17.5" fill="url(#canopy)" stroke="url(#brand)" stroke-width="2" stroke-linecap="round"/>
                            <circle cx="24" cy="7.5" r="1.6" fill="none" stroke="#7dd3fc" stroke-width="0.9" opacity="0.9"/>
                            <path d="M24 8.5 L11 17" stroke="#7dd3fc" stroke-width="0.7" stroke-linecap="round" opacity="0.45"/>
                            <path d="M24 8.5 L17 11.5" stroke="#7dd3fc" stroke-width="0.7" stroke-linecap="round" opacity="0.35"/>
                            <path d="M24 8.5 L24 17" stroke="#7dd3fc" stroke-width="0.7" stroke-linecap="round" opacity="0.4"/>
                            <path d="M24 8.5 L31 11.5" stroke="#7dd3fc" stroke-width="0.7" stroke-linecap="round" opacity="0.35"/>
                            <path d="M24 8.5 L37 17" stroke="#7dd3fc" stroke-width="0.7" stroke-linecap="round" opacity="0.45"/>
                            <line x1="11" y1="17.2" x2="18.5" y2="27.5" stroke="url(#brand)" stroke-width="1" stroke-linecap="round" opacity="0.75"/>
                            <line x1="17" y1="17.2" x2="18.5" y2="27.5" stroke="url(#brand)" stroke-width="1" stroke-linecap="round" opacity="0.8"/>
                            <line x1="24" y1="17.2" x2="24" y2="27.5" stroke="url(#brand)" stroke-width="1" stroke-linecap="round" opacity="0.85"/>
                            <line x1="31" y1="17.2" x2="29.5" y2="27.5" stroke="url(#brand)" stroke-width="1" stroke-linecap="round" opacity="0.8"/>
                            <line x1="37" y1="17.2" x2="29.5" y2="27.5" stroke="url(#brand)" stroke-width="1" stroke-linecap="round" opacity="0.75"/>
                            <rect x="17" y="27.5" width="14" height="10" rx="1.8" fill="url(#box)"/>
                            <path d="M17 30 H31" stroke="white" stroke-opacity="0.35" stroke-width="1" stroke-linecap="round"/>
                            <path d="M26.5 31.5 L29 31.5 L29 29.5" stroke="white" stroke-opacity="0.5" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round"/>
                            <circle cx="24" cy="40" r="1.1" fill="#38bdf8" opacity="0.55"/>
                            <circle cx="24" cy="42.2" r="0.75" fill="#a78bfa" opacity="0.4"/>
                          </svg>
                          <span style="font-size:20px;font-weight:700;color:#38bdf8;letter-spacing:1px;text-shadow:0 0 20px rgba(56,189,248,0.3);">DROP</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="padding:0 0 14px;"><table width="60" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td style="height:2px;background:linear-gradient(90deg,transparent,rgba(56,189,248,0.15),transparent);border-radius:1px;"></td></tr></table></td></tr>
                <tr>
                  <td style="padding:0 0 16px;">
                    <span style="font-size:22px;font-weight:900;color:#f0f0f0;line-height:1.3;">Verify Your Email</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 20px;">
                    <p style="font-size:14px;color:#bbb;line-height:1.7;margin:0;">
                      Thanks for joining Sky Drop! Please verify your email address to complete your account setup and start buying items immediately.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 0 24px;">
                    <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                      <tr>
                        <td style="border-radius:12px;background:linear-gradient(135deg, #38bdf8, #818cf8);box-shadow:0 4px 15px rgba(56,189,248,0.3);">
                          <a href="${verificationLink}" style="display:inline-block;background:linear-gradient(135deg, #38bdf8, #818cf8);color:#0a0a0a;font-weight:800;font-size:15px;padding:16px 36px;border-radius:12px;text-decoration:none;letter-spacing:0.3px;">Verify Email</a>
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
                  <td style="padding:0 0 8px;">
                    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(56,189,248,0.04);border:1px solid rgba(56,189,248,0.1);border-radius:12px;padding:14px 18px;">
                      <tr>
                        <td style="font-size:11px;font-weight:700;color:#38bdf8;letter-spacing:0.5px;">🔒 Secure Platform</td>
                      </tr>
                      <tr>
                        <td style="padding:6px 0 0;font-size:12px;color:#888;line-height:1.6;">
                          Sky Drop is a secure marketplace. Verifying your email helps protect your account and ensures you receive important notifications.
                        </td>
                      </tr>
                    </table>
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
                          ${process.env.BUSINESS_ADDRESS || "New Zealand"}<br>
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
