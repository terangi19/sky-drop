/**
 * Deterministic public listing copy gate.
 * Strips internal vision/attr metadata and rejects impossible public copy.
 * Perception extras must NEVER reach buyers as "Attr:…" fragments.
 */

import type { SkyAiListingFill } from "./sky-ai-listing-fill";

/** Internal metadata prefixes that must never appear in title/description/search cards. */
export const INTERNAL_COPY_PREFIX_RE =
  /^(attr|attribute|visionfact|vision_fact|candidate|confidence|internal|text|kw|visual)\s*:/i;

export const INTERNAL_COPY_INLINE_RE =
  /\b(?:Attr|attr|attribute|visionFact|vision_fact|candidate|confidence|internal)\s*:\s*[^\n.;,]*/gi;

const LONE_MANUFACTURER_RE =
  /^(panini|topps|upper\s*deck|fleer|bowman|donruss|pokemon|nike|adidas|apple|samsung|sony|microsoft|bmw|toyota|ford|honda|prizm|select|optic)$/i;

const GENERIC_ONLY_RE =
  /^(item|product|thing|stuff|card|phone|shoe|console|listing)$/i;

const NOISE_ATTR_VALUES =
  /^(player\s*image|orange\s*background|shiny\s*surface|background|surface|image|photo|picture)$/i;

export type PublicCopyGateResult = {
  fill: SkyAiListingFill;
  rejected: string[];
  notes: string[];
};

/** True when a string looks like internal vision/attr metadata. */
export function isInternalCopyFragment(raw: string): boolean {
  const t = String(raw || "").trim();
  if (!t) return true;
  if (INTERNAL_COPY_PREFIX_RE.test(t)) return true;
  if (/^(undefined|null|NaN)$/i.test(t)) return true;
  if (/\bconfidence\s*[:=]\s*(high|medium|low|\d)/i.test(t)) return true;
  if (/^\s*\{[\s\S]*\}\s*$/.test(t) && /confidence|"value"/i.test(t)) return true;
  const body = t.replace(INTERNAL_COPY_PREFIX_RE, "").trim();
  if (NOISE_ATTR_VALUES.test(body)) return true;
  return false;
}

/** Strip internal prefixes / Attr: blobs from buyer-facing prose. */
export function sanitizePublicCopyText(raw: string): string {
  let s = String(raw || "");
  s = s.replace(INTERNAL_COPY_INLINE_RE, " ");
  s = s.replace(/\b(?:undefined|null)\b/gi, " ");
  s = s.replace(/\s{2,}/g, " ").replace(/\s+([.,;:!])/g, "$1").trim();
  // Drop orphaned "Attr." leftovers
  s = s.replace(/\bAttr\b\.?/gi, " ").replace(/\s{2,}/g, " ").trim();
  return s;
}

/** Filter extras that are safe for description weaving (structured facts only). */
export function filterPublicExtras(extras: string[] | undefined): string[] {
  if (!Array.isArray(extras)) return [];
  return extras
    .map((e) => String(e || "").trim())
    .filter(Boolean)
    .filter((e) => !isInternalCopyFragment(e))
    .filter((e) => !/^attr:/i.test(e))
    .filter((e) => !/^text:/i.test(e))
    .filter((e) => !/^kw:/i.test(e))
    .filter((e) => !/^visual:/i.test(e))
    .filter((e) => !/^accessory:/i.test(e))
    .slice(0, 16);
}

/**
 * Reject titles that are lone manufacturers, attrs-only, or internal metadata.
 * Returns null when the title must be recomposed / cleared.
 */
export function assessTitleQuality(
  title: string | undefined,
  opts?: { richerFactsAvailable?: boolean; canonicalIdentity?: string }
): { ok: boolean; reason?: string } {
  const t = sanitizePublicCopyText(String(title || "")).trim();
  if (!t) return { ok: false, reason: "empty_title" };
  if (isInternalCopyFragment(t)) return { ok: false, reason: "internal_metadata" };
  if (INTERNAL_COPY_INLINE_RE.test(t)) return { ok: false, reason: "inline_internal" };
  if (GENERIC_ONLY_RE.test(t)) return { ok: false, reason: "generic_only" };
  if (LONE_MANUFACTURER_RE.test(t) && opts?.richerFactsAvailable !== false) {
    // Lone manufacturer is never enough when we expect marketplace identity
    if (opts?.canonicalIdentity && !LONE_MANUFACTURER_RE.test(opts.canonicalIdentity)) {
      return { ok: false, reason: "lone_manufacturer_vs_richer" };
    }
    if (opts?.richerFactsAvailable) {
      return { ok: false, reason: "lone_manufacturer" };
    }
    // Still reject bare manufacturer as a public title — soft category is better
    return { ok: false, reason: "lone_manufacturer" };
  }
  if (/^(psa|bgs|cgc)\s*\d/i.test(t) && t.split(/\s+/).length <= 3) {
    return { ok: false, reason: "grader_attr_stack" };
  }
  return { ok: true };
}

/**
 * Compose a trading-card / collectible title from structured facts — never brand alone.
 */
export function composeTradingCardTitle(facts: {
  playerName?: string;
  team?: string;
  manufacturer?: string;
  productLine?: string;
  year?: string;
  parallel?: string;
  parallelColour?: string;
  serialNumber?: string;
  grader?: string;
  grade?: string;
}): string {
  const parts: string[] = [];
  if (facts.year) parts.push(facts.year);
  if (facts.playerName) parts.push(facts.playerName);
  else if (facts.team) parts.push(facts.team);

  const line = [facts.manufacturer, facts.productLine]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  if (line && !parts.join(" ").toLowerCase().includes(line.toLowerCase())) {
    parts.push(line);
  } else if (!parts.length && line) {
    // Brand/line alone is weak — prefer soft category noun
    parts.push(`${line} trading card`);
  }

  const parallelBits = [facts.parallelColour, facts.parallel]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (parallelBits && !parts.join(" ").toLowerCase().includes(parallelBits.toLowerCase())) {
    parts.push(parallelBits);
  }
  if (facts.serialNumber) parts.push(`#${facts.serialNumber.replace(/^#/, "")}`);
  if (facts.grader && facts.grade) {
    parts.push(`${facts.grader.toUpperCase()} ${facts.grade}`);
  }

  const title = parts.join(" ").replace(/\s+/g, " ").trim();
  if (!title) return "Trading card";
  if (LONE_MANUFACTURER_RE.test(title)) return `${title} trading card`;
  return title.slice(0, 120);
}

/** Extract structured card facts from vision extras / observation-style keys. */
export function extractTradingCardFactsFromExtras(
  extras: string[] | undefined
): {
  playerName?: string;
  team?: string;
  manufacturer?: string;
  productLine?: string;
  year?: string;
  parallel?: string;
  parallelColour?: string;
  serialNumber?: string;
  grader?: string;
  grade?: string;
} {
  const out: ReturnType<typeof extractTradingCardFactsFromExtras> = {};
  for (const raw of extras || []) {
    const e = String(raw || "").trim();
    const m = e.match(/^([a-z_]+):\s*(.+)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (!val || isInternalCopyFragment(e)) continue;
    if (key === "subject" || key === "player" || key === "playername") out.playerName = val;
    else if (key === "team") out.team = val;
    else if (key === "brand" || key === "manufacturer") out.manufacturer = val;
    else if (key === "set" || key === "productline" || key === "product_line") out.productLine = val;
    else if (key === "year") out.year = val;
    else if (key === "parallel") out.parallel = val;
    else if (key === "parallelcolour" || key === "parallel_colour" || key === "colour") {
      out.parallelColour = val;
    } else if (key === "serial" || key === "serialnumber" || key === "serial_number") {
      out.serialNumber = val;
    } else if (key === "grade") {
      const gm = val.match(/^(psa|bgs|cgc|sgc)\s*(.+)$/i);
      if (gm) {
        out.grader = gm[1].toUpperCase();
        out.grade = gm[2].trim();
      } else out.grade = val;
    }
  }
  return out;
}

/**
 * Final public copy gate — run after compose, before draft apply.
 */
export function gatePublicListingCopy(
  fill: SkyAiListingFill,
  opts?: {
    allowPrice?: boolean;
    allowConditionNew?: boolean;
    canonicalIdentity?: string;
    richerFactsAvailable?: boolean;
  }
): PublicCopyGateResult {
  const rejected: string[] = [];
  const notes: string[] = [];
  const out: SkyAiListingFill = { ...fill };

  if (out.title) {
    const cleaned = sanitizePublicCopyText(out.title);
    const quality = assessTitleQuality(cleaned, {
      richerFactsAvailable: opts?.richerFactsAvailable,
      canonicalIdentity: opts?.canonicalIdentity,
    });
    if (!quality.ok) {
      rejected.push(`title:${quality.reason}`);
      if (opts?.canonicalIdentity && assessTitleQuality(opts.canonicalIdentity).ok) {
        out.title = opts.canonicalIdentity;
        notes.push("title_replaced_with_canonical");
      } else {
        const card = extractTradingCardFactsFromExtras(out.extras);
        const composed = composeTradingCardTitle(card);
        if (composed && !LONE_MANUFACTURER_RE.test(composed)) {
          out.title = composed;
          notes.push("title_recomposed_from_facts");
        } else {
          delete out.title;
          notes.push("title_cleared");
        }
      }
    } else {
      out.title = cleaned;
    }
  }

  if (out.description) {
    const cleaned = sanitizePublicCopyText(out.description);
    if (
      INTERNAL_COPY_INLINE_RE.test(out.description) ||
      /Attr:/i.test(out.description) ||
      /\bconfidence\s*:/i.test(out.description)
    ) {
      notes.push("description_sanitized_internal");
    }
    if (!cleaned || isInternalCopyFragment(cleaned)) {
      rejected.push("description:internal_or_empty");
      delete out.description;
    } else {
      out.description = cleaned;
    }
  }

  if (Array.isArray(out.extras)) {
    const before = out.extras.length;
    out.extras = filterPublicExtras(out.extras);
    if (out.extras.length < before) notes.push("extras_stripped_internal");
    if (!out.extras.length) delete out.extras;
  }

  // Price: never invent; caller clears on NEW_OBJECT. Gate only strips empty/nullish.
  if (out.price !== undefined && String(out.price).trim() === "") {
    delete out.price;
  }
  if (opts?.allowPrice === false && out.price) {
    rejected.push("price:blocked_new_object");
    delete out.price;
    notes.push("stale_price_cleared");
  }

  // Condition New only when sealed evidence or USER — caller sets allowConditionNew
  if (
    out.condition === "New" &&
    opts?.allowConditionNew === false
  ) {
    rejected.push("condition:unsupported_new");
    delete out.condition;
    notes.push("unsupported_new_cleared");
  }

  if (out.category === "Collectibles") {
    // Existing Sky Drop physical taxonomy has Sports, not Collectibles
    out.category = "Sports";
    notes.push("category_collectibles_to_sports");
  }

  return { fill: out, rejected, notes };
}
