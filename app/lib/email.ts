interface StatusBadge {
  text: string;
  color: "sky" | "sky" | "sky" | "red" | "sky" | "sky";
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
  layout?: "default" | "welcome";
}

const WELCOME_FEATURE_CARDS = [
  { icon: "📦", title: "Sell Something", desc: "Create your first listing in minutes." },
  { icon: "🔍", title: "Discover Deals", desc: "Browse listings from sellers across New Zealand." },
  { icon: "✨", title: "Sky AI", desc: "Get help with pricing, titles, descriptions, and listing creation." },
] as const;

const BADGE_COLORS: Record<string, { bg: string; text: string; border: string; glow: string }> = {
  sky:      { bg: "linear-gradient(135deg, #0c2a42, #0f344e)", text: "#60a5fa", border: "rgba(96,165,250,0.3)", glow: "rgba(96,165,250,0.15)" },
  green:    { bg: "linear-gradient(135deg, #0c2e1a, #0f3d26)", text: "#10b981", border: "rgba(16,185,129,0.3)", glow: "rgba(16,185,129,0.15)" },
  emerald:  { bg: "linear-gradient(135deg, #0c2e1a, #0f3d26)", text: "#34d399", border: "rgba(52,211,153,0.3)", glow: "rgba(52,211,153,0.15)" },
  amber:    { bg: "linear-gradient(135deg, #2a1a00, #3d2a00)", text: "#f59e0b", border: "rgba(245,158,11,0.3)", glow: "rgba(245,158,11,0.15)" },
  red:      { bg: "linear-gradient(135deg, #2a0c0c, #3d0f0f)", text: "#ef4444", border: "rgba(239,68,68,0.3)", glow: "rgba(239,68,68,0.15)" },
  purple:   { bg: "linear-gradient(135deg, #1f0c2a, #2a0f3d)", text: "#a78bfa", border: "rgba(167,139,250,0.3)", glow: "rgba(167,139,250,0.15)" },
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
  const s = BADGE_COLORS[badge.color] || BADGE_COLORS.sky;
  return `
    <tr><td style="padding:0 0 14px;">
      <table cellpadding="0" cellspacing="0" style="margin:0;">
        <tr>
          <td style="background:${s.bg};border:1px solid ${s.border};border-radius:100px;padding:8px 20px;box-shadow:0 0 30px ${s.glow},inset 0 1px 0 rgba(255,255,255,0.04);">
            <span style="font-size:12px;font-weight:800;color:${s.text};letter-spacing:1px;text-transform:uppercase;">${badge.text}</span>
          </td>
        </tr>
      </table>
    </td></tr>
  `;
}

function productCard(image?: string, title?: string, seller?: string): string {
  if (!image && !title) return "";
  return `
    <tr><td style="padding:0 0 24px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg, rgba(56,189,248,0.05), rgba(129,140,248,0.03));border-radius:16px;border:1px solid rgba(56,189,248,0.15);box-shadow:0 4px 20px rgba(56,189,248,0.08);">
        <tr>
          ${image ? `
          <td width="90" style="padding:0;">
            <div style="width:90px;height:90px;overflow:hidden;border-radius:16px 0 0 16px;">
              <img src="${image}" alt="" width="90" height="90" style="display:block;width:90px;height:90px;object-fit:cover;" />
            </div>
          </td>
          ` : ""}
          <td style="padding:18px 20px;vertical-align:middle;">
            ${title ? `<span style="font-size:16px;font-weight:700;color:#f0f0f0;line-height:1.4;letter-spacing:-0.2px;">${title}</span>` : ""}
            ${seller ? `<br><span style="font-size:13px;color:#888;font-weight:500;margin-top:6px;display:inline-block;">Seller: ${seller}</span>` : ""}
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
        <td style="padding:10px 0 6px;font-size:12px;color:#777;font-weight:500;">Order ID</td>
        <td style="padding:10px 0 6px;font-size:12px;color:#ccc;text-align:right;font-family:monospace;letter-spacing:0.5px;font-weight:600;">#${orderId}</td>
      </tr>`;
  }
  if (date) {
    headerRows += `
      <tr>
        <td style="padding:6px 0 10px;font-size:12px;color:#777;font-weight:500;">Date</td>
        <td style="padding:6px 0 10px;font-size:12px;color:#ccc;text-align:right;font-weight:500;">${date}</td>
      </tr>`;
  }

  const rowHtml = rows ? rows.map((r) => `
    <tr>
      <td style="padding:12px 0;font-size:13px;color:#999;font-weight:500;">${r.label}</td>
      <td style="padding:12px 0;font-size:14px;font-weight:${r.highlight ? "800" : "600"};color:${r.highlight ? "#38bdf8" : "#f0f0f0"};text-align:right;">${r.value}</td>
    </tr>
  `).join(`
    <tr><td colspan="2" style="border-bottom:1px solid rgba(56,189,248,0.1);"></td></tr>
  `) : "";

  const hasBoth = headerRows && rows;

  return `
    <tr><td style="padding:0 0 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="padding:0 0 14px;font-size:10px;font-weight:700;color:#555;text-transform:uppercase;letter-spacing:2px;">Order Details</td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg, rgba(56,189,248,0.05), rgba(129,140,248,0.03));border-radius:16px;border:1px solid rgba(56,189,248,0.15);box-shadow:0 4px 20px rgba(56,189,248,0.08);">
        <tr>
          <td style="padding:6px 24px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              ${headerRows}
              ${hasBoth ? `<tr><td colspan="2" style="border-bottom:1px solid rgba(56,189,248,0.1);padding:0;"></td></tr>` : ""}
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
            <td style="width:24px;height:24px;border-radius:12px;background:linear-gradient(135deg, rgba(56,189,248,0.2), rgba(129,140,248,0.15));text-align:center;vertical-align:middle;border:1px solid rgba(56,189,248,0.2);">
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
      <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg, rgba(56,189,248,0.03), rgba(129,140,248,0.02));border-radius:12px;border:1px solid rgba(56,189,248,0.1);">
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

function ctaBlock(ctas?: { label: string; url: string; primary?: boolean }[], large = false): string {
  if (!ctas || ctas.length === 0) return "";
  const buttons = ctas.map((cta) => {
    if (cta.primary) {
      return `
        <td style="padding:4px;${large ? "display:block;width:100%;" : ""}">
          <table cellpadding="0" cellspacing="0" style="margin:0 auto;${large ? "width:100%;" : ""}">
            <tr>
              <td style="border-radius:12px;background:linear-gradient(135deg, #38bdf8, #818cf8);box-shadow:0 4px 15px rgba(56,189,248,0.3);">
                <a href="${cta.url}" style="display:inline-block;background:linear-gradient(135deg, #38bdf8, #818cf8);color:#0a0a0a;font-weight:800;font-size:${large ? "16" : "15"}px;padding:${large ? "18px 40px" : "16px 36px"};border-radius:12px;text-decoration:none;letter-spacing:0.3px;">${cta.label}</a>
              </td>
            </tr>
          </table>
        </td>`;
    }
    return `
      <td style="padding:4px;">
        <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
          <tr>
            <td style="border-radius:12px;border:1px solid rgba(56,189,248,0.2);background:linear-gradient(135deg, rgba(56,189,248,0.05), rgba(129,140,248,0.03));">
              <a href="${cta.url}" style="display:inline-block;color:#ccc;font-weight:600;font-size:14px;padding:16px 32px;border-radius:12px;text-decoration:none;">${cta.label}</a>
            </td>
          </tr>
        </table>
      </td>`;
  }).join("");
  return `
    <tr><td style="padding:0 0 24px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr><td align="center" style="padding:0;">
          <table cellpadding="0" cellspacing="0" style="margin:0 auto;${large ? "width:100%;" : ""}">
            <tr${large ? ' class="cta-stack"' : ""}>${buttons}</tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
  `;
}

function trustSection(): string {
  return `
    <tr><td style="padding:0 0 8px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(56,189,248,0.04);border:1px solid rgba(56,189,248,0.1);border-radius:12px;padding:14px 18px;">
        <tr>
          <td style="font-size:11px;font-weight:700;color:#38bdf8;letter-spacing:0.5px;">🛡️ Keep Your Purchase Protected</td>
        </tr>
        <tr>
          <td style="padding:6px 0 0;font-size:12px;color:#888;line-height:1.6;">
            For the best protection, keep communication and payment on Sky Drop. If you take things elsewhere, Sky Drop will do its best to help with refunds, but our ability to assist is limited.
          </td>
        </tr>
      </table>
    </td></tr>
  `;
}

function heroBlock(title: string, subtitle: string): string {
  return `
    <tr><td style="padding:0 0 18px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg, rgba(56,189,248,0.15), rgba(129,140,248,0.1));border-radius:18px;border:1px solid rgba(56,189,248,0.2);box-shadow:0 8px 32px rgba(56,189,248,0.15),inset 0 1px 0 rgba(255,255,255,0.05);">
        <tr>
          <td align="center" style="padding:28px 24px 24px;">
            <span style="font-size:28px;font-weight:900;color:#ffffff;line-height:1.2;letter-spacing:-0.5px;text-shadow:0 2px 4px rgba(0,0,0,0.3);">${title}</span>
            <br>
            <span style="display:inline-block;margin-top:8px;font-size:13px;color:#94a3b8;line-height:1.5;letter-spacing:0.4px;">${subtitle}</span>
          </td>
        </tr>
      </table>
    </td></tr>
  `;
}

function featureCardsBlock(): string {
  const cards = WELCOME_FEATURE_CARDS.map((c) => `
    <tr>
      <td style="padding:0 0 10px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg, rgba(56,189,248,0.05), rgba(129,140,248,0.03));border-radius:12px;border:1px solid rgba(56,189,248,0.15);box-shadow:0 2px 8px rgba(56,189,248,0.05);">
          <tr>
            <td width="40" align="center" style="padding:12px 0 12px 14px;font-size:20px;vertical-align:middle;">${c.icon}</td>
            <td style="padding:12px 14px 12px 10px;vertical-align:middle;">
              <div style="font-size:14px;font-weight:800;color:#ececec;line-height:1.4;letter-spacing:-0.2px;">${c.title}</div>
              <div style="font-size:12px;color:#777;line-height:1.5;margin-top:2px;">${c.desc}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join("");
  return `
    <tr><td style="padding:0 0 12px;">
      <table width="100%" cellpadding="0" cellspacing="0">${cards}</table>
    </td></tr>
  `;
}

function compactMessageBlock(message: string): string {
  if (!message) return "";
  return `
    <tr><td style="padding:0 0 10px;">
      <span style="font-size:13px;color:#b0b0b0;line-height:1.5;">${message.replace(/\*\*(.+?)\*\*/g, "<strong style=\"color:#e8e8e8;\">$1</strong>")}</span>
    </td></tr>
  `;
}

function emailShell(baseUrl: string, body: string, compact = false): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @@media only screen and (max-width:480px) {
    .prod-img { width:60px !important; height:60px !important; }
    .cta-stack { display:block !important; }
    .cta-stack td { display:block !important; padding:6px 0 !important; }
    .email-container { padding:16px !important; }
    .email-inner { width:100% !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:linear-gradient(135deg,#0a0a0a,#0f0f0f);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,#0a0a0a,#0f0f0f);">
    <tr>
      <td align="center" style="padding:${compact ? "24" : "32"}px 16px;">
        <table width="540" cellpadding="0" cellspacing="0" class="email-inner" style="max-width:540px;width:100%;position:relative;">
          <tr>
            <td align="center" style="padding:0 0 ${compact ? "12" : "18"}px;">
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="text-align:center;padding:${compact ? "10" : "12"}px 24px;border-radius:14px;background:linear-gradient(135deg, rgba(56,189,248,0.08), rgba(129,140,248,0.05));border:1px solid rgba(56,189,248,0.15);box-shadow:0 4px 20px rgba(56,189,248,0.1),inset 0 1px 0 rgba(255,255,255,0.05);">
                    <span style="font-size:${compact ? "18" : "20"}px;font-weight:700;color:#e0e0e0;letter-spacing:1px;">SKY</span>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none" style="display:inline-block;margin:0 ${compact ? "4" : "5"}px;width:24px;height:24px;vertical-align:middle;">
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
                    <span style="font-size:${compact ? "18" : "20"}px;font-weight:700;color:#38bdf8;letter-spacing:1px;text-shadow:0 0 20px rgba(56,189,248,0.3);">DROP</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          ${body}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildWelcomeEmailBody(data: EmailData, baseUrl: string): string {
  const secondaryCta = {
    label: "Create Your First Listing with Sky AI",
    url: `${baseUrl}/post/ai`,
    primary: false,
  };
  return `
    ${heroBlock(data.title, "New Zealand's Marketplace")}
    ${compactMessageBlock(data.message)}
    ${featureCardsBlock()}
    ${data.ctas && data.ctas.length > 0 ? ctaBlock([{ ...data.ctas[0], primary: true }], true) : ""}
    ${ctaBlock([secondaryCta], true)}
    ${footerBlock(baseUrl, true)}
  `;
}

function buildDefaultEmailBody(data: EmailData, baseUrl: string): string {
  return `
    <tr><td style="padding:0 0 14px;"><table width="60" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td style="height:2px;background:linear-gradient(90deg,transparent,rgba(56,189,248,0.15),transparent);border-radius:1px;"></td></tr></table></td></tr>
    ${titleBlock(data.title)}
    ${data.statusBadge ? badgeBlock(data.statusBadge) : ""}
    ${productCard(data.listingImage, data.listingTitle, data.sellerName || data.buyerName)}
    ${messageBlock(data.message)}
    ${data.orderId || data.date || data.summaryRows ? summaryBlock(data.summaryRows, data.orderId, data.date) : ""}
    ${data.whatHappensNext ? whatHappensNextBlock(data.whatHappensNext) : ""}
    ${data.ctas && data.ctas.length > 0 ? ctaBlock(data.ctas) : ""}
    ${data.showTrustSection !== false ? trustSection() : ""}
    ${footerBlock(baseUrl)}
  `;
}

function footerBlock(baseUrl: string, compact = false): string {
  if (compact) {
    return `
    <tr>
      <td align="center" style="padding:16px 0 0;">
        <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
          <tr>
            <td style="font-size:11px;color:#555;text-align:center;line-height:1.6;">
              Need help? Ask Sky AI anytime.
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
  }
  return `
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
              You're receiving this because you have a Sky Drop account.<br>
              <a href="${baseUrl}/settings" style="color:#3a3a3a;text-decoration:underline;">Notification settings</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

export function buildEmailHtml(data: EmailData): string {
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://skydrop.co.nz";
  const isWelcome = data.layout === "welcome";

  if (isWelcome) {
    return emailShell(baseUrl, buildWelcomeEmailBody(data, baseUrl), true);
  }

  return emailShell(baseUrl, buildDefaultEmailBody(data, baseUrl));
}

export function getWelcomeEmailContent(baseUrl: string) {
  return {
    subject: "Welcome to Sky Drop 🚀",
    title: "Welcome to Sky Drop 🚀",
    message: `Kia ora,

Thanks for joining Sky Drop.

Whether you're buying, selling, trading, or offering services, you're now part of a growing marketplace built for New Zealand.`,
    layout: "welcome" as const,
    ctas: [{ label: "Browse Sky Drop", url: baseUrl, primary: true }],
    showTrustSection: false,
  };
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
  purchase:            { text: "Payment Received", color: "sky" },
  purchase_confirmation: { text: "Payment Confirmed", color: "sky" },
  order_confirmed:     { text: "Seller Confirmed ✓", color: "sky" },
  item_shipped:        { text: "In Transit", color: "sky" },
  delivered:           { text: "Awaiting Confirmation", color: "sky" },
  bid:                 { text: "New Bid", color: "sky" },
  outbid:              { text: "You've Been Outbid", color: "red" },
  bid_confirmation:    { text: "Bid Active", color: "sky" },
  auction_won:         { text: "Auction Won", color: "sky" },
  auction_lost:        { text: "Not Winning", color: "red" },
  offer:               { text: "Pending Review", color: "sky" },
  offer_accepted:      { text: "Offer Accepted", color: "sky" },
  offer_declined:      { text: "Declined", color: "red" },
  payment_released:    { text: "Funds Available", color: "sky" },
  service_completed:   { text: "Complete", color: "sky" },
  item_returned:       { text: "Returned", color: "sky" },
  listing_rejected:    { text: "Not Approved", color: "red" },
  dispute_opened:      { text: "Under Review", color: "sky" },
  job_application:     { text: "New Application", color: "sky" },
  verification:        { text: "Updated", color: "sky" },
};

const WHAT_HAPPENS_NEXT: Record<string, string[]> = {
  purchase: [
    "Review the order details in your Sales Dashboard",
    "Prepare the item and get it ready for shipment",
    "Mark the order as shipped once it's on its way",
    "Payment already went to your Stripe account at checkout — confirm fulfillment with the buyer",
  ],
  purchase_confirmation: [
    "The seller will prepare your item for delivery",
    "You'll receive a notification when it's shipped",
    "Inspect your item carefully upon arrival",
    "Confirm delivery to complete your order — payment already went to the seller via Stripe",
  ],
  order_confirmed: [
    "Your seller is preparing your item for shipment",
    "You'll be notified the moment it's on its way",
    "Track delivery and prepare to receive your item",
    "Funds are sent directly to the seller via Stripe — Sky Drop never holds them",
  ],
  item_shipped: [
    "Your item is on its way to you",
    "Track delivery using the shipping details provided",
    "Inspect the item as soon as it arrives",
    "Confirm delivery to complete your order — payment already went to the seller's Stripe account",
  ],
  delivered: [
    "Inspect your item carefully",
    "Payment already went to the seller — confirm delivery to complete the order",
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
    "Payment goes directly to the seller via Stripe",
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
    "Payment sent directly to seller via Stripe",
    "Coordinate shipping or pickup with the seller",
  ],
  offer_declined: [
    "Your offer was not accepted by the seller",
    "Browse similar listings or send a new offer",
    "Try messaging the seller to negotiate",
  ],
  payment_released: [
    "Your order is complete",
    "For Stripe Checkout sales, payment was already in your connected Stripe account from checkout",
    "Payouts to your bank follow your Stripe Express schedule",
  ],
  service_completed: [
    "Review the completed service carefully",
    "Confirm you're satisfied to complete the order — payment already went to the seller via Stripe",
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
        message: `Your order has been confirmed and your payment has gone directly to the seller's Stripe account — Sky Drop never holds your money.\n\nKeep an eye on your messages — the seller may reach out with shipping or pickup details.`,
        statusBadge: badge,
        summaryRows: listingTitle ? [
          { label: "Item", value: listingTitle },
          ...(total ? [{ label: "Total charged", value: `$${total.toFixed(2)}`, highlight: true }] : []),
          { label: "Payment", value: "Sent to seller via Stripe 💳" },
        ] : undefined,
        whatHappensNext: steps,
        reviewPrompt: true,
      };
    case "order_confirmed":
      return {
        subject: `📦 Order Confirmed — ${listingTitle || ""}`,
        title: "Order Confirmed ✅",
        message: listingTitle
          ? `Your order for **${listingTitle}** has been confirmed by the seller — they're on it!\n\nYour payment has been sent directly to the seller via Stripe. If anything doesn't look right, you can open a dispute within 7 days of delivery.`
          : `Your order has been confirmed by the seller.`,
        statusBadge: badge,
        summaryRows: listingTitle ? [
          { label: "Item", value: listingTitle },
          ...(total ? [{ label: "Total charged", value: `$${total.toFixed(2)}`, highlight: true }] : []),
          { label: "Payment", value: "Sent to seller via Stripe 💳" },
          { label: "Status", value: "Preparing order" },
        ] : undefined,
        whatHappensNext: steps,
      };
    case "item_shipped":
      return {
        subject: `🚚 Item Shipped — ${listingTitle || ""}`,
        title: "Item Shipped! 🚚",
        message: listingTitle
          ? `Your item **${listingTitle}** is on its way!\n\nTrack your delivery and get ready to receive it. Once it arrives, inspect the item and **confirm delivery** on Sky Drop to complete your order. Payment already went to the seller via Stripe at checkout.`
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
          ? `Your purchase **${listingTitle}** has been marked as delivered.\n\n**Please confirm receipt** to complete the order. Payment already went to the seller via Stripe at checkout. If something isn't right, open a dispute within 7 days through your purchases page.`
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
          ? `The service **${listingTitle}** has been marked as complete by the seller.\n\nPlease review the work and confirm you're satisfied to complete the order. Payment already went to the seller via Stripe at checkout. If there are any issues, open a dispute within 7 days.`
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
            ? `Congratulations! You won **${listingTitle}** with a winning bid of **$${total.toFixed(2)}**.\n\nComplete your purchase within **24 hours** to secure the item. Your payment will be sent directly to the seller via Stripe upon completion.`
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
            ? `Your offer of **$${total.toFixed(2)}** on **${listingTitle}** has been accepted by the seller!\n\nComplete your purchase now to secure the item. Payment will be sent directly to the seller via Stripe.`
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
        subject: `✅ Order Complete — ${listingTitle || ""}`,
        title: "Order Complete ✅",
        message: listingTitle
          ? total
            ? `The order for **${listingTitle}** ($${total.toFixed(2)}) is complete. For Stripe Checkout, payment went to your connected account at purchase time — bank payouts follow your Stripe schedule.`
            : `The order for **${listingTitle}** is complete.`
          : `Your order is complete.`,
        statusBadge: badge,
        summaryRows: listingTitle && total ? [
          { label: "Listing", value: listingTitle },
          { label: "Order total", value: `$${total.toFixed(2)}`, highlight: true },
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
        statusBadge: { text: "Reward Earned", color: "sky" },
      };
    case "referral":
      return {
        subject: `🎁 ${title}`,
        title: "Someone Used Your Referral! 🎁",
        message: `Someone signed up using your referral code! You've earned a referral reward.\n\nCheck your dashboard for details and keep sharing your referral link.`,
        statusBadge: { text: "Reward Earned", color: "sky" },
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
