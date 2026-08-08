/**
 * User notification preference helpers.
 * Prefs are stored on profiles/* via /api/save-profile.
 * Category flags gate in-app (and downstream email/push) delivery.
 */

export type NotificationPrefProfile = {
  notifEmail?: boolean;
  notifMessages?: boolean;
  notifAlerts?: boolean;
  notifWatchlist?: boolean;
  notifOffers?: boolean;
  notifPriceDrop?: boolean;
  notifOffersTrades?: boolean;
  notifMessageRequests?: boolean;
  notifListingActivity?: boolean;
  notifListingReplies?: boolean;
  notifReactions?: boolean;
  notifMentions?: boolean;
  notifSecurity?: boolean;
  notifPlatform?: boolean;
  notifQuietHours?: boolean;
  notifQuietHoursStart?: string;
  notifQuietHoursEnd?: string;
};

/** Pref categories exposed in Settings → Notifications (all persisted + enforced). */
export type NotifCategory =
  | "messages"
  | "listing_activity"
  | "wanted_saved"
  | "platform";

const MESSAGE_TYPES = new Set([
  "message",
  "offer",
  "offer_received",
  "message_request",
  "offers_trades",
]);

const LISTING_ACTIVITY_TYPES = new Set([
  "bid",
  "bid_confirmation",
  "outbid",
  "sale",
  "purchase",
  "auction_won",
  "auction_unpaid",
  "listing_reply",
  "listing_activity",
  "sold",
  "order_update",
  "shipping",
]);

const WANTED_SAVED_TYPES = new Set([
  "saved_search_match",
  "price_drop",
  "watchlist",
  "match",
  "wanted_match",
]);

const PLATFORM_TYPES = new Set([
  "platform",
  "platform_update",
  "announcement",
  "verification",
  "listing_rejected",
  "account_review",
]);

/** Always deliver regardless of category prefs (account safety). */
const ALWAYS_ALLOW = new Set([
  "security",
  "dispute_opened",
  "dispute",
  "refund",
  "kyc_submitted",
]);

export function notifCategoryForType(type: string): NotifCategory | "always" | "default" {
  const t = String(type || "")
    .trim()
    .toLowerCase();
  if (!t) return "default";
  if (ALWAYS_ALLOW.has(t) || t.startsWith("security")) return "always";
  if (MESSAGE_TYPES.has(t)) return "messages";
  if (LISTING_ACTIVITY_TYPES.has(t)) return "listing_activity";
  if (WANTED_SAVED_TYPES.has(t)) return "wanted_saved";
  if (PLATFORM_TYPES.has(t)) return "platform";
  // Offers without message bucket already covered; leftover offer-like → messages
  if (t.includes("offer") || t.includes("message")) return "messages";
  if (t.includes("watch") || t.includes("saved_search") || t.includes("price_drop")) {
    return "wanted_saved";
  }
  if (t.includes("listing") || t.includes("bid") || t.includes("sale") || t.includes("purchase")) {
    return "listing_activity";
  }
  return "default";
}

function prefEnabled(value: boolean | undefined, defaultOn = true): boolean {
  return defaultOn ? value !== false : !!value;
}

/**
 * Whether the target user allows this notification type (in-app channel).
 * Missing profile / unknown type → allow (fail open for delivery reliability).
 */
export function profileAllowsNotificationType(
  profile: NotificationPrefProfile | null | undefined,
  type: string
): boolean {
  if (!profile) return true;
  const category = notifCategoryForType(type);
  if (category === "always") return true;

  switch (category) {
    case "messages":
      return prefEnabled(profile.notifMessages);
    case "listing_activity":
      return prefEnabled(profile.notifListingActivity);
    case "wanted_saved":
      return prefEnabled(profile.notifWatchlist);
    case "platform":
      return prefEnabled(profile.notifPlatform);
    default:
      return true;
  }
}

/** Master email channel gate (separate from category). Default on. */
export function profileAllowsNotificationEmail(
  profile: NotificationPrefProfile | null | undefined
): boolean {
  if (!profile) return true;
  return prefEnabled(profile.notifEmail);
}

/**
 * Quiet hours: mute non-critical types when enabled.
 * Security / disputes always pass.
 */
export function isInQuietHours(
  profile: NotificationPrefProfile | null | undefined,
  now = new Date()
): boolean {
  if (!profile?.notifQuietHours) return false;
  const start = String(profile.notifQuietHoursStart || "22:00");
  const end = String(profile.notifQuietHoursEnd || "08:00");
  const [sh, sm] = start.split(":").map((n) => parseInt(n, 10));
  const [eh, em] = end.split(":").map((n) => parseInt(n, 10));
  if (![sh, sm, eh, em].every((n) => Number.isFinite(n))) return false;
  const mins = now.getHours() * 60 + now.getMinutes();
  const startM = sh * 60 + sm;
  const endM = eh * 60 + em;
  if (startM === endM) return false;
  if (startM < endM) return mins >= startM && mins < endM;
  // wraps midnight
  return mins >= startM || mins < endM;
}

export function profileAllowsNotificationDelivery(
  profile: NotificationPrefProfile | null | undefined,
  type: string,
  now = new Date()
): boolean {
  if (!profileAllowsNotificationType(profile, type)) return false;
  const category = notifCategoryForType(type);
  if (category === "always") return true;
  if (isInQuietHours(profile, now)) return false;
  return true;
}
