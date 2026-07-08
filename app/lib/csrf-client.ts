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

export async function ensureCsrfToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  const fromCookie = getCsrfFromCookie();
  if (fromCookie) {
    cachedToken = fromCookie;
    return fromCookie;
  }
  try {
    const res = await fetch("/api/csrf");
    if (res.ok) {
      const data = await res.json();
      const token = data?.token || getCsrfFromCookie();
      if (token) cachedToken = token;
      return token || null;
    }
  } catch {}
  return null;
}

export function getCsrfHeader(): Record<string, string> {
  const token = cachedToken || getCsrfFromCookie();
  if (!token) return {};
  return { [CSRF_HEADER_NAME]: token };
}

export function getCsrfHeaderValue(): string | null {
  return cachedToken || getCsrfFromCookie();
}

// Alias used by existing client code
export const getClientCsrfToken = ensureCsrfToken;
