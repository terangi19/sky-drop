const CSRF_COOKIE_NAME = 'csrf_token';

/**
 * Get CSRF token from client-side cookies
 * This is a client-side helper to read the non-httpOnly cookie
 */
export function getClientCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  
  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === CSRF_COOKIE_NAME) {
      return value;
    }
  }
  return null;
}
