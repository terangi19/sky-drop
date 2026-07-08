/**
 * Logs Āwhina replies that stall, over-question, or mis-route — for expanding the eval suite.
 * Best-effort; never blocks chat.
 */

import { detectSkyAiIntent, hasListingSellIntent } from "./sky-ai-intent";
import {
  hasDeadEndPhrase,
  hasOverQuestioning,
  hasPricingStructure,
} from "./sky-ai-reply-quality";
import { logSecurityInfo } from "./security-log";

export type AwhinaQualityLogInput = {
  userMessage: string;
  reply: string;
  pathname: string;
  source: "ai" | "rules";
  listingFill?: unknown;
  uid?: string | null;
  ip?: string;
};

export function analyzeAwhinaReplyQuality(input: AwhinaQualityLogInput): string[] {
  const { userMessage, reply, pathname, listingFill } = input;
  const issues: string[] = [];
  const intent = detectSkyAiIntent(userMessage);

  if (hasDeadEndPhrase(reply)) issues.push("dead_end");
  if (hasOverQuestioning(reply)) issues.push("over_questioning");

  if (intent === "find_buy" && (listingFill || /\[\[listing_fill\]\]/i.test(reply))) {
    issues.push("find_treated_as_sell");
  }
  if (hasListingSellIntent(userMessage) && pathname === "/post/ai" && !listingFill && !/\[\[listing_fill\]\]/i.test(reply)) {
    if (input.source === "ai") issues.push("sell_missing_listing_fill");
  }
  if (intent === "price_value" && !hasPricingStructure(reply) && input.source === "ai") {
    issues.push("pricing_format_missing");
  }
  if (intent === "buy_trouble" && /\bplease provide|what item are you/i.test(reply)) {
    issues.push("buy_trouble_stall");
  }
  if (intent === "cancel_draft" && /\bno draft|what item are you looking/i.test(reply)) {
    issues.push("cancel_draft_stall");
  }

  return issues;
}

export async function logAwhinaQualityIfNeeded(input: AwhinaQualityLogInput): Promise<void> {
  const issues = analyzeAwhinaReplyQuality(input);
  if (!issues.length) return;

  const intent = detectSkyAiIntent(input.userMessage);
  await logSecurityInfo("awhina_quality_issue", `Āwhina quality flags: ${issues.join(", ")}`, {
    actorUid: input.uid ?? undefined,
    ip: input.ip,
    metadata: {
      intent,
      issues,
      source: input.source,
      pathname: input.pathname,
      userMessage: input.userMessage.slice(0, 500),
      replyPreview: input.reply.slice(0, 800),
      hasListingFill: Boolean(input.listingFill),
    },
  }).catch(() => {
    /* non-blocking */
  });
}
