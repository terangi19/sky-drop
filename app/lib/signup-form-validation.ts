import { validateEmail } from "./api-validation";
import { MIN_PASSWORD_LENGTH } from "./password-strength";

export { MIN_PASSWORD_LENGTH };

export function isValidSignupEmail(email: string): boolean {
  return validateEmail(email.trim()).valid;
}

export function isSignupPasswordLongEnough(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}

export function getSignupClientErrors(
  email: string,
  password: string,
  options?: { requireValues?: boolean }
): { email: string | null; password: string | null } {
  const trimmedEmail = email.trim();
  let emailError: string | null = null;
  if (!trimmedEmail) {
    emailError = options?.requireValues ? "Enter a valid email address." : null;
  } else if (!isValidSignupEmail(trimmedEmail)) {
    emailError = "Enter a valid email address.";
  }

  let passwordError: string | null = null;
  if (!password) {
    passwordError = options?.requireValues
      ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters`
      : null;
  } else if (!isSignupPasswordLongEnough(password)) {
    passwordError = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }

  return { email: emailError, password: passwordError };
}

export function canEnableSignupSubmit(input: {
  email: string;
  password: string;
  acceptedTerms: boolean;
  loading?: boolean;
}): boolean {
  if (input.loading || !input.acceptedTerms) return false;
  const errors = getSignupClientErrors(input.email, input.password, { requireValues: true });
  return !errors.email && !errors.password;
}
