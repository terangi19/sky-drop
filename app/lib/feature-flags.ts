/**
 * Feature Flag System
 * 
 * Allows gradual rollout of new features with metrics collection
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
    rolloutPercentage: 10, // Start with 10% of users
    userWhitelist: [], // Add specific users for testing
    metricsEnabled: true,
  },
  
  // V1: Disable Stripe Checkout (use Arrange Purchase / Message Seller instead)
  DISABLE_STRIPE_CHECKOUT_V1: {
    enabled: true,
    rolloutPercentage: 100, // All users in V1
    metricsEnabled: false,
  },
  
  // V1: Disable Buy Now buttons (use Message Seller instead)
  DISABLE_BUY_NOW_V1: {
    enabled: true,
    rolloutPercentage: 100, // All users in V1
    metricsEnabled: false,
  },
  
  // V1: Disable Stripe onboarding screens
  DISABLE_STRIPE_ONBOARDING_V1: {
    enabled: true,
    rolloutPercentage: 100, // All users in V1
    metricsEnabled: false,
  },
};

/**
 * Check if feature is enabled for a specific user
 */
export function isFeatureEnabled(featureName: string, userId?: string): boolean {
  const flag = FEATURE_FLAGS[featureName];
  if (!flag || !flag.enabled) return false;

  // Check whitelist
  if (userId && flag.userWhitelist?.includes(userId)) {
    return true;
  }

  // Check rollout percentage
  if (userId) {
    const hash = simpleHash(userId);
    const percentage = (hash % 100);
    return percentage < flag.rolloutPercentage;
  }

  return false;
}

/**
 * Check if metrics are enabled for a feature
 */
export function areMetricsEnabled(featureName: string): boolean {
  const flag = FEATURE_FLAGS[featureName];
  return flag?.metricsEnabled ?? false;
}

/**
 * Simple hash function for consistent user assignment
 */
function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Update feature flag configuration (admin only)
 */
export function updateFeatureFlag(featureName: string, config: Partial<FeatureFlag>): void {
  if (FEATURE_FLAGS[featureName]) {
    FEATURE_FLAGS[featureName] = { ...FEATURE_FLAGS[featureName], ...config };
  }
}
