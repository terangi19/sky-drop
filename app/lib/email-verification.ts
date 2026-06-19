import { User } from "firebase/auth";

/**
 * Check if a user's email is verified
 * Returns true if verified, false otherwise
 */
export function isEmailVerified(user: User | null): boolean {
  if (!user) return false;
  return user.emailVerified === true;
}

/**
 * Error to throw when email verification is required
 */
export class EmailVerificationRequiredError extends Error {
  constructor() {
    super("Please verify your email address to continue");
    this.name = "EmailVerificationRequiredError";
  }
}

/**
 * Throws EmailVerificationRequiredError if user's email is not verified
 * Use this at the start of protected operations
 */
export function requireEmailVerification(user: User | null): void {
  if (!isEmailVerified(user)) {
    throw new EmailVerificationRequiredError();
  }
}

/**
 * Check if an operation should require email verification
 * Critical operations that require verified email
 */
export function requiresEmailVerification(operation: string): boolean {
  const criticalOperations = [
    'create_listing',
    'purchase',
    'make_offer',
    'place_bid',
    'send_message',
    'arrange_purchase',
    'confirm_arrange_sale',
    'accept_offer',
    'create_trade_post',
    'digital_listing',
  ];
  
  return criticalOperations.includes(operation);
}
