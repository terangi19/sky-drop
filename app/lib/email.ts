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
      <td style="padding: 8px 0 32px;">
        <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
          <tr>
            <td style="border-radius:10px;" bgcolor="#38bdf8">
              <a href="${data.ctaUrl}" style="display:inline-block;background:#38bdf8;color:#0a0a0a;font-weight:700;font-size:14px;padding:14px 36px;border-radius:10px;text-decoration:none;letter-spacing:0.3px;">
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
      <td style="padding: 0 0 24px; font-size: 13px; line-height: 1.5; color: #666;">
        ${data.footerNote}
      </td>
    </tr>
  ` : "";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;-webkit-font-smoothing:antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;">
    <tr>
      <td align="center" style="padding:48px 16px;">
        <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">

          <tr>
            <td align="center" style="padding:0 0 6px;">
              <span style="font-size:24px;font-weight:900;color:#fff;letter-spacing:1.5px;">SKY<span style="color:#38bdf8;">DROP</span></span>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 0 40px;font-size:13px;color:#555;letter-spacing:0.3px;">New Zealand's marketplace</td>
          </tr>

          <tr>
            <td style="background:#141414;border-radius:20px;padding:40px;border:1px solid #222;">

              <tr>
                <td style="padding:0 0 20px;">
                  <div style="width:40px;height:4px;background:#38bdf8;border-radius:2px;margin-bottom:20px;"></div>
                  <h1 style="margin:0;font-size:22px;font-weight:800;color:#fff;letter-spacing:-0.3px;line-height:1.3;">${data.title}</h1>
                </td>
              </tr>

              <tr>
                <td style="padding:0 0 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:1px;background:#222;"></td></tr></table>
                </td>
              </tr>

              <tr>
                <td style="font-size:15px;color:#ccc;line-height:1.7;padding:0 0 8px;">
                  ${data.message.replace(/\n/g, "<br>")}
                </td>
              </tr>

              ${ctaBlock}
              ${footerNoteBlock}

              <tr>
                <td style="padding:16px 0 0;">
                  <table width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:1px;background:#222;"></td></tr></table>
                </td>
              </tr>

              <tr>
                <td style="padding:16px 0 0;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="font-size:13px;color:#555;">
                        Sent from <a href="https://skydrop.nz" style="color:#38bdf8;text-decoration:none;font-weight:600;">Sky Drop</a>
                      </td>
                      <td align="right" style="font-size:13px;color:#555;">
                        ${new Date().getFullYear()}
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

            </td>
          </tr>

          <tr>
            <td align="center" style="padding:32px 0 0;font-size:12px;color:#444;line-height:1.6;">
              You're receiving this because you have a Sky Drop account.
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
