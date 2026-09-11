/** Client HTML for platform notification emails — non-admin must not supply markup. */

const DANGEROUS_HTML_RE =
  /<script[\s>]|javascript:|on\w+\s*=|<iframe|<object|<embed|<link[\s>]|data:text\/html/i;

const HTML_MARKUP_RE = /<[a-z][\s\S]*>/i;

export function containsDangerousHtml(html: string): boolean {
  return DANGEROUS_HTML_RE.test(html);
}

export function looksLikeHtml(value: string): boolean {
  return HTML_MARKUP_RE.test(value);
}

export function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function wrapPlainTextAsEmailHtml(text: string): string {
  const escaped = escapeHtmlText(text.slice(0, 80_000));
  const body = escaped.replace(/\r\n|\r|\n/g, "<br/>\n");
  return `<!DOCTYPE html><html><body style="font-family:sans-serif;color:#111">${body}</body></html>`;
}

export type NotificationEmailBodyResult =
  | { ok: true; html: string }
  | { ok: false; error: string };

/**
 * Admin: HTML allowed after script/javascript rejection.
 * Non-admin: plaintext only; server wraps it. Raw HTML is rejected (SMTP self-phishing).
 */
export function resolveNotificationEmailBody(input: {
  isAdmin: boolean;
  html?: unknown;
  text?: unknown;
}): NotificationEmailBodyResult {
  if (input.isAdmin) {
    if (typeof input.html !== "string" || !input.html.trim()) {
      return { ok: false, error: "Missing to, subject, or html" };
    }
    if (input.html.length > 80_000) {
      return { ok: false, error: "Invalid email body" };
    }
    if (containsDangerousHtml(input.html)) {
      return { ok: false, error: "Invalid email body" };
    }
    return { ok: true, html: input.html };
  }

  if (typeof input.html === "string" && input.html.trim() && looksLikeHtml(input.html)) {
    return { ok: false, error: "HTML email body is not allowed" };
  }

  const textCandidate =
    typeof input.text === "string" && input.text.trim()
      ? input.text
      : typeof input.html === "string"
        ? input.html
        : "";

  if (!textCandidate.trim()) {
    return { ok: false, error: "Missing text body" };
  }
  if (textCandidate.length > 80_000) {
    return { ok: false, error: "Invalid email body" };
  }

  return { ok: true, html: wrapPlainTextAsEmailHtml(textCandidate) };
}
