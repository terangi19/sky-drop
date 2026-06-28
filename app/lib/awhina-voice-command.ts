import { findBestDestination, getGuideReply, scoreDestination } from "./guide-assistant";
import { dispatchListingFill, type SkyAiListingFill } from "./sky-ai-listing-fill";

export type VoiceCommandAction =
  | {
      type: "navigate";
      path: string;
      status: string;
      openChat?: string;
    }
  | {
      type: "search";
      path: string;
      status: string;
      query: string;
    }
  | {
      type: "listing";
      path: string;
      status: string;
      message: string;
    }
  | {
      type: "chat";
      status: string;
      message: string;
    }
  | {
      type: "reply";
      status: string;
      message: string;
    };

const SEARCH_INTENT =
  /\b(find|search(?:ing)?|look(?:ing)?\s+for|show me|get me|hunt for|browse for|need a|want a|where can i find)\b/i;

const SELL_INTENT =
  /\b(sell|selling|list(?:ing)?|post|create a listing|advertise|for sale|i want to sell|make a listing)\b/i;

const UNDER_PRICE = /\b(?:under|below|less than|max|maximum|up to)\s*\$?\s*([\d,]+(?:\.\d{2})?)/i;
const OVER_PRICE = /\b(?:over|above|more than|min|minimum|at least)\s*\$?\s*([\d,]+(?:\.\d{2})?)/i;
const IN_LOCATION =
  /\b(?:in|near|around|from)\s+(auckland|wellington|christchurch|hamilton|tauranga|dunedin|palmerston north|napier|rotorua|nelson|invercargill|queenstown|new plymouth|whangarei|gisborne|timaru|taupo|north shore|manukau|waitakere|canterbury|waikato|otago|hawke'?s bay)\b/i;

function parsePrice(raw: string): number | undefined {
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function extractSearchTerms(text: string): string {
  let q = text.trim();
  q = q.replace(
    /^(please\s+)?(can you\s+)?(find|search for|look for|show me|get me|i need|i want)\s+(me\s+)?(a|an|some)?\s*/i,
    ""
  );
  q = q.replace(UNDER_PRICE, "");
  q = q.replace(OVER_PRICE, "");
  q = q.replace(IN_LOCATION, "");
  q = q.replace(/\b(in new zealand|on sky drop|on skydrop)\b/gi, "");
  return q.replace(/\s+/g, " ").trim();
}

function buildSearchPath(text: string): { path: string; query: string; status: string } | null {
  if (!SEARCH_INTENT.test(text)) return null;

  const query = extractSearchTerms(text);
  if (!query || query.length < 2) return null;

  const params = new URLSearchParams();
  params.set("q", query);

  const under = text.match(UNDER_PRICE);
  const over = text.match(OVER_PRICE);
  const loc = text.match(IN_LOCATION);

  if (under) params.set("maxPrice", String(parsePrice(under[1])));
  if (over) params.set("minPrice", String(parsePrice(over[1])));
  if (loc) params.set("location", loc[1]);

  const locLabel = loc ? ` in ${loc[1][0].toUpperCase()}${loc[1].slice(1)}` : "";
  const priceLabel = under ? ` under $${under[1]}` : over ? ` over $${over[1]}` : "";

  return {
    path: `/search?${params.toString()}`,
    query,
    status: `Looking for ${query}${locLabel}${priceLabel}…`,
  };
}

function buildListingAction(text: string): VoiceCommandAction | null {
  if (!SELL_INTENT.test(text)) return null;
  const hasDetail =
    SELL_INTENT.test(text) &&
    (/\$[\d,]+/.test(text) ||
      /\b(ps5|iphone|laptop|car|toyota|honda|mazda|bike|couch|service|rental|digital)\b/i.test(text) ||
      text.split(/\s+/).length >= 6);

  if (!hasDetail && !/\b(sell|listing|post)\b/i.test(text)) return null;

  return {
    type: "listing",
    path: "/post/ai",
    status: "Opening Sell — filling your listing…",
    message: text,
  };
}

/** Resolve voice commands locally before calling the API. */
export function resolveVoiceCommand(text: string, pathname: string): VoiceCommandAction | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const search = buildSearchPath(trimmed);
  if (search) {
    return {
      type: "search",
      path: search.path,
      status: search.status,
      query: search.query,
    };
  }

  const listing = buildListingAction(trimmed);
  if (listing) return listing;

  const dest = findBestDestination(trimmed);
  const destScore = dest ? scoreDestination(trimmed, dest) : 0;
  const wantsNav =
    /\b(take me|go to|open|show me|navigate|bring me|send me|guide me|my messages|my purchases|my sales|my profile)\b/i.test(
      trimmed
    ) || destScore >= 4;

  if (dest && wantsNav) {
    const same =
      pathname === dest.path ||
      (dest.path.includes("#") && pathname === dest.path.split("#")[0]);
    if (same) {
      return {
        type: "reply",
        status: `You're already on ${dest.title}.`,
        message: `You're already on **${dest.title}**. What else can I help with?`,
      };
    }
    return {
      type: "navigate",
      path: dest.path,
      status: `Opening ${dest.title}…`,
    };
  }

  const guide = getGuideReply(trimmed, pathname);
  if (guide.navigateTo) {
    return {
      type: "navigate",
      path: guide.navigateTo,
      status: guide.destination ? `Opening ${guide.destination.title}…` : "On my way…",
    };
  }

  if (guide.text && !guide.text.includes("Tell me what you need")) {
    return {
      type: "reply",
      status: "Here's what I found…",
      message: guide.text.replace(/\*\*([^*]+)\*\*/g, "$1"),
    };
  }

  return null;
}

export function listingFillFromVoiceApi(fill: SkyAiListingFill | undefined) {
  if (!fill) return;
  dispatchListingFill(fill);
}
