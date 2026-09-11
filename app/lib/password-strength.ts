/** Minimum password length for signup and strength checks. Keep in sync with Firebase/auth if raised. */
export const MIN_PASSWORD_LENGTH = 8;

export function getPasswordRequirements(password: string): { label: string; met: boolean }[] {
  const types = [
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /[0-9]/.test(password),
    /[!@#$%^&*(),.?":{}|<>]/.test(password),
  ].filter(Boolean).length;

  return [
    { label: `At least ${MIN_PASSWORD_LENGTH} characters`, met: password.length >= MIN_PASSWORD_LENGTH },
    {
      label: "At least 3 of: uppercase, lowercase, number, special",
      met: types >= 3,
    },
  ];
}

export function validatePasswordStrength(password: string): { valid: boolean; error?: string } {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }

  const types = [
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /[0-9]/.test(password),
    /[!@#$%^&*(),.?":{}|<>]/.test(password),
  ].filter(Boolean).length;

  if (types < 3) {
    return {
      valid: false,
      error: "Use at least 3 of: uppercase, lowercase, number, or special character",
    };
  }

  return { valid: true };
}
