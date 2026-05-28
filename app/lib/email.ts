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
      <td style="padding: 0 0 24px;">
        <a href="${data.ctaUrl}" style="display:inline-block;background:#38bdf8;color:#000;font-weight:700;font-size:14px;padding:14px 32px;border-radius:12px;text-decoration:none;">
          ${data.cta}
        </a>
      </td>
    </tr>
  ` : "";

  const footerNoteBlock = data.footerNote ? `
    <tr>
      <td style="padding: 0 0 12px; font-size: 12px; color: #888;">
        ${data.footerNote}
      </td>
    </tr>
  ` : "";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0d0d0d;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding:0 0 8px;">
              <span style="font-size:22px;font-weight:900;color:#fff;letter-spacing:1px;">SKY<span style="color:#38bdf8;">DROP</span></span>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 0 24px;font-size:13px;color:#666;">New Zealand's community marketplace</td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background:#1a1a1a;border-radius:16px;padding:32px;border:1px solid #222;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="font-size:13px;color:#888;padding:0 0 8px;">${data.title}</td>
                </tr>
                <tr>
                  <td style="font-size:15px;color:#e0e0e0;line-height:1.5;padding:0 0 20px;">
                    ${data.message.replace(/\n/g, "<br>")}
                  </td>
                </tr>
                ${ctaBlock}
                ${footerNoteBlock}
                <tr>
                  <td style="border-top:1px solid #222;padding:16px 0 0;font-size:12px;color:#555;">
                    You received this email because you have a Sky Drop account.
                    <br><a href="https://skydrop.nz" style="color:#38bdf8;text-decoration:none;">Sky Drop</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px 0 0;font-size:11px;color:#444;">
              © ${new Date().getFullYear()} Sky Drop. All rights reserved.
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
