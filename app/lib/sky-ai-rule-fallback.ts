import { SKY_AI_GENERIC_FALLBACK, getGuideReply } from "./guide-assistant";
import {
  isSkyAiGeneralQuestion,
  skyAiCapabilitiesReply,
} from "./sky-ai-prompts";

/** Rule-based reply when OpenAI is unavailable — avoid useless generic one-liner. */
export function skyAiRuleFallbackText(
  message: string,
  pathname: string
): { text: string; navigateTo?: string } {
  if (isSkyAiGeneralQuestion(message)) {
    return { text: skyAiCapabilitiesReply() };
  }

  const onSellPage = pathname.startsWith("/post/ai");
  if (onSellPage) {
    const hasListingData =
      /\b(sell|selling|for sale|vehicle|rental|service|digital|template|ebook|iphone|ps5|laptop|macbook|car|toyota|bmw|ford|mazda|honda|nissan|lawn|clean|tutor|design|website)\b/i.test(message) ||
      /\$[\d,]+/.test(message) ||
      /\d{4}\s+[A-Za-z]/.test(message) ||
      /(?:^|\n)\w+\s*:/i.test(message);
    if (hasListingData) {
      return {
        text: "Āwhina is temporarily unavailable — the AI can't fill the form right now.\n\nYou can still fill in the title, description, price and category manually below, then click **Post Now** to publish.",
      };
    }
  }

  const rule = getGuideReply(message, pathname);
  const plain = rule.text.replace(/\*\*([^*]+)\*\*/g, "$1");
  if (plain.trim() === SKY_AI_GENERIC_FALLBACK) {
    return { text: skyAiCapabilitiesReply(), navigateTo: rule.navigateTo };
  }
  return { text: plain, navigateTo: rule.navigateTo };
}
