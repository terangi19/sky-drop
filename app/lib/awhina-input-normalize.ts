/**
 * Conservative marketplace-aware input normalization for Āwhina.
 *
 * Raw text is preserved for display/logging. Interpretation (intent, slots,
 * entity extraction, search/listing parse) must use `normalized`.
 *
 * Do NOT globally autocorrect arbitrary words. Only high-confidence
 * marketplace command / product / vehicle repairs.
 */

import {
  extractSellerAuthoredText,
  stripInternalOrchestrationFragments,
} from "./awhina-orchestration-boundary";

export type NormalizedAwhinaInput = {
  raw: string;
  normalized: string;
};

const COMMAND_CANONICAL: Record<string, string> = {
  sell: "sell",
  selling: "selling",
  list: "list",
  listing: "listing",
  find: "find",
  finding: "finding",
  search: "search",
  rent: "rent",
  rental: "rental",
  hire: "hire",
  post: "post",
  posting: "posting",
  offer: "offer",
  offering: "offering",
};

/** Soft command typos — only when marketplace context is strong. */
const COMMAND_TYPOS: Record<string, string> = {
  sel: "sell",
  seling: "selling",
  sll: "sell",
  lst: "list",
  lsting: "listing",
  fnd: "find",
  serach: "search",
  serch: "search",
};

const MARKETPLACE_FOLLOW =
  /^(my|a|an|the|out|me|for|this|that|some|it)\b/i;

function lettersOnly(token: string): string {
  return token.replace(/[^a-zA-Z]/g, "").toLowerCase();
}

function hasInternalCommandNoise(token: string): boolean {
  return /[a-zA-Z][.·•_\-][a-zA-Z]/.test(token) || /[a-zA-Z]\.[a-zA-Z]/.test(token);
}

/**
 * Repair punctuated command tokens: se.ll, s.ell, sel.l, li.st, f.ind → sell/list/find.
 * Leaves legitimate model codes (e.g. GT-R already split, E92) alone unless they
 * collapse exactly to a known command word.
 */
function repairCommandToken(token: string, nextToken: string | undefined): string | null {
  const letters = lettersOnly(token);
  if (!letters) return null;

  if (COMMAND_CANONICAL[letters]) {
    if (hasInternalCommandNoise(token) || /^[A-Z.·•_\-]+$/.test(token)) {
      return COMMAND_CANONICAL[letters];
    }
    // Already a clean command word — keep original casing-normalized form
    if (token.toLowerCase() === letters) return COMMAND_CANONICAL[letters];
  }

  const typo = COMMAND_TYPOS[letters];
  if (typo && (MARKETPLACE_FOLLOW.test(nextToken || "") || !nextToken)) {
    return typo;
  }

  return null;
}

function repairProductToken(token: string, next: string | undefined, prev: string | undefined): string | null {
  const lower = token.toLowerCase();
  const letters = lettersOnly(token);

  // iphon → iphone; phon → iphone when followed by model number / "pro"
  if (letters === "iphon" || lower === "iphon") return "iphone";
  if (
    (letters === "phon" || letters === "phone") &&
    next &&
    /^\d{1,2}\b/i.test(next)
  ) {
    return "iphone";
  }
  if (letters === "phon" && next && /^pro\b/i.test(next)) return "iphone";

  // "phon 15 pro" already handled; "15 pro" after bare phon
  if (lower === "ps5" || lower === "ps4") return lower;

  void prev;
  return null;
}

function collapseWhitespace(s: string): string {
  return s.replace(/[\u00A0\u2000-\u200B\s]+/g, " ").trim();
}

/**
 * `/post/ai` historically prepended a client-only LISTING CREATION REQUEST
 * directive before sending the seller message. Strip that envelope and keep
 * only seller-authored text. Follow-ups stay as-is (no forced "selling my"
 * rewrite) so compound fact extraction sees the original details.
 */
function stripLegacySellSurfaceDirective(raw: string): string {
  const sellerText = extractSellerAuthoredText(raw);
  if (!sellerText) return stripInternalOrchestrationFragments(raw);
  // First-turn envelopes that were only the directive + item identity still
  // need sell intent when the seller text itself has no sell verb.
  const hadEnvelope = /\[\s*listing\s+creation\s+request\s*\]/i.test(raw);
  if (
    hadEnvelope &&
    !/\b(?:sell|selling|list|listing|offer|offering)\b/i.test(sellerText)
  ) {
    return `selling my ${sellerText}`;
  }
  return sellerText;
}

/**
 * sell-my-skyline / list-my-iphone → sell my skyline
 * Keep hyphens inside product names when not command-shaped.
 */
function expandCommandHyphens(s: string): string {
  return s
    .replace(
      /\b(sell(?:ing)?|list(?:ing)?|find(?:ing)?|search|rent(?:ing|al)?|hire|post(?:ing)?|offer(?:ing)?)-(my|a|an|the|out|me)-([\w]+)/gi,
      "$1 $2 $3"
    )
    .replace(
      /\b(sell(?:ing)?|list(?:ing)?|find(?:ing)?|search|rent(?:ing|al)?|hire|post(?:ing)?|offer(?:ing)?)-(my|a|an|the|out|me)\b/gi,
      "$1 $2"
    );
}

/**
 * Vehicle chassis spacing: "r 34" → "r34" when nearby vehicle/sell context supports it.
 * Conservative — only R3x / E9x style codes, not arbitrary "a 4".
 */
function repairVehicleChassisSpacing(s: string): string {
  const vehicleCtx =
    /\b(sell|list|nissan|skyline|gtr|gt-r|bmw|mazda|toyota|honda|ford|vehicle|car|rego)\b/i.test(
      s
    ) || /\br\s*3[2-4]\b/i.test(s);

  if (!vehicleCtx) return s;

  return s
    .replace(/\br\s*([3][2-4])\b/gi, "R$1")
    .replace(/\be\s*(9[0-3])\b/gi, "E$1");
}

const ONES: Record<string, number> = {
  zero: 0,
  oh: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
};

const TEENS: Record<string, number> = {
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
};

const TENS: Record<string, number> = {
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

const YEAR_ONES = { ...ONES, ...TEENS };

function decodeSpokenMarketplaceNumbers(s: string): string {
  let n = s;

  n = n.replace(
    /\b(twenty|nineteen)\s+(oh\s+)?(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\b/gi,
    (_m, century: string, _oh: string, yearPart: string) => {
      const centuryN = /^twenty$/i.test(century) ? 2000 : 1900;
      const ones = YEAR_ONES[yearPart.toLowerCase()];
      if (ones == null) return _m;
      return String(centuryN + ones);
    }
  );

  n = n.replace(
    /\btwo\s+thousand\s+and\s+(twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|eleven|ten)\b/gi,
    (_m, yearPart: string) => String(2000 + (YEAR_ONES[yearPart.toLowerCase()] || 0))
  );

  n = n.replace(
    /\b((?:zero|oh|one|two|three|four|five|six|seven|eight|nine)(?:\s+(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)){1,5})\s+thousand(?:\s+k)?\b/gi,
    (_m, seq: string) => {
      const digits = seq
        .split(/\s+/)
        .map((w) => ONES[w.toLowerCase()])
        .filter((d) => d != null);
      if (!digits.length) return _m;
      const lead = Number(digits.join(""));
      if (!Number.isFinite(lead)) return _m;
      return String(lead * 1000);
    }
  );

  n = n.replace(
    /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\s+(one|two|three|four|five|six|seven|eight|nine)\s+(one|two|three|four|five|six|seven|eight|nine)\b/gi,
    (_m, tens: string, ones: string, tenths: string) => {
      const nVal = (TENS[tens.toLowerCase()] || 0) + (ONES[ones.toLowerCase()] || 0);
      const h = ONES[tenths.toLowerCase()] || 0;
      if (nVal < 20) return _m;
      return String(nVal * 1000 + h * 100);
    }
  );

  n = n.replace(
    /\b(eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\s+(five|one|two|three|four|six|seven|eight|nine)\s+hundred\b/gi,
    (_m, tens: string, hundreds: string) => {
      const t = TEENS[tens.toLowerCase()] || 0;
      const h = ONES[hundreds.toLowerCase()] || 0;
      return String(t * 1000 + h * 100);
    }
  );

  n = n.replace(
    /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)\s+(one|two|three|four|five|six|seven|eight|nine)\s+hundred(?:\s+bucks)?\b/gi,
    (_m, tens: string, ones: string) => {
      const nVal = (TENS[tens.toLowerCase()] || 0) + (ONES[ones.toLowerCase()] || 0);
      return String(nVal * 100);
    }
  );

  n = n.replace(
    /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?=\s+(?:a\s+(?:visit|lawn)|bucks|an?\s+hour|per\s+(?:hour|visit|lawn)|\/\s*h(?:ou)?r))\b/gi,
    (m) => String(TENS[m.toLowerCase()] || m)
  );

  return n;
}

function applyNzMarketplaceSlang(s: string): string {
  return s
    .replace(/\bchch\b/gi, "christchurch")
    .replace(/\bwestie\b/gi, "west auckland")
    .replace(/\bhammers?\b/gi, "hamilton")
    .replace(/\bpalmy\b/gi, "palmerston north")
    .replace(/\bakl\b/gi, "auckland")
    .replace(/\bwellie\b/gi, "wellington")
    .replace(/\bdunners\b/gi, "dunedin")
    .replace(/\b(\d+)\s*pw\b/gi, "$1 per week")
    .replace(/\bkays\b/gi, "km")
    .replace(/\baskin\b/gi, "asking")
    .replace(/\btrimmin\b/gi, "trimming")
    .replace(
      /\b'?0([0-9])\s+(?=(?:bmw|toyota|honda|mazda|ford|nissan|holden|subaru|hyundai|kia|mitsubishi|audi|mercedes|volkswagen|vw|isuzu|suzuki)\b)/gi,
      "200$1 "
    )
    .replace(
      /\b(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+pads\b/gi,
      (_m, qty) => `${qty} controllers`
    );
}

function stripVoiceFiller(s: string): string {
  return s
    .replace(/\b(?:uh+|um+|erm+|uhuh)\b/gi, " ")
    .replace(/\b(?:yeah|yep|yup)\s+(?:so|uh+|um+)?\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeAwhinaInput(raw: string): NormalizedAwhinaInput {
  const rawStr = typeof raw === "string" ? raw : "";
  let n = stripLegacySellSurfaceDirective(rawStr);
  n = collapseWhitespace(n);
  if (!n) return { raw: rawStr, normalized: "" };

  n = stripVoiceFiller(n);
  n = applyNzMarketplaceSlang(n);
  n = decodeSpokenMarketplaceNumbers(n);
  n = expandCommandHyphens(n);

  const parts = n.split(" ");
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const tok = parts[i];
    const next = parts[i + 1];
    const prev = out[out.length - 1];

    const cmd = repairCommandToken(tok, next);
    if (cmd) {
      out.push(cmd);
      continue;
    }

    const product = repairProductToken(tok, next, prev);
    if (product) {
      out.push(product);
      continue;
    }

    out.push(tok);
  }

  n = collapseWhitespace(out.join(" "));
  n = repairVehicleChassisSpacing(n);

  return { raw: rawStr, normalized: n };
}

/** Convenience: normalized string only. */
export function normalizedAwhinaText(raw: string): string {
  return normalizeAwhinaInput(raw).normalized;
}
