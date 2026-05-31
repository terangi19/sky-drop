interface StatusBadge {
  text: string;
  color: "sky" | "green" | "amber" | "red" | "purple" | "emerald";
}

interface SummaryRow {
  label: string;
  value: string;
  highlight?: boolean;
}

interface EmailData {
  to: string;
  subject: string;
  title: string;
  message: string;
  listingImage?: string;
  listingTitle?: string;
  sellerName?: string;
  buyerName?: string;
  orderId?: string;
  date?: string;
  total?: string;
  statusBadge?: StatusBadge;
  summaryRows?: SummaryRow[];
  whatHappensNext?: string[];
  ctas?: { label: string; url: string; primary?: boolean }[];
  showTrustSection?: boolean;
}

const BADGE_STYLES: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  sky:      { bg: "#0a1e30", text: "#38bdf8", border: "#1a3a5a", glow: "rgba(56,189,248,0.15)" },
  green:    { bg: "#0a1f12", text: "#10b981", border: "#1a3a22", glow: "rgba(16,185,129,0.15)" },
  emerald:  { bg: "#0a1f12", text: "#34d399", border: "#1a3a22", glow: "rgba(52,211,153,0.15)" },
  amber:    { bg: "#1e1500", text: "#f59e0b", border: "#3a2a00", glow: "rgba(245,158,11,0.15)" },
  red:      { bg: "#1e0808", text: "#ef4444", border: "#3a1818", glow: "rgba(239,68,68,0.15)" },
  purple:   { bg: "#140a1e", text: "#a78bfa", border: "#2a1a3a", glow: "rgba(167,139,250,0.15)" },
};

const BADGE_ICONS: Record<string, string> = {
  sky: "🔒",
  green: "✓",
  emerald: "✓",
  amber: "⏳",
  red: "✕",
  purple: "ℹ",
};

function badgeBlock(badge?: StatusBadge): string {
  if (!badge) return "";
  const s = BADGE_STYLES[badge.color] || BADGE_STYLES.sky;
  const icon = BADGE_ICONS[badge.color] || "";
  return `
    <tr><td style="padding:0 0 20px;">
      <table cellpadding="0" cellspacing="0" style="margin:0;">
        <tr>
          <td style="background:${s.bg};border:1px solid ${s.border};border-radius:20px;padding:8px 18px;box-shadow:0 0 20px ${s.glow};">
            <span style="font-size:13px;font-weight:700;color:${s.text};letter-spacing:0.3px;">${icon ? icon + " " : ""}${badge.text}</span>
          </td>
        </tr>
      </table>
    </td></tr>
  `;
}

function productCard(image?: string, title?: string, seller?: string): string {
  if (!image && !title) return "";
  return `
    <tr><td style="padding:0 0 20px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:12px;border:1px solid #2a2a2a;">
        <tr>
          ${image ? `
          <td width="80" style="padding:0;">
            <img src="${image}" alt="" width="80" height="80" style="display:block;width:80px;height:80px;" />
          </td>
          ` : ""}
          <td style="padding:14px 16px;vertical-align:middle;">
            ${title ? `<span style="font-size:15px;font-weight:700;color:#f0f0f0;line-height:1.3;">${title}</span>` : ""}
            ${seller ? `<br><span style="font-size:12px;color:#888;">Seller: ${seller}</span>` : ""}
          </td>
        </tr>
      </table>
    </td></tr>
  `;
}

function titleBlock(title: string): string {
  return `
    <tr><td style="padding:0 0 16px;">
      <span style="font-size:22px;font-weight:900;color:#f0f0f0;line-height:1.3;">${title}</span>
    </td></tr>
  `;
}

function messageBlock(message: string): string {
  if (!message) return "";
  const paragraphs = message.split("\n\n").map((p, i) => `
    <tr>
      <td style="font-size:14px;color:#bbb;line-height:1.7;padding:${i > 0 ? "12" : "0"}px 0 0;">
        ${p.replace(/\n/g, "<br>").replace(/\*\*(.+?)\*\*/g, "<strong style=\"color:#e0e0e0;\">$1</strong>")}
      </td>
    </tr>
  `).join("");
  return `
    <tr><td style="padding:0 0 20px;">
      <table width="100%" cellpadding="0" cellspacing="0">${paragraphs}</table>
    </td></tr>
  `;
}

function summaryBlock(rows?: SummaryRow[], orderId?: string, date?: string): string {
  if ((!rows || rows.length === 0) && !orderId && !date) return "";

  let headerRows = "";
  if (orderId) {
    headerRows += `
      <tr>
        <td style="padding:8px 0 4px;font-size:12px;color:#777;">Order ID</td>
        <td style="padding:8px 0 4px;font-size:12px;color:#ccc;text-align:right;font-family:monospace;letter-spacing:0.5px;">#${orderId}</td>
      </tr>`;
  }
  if (date) {
    headerRows += `
      <tr>
        <td style="padding:4px 0 8px;font-size:12px;color:#777;">Date</td>
        <td style="padding:4px 0 8px;font-size:12px;color:#ccc;text-align:right;">${date}</td>
      </tr>`;
  }

  const rowHtml = rows ? rows.map((r) => `
    <tr>
      <td style="padding:10px 0;font-size:13px;color:#999;">${r.label}</td>
      <td style="padding:10px 0;font-size:13px;font-weight:${r.highlight ? "800" : "600"};color:${r.highlight ? "#38bdf8" : "#f0f0f0"};text-align:right;">${r.value}</td>
    </tr>
  `).join(`
    <tr><td colspan="2" style="border-bottom:1px solid #222;"></td></tr>
  `) : "";

  const hasBoth = headerRows && rows;

  return `
    <tr><td style="padding:0 0 20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:0 0 12px;font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:1.5px;">Order Details</td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:12px;border:1px solid #2a2a2a;">
        <tr>
          <td style="padding:4px 18px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${headerRows}
              ${hasBoth ? `<tr><td colspan="2" style="border-bottom:1px solid #222;padding:0;"></td></tr>` : ""}
              ${rowHtml}
            </table>
          </td>
        </tr>
      </table>
    </td></tr>
  `;
}

function whatHappensNextBlock(steps?: string[]): string {
  if (!steps || steps.length === 0) return "";
  const items = steps.map((step, i) => `
    <tr>
      <td width="28" style="padding:8px 0;vertical-align:top;">
        <table cellpadding="0" cellspacing="0">
          <tr>
            <td style="width:24px;height:24px;border-radius:12px;background:#1a3a4a;text-align:center;vertical-align:middle;">
              <span style="font-size:11px;font-weight:800;color:#38bdf8;">${i + 1}</span>
            </td>
          </tr>
        </table>
      </td>
      <td style="padding:8px 0;font-size:13px;color:#bbb;line-height:1.5;">${step}</td>
    </tr>
  `).join("");
  return `
    <tr><td style="padding:0 0 20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:0 0 10px;font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:1.5px;">What Happens Next</td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border-radius:12px;border:1px solid #222;">
        <tr><td style="padding:6px 18px;">
          <table width="100%" cellpadding="0" cellspacing="0">${items}</table>
        </td></tr>
      </table>
    </td></tr>
  `;
}

function reviewBlock(): string {
  return `
    <tr><td style="padding:0 0 20px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;border-radius:12px;padding:16px 18px;border:1px solid #222;">
        <tr>
          <td style="font-size:13px;font-weight:700;color:#f0f0f0;">Enjoy your purchase?</td>
        </tr>
        <tr>
          <td style="padding:6px 0 0;font-size:12px;color:#888;line-height:1.5;">Leave a review for the seller and help the community make informed decisions. Your feedback builds trust on Sky Drop.</td>
        </tr>
      </table>
    </td></tr>
  `;
}

function ctaBlock(ctas?: { label: string; url: string; primary?: boolean }[]): string {
  if (!ctas || ctas.length === 0) return "";
  const buttons = ctas.map((cta) => {
    if (cta.primary) {
      return `
        <td style="padding:4px;">
          <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr>
              <td style="border-radius:10px;background:#38bdf8;">
                <a href="${cta.url}" style="display:inline-block;background:#38bdf8;color:#0a0a0a;font-weight:800;font-size:14px;padding:14px 32px;border-radius:10px;text-decoration:none;letter-spacing:0.2px;">${cta.label}</a>
              </td>
            </tr>
          </table>
        </td>`;
    }
    return `
      <td style="padding:4px;">
        <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
          <tr>
            <td style="border-radius:10px;border:1px solid #333;">
              <a href="${cta.url}" style="display:inline-block;color:#ccc;font-weight:600;font-size:13px;padding:14px 28px;border-radius:10px;text-decoration:none;">${cta.label}</a>
            </td>
          </tr>
        </table>
      </td>`;
  }).join("");
  return `
    <tr><td style="padding:0 0 20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td align="center" style="padding:0;">
          <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
            <tr>${buttons}</tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  `;
}

function trustSection(): string {
  return `
    <tr><td style="padding:0 0 8px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(239,68,68,0.04);border:1px solid rgba(239,68,68,0.1);border-radius:12px;padding:14px 18px;">
        <tr>
          <td style="font-size:11px;font-weight:700;color:#ef4444;letter-spacing:0.5px;">⚠️ Keep Your Purchase Protected</td>
        </tr>
        <tr>
          <td style="padding:6px 0 0;font-size:12px;color:#888;line-height:1.6;">
            You're free to communicate however you like — WhatsApp, text, email, in person. And you can pay however you choose — bank transfer, cash, crypto, whatever works for you.
            <strong style="color:#bbb;">But if you do, Sky Drop cannot protect you.</strong> If you take communication or payment outside our platform, you lose all buyer protection and <strong style="color:#ef4444;">you will not be eligible for a refund or dispute resolution.</strong>
            <br><br>All of this is at your own risk. <strong style="color:#ef4444;">You have been warned.</strong>
          </td>
        </tr>
      </table>
    </td></tr>
  `;
}

export function buildEmailHtml(data: EmailData): string {
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://skydrop.nz";

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @@media only screen and (max-width:480px) {
    .prod-img { width:60px !important; height:60px !important; }
    .cta-stack { display:block !important; }
    .cta-stack td { display:block !important; padding:4px 0 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;">
    <tr>
      <td align="center" style="padding:24px 16px;">
        <table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding:0 0 8px;">
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="text-align:center;">
                    <span style="font-size:20px;font-weight:900;color:#e0e0e0;letter-spacing:1.5px;">SKY</span>
                    <span style="font-size:20px;font-weight:900;color:#38bdf8;letter-spacing:1.5px;">DROP</span>
                  </td>
                </tr>
                <tr><td style="padding:2px 0 0;font-size:9px;color:#444;letter-spacing:2.5px;text-align:center;text-transform:uppercase;">New Zealand's Marketplace</td></tr>
              </table>
            </td>
          </tr>

          <!-- Divider -->
          <tr><td style="padding:0 0 16px;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-bottom:1px solid #1a1a1a;"></td></tr></table></td></tr>

          ${titleBlock(data.title)}

          ${data.statusBadge ? badgeBlock(data.statusBadge) : badgeBlock({ text: "Processing", color: "sky" })}

          ${productCard(data.listingImage, data.listingTitle, data.sellerName || data.buyerName)}

          ${messageBlock(data.message)}

          ${data.orderId || data.date || data.summaryRows ? summaryBlock(data.summaryRows, data.orderId, data.date) : ""}

          ${data.whatHappensNext ? whatHappensNextBlock(data.whatHappensNext) : ""}

          ${data.ctas && data.ctas.length > 0 ? ctaBlock(data.ctas) : ""}

          ${data.showTrustSection !== false ? trustSection() : ""}

          <!-- Footer -->
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
                    You're receiving this because you have a Sky Drop account.<br>
                    <a href="${baseUrl}/settings" style="color:#3a3a3a;text-decoration:underline;">Notification settings</a>
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

interface EmailContent {
  subject: string;
  title: string;
  message: string;
  statusBadge?: StatusBadge;
  summaryRows?: SummaryRow[];
  whatHappensNext?: string[];
  reviewPrompt?: boolean;
}

const STATUS_BADGES: Record<string, StatusBadge> = {
  purchase:            { text: "Payment Received", color: "green" },
  purchase_confirmation: { text: "Payment Held in Escrow", color: "sky" },
  order_confirmed:     { text: "Seller Confirmed ✓", color: "green" },
  item_shipped:        { text: "In Transit", color: "sky" },
  delivered:           { text: "Awaiting Confirmation", color: "amber" },
  bid:                 { text: "New Bid", color: "purple" },
  outbid:              { text: "You've Been Outbid", color: "red" },
  bid_confirmation:    { text: "Bid Active", color: "green" },
  auction_won:         { text: "Auction Won", color: "green" },
  auction_lost:        { text: "Not Winning", color: "red" },
  offer:               { text: "Pending Review", color: "amber" },
  offer_accepted:      { text: "Offer Accepted", color: "green" },
  offer_declined:      { text: "Declined", color: "red" },
  payment_released:    { text: "Funds Available", color: "green" },
  service_completed:   { text: "Complete", color: "emerald" },
  item_returned:       { text: "Returned", color: "emerald" },
  listing_rejected:    { text: "Not Approved", color: "red" },
  dispute_opened:      { text: "Under Review", color: "amber" },
  job_application:     { text: "New Application", color: "purple" },
  verification:        { text: "Updated", color: "sky" },
};

const WHAT_HAPPENS_NEXT: Record<string, string[]> = {
  purchase: [
    "Review the order details in your Sales Dashboard",
    "Prepare the item and get it ready for shipment",
    "Mark the order as shipped once it's on its way",
    "Funds will be released to you after buyer confirms delivery",
  ],
  purchase_confirmation: [
    "The seller will prepare your item for delivery",
    "You'll receive a notification when it's shipped",
    "Inspect your item carefully upon arrival",
    "Confirm delivery to release funds to the seller — you're protected until then",
  ],
  order_confirmed: [
    "Your seller is preparing your item for shipment",
    "You'll be notified the moment it's on its way",
    "Track delivery and prepare to receive your item",
    "Confirm receipt to release payment from escrow",
  ],
  item_shipped: [
    "Your item is on its way to you",
    "Track delivery using the shipping details provided",
    "Inspect the item as soon as it arrives",
    "Confirm delivery on Sky Drop to release payment to the seller",
  ],
  delivered: [
    "Inspect your item carefully",
    "Confirm delivery to release payment from escrow",
    "Leave a review for the seller to help the community",
  ],
  bid: [
    "Monitor bids as the auction progresses",
    "Respond to any buyer questions in messages",
    "The winning bidder will be notified when the auction ends",
    "Coordinate delivery once payment is confirmed",
  ],
  outbid: [
    "Place a higher bid to regain your winning position",
    "Set a higher auto-bid max to stay in the lead automatically",
    "You'll be notified if you're outbid again",
  ],
  bid_confirmation: [
    "Your bid is now active on this listing",
    "We'll notify you if you get outbid",
    "Increase your max bid anytime to stay ahead",
    "If you win, you'll have 24 hours to complete payment",
  ],
  auction_won: [
    "Congratulations on winning the auction!",
    "Complete your purchase within 24 hours to secure the item",
    "Coordinate delivery or pickup with the seller",
    "Funds are held securely until you confirm delivery",
  ],
  auction_lost: [
    "Don't worry — there are plenty more listings to explore",
    "Browse similar items from other sellers",
    "Set up alerts for listings you're interested in",
  ],
  offer: [
    "Review the offer amount and buyer details",
    "Accept, decline, or send a counteroffer",
    "If accepted, the buyer will complete payment",
    "Coordinate delivery once the order is confirmed",
  ],
  offer_accepted: [
    "Your offer has been accepted by the seller!",
    "Complete your purchase to secure the item",
    "Payment is protected in escrow until delivery",
    "Coordinate shipping or pickup with the seller",
  ],
  offer_declined: [
    "Your offer was not accepted by the seller",
    "Browse similar listings or send a new offer",
    "Try messaging the seller to negotiate",
  ],
  payment_released: [
    "Funds are now available in your Sky Drop balance",
    "Withdraw to your bank account via Stripe Connect",
    "Check your profile for withdrawal options",
  ],
  service_completed: [
    "Review the completed service carefully",
    "Confirm you're satisfied to release payment",
    "Leave a review for the service provider",
  ],
  item_returned: [
    "The rental item has been returned",
    "Inspect the item for any damage",
    "Confirm the return to release the deposit",
  ],
};

export function notificationToEmail(type: string, title: string, listingTitle?: string, total?: number): EmailContent {
  const badge = STATUS_BADGES[type];
  const steps = WHAT_HAPPENS_NEXT[type];

  switch (type) {
    case "purchase":
      return {
        subject: `🛒 Item Sold — ${listingTitle || ""}`,
        title: "Item Sold! 🎉",
        message: listingTitle
          ? total
            ? `Great news! **${listingTitle}** has been purchased for **$${total.toFixed(2)}**.`
            : `Great news! **${listingTitle}** has been purchased.`
          : `Your item has been purchased!`,
        statusBadge: badge,
        summaryRows: listingTitle ? [
          { label: "Item", value: listingTitle },
          ...(total ? [{ label: "Sale amount", value: `$${total.toFixed(2)}`, highlight: true }] : []),
          { label: "Buyer protection fee", value: "$1.00" },
          { label: "Net earnings", value: total ? `$${(total - 1).toFixed(2)}` : "—" },
        ] : undefined,
        whatHappensNext: steps,
      };
    case "purchase_confirmation":
      return {
        subject: `🛒 Order Confirmed — ${listingTitle || ""}`,
        title: "Purchase Confirmed 🛒",
        message: `Your order has been confirmed and your payment is secure. Your funds are held in **escrow** — the seller only gets paid once you confirm delivery.\n\nKeep an eye on your messages — the seller may reach out with shipping or pickup details.`,
        statusBadge: badge,
        summaryRows: listingTitle ? [
          { label: "Item", value: listingTitle },
          ...(total ? [{ label: "Total charged", value: `$${total.toFixed(2)}`, highlight: true }] : []),
          { label: "Payment", value: "Held in escrow 🔒" },
        ] : undefined,
        whatHappensNext: steps,
        reviewPrompt: true,
      };
    case "order_confirmed":
      return {
        subject: `📦 Order Confirmed — ${listingTitle || ""}`,
        title: "Order Confirmed ✅",
        message: listingTitle
          ? `Your order for **${listingTitle}** has been confirmed by the seller — they're on it!\n\nYour payment stays safe in escrow until you confirm delivery. If anything doesn't look right, you can open a dispute within 7 days of delivery.`
          : `Your order has been confirmed by the seller.`,
        statusBadge: badge,
        summaryRows: listingTitle ? [
          { label: "Item", value: listingTitle },
          ...(total ? [{ label: "Total charged", value: `$${total.toFixed(2)}`, highlight: true }] : []),
          { label: "Payment", value: "Held in escrow 🔒" },
          { label: "Status", value: "Preparing order" },
        ] : undefined,
        whatHappensNext: steps,
      };
    case "item_shipped":
      return {
        subject: `🚚 Item Shipped — ${listingTitle || ""}`,
        title: "Item Shipped! 🚚",
        message: listingTitle
          ? `Your item **${listingTitle}** is on its way!\n\nTrack your delivery and get ready to receive it. Once it arrives, inspect the item and **confirm delivery** on Sky Drop to release payment to the seller.`
          : `Your item has been shipped!`,
        statusBadge: badge,
        whatHappensNext: steps,
        reviewPrompt: true,
      };
    case "delivered":
      return {
        subject: `✅ Delivered — ${listingTitle || ""}`,
        title: "Item Delivered 📬",
        message: listingTitle
          ? `Your purchase **${listingTitle}** has been marked as delivered.\n\n**Please confirm receipt** to release funds to the seller. If something isn't right, open a dispute within 7 days through your purchases page.`
          : `Your item has been delivered.`,
        statusBadge: badge,
        summaryRows: listingTitle && total ? [
          { label: "Item", value: listingTitle },
          { label: "Amount", value: `$${total.toFixed(2)}` },
          { label: "Status", value: "Awaiting confirmation", highlight: true },
        ] : undefined,
        whatHappensNext: steps,
        reviewPrompt: true,
      };
    case "service_completed":
      return {
        subject: `✅ Service Completed — ${listingTitle || ""}`,
        title: "Service Completed ✅",
        message: listingTitle
          ? `The service **${listingTitle}** has been marked as complete by the seller.\n\nPlease review the work and confirm you're satisfied to release payment. If there are any issues, open a dispute within 7 days.`
          : `The service has been marked as complete.`,
        statusBadge: badge,
        whatHappensNext: steps,
        reviewPrompt: true,
      };
    case "item_returned":
      return {
        subject: `🔄 Item Returned — ${listingTitle || ""}`,
        title: "Return Confirmed 🔄",
        message: listingTitle
          ? `The rental **${listingTitle}** has been returned and confirmed. Thanks for using Sky Drop!\n\nYour deposit will be released once the owner confirms everything is in order.`
          : `Your rental return has been confirmed.`,
        statusBadge: badge,
        whatHappensNext: steps,
      };
    case "bid":
      return {
        subject: `🔨 New Bid — ${listingTitle || ""}`,
        title: "New Bid Received 🔨",
        message: listingTitle
          ? total
            ? `You received a bid of **$${total.toFixed(2)}** on **${listingTitle}**.`
            : `You received a new bid on **${listingTitle}**.`
          : `You received a new bid on your listing.`,
        statusBadge: badge,
        summaryRows: listingTitle && total ? [
          { label: "Listing", value: listingTitle },
          { label: "Bid amount", value: `$${total.toFixed(2)}`, highlight: true },
        ] : undefined,
        whatHappensNext: steps,
      };
    case "outbid":
      return {
        subject: `💸 Outbid — ${listingTitle || ""}`,
        title: "You've Been Outbid! 💸",
        message: listingTitle
          ? total
            ? `Someone placed a higher bid on **${listingTitle}**. The current bid is **$${total.toFixed(2)}**.`
            : `Someone placed a higher bid on **${listingTitle}**.`
          : `You've been outbid on an item.`,
        statusBadge: badge,
        summaryRows: listingTitle && total ? [
          { label: "Listing", value: listingTitle },
          { label: "Current bid", value: `$${total.toFixed(2)}`, highlight: true },
        ] : undefined,
        whatHappensNext: steps,
      };
    case "bid_confirmation":
      return {
        subject: `🔨 Bid Placed — ${listingTitle || ""}`,
        title: "Bid Placed ✅",
        message: listingTitle
          ? total
            ? `Your bid of **$${total.toFixed(2)}** on **${listingTitle}** has been placed successfully. We'll notify you if you're outbid or if you win.`
            : `Your bid on **${listingTitle}** has been placed successfully.`
          : `Your bid has been placed successfully.`,
        statusBadge: badge,
        summaryRows: listingTitle && total ? [
          { label: "Listing", value: listingTitle },
          { label: "Your bid", value: `$${total.toFixed(2)}`, highlight: true },
        ] : undefined,
        whatHappensNext: steps,
      };
    case "auction_won":
      return {
        subject: `🎉 You Won! — ${listingTitle || ""}`,
        title: "You Won the Auction! 🎉",
        message: listingTitle
          ? total
            ? `Congratulations! You won **${listingTitle}** with a winning bid of **$${total.toFixed(2)}**.\n\nComplete your purchase within **24 hours** to secure the item. Your payment will be held securely in escrow until you confirm delivery.`
            : `Congratulations! You won the auction for **${listingTitle}**.`
          : `Congratulations! You won the auction.`,
        statusBadge: badge,
        summaryRows: listingTitle ? [
          { label: "Listing", value: listingTitle },
          ...(total ? [{ label: "Winning bid", value: `$${total.toFixed(2)}`, highlight: true }] : []),
        ] : undefined,
        whatHappensNext: steps,
      };
    case "auction_lost":
      return {
        subject: `😔 Auction Ended — ${listingTitle || ""}`,
        title: "Auction Ended 😔",
        message: listingTitle
          ? `The auction for **${listingTitle}** has ended and unfortunately you didn't win this time.\n\nDon't worry — there are plenty more great listings waiting for you. Browse, make offers, and find your next great deal.`
          : `The auction has ended. Unfortunately, you didn't win.`,
        statusBadge: badge,
        whatHappensNext: steps,
      };
    case "offer":
      return {
        subject: `💬 Offer Received — ${listingTitle || ""}`,
        title: "Offer Received 💬",
        message: listingTitle
          ? total
            ? `You received an offer of **$${total.toFixed(2)}** on **${listingTitle}**.\n\nReview the offer in your messages and accept, decline, or send a counteroffer.`
            : `You received an offer on **${listingTitle}**.`
          : `You received an offer on your listing.`,
        statusBadge: badge,
        summaryRows: listingTitle && total ? [
          { label: "Listing", value: listingTitle },
          { label: "Offer amount", value: `$${total.toFixed(2)}`, highlight: true },
        ] : undefined,
        whatHappensNext: steps,
      };
    case "offer_accepted":
      return {
        subject: `✅ Offer Accepted — ${listingTitle || ""}`,
        title: "Offer Accepted! ✅",
        message: listingTitle
          ? total
            ? `Your offer of **$${total.toFixed(2)}** on **${listingTitle}** has been accepted by the seller!\n\nComplete your purchase now to secure the item. Payment is protected in escrow until delivery.`
            : `Your offer on **${listingTitle}** has been accepted!`
          : `Your offer has been accepted!`,
        statusBadge: badge,
        summaryRows: listingTitle && total ? [
          { label: "Listing", value: listingTitle },
          { label: "Offer amount", value: `$${total.toFixed(2)}`, highlight: true },
        ] : undefined,
        whatHappensNext: steps,
      };
    case "offer_declined":
      return {
        subject: `❌ Offer Declined — ${listingTitle || ""}`,
        title: "Offer Declined ❌",
        message: listingTitle
          ? total
            ? `Your offer of **$${total.toFixed(2)}** on **${listingTitle}** was declined by the seller.\n\nYou can browse similar listings or send the seller a new offer through messages.`
            : `Your offer on **${listingTitle}** was declined.`
          : `Your offer was declined.`,
        statusBadge: badge,
        whatHappensNext: steps,
      };
    case "counter_offer":
      return {
        subject: `🔄 Counter Offer — ${listingTitle || ""}`,
        title: "Counter Offer Received 🔄",
        message: listingTitle
          ? total
            ? `The seller has sent a counter offer of **$${total.toFixed(2)}** on **${listingTitle}**.\n\nReply in messages to accept, decline, or negotiate.`
            : `The seller has sent a counter offer on **${listingTitle}**.`
          : `You received a counter offer.`,
        statusBadge: badge,
        whatHappensNext: steps,
      };
    case "payment_released":
      return {
        subject: `💰 Payment Released — ${listingTitle || ""}`,
        title: "Payment Released! 💰",
        message: listingTitle
          ? total
            ? `**$${total.toFixed(2)}** has been released to your account for **${listingTitle}**.`
            : `Payment for **${listingTitle}** has been released to your account.`
          : `Payment has been released to your account.`,
        statusBadge: badge,
        summaryRows: listingTitle && total ? [
          { label: "Listing", value: listingTitle },
          { label: "Amount released", value: `$${total.toFixed(2)}`, highlight: true },
          { label: "Status", value: "Completed ✅" },
        ] : undefined,
        whatHappensNext: steps,
      };
    case "message":
      return {
        subject: `💬 ${title}`,
        title: "New Message 💬",
        message: listingTitle
          ? `You have a new message regarding **${listingTitle}**.\n\nOpen your messages to reply and keep the conversation going.`
          : `You have a new message.\n\nOpen your messages to reply.`,
      };
    case "question":
      return {
        subject: `❓ ${title}`,
        title: "New Question ❓",
        message: listingTitle
          ? `A buyer has a question about **${listingTitle}**.\n\nOpen the listing to reply and help them make a decision.`
          : `A buyer has a question about your listing.`,
      };
    case "job_application":
      return {
        subject: `💼 ${title}`,
        title: "New Job Application 💼",
        message: listingTitle
          ? `A new application has been submitted for **${listingTitle}**.\n\nReview the applicant's details and qualifications in your dashboard.`
          : `A new job application has been submitted.`,
        statusBadge: badge,
      };
    case "verification":
      return {
        subject: `🔐 ${title}`,
        title: "Verification Update 🔐",
        message: `Your account verification status has been updated.\n\nLog in to your account to view the changes and continue enjoying Sky Drop.`,
        statusBadge: badge,
      };
    case "referral_reward":
      return {
        subject: `🎁 ${title}`,
        title: "Referral Reward Earned! 🎁",
        message: `You earned a referral reward!\n\nCheck your dashboard for details and keep sharing Sky Drop with friends to earn more.`,
        statusBadge: { text: "Reward Earned", color: "green" },
      };
    case "referral":
      return {
        subject: `🎁 ${title}`,
        title: "Someone Used Your Referral! 🎁",
        message: `Someone signed up using your referral code! You've earned **5 Drop Tokens** as a reward.\n\nCheck your dashboard to see your balance and keep sharing your referral link.`,
        statusBadge: { text: "Reward Earned", color: "green" },
      };
    case "listing_rejected":
      return {
        subject: `❌ Listing Rejected — ${listingTitle || ""}`,
        title: "Listing Not Approved ❌",
        message: listingTitle
          ? `Your listing **${listingTitle}** has been reviewed and was not approved.\n\nPlease check the reason provided and make the necessary changes before resubmitting. If you believe this is an error, contact support.`
          : `Your listing has been reviewed and was not approved.`,
        statusBadge: badge,
      };
    case "dispute_opened":
      return {
        subject: `⚖️ Dispute Opened — ${listingTitle || ""}`,
        title: "Dispute Opened ⚖️",
        message: listingTitle
          ? `A dispute has been opened for **${listingTitle}**.\n\nAn admin will review the case and contact both parties. You can expect a response within 48 hours. All relevant communication and evidence will be reviewed.`
          : `A dispute has been opened and requires review.`,
        statusBadge: badge,
        whatHappensNext: ["An admin will review the case details", "Both parties may be contacted for more information", "A decision will be made within 48 hours", "Funds will be released based on the outcome"],
      };
    default:
      return {
        subject: title,
        title,
        message: listingTitle
          ? `${title}\n\nListing: ${listingTitle}`
          : title,
      };
  }
}
