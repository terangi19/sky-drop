import DOMPurify from 'dompurify';

export function sanitizeHtml(input: string): string {
  if (!input) return "";
  return DOMPurify.sanitize(input);
}

export function sanitizeForFirestore(input: string): string {
  if (!input) return "";
  return input.slice(0, 5000).replace(/[\u0000-\u001F]/g, "").trim();
}

export function sanitizeListingContent(input: string): string {
  if (!input) return "";
  // Use DOMPurify for comprehensive XSS protection, then strip all HTML tags
  const sanitized = DOMPurify.sanitize(input, { ALLOWED_TAGS: [] });
  return sanitized
    .replace(/[\u0000-\u001F]/g, "")
    .slice(0, 5000)
    .trim();
}
