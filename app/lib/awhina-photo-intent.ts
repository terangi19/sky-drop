/**
 * Photo attachment intent — IMAGE ≠ automatic SELL.
 * Same vision pipeline; behavior depends on text + surface context.
 * Marketplace shorthand (price + location/grade/serial) ⇒ sell, not "Want to sell?".
 */

import { inferObviousSellIntent, extractDomainAwareShorthand, inferFusionDomain } from "./awhina-multimodal-fusion";

export type AwhinaPhotoIntent = "sell" | "identify" | "ambiguous";

const IDENTIFY_RE =
  /\b(what\s+is\s+this|what'?s\s+this|what\s+is\s+that|what'?s\s+that|identify|do\s+you\s+know\s+what|tell\s+me\s+what|recognise|recognize)\b/i;

const SELL_RE =
  /\b(sell|selling|list\s+this|listing|for\s+sale|post\s+this|create\s+a?\s*listing|want\s+to\s+sell|i'?m\s+selling|put\s+this\s+up)\b/i;

const PRICE_RE = /\$\s*\d|\b\d{2,6}\s*(dollars?|bucks)?\b/i;

export function classifyAwhinaPhotoIntent(
  message: string,
  opts?: { onSellPage?: boolean; priorSellingTask?: boolean }
): AwhinaPhotoIntent {
  if (opts?.onSellPage) return "sell";

  const m = (message || "").trim();
  if (IDENTIFY_RE.test(m) && !SELL_RE.test(m)) return "identify";
  if (SELL_RE.test(m) || (PRICE_RE.test(m) && /\b(for|want|asking|price)\b/i.test(m))) {
    return "sell";
  }

  // Photo + marketplace facts (price+location / grade / serial / pickup) ⇒ sell
  if (m) {
    const domain = inferFusionDomain({}, m);
    const facts = extractDomainAwareShorthand(m, domain);
    if (
      inferObviousSellIntent({
        message: m,
        onSellPage: false,
        priorSellingTask: opts?.priorSellingTask,
        userFacts: facts,
      })
    ) {
      return "sell";
    }
  }

  if (!m) {
    if (opts?.priorSellingTask) return "sell";
    return "ambiguous";
  }
  return "ambiguous";
}

export function buildIdentifyOnlyReply(identity: string): string {
  const id = identity.trim() || "that item";
  return `Looks like a **${id}**.`;
}

export function buildSellOfferReply(identity: string): string {
  const id = identity.trim() || "that item";
  return `Looks like a **${id}**. Want to sell it? Reply **Sell this** and I'll start your listing.`;
}
