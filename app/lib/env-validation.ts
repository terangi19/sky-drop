/**
 * Environment variable validation
 * Ensures required environment variables are set before the application starts
 */

const REQUIRED_ENV_VARS = {
  // Firebase Client (public)
  NEXT_PUBLIC_FIREBASE_API_KEY: "Firebase API key",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "Firebase project ID",
  
  // Firebase Admin (server)
  FIREBASE_SERVICE_ACCOUNT: "Firebase service account JSON",
  
  // Stripe
  STRIPE_SECRET_KEY: "Stripe secret key",
  STRIPE_WEBHOOK_SECRET: "Stripe webhook secret",
  
  // Turnstile (optional but recommended)
  // TURNSTILE_SITE_KEY: "Turnstile site key",
  // TURNSTILE_SECRET_KEY: "Turnstile secret key",
};

const OPTIONAL_ENV_VARS = {
  TURNSTILE_SITE_KEY: "Turnstile site key",
  TURNSTILE_SECRET_KEY: "Turnstile secret key",
};

/** Vars that may be absent during Vercel static build but are required at runtime. */
const BUILD_TIME_OPTIONAL = new Set([
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "FIREBASE_SERVICE_ACCOUNT",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
]);

function isProductionBuildPhase(): boolean {
  return (
    process.env.NEXT_PHASE === "phase-production-build" ||
    (process.env.VERCEL === "1" && process.env.NODE_ENV === "production")
  );
}

export function validateEnv(): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required environment variables
  for (const [key, description] of Object.entries(REQUIRED_ENV_VARS)) {
    if (!process.env[key]) {
      const message = `Missing required environment variable: ${key} (${description})`;
      if (isProductionBuildPhase() && BUILD_TIME_OPTIONAL.has(key)) {
        warnings.push(`${message} — will be required at runtime`);
      } else {
        errors.push(message);
      }
    }
  }

  // Check optional environment variables (warnings only)
  for (const [key, description] of Object.entries(OPTIONAL_ENV_VARS)) {
    if (!process.env[key]) {
      warnings.push(`Optional environment variable not set: ${key} (${description})`);
    }
  }

  // Validate FIREBASE_SERVICE_ACCOUNT is valid JSON if present
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch {
      errors.push("FIREBASE_SERVICE_ACCOUNT is not valid JSON");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateEnvOrThrow(): void {
  const result = validateEnv();
  
  if (result.errors.length > 0) {
    throw new Error(
      `Environment validation failed:\n${result.errors.map(e => `  - ${e}`).join('\n')}`
    );
  }

  if (result.warnings.length > 0) {
    console.warn(
      `Environment warnings:\n${result.warnings.map(w => `  - ${w}`).join('\n')}`
    );
  }
}

// Auto-validate on module import in production
if (process.env.NODE_ENV === "production") {
  try {
    validateEnvOrThrow();
  } catch (e) {
    console.error("Environment validation failed:", e);
    // Don't throw in production to allow the app to start with degraded functionality
    // The specific APIs will fail gracefully when the env vars are missing
  }
}
