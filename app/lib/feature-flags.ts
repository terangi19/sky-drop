/**
 * Feature Flag System
 *
 * Gradual rollout helpers. Stripe Checkout V1 gating uses env flags in
 * `stripe-checkout-flags.ts` — do not authorize payments from this file.
 */

export interface FeatureFlag {
  enabled: boolean;
  rolloutPercentage: number;
  userWhitelist?: string[];
  metricsEnabled: boolean;
}

export const FEATURE_FLAGS: Record<string, FeatureFlag> = {
  OPTIMIZED_NAVBAR: {
    enabled: true,
    rolloutPercentage: 10,
    userWhitelist: [],
    metricsEnabled: true,
  },
};

export function isFeatureEnabled(featureName: string, userId?: string): boolean {
  const flag = FEATURE_FLAGS[featureName];
  if (!flag || !flag.enabled) return false;

  if (userId && flag.userWhitelist?.includes(userId)) {
    return true;
  }

  if (userId) {
    const hash = simpleHash(userId);
    const percentage = hash % 100;
    return percentage < flag.rolloutPercentage;
  }

  return false;
}

export function areMetricsEnabled(featureName: string): boolean {
  const flag = FEATURE_FLAGS[featureName];
  return flag?.metricsEnabled ?? false;
}

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

export function updateFeatureFlag(featureName: string, config: Partial<FeatureFlag>): void {
  if (FEATURE_FLAGS[featureName]) {
    FEATURE_FLAGS[featureName] = { ...FEATURE_FLAGS[featureName], ...config };
  }
}
