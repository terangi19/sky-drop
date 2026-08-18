import {
  enhanceListingFillFromMessage,
  hasListingFillOrFormActions,
  parseFormActionsFromMessage,
  mergeFormActionsIntoFill,
} from "./sky-ai-form-actions";
import {
  inferPhysicalCategoryFromText,
  type SkyAiListingFill,
} from "./sky-ai-listing-fill";
import { mergeListingFillWithDraft } from "./sky-ai-draft-merge";
import type { SkyAiListingContext } from "./sky-ai-types";

const LABELED_LISTING =
  /\b(?:price|category|condition|location|description|listing\s+type|stock|property\s+type|availability|bedroom|bathroom|bond|move-?in)\s*:/i;

function normalizePath(pathname: string): string {
  return pathname.split("?")[0].replace(/\/$/, "") || "/";
}

/** User pasted listing details — not a navigation request. */
export function isListingDetailMessage(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length < 60) return false;
  if (
    /\b(take me|go to|navigate|show me the)\b/i.test(trimmed) &&
    trimmed.length < 120 &&
    !LABELED_LISTING.test(trimmed)
  ) {
    return false;
  }

  if (
    LABELED_LISTING.test(trimmed) &&
    (/\bprice\s*:\s*\$?\d/i.test(trimmed) || /\b\d+\s*(?:per\s+week|pw)\b/i.test(trimmed))
  ) {
    return true;
  }

  // Only use the structured-paste shortcut for an actual multi-line paste.
  // A natural one-line seller message such as
  // "1999 Nissan Skyline R34 GTT, manual, 145,000 km ... $38,000 NZD"
  // must go through the canonical listing parser so title, price, condition and
  // vehicle facts are harvested together on turn one. Previously this broad
  // length/price heuristic intercepted that sentence, produced a partial draft
  // (often just Vehicle/Cars/location), and made the seller repeat it.
  if (
    /\r?\n/.test(trimmed) &&
    trimmed.length >= 120 &&
    (/\$\s*\d+|\d+\s*nzd\b/i.test(trimmed) || /\b\d+\s*per\s+week\b/i.test(trimmed)) &&
    /\b(selling|included|condition|pickup|shipping|bundle|console|description|item|works|bedroom|bathroom|property\s+type|rental|furnished|bond|parking)\b/i.test(
      trimmed
    )
  ) {
    return true;
  }

  return false;
}

function pickLineField(text: string, labels: string[]): string | undefined {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(?:^|\\n)\\s*${escaped}\\s*:\\s*([^\\n]+)`, "i");
    const m = text.match(re);
    if (m?.[1]?.trim()) return m[1].trim();
  }
  return undefined;
}

function pickDescriptionBlock(text: string): string | undefined {
  const m = text.match(
    /\bdescription\s*:\s*\n([\s\S]*?)(?=\n\s*(?:keywords|stock|listing\s+type)\s*:|$)/i
  );
  if (m?.[1]?.trim()) return m[1].trim();

  const lines = text.split(/\n/).map((l) => l.trim());
  const start = lines.findIndex((l) => /^description\s*:/i.test(l));
  if (start >= 0) {
    const body = lines
      .slice(start + 1)
      .filter((l) => !/^(keywords|stock|listing\s+type)\s*:/i.test(l))
      .join("\n")
      .trim();
    if (body.length > 20) return body;
  }
  return undefined;
}

function extractTitle(text: string): string | undefined {
  const lines = text
    .split(/\n/)
    .map((l) => l.trim().replace(/^[:#\-–—]+\s*/, ""))
    .filter(Boolean);
  for (const line of lines) {
    if (
      /^(category|price|location|condition|description|keywords|stock|listing\s+type|included|property\s+type|availability)\s*:/i.test(
        line
      )
    ) {
      continue;
    }
    if (line.length >= 3 && line.length <= 140) return line;
  }
  return undefined;
}

function normalizeListingType(raw: string | undefined, text = ""): string {
  const lower = (raw || "").toLowerCase();
  const blob = `${lower} ${text.toLowerCase()}`;
  if (/digital/.test(lower)) return "digital";
  if (/service/.test(lower)) return "service";
  if (/rent(?:al|ing)?\b/.test(lower) && !/\b(?:house|home|apartment|flat|room|property|tenancy|landlord)\b/.test(lower)) return "rental";
  if (/vehicle|car/.test(lower)) return "vehicle";
  if (/\b(?:hire|equipment|tool|trailer|party|machinery|generator|camping|tent|gazebo|pressure\s+washer|excavator|camera)\b/.test(blob)) return "rental";
  if (/\b(?:per\s+day|daily\s+rate|deposit)\b/.test(blob) && !/\b(?:per\s+week|pw|bond|bedroom|bathroom)\b/.test(blob)) return "rental";
  if (/\b(?:house|home|apartment|flat|room|property|tenancy|landlord)\b/.test(lower)) return "physical";
  return "physical";
}

function normalizeCondition(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  const lower = s.toLowerCase();
  if (lower === "new") return "New";
  if (/like new|excellent|mint/i.test(lower)) return "Used - Like New";
  if (/good|used/i.test(lower)) return "Used - Good";
  if (/fair|rough/i.test(lower)) return "Used - Fair";
  return "Used - Good";
}

function parsePrice(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const m = raw.match(/(\d+(?:\.\d{1,2})?)/);
  return m?.[1];
}

function parseWeeklyRent(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  if (!/\b(?:per\s+week|weekly|pw)\b/i.test(raw)) return undefined;
  return parsePrice(raw);
}

function parseBond(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return parsePrice(raw);
}

function inferCategory(listingType: string, title: string, description: string): string {
  const blob = `${title} ${description}`;
  if (listingType === "physical") {
    return inferPhysicalCategoryFromText(blob) || "Other";
  }
  return "Other";
}

/** Parse structured listing paste (labeled fields or title + body). */
export function parseStructuredListingPaste(message: string): SkyAiListingFill | null {
  const text = message.trim();
  if (!text) return null;

  const title = extractTitle(text);
  const categoryRaw = pickLineField(text, ["category"]);
  const propertyTypeRaw = pickLineField(text, ["property type"]);
  const priceRaw = pickLineField(text, ["price"]);
  const location = pickLineField(text, ["location"]);
  const conditionRaw = pickLineField(text, ["condition"]);
  const listingTypeRaw = pickLineField(text, ["listing type"]);
  const stockRaw = pickLineField(text, ["stock"]);
  const bondRaw = pickLineField(text, ["bond"]);
  const description = pickDescriptionBlock(text);

  const listingType = normalizeListingType(
    categoryRaw || listingTypeRaw || propertyTypeRaw,
    text
  );
  const weeklyRent = parseWeeklyRent(priceRaw);
  const price = weeklyRent ? undefined : parsePrice(priceRaw);
  const condition = normalizeCondition(conditionRaw);
  const category = categoryRaw
    ? inferCategory(listingType, title || categoryRaw, description || "")
    : inferCategory(listingType, title || "", description || "");

  const fill: SkyAiListingFill = {};
  if (title) fill.title = title.slice(0, 120);
  if (description) fill.description = description.slice(0, 4000);
  if (price) fill.price = price;
  if (weeklyRent) fill.rentalPriceWeekly = weeklyRent;
  const bond = parseBond(bondRaw);
  if (bond) fill.rentalDeposit = bond;
  if (condition) fill.condition = condition;
  if (location) {
    fill.location = location.slice(0, 80);
    fill.pickupAvailable = true;
    fill.pickupArea = location.slice(0, 80);
  }
  if (category) fill.category = category;
  if (listingType) fill.listingType = listingType;
  if (listingType === "rental" && propertyTypeRaw) {
    fill.category = /house|home/i.test(propertyTypeRaw) ? "Property" : fill.category || "Other";
  }
  if (stockRaw) {
    const qty = stockRaw.match(/(\d+)/);
    if (qty?.[1]) fill.stockQuantity = qty[1];
  }

  if (/fixed\s+price|buy\s+now/i.test(listingTypeRaw || text)) {
    fill.saleType = "buy_now";
  }

  const actions = parseFormActionsFromMessage(text);
  const merged = mergeFormActionsIntoFill(fill, actions);

  if (!hasListingFillOrFormActions(merged)) return null;
  return merged;
}

export type ListingPasteShortcutResult = {
  reply: string;
  listingFill: SkyAiListingFill;
  source: "rules";
};

export function tryListingPasteShortcut(
  message: string,
  pathname: string,
  listingContext: SkyAiListingContext | null
): ListingPasteShortcutResult | null {
  if (normalizePath(pathname) !== "/post/ai") return null;
  if (!isListingDetailMessage(message)) return null;

  const parsed = parseStructuredListingPaste(message);
  if (!parsed) return null;

  const merged = mergeListingFillWithDraft(listingContext, parsed);
  const listingFill = enhanceListingFillFromMessage(message, merged) || merged;
  if (!hasListingFillOrFormActions(listingFill)) return null;

  const title = listingFill.title || "your item";
  return {
    reply: `Got it — I've filled your listing form for **${title}**. Check the details below, add photos if you have them, and publish when you're ready.`,
    listingFill,
    source: "rules",
  };
}
