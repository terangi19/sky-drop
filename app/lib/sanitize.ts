export function sanitizeHtml(input: string): string {
  if (!input) return "";
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

export function sanitizeForFirestore(input: string): string {
  if (!input) return "";
  return input.slice(0, 5000).replace(/[\u0000-\u001F]/g, "").trim();
}

export function sanitizeListingContent(input: string): string {
  if (!input) return "";
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\s+on\w+\s*=\s*("(?:[^"]*)"|'(?:[^']*)'|[^\s>]+)/gi, "")
    .replace(/javascript\s*:/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001F]/g, "")
    .slice(0, 5000)
    .trim();
}
