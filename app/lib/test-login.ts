/** Shared test-account settings (Firebase Auth custom token flow). */

export const DEFAULT_TEST_EMAIL = "test@skydrop.nz";
export const DEFAULT_TEST_PASSWORD = "TestPass123!";

export function getTestLoginEmail(): string {
  return (
    process.env.TEST_EMAIL?.trim() ||
    process.env.NEXT_PUBLIC_TEST_EMAIL?.trim() ||
    DEFAULT_TEST_EMAIL
  );
}

export function getTestLoginPassword(): string {
  return process.env.TEST_PASSWORD?.trim() || DEFAULT_TEST_PASSWORD;
}

/** Server: allow /api/test-login */
export function isTestLoginApiEnabled(): boolean {
  if (process.env.ENABLE_TEST_LOGIN === "true") return true;
  if (process.env.ENABLE_TEST_LOGIN === "false") return false;
  return process.env.NODE_ENV === "development";
}

/**
 * Client: show Test Login on /login.
 * Enabled in dev, or when NEXT_PUBLIC_ENABLE_TEST_LOGIN / NEXT_PUBLIC_TEST_EMAIL is set.
 */
export function isTestLoginUiEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_ENABLE_TEST_LOGIN === "true") return true;
  if (process.env.NEXT_PUBLIC_ENABLE_TEST_LOGIN === "false") return false;
  if (process.env.NEXT_PUBLIC_TEST_EMAIL?.trim()) return true;
  return process.env.NODE_ENV === "development";
}
