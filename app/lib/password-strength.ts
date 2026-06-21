export function getPasswordRequirements(password: string): { label: string; met: boolean }[] {
  const types = [
    /[A-Z]/.test(password),
    /[a-z]/.test(password),
    /[0-9]/.test(password),
    /[!@#$%^&*(),.?":{}|<>]/.test(password),
  ].filter(Boolean).length;

  return [
    { label: "At least 8 characters", met: password.length >= 8 },
    {
      label: "At least 3 of: uppercase, lowercase, number, special",
      met: types >= 3,
    },
  ];
}

export function validatePasswordStrength(password: string): { valid: boolean; error?: string } {
  if (password.length < 8) {
    return { valid: false, error: "Password must be at least 8 characters" };
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
