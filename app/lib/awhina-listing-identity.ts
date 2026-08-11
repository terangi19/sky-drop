/**
 * Canonical listing identity — one shared product name for title + description.
 * Never blindly concatenates brand/product/model; understands token overlap.
 */

export type ListingIdentityParts = {
  /** Calendar / model year when known (vehicles). */
  year?: string | null;
  /** Brand / make (Apple, PlayStation, Nissan, BMW). */
  brand?: string | null;
  /** Full product / family phrase when known (PlayStation 5, iPhone 15 Pro, Skyline). */
  product?: string | null;
  /** Model / trim / chassis / grade fragment (5, 15 Pro, R34, 335i, PSA 10). */
  model?: string | null;
  /** Vehicle generation code (R34) when separate from model family. */
  generation?: string | null;
  /** Explicit trim/variant (GT-R) when not already in model. */
  variant?: string | null;
};

function normSpace(s: string): string {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensOf(s: string): string[] {
  return normSpace(s)
    .split(" ")
    .filter(Boolean);
}

function tokensEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].toLowerCase() !== b[i].toLowerCase()) return false;
  }
  return true;
}

/** True when `needle` appears as a contiguous token span inside `hay`. */
function containsTokenSpan(hay: string[], needle: string[]): boolean {
  if (!needle.length) return true;
  if (needle.length > hay.length) return false;
  for (let i = 0; i <= hay.length - needle.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j].toLowerCase() !== needle[j].toLowerCase()) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/**
 * Collapse accidental adjacent duplicated tokens / short phrases.
 * Safe for Jordan 1 High, Formula 1, Xbox Series S — only removes true repeats.
 */
export function guardAdjacentIdentityDuplication(raw: string): string {
  let tokens = tokensOf(raw);
  if (tokens.length < 2) return normSpace(raw);

  // Multi-token spans first (length 4 → 2), then single tokens
  for (let span = Math.min(4, Math.floor(tokens.length / 2)); span >= 1; span--) {
    const next: string[] = [];
    let i = 0;
    while (i < tokens.length) {
      if (i + span * 2 <= tokens.length) {
        const a = tokens.slice(i, i + span);
        const b = tokens.slice(i + span, i + span * 2);
        if (tokensEqual(a, b)) {
          next.push(...a);
          i += span * 2;
          continue;
        }
      }
      next.push(tokens[i]);
      i += 1;
    }
    tokens = next;
  }

  return tokens.join(" ");
}

/**
 * Merge one component into an accumulating identity without duplicating overlap.
 */
function appendIdentityComponent(base: string, component: string): string {
  const incoming = normSpace(component);
  if (!incoming) return base;
  const cur = normSpace(base);
  if (!cur) return incoming;

  const curTok = tokensOf(cur);
  const inTok = tokensOf(incoming);

  // Already represented
  if (containsTokenSpan(curTok, inTok)) return cur;
  // Incoming is a richer form of current (e.g. PlayStation → PlayStation 5)
  if (containsTokenSpan(inTok, curTok)) return incoming;

  // Boundary overlap: suffix of cur matches prefix of incoming
  const maxOverlap = Math.min(curTok.length, inTok.length);
  for (let n = maxOverlap; n >= 1; n--) {
    const suffix = curTok.slice(-n);
    const prefix = inTok.slice(0, n);
    if (tokensEqual(suffix, prefix)) {
      return [...curTok, ...inTok.slice(n)].join(" ");
    }
  }

  return `${cur} ${incoming}`;
}

/**
 * Build ONE canonical item identity from structured parts.
 * Ordering: year → brand → product → model → generation → variant.
 * Prefer the richest product phrase; never append a fragment already present.
 */
/** Card product-line swaps: brand=Chrome + product=Topps → Topps Chrome (not Chrome Topps). */
const CARD_LINE_SWAPS: Array<{ mfr: string; line: string; atomic: string }> = [
  { mfr: "topps", line: "chrome", atomic: "Topps Chrome" },
  { mfr: "topps", line: "finest", atomic: "Topps Finest" },
  { mfr: "panini", line: "prizm", atomic: "Panini Prizm" },
  { mfr: "panini", line: "select", atomic: "Panini Select" },
  { mfr: "panini", line: "optic", atomic: "Panini Optic" },
  { mfr: "panini", line: "mosaic", atomic: "Panini Mosaic" },
];

function repairCardBrandProductPair(
  brand: string,
  product: string
): { brand: string; product: string } | null {
  const b = brand.toLowerCase();
  const p = product.toLowerCase();
  for (const k of CARD_LINE_SWAPS) {
    // Swapped fields
    if (b === k.line && p === k.mfr) return { brand: "", product: k.atomic };
    // Short line + manufacturer
    if (b === k.mfr && p === k.line) return { brand: "", product: k.atomic };
    // Product already atomic
    if (p === k.atomic.toLowerCase() || p.includes(k.atomic.toLowerCase())) {
      return { brand: b === k.mfr ? "" : brand, product };
    }
  }
  return null;
}

export function composeListingIdentity(parts: ListingIdentityParts): string {
  const year = normSpace(parts.year || "");
  let brand = normSpace(parts.brand || "");
  let product = normSpace(parts.product || "");
  const model = normSpace(parts.model || "");
  const generation = normSpace(parts.generation || "");
  const variant = normSpace(parts.variant || "");

  if (brand && product) {
    const repaired = repairCardBrandProductPair(brand, product);
    if (repaired) {
      brand = repaired.brand;
      product = repaired.product;
    }
  }

  let identity = "";

  // Prefer product as the core noun phrase when present
  if (product) {
    identity = product;
    // Prepend brand only when not already in the product phrase
    if (brand && !containsTokenSpan(tokensOf(identity), tokensOf(brand))) {
      // Avoid "Sony PlayStation" style brand when product already names the line
      // unless brand tokens are truly absent (Apple + iPhone 15 Pro).
      identity = appendIdentityComponent(brand, identity);
    }
  } else if (brand) {
    identity = brand;
  }

  if (model) {
    identity = appendIdentityComponent(identity, model);
  }
  if (generation) {
    identity = appendIdentityComponent(identity, generation);
  }
  if (variant) {
    identity = appendIdentityComponent(identity, variant);
  }

  if (year) {
    // Year leads when not already present
    if (!containsTokenSpan(tokensOf(identity), tokensOf(year))) {
      identity = identity ? `${year} ${identity}` : year;
    }
  }

  return guardAdjacentIdentityDuplication(identity);
}

/**
 * Compose identity from a freeform seed plus optional structured fields.
 * Use before title or description writers.
 */
export function composeListingIdentityFromSeed(
  seed: string,
  extras?: Omit<ListingIdentityParts, "product">
): string {
  return composeListingIdentity({
    product: seed,
    year: extras?.year,
    brand: extras?.brand,
    model: extras?.model,
    generation: extras?.generation,
    variant: extras?.variant,
  });
}
