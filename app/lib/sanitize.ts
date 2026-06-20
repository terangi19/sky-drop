import DOMPurify from 'dompurify';

function safeDompurifySanitize(input: string, options?: { ALLOWED_TAGS?: string[] }): string {
  // DOMPurify requires a DOM environment; defensively handle server/minified builds
  // where the imported value may not expose a sanitize function.
  if (typeof window !== 'undefined' && DOMPurify && typeof DOMPurify.sanitize === 'function') {
    return DOMPurify.sanitize(input, options);
  }
  // Server-side or fallback: strip HTML tags and decode common entities
  return input
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export function sanitizeHtml(input: string): string {
  if (!input) return "";
  return safeDompurifySanitize(input);
}

export function sanitizeForFirestore(input: string): string {
  if (!input) return "";
  return input.slice(0, 5000).replace(/[\u0000-\u001F]/g, "").trim();
}

export function sanitizeListingContent(input: string): string {
  if (!input) return "";
  // Strip all HTML tags and control characters, then truncate
  const sanitized = safeDompurifySanitize(input, { ALLOWED_TAGS: [] });
  const sanitizedStr = String(sanitized || "");
  return sanitizedStr
    .replace(/[\u0000-\u001F]/g, "")
    .slice(0, 5000)
    .trim();
}
