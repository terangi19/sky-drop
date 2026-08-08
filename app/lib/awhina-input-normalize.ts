/**
 * Conservative marketplace-aware input normalization for Āwhina.
 *
 * Raw text is preserved for display/logging. Interpretation (intent, slots,
 * entity extraction, search/listing parse) must use `normalized`.
 *
 * Do NOT globally autocorrect arbitrary words. Only high-confidence
 * marketplace command / product / vehicle repairs.
 */

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

export function normalizeAwhinaInput(raw: string): NormalizedAwhinaInput {
  const rawStr = typeof raw === "string" ? raw : "";
  let n = collapseWhitespace(rawStr);
  if (!n) return { raw: rawStr, normalized: "" };

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
