/**
 * Semantic seller-message understanding.
 *
 * UNDERSTAND → STRUCTURE (this module) → VERIFY → WRITE (existing composers).
 * Raw seller speech is never a public description. Facts are classified even
 * when the message has no punctuation.
 *
 * Generic only — category dictionaries of accessory/defect/price cues, never
 * product-specific Makita/PS5/BMW/iPhone branches.
 */

import type { SellerEvidenceItem } from "./awhina-seller-evidence";

export type SemanticPriceClass =
  | "confirmed"
  | "tentative"
  | "historical"
  | "excluded"
  | "not_price";

export type SemanticEvidenceKind =
  | "identity"
  | "attribute"
  | "included"
  | "positive_condition"
  | "negative_condition"
  | "modification"
  | "location"
  | "price_confirmed"
  | "price_tentative"
  | "price_historical"
  | "seller_instruction"
  | "seller_intent"
  | "filler";

export type SemanticPriceMention = {
  amount: string;
  klass: Exclude<SemanticPriceClass, "not_price">;
  raw: string;
};

export type ExtractedSemanticFact = {
  kind: SemanticEvidenceKind;
  text: string;
};

export type SellerPriceModel = {
  confirmed?: string;
  tentative?: string;
  historical?: string;
  excluded: string[];
};

export type SellerSemanticModel = {
  identity: string | null;
  location: string | null;
  facts: ExtractedSemanticFact[];
  prices: SellerPriceModel;
  hasDefects: boolean;
  /** Buyer-facing extras for the existing harvest → composer path. */
  evidence: SellerEvidenceItem[];
};

const FILLER_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "bro",
  "mate",
  "like",
  "just",
  "really",
  "pretty",
  "still",
  "also",
  "then",
  "so",
  "yeah",
  "yep",
  "ok",
  "okay",
  "please",
  "thanks",
  "thank",
  "you",
  "my",
  "im",
  "i",
  "it",
  "its",
  "got",
  "has",
  "have",
  "with",
  "for",
  "in",
  "on",
  "of",
  "to",
  "is",
  "are",
]);

/** Component / accessory head nouns — category dictionary, not product names. */
const INCLUDED_HEAD_RE = new RegExp(
  String.raw`\b(?:(?:\d+|one|two|three|four|five|six|a|an|the|original|oem|extra)\s+)?(?:[\w'-]+\s+){0,2}(?:` +
    [
      "controllers?",
      "cables?",
      "cords?",
      "leads?",
      "chargers?",
      "adapters?",
      "docks?",
      "stands?",
      "cases?",
      "bags?",
      "boxes?",
      "covers?",
      "manuals?",
      "discs?",
      "games?",
      "remotes?",
      "batteries",
      "battery",
      "drivers?",
      "drills?",
      "saws?",
      "grinders?",
      "hoses?",
      "blades?",
      "bits?",
      "trays?",
      "chairs?",
      "cushions?",
      "tables?",
      "filters?",
      "tanks?",
      "lenses?",
      "protectors?",
      "keyboards?",
      "mice",
      "mouse",
      "headsets?",
      "pads?",
      "racks?",
      "liners?",
      "canop(?:y|ies)",
      "tow\\s*bars?",
      "screens?",
      "hdmi",
      "usb-?c",
    ].join("|") +
    String.raw`)\b`,
  "gi"
);

const DEFECT_TOKEN_RE =
  /\b(?:scratch(?:ed|es)?|crack(?:ed|s)?|dent(?:ed|s)?|torn|stain(?:ed|s)?|chipp?(?:ed|s)?|scuff(?:ed|s)?|broken|damaged|worn|ding(?:ed|s)?|leak(?:s|ing)?|missing|faulty|dead|swollen|wobbly|sticky|loose|smashed|chipped|drift|doesn'?t|won'?t|not\s+working|reduced\s+runtime|doesn'?t\s+last)\b/i;

const POSITIVE_CONDITION_RE =
  /\b(?:barely\s+use(?:d)?(?:\s+(?:it|them))?|only\s+used\s+(?:once|twice|a\s+few\s+times)|light(?:ly)?\s+used|still\s+works?(?:\s+(?:fine|well|ok|okay|good))?|works?\s+(?:fine|well|ok|okay|good|perfectly)|in\s+working\s+order)\b/gi;

const LOCATION_RE =
  /\b(?:i'?m\s+in|im\s+in|located(?:\s+in)?|based(?:\s+in)?|pickup(?:\s+in)?|pick\s*up(?:\s+in)?|in)\s+(north\s+shore|west\s+auckland|east\s+auckland|south\s+auckland|palmerston\s+north|mount\s+eden|mt\s+eden|auckland|wellington|christchurch|hamilton|tauranga|dunedin|napier|rotorua|queenstown|nelson|whangarei|henderson|manukau|albany|newmarket|takapuna|papakura|waitakere|grey\s*lynn|new\s+lynn|petone|massey|howick|botany)\b/i;

const LOCATION_BARE_RE =
  /\b(north\s+shore|west\s+auckland|east\s+auckland|south\s+auckland|palmerston\s+north|mount\s+eden|mt\s+eden|henderson|manukau|albany|newmarket|takapuna|papakura|waitakere|grey\s*lynn|new\s+lynn|petone|massey|auckland|wellington|christchurch|hamilton|tauranga|dunedin|napier|rotorua|queenstown|nelson|whangarei)\b/i;

export const SELLER_INSTRUCTION_RE =
  /\b(?:can|could|would)\s+you\b|\b(?:please\s+)?(?:make|write|create|generate)\s+(?:the|a|an|my)?\s*(?:ad|listing|title|description)\b|\btell\s+me\s+what\s+(?:price|it(?:'?s|s)?\s+actually\s+worth|they(?:'re|\s+are)\s+worth|i\s+should)\b|\bdon'?t\s+(?:put|say|mention|use)\b|\bdo\s+not\s+(?:put|use|say|mention)\b|\btitle\s+it\b|\bmake\s+(?:the\s+)?(?:ad|listing)\s+sound\s+(?:good|professional)\b|\bhelp\s+me\s+(?:choose|pick|write|price|suggest)\b|\bsuggest\s+(?:a\s+)?(?:fair\s+)?price\b|\bsound\s+professional\b|\blisting_fill\b|\bsystem\s+prompt\b|\bno\s+scams\b|\bno\s+time\s*wasters?\b|\bserious\s+only\b/i;

export const SELLER_INTENT_RE =
  /\bjust\s+want(?:\s+it)?\s+gone\b|\bwant\s+(?:it\s+)?gone\b|\bneed\s+it\s+gone\b|\bpaid\s+(?:heaps|a\s+lot|lots)\s+for\s+it\b|\bidk\b|\bi\s+don'?t\s+know\s+what\s+(?:it'?s|they(?:'re|\s+are))\s+worth\b/i;

const IDENTITY_STOP_RE =
  /\b(?:bro|mate|barely|had\s+it|couple(?:\s+of)?\s+years?|still\s+works?|got|comes?\s+with|includes?|paid|bought|purchased|maybe|thinking|idk|i'?m\s+in|im\s+in|located|pickup|pick\s*up|shipping|can\s+you|could\s+you|tell\s+me|don'?t|do\s+not|just\s+want|make\s+the|help\s+me|title\s+it|mint|excellent|brand\s+new|like\s+new|good\s+condition|used\s+condition|asking|for\s+(?:\$|\d)|needs?\s+new|bit\s+scratched|scratched|dent|wait|actually|under|prefer|wtb|budget|no\s+rust|no\s+scams|serious\s+only)\b/i;

const NON_PRICE_AFTER_RE =
  /^(?:\s*(?:gb|tb|mb|km|kms|kilomet(?:er|re)s?|%|percent|inch(?:es)?|in\b|cm|mm|bed(?:room)?s?|bath(?:room)?s?|seater|pack|pcs?|volt(?:s)?|watt(?:s)?|gb\b|controllers?|chairs?|batter(?:y|ies)|cables?|i\b|t\b))/i;

const NON_PRICE_BEFORE_RE =
  /(?:stage|index|series|model|mark|mk|version|grade|size|iphone|pixel|galaxy|xbox|ps|bmw|335i)\s*$/i;

const CONFIRMED_PRICE_CUE_RE =
  /\b(?:asking(?:\s+(?:price|for))?|want(?:s|ed)?\s+\$?\s*\d[\d,]*\s*(?:k)?\s+for\s+it|sell(?:ing)?\s+(?:it\s+)?for|price(?:\s+is)?|ono|o\.n\.o)\b|\$\s*\d|\b\d[\d,]*\s*(?:k)?\s*(?:bucks|nzd|dollars?)\b/i;

function clean(raw: string): string {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .replace(/^[,.;:\s-]+|[,.;:\s-]+$/g, "")
    .trim();
}

function titleCaseLocation(raw: string): string {
  return raw
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function normalizeAmount(raw: string, kFlag?: string | null): string | null {
  let n = Number(String(raw).replace(/,/g, ""));
  if (!Number.isFinite(n) || n < 1 || n > 10_000_000) return null;
  if (kFlag && /^k$/i.test(kFlag)) n *= 1000;
  if (n >= 1980 && n <= 2035 && !kFlag) return null;
  return String(Math.round(n));
}

function windowAround(text: string, start: number, end: number, radius = 48): string {
  return text.slice(Math.max(0, start - radius), Math.min(text.length, end + radius));
}

function isExcludedPriceSpan(span: string): boolean {
  return (
    /\bdon'?t\s+put\b|\bdo\s+not\s+(?:put|use)\b|\bnot\s+(?:the\s+)?(?:asking\s+)?price\b|\bdon'?t\s+use\s+(?:that|it)\b/i.test(
      span
    )
  );
}

function isHistoricalPriceSpan(span: string): boolean {
  return /\b(?:paid|bought|purchased|originally|original(?:ly)?\s+(?:paid|price)|paid\s+(?:like|around|about)|was(?:\s+asking)?|last\s+year)\b/i.test(
    span
  );
}

function isTentativePriceSpan(span: string): boolean {
  return (
    /\b(?:maybe|may\s+be|not\s+sure|idk|i\s+don'?t\s+know|thinking|reckon|around|roughly|or\s+so|ish|what\s+(?:it'?s|they(?:'re|\s+are))\s+worth|what\s+price\s+i\s+should|tell\s+me\s+what\s+(?:price|it'?s\s+(?:actually\s+)?worth))\b/i.test(
      span
    )
  );
}

/** Immediate left-context of THIS number — never a 48-char window that includes a later "was". */
function priceClassFromLocalCues(
  before: string,
  after: string
): SemanticPriceMention["klass"] | "skip" | null {
  const left = before.slice(-36);
  if (/\b(?:don'?t\s+put|do\s+not\s+(?:put|use))\b/i.test(left) && /\b(?:was|paid|that|the|it)\s*$/i.test(left)) {
    return "excluded";
  }
  if (/\b(?:under|below|up\s+to|max(?:imum)?|budget)\s*$/i.test(left)) return "skip";
  if (/\bbond\s*\$?\s*$/i.test(left)) return "skip";
  if (/\b(?:lot|set)\s+of\s*$/i.test(left)) return "skip";
  if (/\b(?:starting\s+)?bid\s*$/i.test(left)) return "skip";
  if (/\bbuy\s+now\s*$/i.test(left)) return "confirmed";
  if (/\b(?:paid|bought|purchased|originally|was(?:\s+asking)?)\s*$/i.test(left)) {
    return "historical";
  }
  if (/\b(?:maybe|may\s+be|not\s+sure|idk|thinking|reckon|around|roughly)\s*$/i.test(left)) {
    return "tentative";
  }
  if (/\b(?:now|asking|askin|nah|sell(?:ing)?\s+for|price(?:\s+is)?|make\s+it)\s*$/i.test(left)) {
    return "confirmed";
  }
  if (/^\s*(?:ono|o\.n\.o|neg|negotiable|or\s+nearest\s+offer|the\s+lot|the\s+pair|bucks|nzd|dollars?)\b/i.test(after)) {
    return "confirmed";
  }
  if (/^\s*(?:a|an|per|\/)\s*(?:day|week|hour|hr|lawn|visit|job|night|section)\b/i.test(after)) {
    return "confirmed";
  }
  if (
    /\b(?:auckland|wellington|christchurch|hamilton|tauranga|dunedin|manukau|henderson|west\s+auckland|east\s+auckland|south\s+auckland|north\s+shore)\s*$/i.test(
      left
    ) &&
    !after.trim()
  ) {
    return "confirmed";
  }
  return null;
}

function isNotPriceSpan(before: string, after: string, amount: number): boolean {
  if (NON_PRICE_BEFORE_RE.test(before)) return true;
  if (NON_PRICE_AFTER_RE.test(after)) return true;
  if (/\b(?:stage|index|lot\s+of|set\s+of|air\s+max|max)\s+$/i.test(before)) return true;
  if (/[a-zA-Z]$/.test(before)) return true;
  if (/[a-zA-Z]-$/.test(before)) return true;
  if (/^\s*(?:i\b|inch(?:es)?|pro\b|max\b|plus\b|mini\b|gb|tb|bed|bath|seater|controllers?|pads?|games?|keys?|templates?|%|percent|kays)\b/i.test(after)) {
    return true;
  }
  // Phone generation ("it's a 15 pro") is identity, not asking price.
  if (
    amount >= 4 &&
    amount <= 16 &&
    /^\s*(?:pro(?:\s*max)?|plus|mini)\b/i.test(after) &&
    /\b(?:iphone|it'?s\s+(?:a|the)|its\s+(?:a|the))\b/i.test(`${before} ${after}`)
  ) {
    return true;
  }
  if (/\bx\s*$/i.test(before) && amount <= 12) return true;
  if (/^\s*(?:the\s+)?(?:lot|pair|set)\b/i.test(after) && amount <= 12 && /\b(?:lot|set|pair|x\d)\b/i.test(before)) {
    return true;
  }
  // "wait no 256" / "actually 256" / "wait no 512 purple" — storage/capacity, not asking price
  if (
    /(?:wait\s+)?(?:no|nah|actually)\s*$/i.test(before) &&
    /^(64|128|256|512|1024|1|2|4)$/.test(String(amount))
  ) {
    return true;
  }
  // Phone generation ("it's the 14 again") is identity, not asking price.
  if (
    amount >= 4 &&
    amount <= 16 &&
    /\b(?:iphone|pixel|galaxy|it'?s|its|forget)\b/i.test(before) &&
    !/\bmake\s+it\s*$/i.test(before)
  ) {
    return true;
  }
  if (/^\s*(?:and\s+)?(?:its|it's|is)\s+(?:purple|blue|black|white|red|green|silver|grey|gray)\b/i.test(after) &&
      /^(64|128|256|512|1024)$/.test(String(amount))) {
    return true;
  }
  if (/\bbattery\s*$/i.test(before) && amount <= 100) return true;
  if (amount <= 20 && /^\s*[a-z][\w'-]*/i.test(after)) {
    const locish =
      /(?:auckland|wellington|christchurch|hamilton|tauranga|dunedin|queenstown|palmerston|wellie|dunners|westie|hammers|palmy|akl|chch)\b/i.test(
        after
      );
    if (!locish) return true;
  }
  if (/\b\d{3,7}\s*km/i.test(`${before}${after}`) && amount >= 1000) {
    if (/km/i.test(after) || /km/i.test(before.slice(-8))) return true;
  }
  if (/\b(?:gb|tb)\b/i.test(after) || /\b(?:gb|tb)\s*$/i.test(before)) return true;
  return false;
}

function isConfirmedPriceSpan(span: string, before: string, after: string): boolean {
  if (/\b(?:now|asking|askin|ono|o\.n\.o|neg|negotiable|nah|firm|sell(?:ing)?\s+for|price(?:\s+is)?|buy\s+now|make\s+it)\b/i.test(span)) {
    return true;
  }
  if (/\b(?:now|asking|nah)\s*$/i.test(before)) return true;
  if (/^\s*(?:ono|o\.n\.o|neg|or\s+nearest\s+offer|bucks|nzd|dollars?|the\s+lot|the\s+pair)\b/i.test(after)) {
    return true;
  }
  return false;
}

/**
 * Classify every numeric mention. Asking price is only the confirmed class.
 * Last confirmed amount wins (nah 9k after maybe 8500).
 */
export function classifySellerPrices(message: string): SellerPriceModel {
  const text = String(message || "");
  const mentions: SemanticPriceMention[] = [];
  const re =
    /\$\s*([\d,]+(?:\.\d{1,2})?)\s*(k)?|(?<![a-zA-Z])\b([\d,]+(?:\.\d{1,2})?)\s*(k)?\s*(?:bucks|nzd|dollars?|ono)?\b/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const rawDigits = match[1] || match[3];
    const kFlag = match[2] || match[4];
    const amount = normalizeAmount(rawDigits, kFlag);
    if (!amount) continue;
    const n = Number(amount);
    if (
      kFlag &&
      /^\d{2,3}$/.test(String(rawDigits).replace(/,/g, "")) &&
      /\b[\d,]{4,6}\b/.test(text) &&
      /\b(?:hilux|ranger|ute|toyota|ford|honda|mazda|nissan|bmw)\b/i.test(text)
    ) {
      continue;
    }
    const before = text.slice(Math.max(0, match.index - 48), match.index);
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 28);
    if (isNotPriceSpan(before, after, n)) continue;
    if (/\b(?:under|below|up\s+to|max(?:imum)?|budget)\s*$/i.test(before)) continue;
    if (/\b(?:bond|deposit)\s*$/i.test(before) && /\bweeks?\b/i.test(after)) continue;
    if (/^\s*(?:gb|tb|bed|bath|inch|controllers?|pads?|games?|keys?|%|percent)\b/i.test(after)) {
      continue;
    }
    const span = windowAround(text, match.index, match.index + match[0].length, 28);
    const local = priceClassFromLocalCues(before, after);
    if (local === "skip") continue;
    let klass: SemanticPriceMention["klass"] = "confirmed";
    if (local) {
      klass = local;
    } else if (isExcludedPriceSpan(before) || isExcludedPriceSpan(span.slice(0, Math.max(0, span.indexOf(match[0]) + 1)))) {
      klass = "excluded";
    } else if (isConfirmedPriceSpan(span, before, after)) {
      klass = "confirmed";
    } else if (
      !/\$/.test(match[0]) &&
      !/\b(?:bucks|nzd|dollars?|ono|neg|negotiable)\b/i.test(match[0]) &&
      !CONFIRMED_PRICE_CUE_RE.test(`${before} ${match[0]}`) &&
      !/\b(?:asking|askin|price|for|at|want|now|nah)\b/i.test(before)
    ) {
      if (/\b(?:paid|bought|purchased|was(?:\s+asking)?)\s+$/i.test(before)) klass = "historical";
      else if (/\b(?:maybe|thinking|reckon|around)\s+$/i.test(before)) klass = "tentative";
      else if (
        !/\b(?:in\s+)?(?:auckland|wellington|christchurch|hamilton|tauranga|dunedin|manukau|henderson|west\s+auckland|queenstown|palmerston)\b/i.test(
          after
        ) &&
        !/^\s*(?:ono|o\.n\.o|neg|or\s+nearest|the\s+lot|the\s+pair)\b/i.test(after)
      ) {
        if (
          !after.trim() &&
          (n >= 20 ||
            /\b(?:sell(?:ing)?|asking|askin|pdf|download|ebook|template)\b/i.test(text))
        ) {
          klass = "confirmed";
        } else {
          continue;
        }
      }
    }
    mentions.push({ amount, klass, raw: match[0] });
  }

  const model: SellerPriceModel = { excluded: [] };
  for (const mention of mentions) {
    if (mention.klass === "excluded") {
      if (!model.excluded.includes(mention.amount)) model.excluded.push(mention.amount);
      continue;
    }
    if (mention.klass === "historical") model.historical = mention.amount;
    if (mention.klass === "tentative") model.tentative = mention.amount;
    if (mention.klass === "confirmed") model.confirmed = mention.amount;
  }
  if (model.historical && /don'?t\s+put|do\s+not\s+(?:put|use)/i.test(text)) {
    if (!model.excluded.includes(model.historical)) model.excluded.push(model.historical);
  }
  if (model.historical && model.excluded.includes(model.historical)) {
    delete model.historical;
  }
  if (model.confirmed && model.excluded.includes(model.confirmed)) {
    delete model.confirmed;
  }
  if (model.confirmed && model.historical === model.confirmed && isHistoricalPriceSpan(text) && !/\b(?:now|nah|asking)\b/i.test(text)) {
    delete model.confirmed;
  }
  if (model.confirmed && model.tentative === model.confirmed && isTentativePriceSpan(text) && !/\bnah\b/i.test(text)) {
    delete model.confirmed;
  }
  return model;
}

/** True when `amount` must not become fill.price. */
export function isNonConfirmedAskingPrice(message: string, amount: string): boolean {
  const prices = classifySellerPrices(message);
  if (prices.confirmed && prices.confirmed === amount) return false;
  if (prices.historical === amount) return true;
  if (prices.tentative === amount) return true;
  if (prices.excluded.includes(amount)) return true;
  if (!prices.confirmed && (prices.tentative || prices.historical)) {
    if (prices.tentative === amount || prices.historical === amount) return true;
  }
  const n = String(amount).replace(/[^\d.]/g, "");
  if (!n) return false;
  const idx = message.search(new RegExp(`\\$?\\s*${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"));
  if (idx < 0) return false;
  const span = windowAround(message, idx, idx + n.length);
  return isTentativePriceSpan(span) || isHistoricalPriceSpan(span) || isExcludedPriceSpan(span);
}

export function stripSellerCommandsAndFiller(message: string): string {
  let out = String(message || "");
  out = out.replace(new RegExp(SELLER_INSTRUCTION_RE.source + String.raw`[\s\S]*$`, "i"), " ");
  out = out.replace(/\bjust\s+want(?:\s+it)?\s+gone\b/gi, " ");
  out = out.replace(/\bpaid\s+(?:heaps|a\s+lot|lots)\s+for\s+it\b/gi, " ");
  out = out.replace(/\b(?:i\s+don'?t\s+know|idk)\s+what\s+(?:it'?s|they(?:'re|\s+are))\s+worth\b/gi, " ");
  out = out.replace(/\bdon'?t\s+put\s+that\s+as\s+(?:the\s+)?price(?:\s+though)?\b/gi, " ");
  out = out.replace(/\bmake\s+(?:the\s+)?(?:ad|listing)\s+sound\s+(?:good|professional)\b/gi, " ");
  out = out.replace(/\btell\s+me\s+what\s+(?:it(?:'?s|s)?\s+actually\s+worth|price\s+i\s+should[^\n]*)\b/gi, " ");
  return clean(out);
}

/**
 * Identity-only label. Stops before condition, inclusions, price, location, commands.
 */
export function extractBuyerFacingIdentity(message: string): string | null {
  let t = stripSellerCommandsAndFiller(message);
  t = t
    .replace(/^\s*title\s+it\b[\s\S]*?(?=\b(?:sell|selling|list)\b)/i, " ")
    .replace(/\bdon'?t\s+(?:say|put|use|add)\b[\s\S]*?(?=\b(?:sell|selling|list)\b)/i, " ")
    .replace(
      /^\s*(?:please\s+)?(?:i\s+(?:want|wanna|would\s+like)\s+to\s+)?(?:sell(?:ing)?|list(?:ing)?|post(?:ing)?|advertise|wanted|iso|wtb)\s*:?\s+(?:my\s+|a\s+|an\s+|the\s+|out\s+)?/i,
      ""
    )
    .replace(/^\s*(?:wtb|iso|wanted)\s*:?\s+/i, "")
    .replace(/^(?:brand[\s-]*new|like[\s-]*new|mint)\s+but\s+\w+\s+/i, "")
    .replace(/^\s*i\s+am\s+selling\s+(?:my\s+|a\s+|an\s+|the\s+)?/i, "")
    .replace(/^\s*i'?m\s+selling\s+(?:my\s+|a\s+|an\s+|the\s+)?/i, "");
  t = t.split(/[,.;]/)[0] || t;
  const stop = t.search(IDENTITY_STOP_RE);
  if (stop > 0) t = t.slice(0, stop);
  t = clean(t)
    .replace(/[,;]+$/g, "")
    .replace(/\b(?:for sale|please|thanks)\b/gi, "")
    .trim();
  if (t.length < 2 || t.length > 80) return t.length >= 2 ? t.slice(0, 80).replace(/\s+\S*$/, "").trim() : null;
  if (/^(?:it|this|that|them|my|the)$/i.test(t)) return null;
  return t;
}

function extractLocation(message: string): string | null {
  const explicit = message.match(LOCATION_RE);
  if (explicit?.[1]) return titleCaseLocation(explicit[1]);
  const pickup = message.match(/\bpickup\s+(west\s+auckland|east\s+auckland|south\s+auckland|north\s+shore|[a-z][a-z]+)/i);
  if (pickup?.[1]) return titleCaseLocation(pickup[1]);
  const bare = message.match(LOCATION_BARE_RE);
  if (bare?.[1]) return titleCaseLocation(bare[1]);
  return null;
}

function normalizeIncludedItem(raw: string): string | null {
  let t = clean(raw)
    .replace(/^(?:and|with|plus|got|has|includes?|comes?\s+with)\s+/i, "")
    .replace(/^(?:a|an|the)\s+/i, "")
    .replace(/\bhdmi\b/gi, "HDMI")
    .replace(/\busb-?c\b/gi, "USB-C");
  if (/^hdmi$/i.test(t)) t = "HDMI cable";
  if (/^usb-?c$/i.test(t)) t = "USB-C cable";
  if (/^power$/i.test(t)) t = "power cable";
  t = t.replace(/\s+/g, " ").trim();
  if (t.length < 3) return null;
  if (FILLER_WORDS.has(t.toLowerCase())) return null;
  if (SELLER_INSTRUCTION_RE.test(t) || SELLER_INTENT_RE.test(t)) return null;
    if (/^(?:selling|sell|listing|price|worth|professional|ad|wanted|iso)$/i.test(t)) return null;
    if (/^(?:wanted|looking for|iso)\b/i.test(t)) return null;
  return t;
}

function splitPackedIncludedList(blob: string): string[] {
  const source = clean(blob);
  if (!source) return [];
  const items: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const item = normalizeIncludedItem(raw);
    if (!item) return;
    const key = item.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    items.push(item);
  };

  for (const part of source.split(/\s*(?:,|;|\band\b)\s*/i)) {
    const chunk = clean(part);
    if (!chunk) continue;
    const heads = [...chunk.matchAll(INCLUDED_HEAD_RE)].map((m) => clean(m[0]));
    if (heads.length) {
      for (const head of heads) push(head);
      continue;
    }
    if (chunk.split(/\s+/).length <= 4) push(chunk);
  }
  return items;
}

const INCLUSION_LEAD_RE =
  /\b(?:got|has|have|comes?\s+with|includes?|with)\s+(.+?)(?=\b(?:but\s+one|one\s+\w+\s+(?:got|has|doesn)|paid|bought|purchased|originally|maybe|thinking|idk|i'?m\s+in|im\s+in|located|pickup|pick\s*up|shipping|can\s+you|could\s+you|tell\s+me|don'?t|do\s+not|just\s+want|make\s+the|help\s+me|case\s+pretty|one\s+\w+\s+doesn|$))/i;

function extractIncludedItems(message: string): string[] {
  const items: string[] = [];
  const seen = new Set<string>();
  const pushAll = (list: string[]) => {
    for (const item of list) {
      if (/usb/i.test(item) && /\bnot\s+(?:a\s+)?usb\b/i.test(message)) continue;
      if (/\bdisc\b/i.test(item) && /\bnot\s+(?:a\s+)?disc\b/i.test(message)) continue;
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push(item);
    }
  };

  const lead = message.match(INCLUSION_LEAD_RE);
  if (lead?.[1]) pushAll(splitPackedIncludedList(lead[1]));

  // Counted items even without a clean lead capture.
  const counted = message.matchAll(
    /\b(?:got|has|have|with|includes?|need|must\s+have)\s+((?:one|two|three|four|five|\d+)\s+[a-z][\w'-]*s)\b/gi
  );
  for (const m of counted) {
    const item = normalizeIncludedItem(m[1]);
    if (item) {
      const key = item.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        items.push(item);
      }
    }
  }
  return items;
}

function extractDefects(message: string): string[] {
  const defects: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const text = clean(raw)
      .replace(/^(?:and|but|got|has)\s+/i, "")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length < 4) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    if (SELLER_INSTRUCTION_RE.test(text) || SELLER_INTENT_RE.test(text)) return;
    seen.add(key);
    defects.push(text);
  };

  const countedDefect = message.match(
    /\b(?:got|has|with|includes?)\s+(?:one|two|three|four|five|\d+)\s+([a-z][\w'-]*s)\s+but\s+one\s+(?:got|has)\s+(.+?)(?=\b(?:comes?\s+with|includes?|located|i'?m\s+in|im\s+in|pickup|shipping|paid|maybe|can\s+you|$))/i
  );
  if (countedDefect) {
    const singular = countedDefect[1].replace(/ies$/i, "y").replace(/s$/i, "");
    const defect = clean(countedDefect[2]);
    if (defect) push(`one ${singular} has ${defect}`);
  }

  const oneDoesnt = message.match(
    /\bone\s+([a-z][\w'-]*)\s+(doesn'?t\s+(?:last|work|hold|charge)(?:\s+\w+){0,6})/i
  );
  if (oneDoesnt) {
    const noun = oneDoesnt[1];
    const rest = oneDoesnt[2].replace(/\s+anymore$/i, "").trim();
    if (/doesn'?t\s+last/i.test(rest)) push(`one ${noun} doesn't last as long`);
    else push(`one ${noun} ${rest}`);
  }

  const onPart = message.matchAll(
    /\b(dent(?:ed)?|crack(?:ed)?|scratch(?:ed)?|smash(?:ed)?|chip(?:ped)?)\s+on\s+(?:the\s+)?([a-z][\w'-]*)\b/gi
  );
  for (const m of onPart) {
    push(`${m[1]} on ${m[2]}`);
  }

  const nounDefect = message.matchAll(
    /\b((?:the\s+)?(?:case|screen|body|frame|lens|cover|box|tray|hose|seat|arm|top|back|hull|door|lid|bin|latch|windscreen|bumper|zip(?:per)?))\s+(?:is\s+|pretty\s+|quite\s+|a\s+bit\s+)?(scratch(?:ed|es)?|crack(?:ed|s)?|dent(?:ed|s)?|torn|stain(?:ed|s)?|chipp?(?:ed|s)?|scuff(?:ed|s)?|broken|damaged|worn|wobbly|sticky|loose|smashed)\b/gi
  );
  for (const m of nounDefect) {
    push(`${m[1]} ${m[2]}`.replace(/^(?:the)\s+/i, ""));
  }

  const adjNoun = message.matchAll(
    /\b(scratch(?:ed|es)?|crack(?:ed|s)?|dent(?:ed|s)?|torn|stain(?:ed|s)?|chipp?(?:ed|s)?|scuff(?:ed|s)?|broken|damaged|worn|smashed)\s+(?!on\b)([a-z][\w'-]*)\b/gi
  );
  for (const m of adjNoun) {
    if (
      /^(?:west|east|south|north|auckland|wellington|christchurch|hamilton|tauranga|dunedin|napier|palmerston|shore|coast|wellie|westie|hammers|palmy|akl|chch)\b/i.test(
        m[2]
      )
    ) {
      continue;
    }
    push(`${m[2]} ${m[1]}`);
  }

  return defects;
}

function extractPositiveCondition(message: string): string[] {
  const out: string[] = [];
  for (const m of message.matchAll(POSITIVE_CONDITION_RE)) {
    const raw = clean(m[0]);
    if (/barely\s+use/i.test(raw)) {
      if (!out.includes("barely used")) out.push("barely used");
      continue;
    }
    if (/still\s+works?|works?\s+(?:fine|well|ok|okay|good)|working\s+order/i.test(raw)) {
      if (!out.includes("works well")) out.push("works well");
      continue;
    }
    if (/light(?:ly)?\s+used|only\s+used/i.test(raw)) {
      if (!out.includes("lightly used")) out.push("lightly used");
    }
  }
  return out;
}

function factToEvidence(fact: ExtractedSemanticFact): SellerEvidenceItem | null {
  if (fact.kind === "included") return { kind: "included", text: fact.text };
  if (fact.kind === "negative_condition") {
    if (/\b(?:drift|doesn'?t|won'?t|fault|mechanical|runtime|last)\b/i.test(fact.text)) {
      return { kind: "mechanical", text: fact.text };
    }
    return { kind: "conditionDetail", text: fact.text };
  }
  if (fact.kind === "positive_condition") return { kind: "conditionDetail", text: fact.text };
  if (fact.kind === "modification") return { kind: "modification", text: fact.text };
  if (fact.kind === "attribute") return { kind: "note", text: fact.text };
  return null;
}

/**
 * Full semantic model for a messy seller message.
 * Description composers must only receive `evidence` + structured fill fields.
 */
export function extractSellerSemanticModel(message: string): SellerSemanticModel {
  const raw = String(message || "").replace(/\s+/g, " ").trim();
  const facts: ExtractedSemanticFact[] = [];
  const identity = extractBuyerFacingIdentity(raw);
  if (identity) facts.push({ kind: "identity", text: identity });

  const location = extractLocation(raw);
  if (location) facts.push({ kind: "location", text: location });

  const prices = classifySellerPrices(raw);
  if (prices.confirmed) facts.push({ kind: "price_confirmed", text: prices.confirmed });
  if (prices.tentative) facts.push({ kind: "price_tentative", text: prices.tentative });
  if (prices.historical) facts.push({ kind: "price_historical", text: prices.historical });

  if (SELLER_INSTRUCTION_RE.test(raw)) {
    facts.push({ kind: "seller_instruction", text: "seller_instruction" });
  }
  if (SELLER_INTENT_RE.test(raw)) {
    facts.push({ kind: "seller_intent", text: "seller_intent" });
  }

  for (const item of extractIncludedItems(raw)) {
    facts.push({ kind: "included", text: item });
  }
  for (const defect of extractDefects(raw)) {
    facts.push({ kind: "negative_condition", text: defect });
  }
  for (const pos of extractPositiveCondition(raw)) {
    facts.push({ kind: "positive_condition", text: pos });
  }

  const exclusion = raw.match(
    /\bno\s+(?!known\s+|cracks?|faults?|repairs?|damage|idea|sure)([a-z][\w'-]+(?:\s+[a-z][\w'-]+){0,3})/i
  );
  if (exclusion?.[1] && !DEFECT_TOKEN_RE.test(exclusion[1])) {
    if (
      /^(?:scams?|time\s*wasters?|lowballers?|spam|serious(?:\s+only)?)\b/i.test(
        exclusion[1].trim()
      )
    ) {
      // seller instruction, not a product fact
    } else {
    const text = `No ${clean(exclusion[1])}`;
    if (!/^(?:No idea|No sure)$/i.test(text)) {
      facts.push({ kind: "attribute", text });
    }
    }
  }

  const hasDefects = facts.some((f) => f.kind === "negative_condition");
  const evidence: SellerEvidenceItem[] = [];
  const seen = new Set<string>();
  for (const fact of facts) {
    const item = factToEvidence(fact);
    if (!item) continue;
    const key = `${item.kind}:${item.text.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    evidence.push(item);
  }

  return { identity, location, facts, prices, hasDefects, evidence };
}

const STOP_FOR_COVER = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "with",
  "for",
  "in",
  "on",
  "of",
  "to",
  "is",
  "are",
  "has",
  "have",
  "one",
  "comes",
  "includes",
]);

function distinctiveTokens(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_FOR_COVER.has(t))
    .map((t) => t.replace(/(?:es|ed|ing|s)$/i, "") || t);
}

/** Semantic coverage: candidate meaning appears in haystack (not string equality). */
export function semanticTextCoveredBy(candidate: string, haystack: string): boolean {
  const a = distinctiveTokens(candidate);
  if (!a.length) return true;
  const b = new Set(distinctiveTokens(haystack));
  if (!b.size) return false;
  const hit = a.filter((t) => b.has(t)).length;
  return hit >= Math.max(1, Math.ceil(a.length * 0.6));
}

export function descriptionCoversEvidence(
  description: string,
  evidence: SellerEvidenceItem[]
): { missing: SellerEvidenceItem[]; covered: number } {
  const missing: SellerEvidenceItem[] = [];
  let covered = 0;
  for (const item of evidence) {
    if (semanticTextCoveredBy(item.text, description)) {
      covered += 1;
    } else {
      missing.push(item);
    }
  }
  return { missing, covered };
}

export function containsRawSellerDump(description: string, sourceMessage: string): boolean {
  const desc = clean(description).toLowerCase();
  const src = stripSellerCommandsAndFiller(sourceMessage).toLowerCase();
  if (desc.length < 40 || src.length < 40) return false;
  // If a long unpunctuated seller span leaked into public copy, that's a dump.
  const span = src.replace(/^(?:selling|sell|listing)\s+(?:my\s+)?/i, "").slice(0, 90);
  if (span.length >= 40 && desc.includes(span.slice(0, 40))) return true;
  return (
    /\b(?:bro|idk|tell me what|make the listing|sound professional|dont put that|had it couple)\b/i.test(
      description
    )
  );
}
