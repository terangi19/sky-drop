interface EmailData {
  to: string;
  subject: string;
  title: string;
  message: string;
  cta?: string;
  ctaUrl?: string;
  footerNote?: string;
}

export function buildEmailHtml(data: EmailData): string {
  const ctaBlock = data.cta && data.ctaUrl ? `
    <tr>
      <td style="padding: 4px 0 24px;">
        <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
          <tr>
            <td style="border-radius:8px;" bgcolor="#38bdf8">
              <a href="${data.ctaUrl}" style="display:inline-block;background:#38bdf8;color:#0a0a0a;font-weight:700;font-size:14px;padding:13px 32px;border-radius:8px;text-decoration:none;">
                ${data.cta}
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  ` : "";

  const footerNoteBlock = data.footerNote ? `
    <tr>
      <td style="padding: 0 0 20px; font-size: 13px; line-height: 1.5; color: #666;">
        ${data.footerNote}
      </td>
    </tr>
  ` : "";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  .logo-txt { font-size: 20px; font-weight: 900; color: #e0e0e0; letter-spacing: 1.5px; }
  .logo-accent { color: #38bdf8; }
</style>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding:0 0 32px;">
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="vertical-align:middle;">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="36" height="36" style="display:block;margin:0 auto 8px;">
                      <circle cx="16" cy="16" r="14" fill="none" stroke="#38bdf8" stroke-width="0.4" opacity="0.15"/>
                      <path d="M2 9 C2 4, 8 1, 16 1 C24 1, 30 4, 30 9" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M8 9 C8 5.5, 12 3, 16 3 C20 3, 24 5.5, 24 9" fill="none" stroke="#38bdf8" stroke-width="0.6" opacity="0.3" stroke-linecap="round"/>
                      <line x1="6" y1="9.5" x2="10" y2="18" stroke="#38bdf8" stroke-width="0.8" opacity="0.35" stroke-linecap="round"/>
                      <line x1="26" y1="9.5" x2="22" y2="18" stroke="#38bdf8" stroke-width="0.8" opacity="0.35" stroke-linecap="round"/>
                      <line x1="16" y1="9.5" x2="16" y2="18" stroke="#38bdf8" stroke-width="0.8" opacity="0.35" stroke-linecap="round"/>
                      <rect x="10.5" y="18" width="11" height="9" rx="1.5" fill="none" stroke="#38bdf8" stroke-width="1.8" stroke-linejoin="round"/>
                      <line x1="11" y1="21" x2="21" y2="21" stroke="#38bdf8" stroke-width="1.2" opacity="0.5" stroke-linecap="round"/>
                      <path d="M12.5 22.5 L15 22.5" stroke="#38bdf8" stroke-width="0.8" opacity="0.3" stroke-linecap="round"/>
                      <path d="M18 23 L21 23 L21 20" fill="none" stroke="#38bdf8" stroke-width="1" opacity="0.5" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                  </td>
                  <td style="vertical-align:middle;padding-left:10px;">
                    <span style="font-size:20px;font-weight:900;color:#e0e0e0;letter-spacing:1.5px;">SKY</span>
                    <span style="font-size:20px;font-weight:900;color:#38bdf8;letter-spacing:1.5px;">DROP</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background:#141414;border-radius:16px;padding:36px;border:1px solid #222;">
              <table width="100%" cellpadding="0" cellspacing="0">

                <tr>
                  <td style="padding:0 0 20px;font-size:20px;font-weight:800;color:#f0f0f0;letter-spacing:-0.2px;line-height:1.3;">
                    ${data.title}
                  </td>
                </tr>

                <tr>
                  <td style="font-size:15px;color:#bbb;line-height:1.7;padding:0 0 4px;">
                    ${data.message.replace(/\n/g, "<br>")}
                  </td>
                </tr>

                ${ctaBlock}

                ${footerNoteBlock}

              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px 0 0;">
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="font-size:12px;color:#555;">
                    <a href="${process.env.NEXT_PUBLIC_BASE_URL || "https://skydrop.nz"}" style="color:#555;text-decoration:none;">Sky Drop</a>
                    &nbsp;·&nbsp;
                    <span style="color:#444;">${new Date().getFullYear()}</span>
                    &nbsp;·&nbsp;
                    <span style="color:#444;">New Zealand</span>
                  </td>
                </tr>
                <tr>
                  <td style="padding:12px 0 0;font-size:11px;color:#3a3a3a;">
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
</html>`;
}

export function notificationToEmail(type: string, title: string, listingTitle?: string, total?: number): { subject: string; message: string } {
  switch (type) {
    case "purchase":
      return {
        subject: `🛒 ${title}`,
        message: listingTitle
          ? total
            ? `You have a new purchase for "${listingTitle}" — $${total.toFixed(2)}.\n\nCheck your sales dashboard to confirm and ship.`
            : `You have a new purchase for "${listingTitle}".\n\nCheck your sales dashboard.`
          : `You have a new purchase.\n\nCheck your sales dashboard.`,
      };
    case "bid":
      return {
        subject: `🔨 ${title}`,
        message: listingTitle
          ? `There's a new bid on "${listingTitle}".\n\nCheck the listing to see the current bid.`
          : `There's a new bid on your listing.`,
      };
    case "outbid":
      return {
        subject: `💸 ${title}`,
        message: listingTitle
          ? `You've been outbid on "${listingTitle}".\n\nPlace a higher bid to win.`
          : `You've been outbid.`,
      };
    case "question":
      return {
        subject: `❓ ${title}`,
        message: listingTitle
          ? `A buyer has a question about "${listingTitle}".\n\nOpen the listing to reply.`
          : `A buyer has a question about your listing.`,
      };
    case "offer":
      return {
        subject: `💬 ${title}`,
        message: listingTitle
          ? `You received an offer on "${listingTitle}".\n\nCheck your messages to review and respond.`
          : `You received an offer on your listing.`,
      };
    case "job_application":
      return {
        subject: `💼 ${title}`,
        message: listingTitle
          ? `A new application has been submitted for "${listingTitle}".\n\nReview the applicant's details in your dashboard.`
          : `A new job application has been submitted.`,
      };
    case "verification":
      return {
        subject: `🔐 ${title}`,
        message: `Your verification status has been updated.\n\nLog in to your account to view the changes.`,
      };
    case "referral_reward":
      return {
        subject: `🎁 ${title}`,
        message: `You earned a referral reward!\n\nCheck your dashboard for details.`,
      };
    default:
      return {
        subject: title,
        message: listingTitle
          ? `${title}\n\nListing: ${listingTitle}`
          : title,
      };
  }
}
