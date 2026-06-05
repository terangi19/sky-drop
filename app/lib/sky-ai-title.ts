import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import type { VerifiedListingFacts } from "./sky-ai-listing-truth";

/** Injected into Āwhina system prompt — titles must read like real NZ marketplace listings */
export const SKY_AI_TITLE_RULES = `
## LISTING TITLES (critical — sound like an experienced NZ seller, not AI)

Write titles the way real Trade Me / Facebook Marketplace sellers do: short, searchable, one **verified** selling point.

**Format**
- Vehicle: \`[Year] [Make] [Model] [Key Selling Point]\` — selling point only if user/draft confirmed it
- Electronics: \`[Brand] [Model] [Storage/Variant] [Colour]\`
- General physical: \`[Brand] [Product] [Size/Variant]\`

**Length:** prefer ≤60 characters. Never exceed 80.

**One verified selling point only** — never concatenate keywords (bad: \`Turbo Supercharger Chrome Rims\`).

**Never use**
- Marketing buzzwords or invented mods/features
- Em dashes (—) followed by long feature lists
- Terms the user did not provide (WOF, rims, supercharger, etc.)

**Modified cars — only when user stated the mod:**
- Good: \`2007 BMW 335i Stage 2\`, \`2007 BMW 335i Twin Turbo\`, \`2007 BMW 335i M Sport\`
- Bad: \`2007 BMW 335i Turbo Supercharger Chrome Rims\`

If no verified selling point, use \`[Year] [Make] [Model]\` only.
`.trim();

const BANNED_PHRASES: RegExp[] = [
  /\bheavily modified\b/gi,
  /\blightly modified\b/gi,
  /\bfully modified\b/gi,
  /\bloaded with features?\b/gi,
  /\bfully loaded\b/gi,
  /\bamazing condition\b/gi,
  /\bincredible\b/gi,
  /\bamazing\b/gi,
  /\bstunning\b/gi,
  /\bmust see\b/gi,
  /\bbest\b/gi,
  /\bwow\b/gi,
  /\bperfect condition\b/gi,
  /\bexcellent condition\b/gi,
  /\bgreat condition\b/gi,
  /\blike new condition\b/gi,
  /\bfor sale\b/gi,
  /\bgrab a bargain\b/gi,
  /\bdon'?t miss\b/gi,
  /\bturbo supercharger\b/gi,
  /\bsupercharg(?:ed|er)\b/gi,
  /\bchrome rims?\b/gi,
  /\bnew wof\b/gi,
];

const ENTHUSIAST_POINTS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bstage\s*2\b/i, label: "Stage 2" },
  { pattern: /\bstage\s*1\b/i, label: "Stage 1" },
  { pattern: /\bfull bolt[\s-]?on\b|\bfbo\b/i, label: "Full Bolt-On" },
  { pattern: /\b17t\b/i, label: "17T Twin Turbo" },
  { pattern: /\btwin\s*turbo\b|\btwinturbo\b/i, label: "Twin Turbo" },
  { pattern: /\bn54\b/i, label: "N54 Twin Turbo" },
  { pattern: /\bn55\b/i, label: "N55 Turbo" },
  { pattern: /\bm\s*sport\b/i, label: "M Sport" },
  { pattern: /\blow\s*km\b|\blow\s*k\b/i, label: "Low KM" },
  { pattern: /\bsupercharg(?:ed|er)\b/i, label: "Supercharged" },
  { pattern: /\bmanual\b|\b6\s*mt\b|\b6\s*speed\b/i, label: "Manual" },
  { pattern: /\bauto(?:matic)?\b/i, label: "Automatic" },
  { pattern: /\b4wd\b|\bawd\b|\b4x4\b/i, label: "4WD" },
  { pattern: /\bcoupe\b/i, label: "Coupe" },
  { pattern: /\bwagon\b|\bestate\b/i, label: "Wagon" },
];

function inferEnthusiastPoint(text: string): string | null {
  for (const { pattern, label } of ENTHUSIAST_POINTS) {
    if (pattern.test(text)) return label;
  }
  return null;
}

function stripBuzzwords(title: string): string {
  let t = title;
  for (const p of BANNED_PHRASES) {
    t = t.replace(p, " ");
  }
  return t.replace(/\s+/g, " ").replace(/\s+&\s+/g, " ").trim();
}

function vehicleBaseFromFill(fill?: Partial<SkyAiListingFill>): string | null {
  const year = fill?.vehicleYear?.trim();
  const make = fill?.vehicleMake?.trim();
  const model = fill?.vehicleModel?.trim();
  if (!make && !model) return null;
  return [year, make, model].filter(Boolean).join(" ").trim() || null;
}

function collapseFeatureListTitle(
  title: string,
  fill?: Partial<SkyAiListingFill>,
  facts?: VerifiedListingFacts | null
): string {
  const verifiedBlob = facts?.blob || "";

  const dashMatch = title.match(/^(.+?)\s*[—–-]\s*(.+)$/);
  if (!dashMatch) return title;

  const [, head, tail] = dashMatch;
  const headTrim = head!.trim();
  const tailTrim = tail!.trim();

  const tailWords = tailTrim.split(/\s+/).length;
  const isFeatureDump =
    tailWords > 3 ||
    tailTrim.includes("&") ||
    /\b(with|including|features?|mods?|modified|charger|downpipe|chrome|wof|supercharger)\b/i.test(
      tailTrim
    );

  if (!isFeatureDump) {
    const point = verifiedBlob
      ? inferEnthusiastPoint(verifiedBlob) && inferEnthusiastPoint(tailTrim)
        ? inferEnthusiastPoint(tailTrim)
        : null
      : null;
    if (point && !headTrim.toLowerCase().includes(point.toLowerCase())) {
      return `${headTrim} ${point}`;
    }
    return headTrim;
  }

  const point = facts?.verifiedSellingPoint || (verifiedBlob ? inferEnthusiastPoint(verifiedBlob) : null);

  if (point) {
    return `${headTrim.split(/\s+/).slice(0, 4).join(" ")} ${point}`.replace(/\s+/g, " ").trim();
  }

  const base = vehicleBaseFromFill(fill);
  return base || headTrim;
}

function trimToPreferredLength(title: string, max = 60): string {
  if (title.length <= max) return title;
  const cut = title.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > max * 0.6) return cut.slice(0, lastSpace).trim();
  return cut.trim();
}

/** Post-process AI titles — verified selling points only, no invented keywords */
export function polishSkyAiTitle(
  rawTitle: string,
  fill?: Partial<SkyAiListingFill>,
  facts?: VerifiedListingFacts | null
): string {
  if (!rawTitle.trim()) return rawTitle;

  let title = stripBuzzwords(rawTitle);
  title = title.replace(/!+/g, "").replace(/\s+/g, " ").trim();
  title = collapseFeatureListTitle(title, fill, facts);

  const base = vehicleBaseFromFill(fill);
  if (base) {
    if (facts?.verifiedSellingPoint) {
      title = `${base} ${facts.verifiedSellingPoint}`;
    } else if (!title.toLowerCase().startsWith(base.toLowerCase().slice(0, 4))) {
      title = base;
    } else if (facts && !facts.verifiedSellingPoint) {
      const extra = title.slice(base.length).trim();
      if (
        extra.split(/\s+/).length > 1 ||
        /\b(supercharg(?:ed|er)|turbo|chrome|wof|rim|stage\s*\d|twin\s*turbo|bolt[\s-]?on)\b/i.test(
          extra
        )
      ) {
        title = base;
      }
    }
  }

  title = trimToPreferredLength(title, 60);
  return title || rawTitle.trim().slice(0, 60);
}
