/**
 * Safety layer for Āwhina — scam detection, off-platform pressure, fill audit.
 */

import { detectScam } from "./scamdetection";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import type { SkyAiListingDraft } from "./sky-ai-types";

export type SkyAiSafetyFlag = {
  code: string;
  severity: "low" | "medium" | "high";
  message: string;
};

const OFF_PLATFORM_PRESSURE =
  /\b(whatsapp|telegram|signal|dm me|text me|email me|pay outside|bank transfer only|gift card|crypto|wire transfer|western union|cashapp|venmo)\b/i;

const SUSPICIOUS_PRICE =
  /\b(\$?\d{1,3})\s*(for|each)\b/i;

export function tryScamCheckReply(message: string): { text: string; flags: SkyAiSafetyFlag[] } | null {
  const scam = detectScam(message);
  const flags: SkyAiSafetyFlag[] = [];

  if (scam.isScam) {
    flags.push({
      code: "scam_keywords",
      severity: scam.severity as SkyAiSafetyFlag["severity"],
      message: `Detected risky phrases: ${scam.keywords.join(", ")}`,
    });
  }

  if (OFF_PLATFORM_PRESSURE.test(message)) {
    flags.push({
      code: "off_platform",
      severity: "high",
      message: "Pressure to move payment or chat off Sky Drop",
    });
  }

  if (!scam.isScam && !OFF_PLATFORM_PRESSURE.test(message)) {
    if (!/\b(scam|safe|legit|trust|fake|suspicious)\b/i.test(message)) return null;
    return {
      text: `I don't see obvious scam phrases in that message, but stay cautious:

• Keep price, pickup, and payment agreements in **Messages** on Sky Drop
• For card protection, use **Stripe Checkout** listings — open a dispute from Purchases if needed
• **Arrange Purchase** is flexible, but payment is between you and the seller — never pay before you've agreed terms in chat
• Walk away if someone rushes you, asks for gift cards/crypto, or refuses to stay on-platform

Want me to flag anything specific in the message? Paste the exact wording.`,
      flags: [],
    };
  }

  const severityLine =
    scam.severity === "high"
      ? "This looks **high risk** — do not pay or share personal details."
      : "This has **warning signs** — proceed carefully and keep everything on Sky Drop.";

  return {
    text: `${severityLine}

**Why:** ${flags.map((f) => f.message).join("; ")}

**What to do:**
• Do not pay outside Sky Drop or via gift cards/crypto
• Keep the conversation in **Messages** so there's a record
• For Stripe purchases, use **Buy Now** only — disputes are available from Purchases
• Report serious issues to support@skydrop.nz

If you're the seller, never ask buyers to leave the platform for payment.`,
    flags,
  };
}

export function auditSkyAiSafety(
  message: string,
  fill?: SkyAiListingFill | null,
  draft?: SkyAiListingDraft | null
): SkyAiSafetyFlag[] {
  const flags: SkyAiSafetyFlag[] = [];
  const combined = [message, fill?.description, fill?.title, draft?.description, draft?.title]
    .filter(Boolean)
    .join(" ");

  const scam = detectScam(combined);
  if (scam.isScam) {
    flags.push({
      code: "scam_content",
      severity: scam.severity as SkyAiSafetyFlag["severity"],
      message: "Scam-like language detected in listing content",
    });
  }

  if (OFF_PLATFORM_PRESSURE.test(combined)) {
    flags.push({
      code: "off_platform_listing",
      severity: "medium",
      message: "Listing copy mentions off-platform payment or contact",
    });
  }

  const price = parseFloat(String(fill?.price ?? draft?.price ?? "").replace(/[^0-9.]/g, ""));
  if (price > 0 && price < 5 && fill?.listingType !== "digital") {
    flags.push({
      code: "price_anomaly",
      severity: "medium",
      message: "Unusually low price — may attract scam buyers or look like a mistake",
    });
  }

  return flags;
}

export function formatSafetyWarnings(flags: SkyAiSafetyFlag[]): string {
  if (!flags.length) return "";
  const high = flags.filter((f) => f.severity === "high");
  const other = flags.filter((f) => f.severity !== "high");
  const lines = ["", "**Safety note:**"];
  for (const f of high) lines.push(`• ⚠️ ${f.message}`);
  for (const f of other) lines.push(`• ${f.message}`);
  return lines.join("\n");
}
