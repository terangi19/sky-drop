/**
 * Boundary between seller-authored listing text and internal Āwhina orchestration.
 *
 * Fact extraction, seller-evidence harvest, extras, and public descriptions must
 * only ever see USER text. Prompt wrappers / control directives stay out.
 */

/** Phrases that only appear in internal control / transport prompts. */
export const INTERNAL_ORCHESTRATION_PATTERNS: RegExp[] = [
  /\[\s*listing\s+creation\s+request\s*\]/i,
  /\blisting_fill\b/i,
  /\blisting\s+fill\s+json\b/i,
  /\brespond\s+only\s+with\s+listing_fill\b/i,
  /\bthe\s+user\s+is\s+on\s+the\s+sell\s+page\b/i,
  /\bparse\s+everything\s+below\s+as\s+listing\s+data\b/i,
  /\bgenerate\s+a\s+complete\s+listing\b/i,
  /\bdo\s+not\s+give\s+general\s+chat\s+advice\b/i,
  /\ball\s+relevant\s+fields\b/i,
  /^\s*system\s*:/im,
  /^\s*developer\s*:/im,
  /^\s*internal\s*:/im,
  /\[\s*(?:system|developer|internal|tool)\s*\]/i,
  /\btool\s+instructions?\b/i,
  /\bprompt\s+wrapper\b/i,
];

const DIRECTIVE_LINE_RE =
  /^(?:the user is on the sell page|parse everything below|respond only with|generate a complete listing|do not give general chat advice)\b/i;

/**
 * True when text contains internal orchestration / control language that must
 * never appear in public listing copy or seller evidence.
 */
export function containsInternalOrchestration(text: string | undefined | null): boolean {
  const raw = String(text || "");
  if (!raw.trim()) return false;
  return INTERNAL_ORCHESTRATION_PATTERNS.some((re) => re.test(raw));
}

/**
 * Strip a leading sell-page transport envelope and return only seller-authored
 * content. Safe when the envelope is missing or malformed.
 */
export function extractSellerAuthoredText(raw: string): string {
  const source = typeof raw === "string" ? raw : "";
  if (!source.trim()) return "";

  let text = source.replace(/^\uFEFF/, "");
  const leading = text.trimStart();
  const markerMatch = leading.match(/^\[\s*listing\s+creation\s+request\s*\]/i);

  if (markerMatch) {
    const afterMarker = leading.slice(markerMatch[0].length);
    // Prefer blank-line boundary between directive block and seller text.
    const blank = afterMarker.search(/\r?\n\s*\r?\n/);
    if (blank >= 0) {
      text = afterMarker.slice(blank).trimStart();
    } else {
      // Fallback: drop known directive lines, keep the rest.
      text = afterMarker
        .split(/\r?\n/)
        .filter((line) => line.trim() && !DIRECTIVE_LINE_RE.test(line.trim()))
        .join("\n")
        .trim();
    }
  }

  // Defense: remove any residual orchestration fragments mid-string.
  text = stripInternalOrchestrationFragments(text);
  return text.trim();
}

/**
 * Remove orchestration fragments anywhere in a string without inventing content.
 */
export function stripInternalOrchestrationFragments(text: string): string {
  let out = String(text || "");
  if (!out) return "";

  // Drop a leading/trailing envelope if it survived whitespace collapse.
  out = out.replace(
    /\[\s*listing\s+creation\s+request\s*\][\s\S]*?(?=(?:\b\d+\s*(?:gb|tb)\b)|(?:\blike[\s-]*new\b)|(?:\bcomes with\b)|(?:\basking\b)|(?:\$\s*\d)|$)/gi,
    " "
  );

  out = out
    .replace(/\[\s*listing\s+creation\s+request\s*\]/gi, " ")
    .replace(/\bthe\s+user\s+is\s+on\s+the\s+sell\s+page\.?/gi, " ")
    .replace(/\bparse\s+everything\s+below\s+as\s+listing\s+data\.?/gi, " ")
    .replace(/\band\s+respond\s+only\s+with\s+listing_fill\s+json\.?/gi, " ")
    .replace(/\brespond\s+only\s+with\s+listing_fill(?:\s+json)?\.?/gi, " ")
    .replace(/\bgenerate\s+a\s+complete\s+listing\b[^.?!]*(?:[.?!]|$)/gi, " ")
    .replace(/\bdo\s+not\s+give\s+general\s+chat\s+advice\.?/gi, " ")
    .replace(/\blisting_fill\b/gi, " ")
    .replace(/^\s*(?:system|developer|internal)\s*:\s*/gim, " ")
    .replace(/\[\s*(?:system|developer|internal|tool)\s*\]/gi, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();

  return out;
}

/**
 * Public listing fields (title / description / extras values) must never carry
 * orchestration. Returns cleaned text, or empty string if nothing usable remains.
 */
export function sanitizePublicListingCopy(text: string | undefined | null): string {
  const cleaned = stripInternalOrchestrationFragments(String(text || ""));
  if (!cleaned || containsInternalOrchestration(cleaned)) return "";
  return cleaned;
}
