// Send all email types to preview them
// Run: node scripts/send-test-emails.cjs

const nodemailer = require("nodemailer");
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env.local") });

const TO = "skyrewi3@gmail.com";
const BASE_URL = process.env.NEXT_PUBLIC_URL || "https://skydrop.co.nz";

const transport = {
  host: process.env.SMTP_HOST || "smtp.mailersend.net",
  port: Number(process.env.SMTP_PORT) || 587,
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },
};

const FROM_NAME = "Sky Drop";
const FROM_ADDR = process.env.SMTP_FROM || process.env.SMTP_USER || "noreply@skydrop.nz";

function buildHtml(opts) {
  const { title, message, badge, summaryRows, steps, ctas, showTrust } = opts;
  const badgeHtml = badge ? `<tr><td style="padding:0 0 20px;"><table cellpadding="0" cellspacing="0"><tr><td style="background:${badge.bg};border:1px solid ${badge.border};border-radius:20px;padding:8px 18px;"><span style="font-size:13px;font-weight:700;color:${badge.text};">${badge.icon} ${badge.label}</span></td></tr></table></td></tr>` : "";
  const stepsHtml = steps ? `<tr><td style="padding:0 0 16px;"><table width="100%" cellpadding="0" cellspacing="0">${steps.map((s, i) => `<tr><td style="padding:${i > 0 ? "8" : "0"}px 0 0;font-size:13px;color:#bbb;line-height:1.5;"><span style="color:#38bdf8;font-weight:700;margin-right:8px;">${i + 1}.</span>${s}</td></tr>`).join("")}</table></td></tr>` : "";
  const summaryHtml = summaryRows ? `<tr><td style="padding:0 0 16px;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:12px;border:1px solid #2a2a2a;">${summaryRows.map(r => `<tr><td style="padding:10px 16px;font-size:13px;color:#bbb;border-bottom:1px solid #2a2a2a;">${r.label}</td><td style="padding:10px 16px;font-size:13px;font-weight:700;color:${r.highlight ? "#38bdf8" : "#f0f0f0"};text-align:right;border-bottom:1px solid #2a2a2a;">${r.value}</td></tr>`).join("")}</table></td></tr>` : "";
  const ctaHtml = ctas ? `<tr><td style="padding:0 0 20px;"><table cellpadding="0" cellspacing="0"><tr>${ctas.map(c => `<td style="padding:4px;"><a href="${c.url}" style="display:inline-block;${c.primary ? "background:#38bdf8;color:#0a0a0a;font-weight:800;" : "border:1px solid #333;color:#ccc;font-weight:600;"}font-size:14px;padding:14px 32px;border-radius:10px;text-decoration:none;">${c.label}</a></td>`).join("")}</tr></table></td></tr>` : "";
  const trustHtml = showTrust !== false ? `<tr><td style="padding:0 0 8px;"><table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(239,68,68,0.04);border:1px solid rgba(239,68,68,0.1);border-radius:12px;padding:14px 18px;"><tr><td style="font-size:11px;font-weight:700;color:#ef4444;letter-spacing:0.5px;">⚠️ Keep Your Purchase Protected</td></tr><tr><td style="padding:6px 0 0;font-size:12px;color:#888;line-height:1.6;">Never pay outside Sky Drop. Keep all communication on our platform. If a deal seems too good to be true, it probably is. <a href="${BASE_URL}/buyer-protection" style="color:#38bdf8;text-decoration:underline;">Learn about buyer protection.</a></td></tr></table></td></tr>` : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"><table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;"><tr><td align="center" style="padding:24px 16px;"><table width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;"><tr><td align="center" style="padding:0 0 8px;"><table cellpadding="0" cellspacing="0"><tr><td style="text-align:center;"><span style="font-size:20px;font-weight:900;color:#e0e0e0;letter-spacing:1.5px;">SKY</span><span style="font-size:20px;font-weight:900;color:#38bdf8;letter-spacing:1.5px;">DROP</span></td></tr><tr><td style="padding:2px 0 0;font-size:9px;color:#444;letter-spacing:2.5px;text-align:center;text-transform:uppercase;">New Zealand's Marketplace</td></tr></table></td></tr><tr><td style="padding:0 0 16px;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-bottom:1px solid #1a1a1a;"></td></tr></table></td></tr><tr><td style="padding:0 0 16px;"><span style="font-size:22px;font-weight:900;color:#f0f0f0;line-height:1.3;">${title}</span></td></tr>${badgeHtml}${summaryHtml}<tr><td style="font-size:14px;color:#bbb;line-height:1.7;padding:0 0 16px;">${message.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#e0e0e0;">$1</strong>').replace(/\n/g, "<br>")}</td></tr>${stepsHtml}${ctaHtml}${trustHtml}<tr><td style="padding:16px 0 0;"><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-bottom:1px solid #1a1a1a;"></td></tr></table></td></tr><tr><td style="padding:12px 0 0;font-size:11px;color:#555;line-height:1.5;text-align:center;">You received this email because you're a Sky Drop member.<br><a href="${BASE_URL}" style="color:#38bdf8;text-decoration:none;">${BASE_URL}</a></td></tr></table></td></tr></table></body></html>`;
}

const emails = [
  {
    subject: "1/8 — Welcome to Sky Drop",
    html: buildHtml({
      title: "Welcome to Sky Drop!",
      message: "Hi there,\n\nThanks for joining **Sky Drop** — New Zealand's community marketplace.\n\nHere's how to get started:\n\n• **Browse listings** — Find what you need across 8 categories\n• **List an item** — Post your first listing for free\n• **Buy with confidence** — Secure payments through Stripe Checkout or arrange directly with sellers\n\nYour account is ready. Now go explore.",
      ctas: [{ label: "Browse Listings", url: BASE_URL, primary: true }],
    }),
  },
  {
    subject: "2/8 — New Message",
    html: buildHtml({
      title: "New Message 💬",
      message: "You have a new message regarding **Toyota Corolla 2020**.\n\nOpen your messages to reply and keep the conversation going.",
      ctas: [{ label: "Open Messages", url: `${BASE_URL}/messages`, primary: true }],
      showTrust: false,
    }),
  },
  {
    subject: "3/8 — Offer Received",
    html: buildHtml({
      title: "Offer Received 💰",
      badge: { bg: "#0a1e30", text: "#38bdf8", border: "#1a3a5a", icon: "🔔", label: "New Offer" },
      message: "You've received an offer of **$8,500** for **Toyota Corolla 2020**.\n\nReview the offer and respond within 48 hours.",
      summaryRows: [
        { label: "Listing", value: "Toyota Corolla 2020" },
        { label: "Offer amount", value: "$8,500", highlight: true },
        { label: "Buyer", value: "j****n@gmail.com" },
      ],
      steps: ["Review the offer amount and buyer details", "Accept, decline, or send a counteroffer", "If accepted, the buyer will complete payment"],
      ctas: [
        { label: "View Offer", url: `${BASE_URL}/messages`, primary: true },
        { label: "Open Sales", url: `${BASE_URL}/sales` },
      ],
    }),
  },
  {
    subject: "4/8 — Purchase Confirmation",
    html: buildHtml({
      title: "Item Sold! 🎉",
      badge: { bg: "#0a1f12", text: "#10b981", border: "#1a3a22", icon: "✓", label: "Sold" },
      message: "Great news! **Toyota Corolla 2020** has been purchased for **$9,200**.\n\nThe buyer has completed payment through Stripe Checkout.",
      summaryRows: [
        { label: "Listing", value: "Toyota Corolla 2020" },
        { label: "Sale price", value: "$9,200", highlight: true },
        { label: "Buyer", value: "j****n@gmail.com" },
        { label: "Order ID", value: "SD-7F3K2P" },
      ],
      steps: ["Confirm the order to notify the buyer", "Coordinate delivery or pickup with the buyer", "Payment is processed through Stripe", "Funds are transferred to your Stripe account"],
      ctas: [
        { label: "Open Sales", url: `${BASE_URL}/sales`, primary: true },
        { label: "Open Messages", url: `${BASE_URL}/messages` },
      ],
    }),
  },
  {
    subject: "5/8 — Order Complete",
    html: buildHtml({
      title: "Order Complete ✅",
      badge: { bg: "#0a1f12", text: "#34d399", border: "#1a3a22", icon: "✓", label: "Completed" },
      message: "The order for **Toyota Corolla 2020** ($9,200) is complete. For Stripe Checkout, payment went to your connected account at purchase time — bank payouts follow your Stripe schedule.",
      summaryRows: [
        { label: "Listing", value: "Toyota Corolla 2020" },
        { label: "Amount released", value: "$9,200", highlight: true },
        { label: "Status", value: "Completed ✅" },
      ],
      steps: ["Funds are now available in your Sky Drop balance", "Withdraw to your bank account via Stripe Connect"],
      ctas: [{ label: "View Balance", url: `${BASE_URL}/profile`, primary: true }],
    }),
  },
  {
    subject: "6/8 — Dispute Opened",
    html: buildHtml({
      title: "Dispute Opened ⚖️",
      badge: { bg: "#1e0808", text: "#ef4444", border: "#3a1818", icon: "⚠️", label: "Dispute Open" },
      message: "A dispute has been opened for **Sony WH-1000XM4 Headphones**.\n\nAn admin will review the case and contact both parties. You can expect a response within 48 hours.",
      summaryRows: [
        { label: "Listing", value: "Sony WH-1000XM4 Headphones" },
        { label: "Amount", value: "$320.00", highlight: true },
        { label: "Status", value: "Under Review" },
      ],
      steps: ["An admin will review the case details", "Both parties may be contacted for more information", "A decision will be made within 48 hours"],
      ctas: [{ label: "View Dispute", url: `${BASE_URL}/disputes`, primary: true }],
    }),
  },
  {
    subject: "7/8 — Job Application Received",
    html: buildHtml({
      title: "New Job Application 💼",
      badge: { bg: "#140a1e", text: "#a78bfa", border: "#2a1a3a", icon: "📋", label: "New Application" },
      message: "A new application has been submitted for **Senior Web Developer**.\n\nReview the applicant's details and qualifications in your dashboard.",
      summaryRows: [
        { label: "Position", value: "Senior Web Developer" },
        { label: "Applicant", value: "alex@example.com" },
      ],
      ctas: [{ label: "Review Application", url: `${BASE_URL}/dashboard/applications`, primary: true }],
      showTrust: false,
    }),
  },
  {
    subject: "8/8 — Referral Reward",
    html: buildHtml({
      title: "Someone Used Your Referral! 🎁",
      badge: { bg: "#0a1f12", text: "#10b981", border: "#1a3a22", icon: "🎁", label: "Reward Earned" },
      message: "Someone signed up using your referral code! You've earned **5 Drop Tokens** as a reward.\n\nCheck your dashboard to see your balance and keep sharing your referral link.",
      ctas: [{ label: "View Dashboard", url: `${BASE_URL}/dashboard`, primary: true }],
      showTrust: false,
    }),
  },
];

async function main() {
  if (!transport.auth.user || !transport.auth.pass) {
    console.error("SMTP not configured. Set SMTP_USER and SMTP_PASS in .env.local");
    process.exit(1);
  }

  const transporter = nodemailer.createTransport(transport);
  console.log(`Sending ${emails.length} emails to ${TO} via ${transport.host}...\n`);

  for (const e of emails) {
    try {
      await transporter.sendMail({ from: { name: FROM_NAME, address: FROM_ADDR }, to: TO, subject: e.subject, html: e.html });
      console.log(`✅ Sent: ${e.subject}`);
    } catch (err) {
      console.log(`❌ Failed: ${e.subject} — ${err.message}`);
    }
  }

  console.log("\nDone! Check your inbox at skyrewi3@gmail.com");
}

main();
