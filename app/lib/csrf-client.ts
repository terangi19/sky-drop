const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

let cachedToken: string | null = null;

function getCsrfFromCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${CSRF_COOKIE_NAME}=([^;]*)`)
  );
  return match ? decodeURIComponent(match[1]) : null;
}

/** Drop in-memory token when cookie is cleared or rotated (e.g. logout, new session). */
export function clearCsrfCache(): void {
  cachedToken = null;
}

function syncCacheWithCookie(): string | null {
  const fromCookie = getCsrfFromCookie();
  if (fromCookie) {
    cachedToken = fromCookie;
    return fromCookie;
  }
  if (cachedToken) {
    cachedToken = null;
  }
  return null;
}

export async function ensureCsrfToken(): Promise<string | null> {
  const fromCookie = syncCacheWithCookie();
  if (fromCookie) return fromCookie;

  try {
    const res = await fetch("/api/csrf", { credentials: "same-origin", cache: "no-store" });
    if (res.ok) {
      const data = (await res.json()) as { csrfToken?: string; token?: string };
      const token = data.csrfToken || data.token || getCsrfFromCookie();
      if (token) cachedToken = token;
      return token || null;
    }
  } catch {
    /* fall through */
  }
  return syncCacheWithCookie();
}

export function getCsrfHeader(): Record<string, string> {
  const token = syncCacheWithCookie();
  if (!token) return {};
  return { [CSRF_HEADER_NAME]: token };
}

export function getCsrfHeaderValue(): string | null {
  return syncCacheWithCookie();
}

// Alias used by existing client code
export const getClientCsrfToken = ensureCsrfToken;

// Refresh CSRF cache after auth session changes (login/logout/account switch)
if (typeof window !== "undefined") {
  void import("./firebase").then(({ auth, onAuthStateChanged }) => {
    onAuthStateChanged(auth, () => {
      clearCsrfCache();
    });
  });
}
