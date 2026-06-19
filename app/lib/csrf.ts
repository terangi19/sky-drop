import { cookies } from 'next/headers';

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const TOKEN_LENGTH = 32;

/**
 * Generate a random CSRF token
 */
function generateToken(): string {
  const array = new Uint8Array(TOKEN_LENGTH);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Get or create CSRF token from cookies
 */
export async function getCsrfToken(): Promise<string> {
  const cookieStore = await cookies();
  const existingToken = cookieStore.get(CSRF_COOKIE_NAME);
  
  if (existingToken) {
    return existingToken.value;
  }
  
  const newToken = generateToken();
  cookieStore.set(CSRF_COOKIE_NAME, newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 60 * 24, // 24 hours
    path: '/',
  });
  
  return newToken;
}

/**
 * Validate CSRF token from request headers
 */
export async function validateCsrfToken(request: Request): Promise<boolean> {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(CSRF_COOKIE_NAME)?.value;
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  
  if (!cookieToken || !headerToken) {
    return false;
  }
  
  // Use constant-time comparison to prevent timing attacks
  if (cookieToken.length !== headerToken.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < cookieToken.length; i++) {
    result |= cookieToken.charCodeAt(i) ^ headerToken.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * CSRF error for use in API routes
 */
export class CsrfError extends Error {
  constructor(message: string = 'CSRF token validation failed') {
    super(message);
    this.name = 'CsrfError';
  }
}

/**
 * Require CSRF token validation for state-changing operations
 * Throws CsrfError if validation fails
 */
export async function requireCsrf(request: Request): Promise<void> {
  if (!(await validateCsrfToken(request))) {
    throw new CsrfError();
  }
}

/**
 * Operations that require CSRF protection
 */
export const CSRF_PROTECTED_OPERATIONS = new Set([
  'create_listing',
  'update_listing',
  'delete_listing',
  'purchase',
  'make_offer',
  'accept_offer',
  'place_bid',
  'arrange_purchase',
  'confirm_arrange_sale',
  'create_trade_post',
  'update_profile',
  'delete_message',
  'admin_action',
]);

/**
 * Check if an operation requires CSRF protection
 */
export function requiresCsrfProtection(operation: string): boolean {
  return CSRF_PROTECTED_OPERATIONS.has(operation);
}
