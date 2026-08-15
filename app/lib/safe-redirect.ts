/**
 * Sanitize post-login redirect paths. Rejects open redirects and malformed paths
 * like `/profile//login` that can appear when redirect query params are corrupted.
 */
export function sanitizeRedirectPath(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "";

  const trimmed = raw.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.includes("\\")) return "";

  const noHash = trimmed.split("#")[0];
  const [pathname, ...queryParts] = noHash.split("?");
  let decodedPathname = pathname;
  try {
    // Query params are decoded before reaching this helper, but a second decode
    // catches encoded slashes/backslashes that a router could reinterpret.
    for (let attempt = 0; attempt < 2; attempt++) {
      const decoded = decodeURIComponent(decodedPathname);
      if (decoded === decodedPathname) break;
      decodedPathname = decoded;
    }
  } catch {
    return "";
  }
  if (
    decodedPathname.includes("..") ||
    decodedPathname.includes("\\") ||
    decodedPathname.startsWith("//") ||
    /[\u0000-\u001F]/.test(decodedPathname)
  ) {
    return "";
  }

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return "/";

  const normalizedPath = `/${segments.join("/")}`;
  const query = queryParts.length ? `?${queryParts.join("?")}` : "";
  return `${normalizedPath}${query}`;
}
