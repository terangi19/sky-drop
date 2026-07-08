/**
 * Deterministic task-completion replies for high-confidence intents.
 * Used before OpenAI so find/sell/troubleshoot never dead-end or mis-route.
 */

import { isSkyAiGeneralQuestion, skyAiCapabilitiesReply } from "./sky-ai-prompts";
import { detectSkyAiIntent, hasListingSellIntent } from "./sky-ai-intent";
import {
  extractFindSearchTerm,
  parseFindBudget,
  parseFindCity,
  resolveFindBrowseRoute,
  type FindBrowseRoute,
} from "./sky-ai-find-routing";

const FIND_RE =
  /\b(find(?: me| a| an)?|show me|looking for|search for|want to buy|wanna buy|need a|need an|iso\b|in search of|hunting for|where can i (find|get)|anyone selling|under \$?\d)\b/i;

const WANTED_AD_EXPLICIT =
  /\b(post a wanted|create a wanted|wanted ad|wanted listing)\b/i;

export type SkyAiTaskContext = {
  priorUserMessage?: string;
  priorAssistantMessage?: string;
};

function buildFindBrowseReplyText(
  route: FindBrowseRoute,
  options: { budget?: string; city?: string }
): string {
  const term = route.searchTerm;
  const hasTerm = term !== "what you're after";
  const displayTerm = hasTerm ? term : route.categoryLabel.toLowerCase();

  let line = hasTerm
    ? `Opening **${displayTerm}** listings`
    : `Opening **${route.categoryLabel}**`;

  if (options.budget) {
    line += ` under **$${Number(options.budget).toLocaleString("en-NZ")}**`;
  }
  if (options.city) {
    line += ` in **${options.city}**`;
  }

  return `${line}... [[NAV:${route.path}]]`;
}

export function tryFindBrowseReply(
  message: string,
  context?: SkyAiTaskContext
): { text: string; navigateTo?: string } | null {
  const m = message.trim();
  if (!m || WANTED_AD_EXPLICIT.test(m)) return null;

  const priorWasFind = Boolean(
    context?.priorUserMessage && FIND_RE.test(context.priorUserMessage)
  );
  const isFindRefinement =
    priorWasFind &&
    (Boolean(parseFindBudget(m) || parseFindCity(m)) ||
      /\b(under|up to|max|budget|in|near|around)\b/i.test(m));

  if (!isFindRefinement) {
    if (!FIND_RE.test(m) && detectSkyAiIntent(m) !== "find_buy") return null;
  }
  if (hasListingSellIntent(m)) return null;

  let budget = parseFindBudget(m);
  let city = parseFindCity(m);
  let item = extractFindSearchTerm(m);

  if (context?.priorUserMessage) {
    if (item === "what you're after") {
      const priorItem = extractFindSearchTerm(context.priorUserMessage);
      if (priorItem !== "what you're after") item = priorItem;
    }
    if (!budget) budget = parseFindBudget(context.priorUserMessage);
    if (!city) city = parseFindCity(context.priorUserMessage);
  }

  const route = resolveFindBrowseRoute(m, { budget, city, searchTerm: item });

  return {
    text: buildFindBrowseReplyText(route, { budget, city }),
    navigateTo: route.path,
  };
}

export function tryVisibilityReply(message: string): { text: string; navigateTo?: string } | null {
  if (detectSkyAiIntent(message) !== "visibility_issue") return null;
  return {
    text: `Common reasons a listing doesn't show: email not verified, status not **Active**, sold/expired, or still processing. Open **My Listings** and check it's Active. [[NAV:/list-list]] If it's Active and still missing, edit and save once — want me to walk through which listing?`,
    navigateTo: "/list-list",
  };
}

export function tryBuyTroubleReply(message: string): { text: string; navigateTo?: string } | null {
  if (detectSkyAiIntent(message) !== "buy_trouble") return null;
  return {
    text: `Usually it's one of these: you're the seller viewing your own listing, it's already sold, it's **Contact Seller** / Arrange Purchase only (no card checkout), or you need to sign in. Try **Contact Seller** in Messages, or sign in for **Buy Now (Card)**. Which button do you see on the page?`,
  };
}

export function tryCancelDraftReply(message: string): { text: string; navigateTo?: string } | null {
  if (detectSkyAiIntent(message) !== "cancel_draft") return null;
  return {
    text: `No worries — refresh **Quick Post** or clear the fields to start fresh. [[NAV:/post/ai]] Want to list something else instead?`,
    navigateTo: "/post/ai",
  };
}

export function tryPriceValueReply(message: string): { text: string; navigateTo?: string } | null {
  if (detectSkyAiIntent(message) !== "price_value") return null;

  const lower = message.toLowerCase();
  let quick = 800;
  let fair = 950;
  let optimistic = 1100;
  let label = "this item";
  let confidence = "Medium — general NZ second-hand market estimate";

  if (/iphone 14 pro/i.test(message)) {
    label = "iPhone 14 Pro 256GB (good condition)";
    quick = 1050;
    fair = 1200;
    optimistic = 1350;
    confidence = "Medium — strong demand for Pro models in NZ";
  } else if (/iphone 15 pro/i.test(message)) {
    label = "iPhone 15 Pro 256GB (good condition)";
    quick = 1150;
    fair = 1300;
    optimistic = 1450;
    confidence = "Medium — strong demand for Pro models in NZ";
  } else if (/macbook air m1/i.test(message)) {
    label = "MacBook Air M1 256GB (good condition)";
    quick = 750;
    fair = 850;
    optimistic = 950;
    confidence = "Medium — M1 Airs hold value well in NZ";
  } else if (/laptop/i.test(lower)) {
    label = "laptop (good condition)";
    quick = 400;
    fair = 550;
    optimistic = 700;
  }

  return {
    text: `For **${label}** in NZ:\n\n**Quick sale:** $${quick.toLocaleString("en-NZ")}\n**Fair market:** $${fair.toLocaleString("en-NZ")}\n**Optimistic:** $${optimistic.toLocaleString("en-NZ")}\n**Confidence:** ${confidence}\n\nWant me to set **Fair market** ($${fair.toLocaleString("en-NZ")}) in your listing?`,
  };
}

export function tryArrangePurchaseReply(message: string): { text: string; navigateTo?: string } | null {
  if (!/\b(arrange purchase|how do i pay|bank transfer|contact seller)\b/i.test(message)) return null;
  if (detectSkyAiIntent(message) === "sell_list") return null;
  return {
    text: `**Arrange Purchase** means you agree payment in **Messages** — bank transfer, cash on pickup, etc. No card checkout, no buyer-protection fee. Seller's bank details show in chat if they've saved them in Profile. [[NAV:/payments]] Want help with **Buy Now (Card)** instead?`,
    navigateTo: "/payments",
  };
}

/** First matching deterministic task reply, or null to use OpenAI. */
export function trySkyAiTaskReply(
  message: string,
  pathname: string,
  context?: SkyAiTaskContext
): { text: string; navigateTo?: string; source: "rules" } | null {
  if (isSkyAiGeneralQuestion(message)) {
    return { text: skyAiCapabilitiesReply(), source: "rules" };
  }

  const find = tryFindBrowseReply(message, context);
  if (find) return { ...find, source: "rules" };

  // On sell page, let OpenAI handle sells with LISTING_FILL
  if (pathname === "/post/ai" && hasListingSellIntent(message)) return null;

  const visibility = tryVisibilityReply(message);
  if (visibility) return { ...visibility, source: "rules" };

  const buy = tryBuyTroubleReply(message);
  if (buy) return { ...buy, source: "rules" };

  const cancel = tryCancelDraftReply(message);
  if (cancel) return { ...cancel, source: "rules" };

  const price = tryPriceValueReply(message);
  if (price) return { ...price, source: "rules" };

  const arrange = tryArrangePurchaseReply(message);
  if (arrange) return { ...arrange, source: "rules" };

  return null;
}
