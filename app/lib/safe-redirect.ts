/**
 * Sanitize post-login redirect paths. Rejects open redirects and malformed paths
 * like `/profile//login` that can appear when redirect query params are corrupted.
 */
export function sanitizeRedirectPath(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "";

  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return "";

  const noHash = trimmed.split("#")[0];
  const [pathname, ...queryParts] = noHash.split("?");
  if (pathname.includes("..")) return "";

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return "/";

  const normalizedPath = `/${segments.join("/")}`;
  const query = queryParts.length ? `?${queryParts.join("?")}` : "";
  return `${normalizedPath}${query}`;
}
