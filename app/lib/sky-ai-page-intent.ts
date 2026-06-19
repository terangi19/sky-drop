import { hasActiveListingDraft, mergeListingFillWithDraft } from "./sky-ai-draft-merge";
import { isListingDetailMessage } from "./sky-ai-listing-paste";
import {
  describeFormActions,
  hasFormActionContent,
  isFormTweakOnlyMessage,
  mergeFormActionsIntoFill,
  parseFormActionsFromMessage,
} from "./sky-ai-form-actions";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import type { SkyAiListingContext } from "./sky-ai-types";
import type { SkyAiProfileContext } from "./sky-ai-profile-context";
import {
  hasProfileFillContent,
  mergeProfileFill,
  normalizeSkyAiProfileFill,
  type SkyAiProfileFill,
} from "./sky-ai-profile-fill";

const NAVIGATE_PATTERNS =
  /\b(take me|go to|open|show me|navigate|bring me|send me|guide me to|where is|where's|how do i get to)\b/i;

const EXPLICIT_BROWSE_INTENT =
  /\b(browse|search|find listings|show me listings|take me to|go to|open)\b.*\b(vehicles?|cars?|digital|services?|rentals?|marketplace|home)\b/i;

const BIO_INTENT =
  /\b(write|make|create|draft|generate|help with|update|need)\b[\s\S]{0,40}\b(bio|profile description|about me|description)\b|\b(bio|profile description|about me)\b[\s\S]{0,40}\b(write|make|create|draft|for me)\b/i;

const PROFILE_SETUP_INTENT =
  /\b(username|social link|instagram|tiktok|discord|region|fill my profile|complete my profile|set up my profile)\b/i;

const SELLER_CONTEXT_INTENT =
  /\b(i sell|i'm selling|i buy and sell|based in|from auckland|from wellington|in auckland|in wellington)\b/i;

const NAME_INTENT = /\b(?:i'm|i am|my name is|call me)\s+([a-z][a-z0-9_]{2,20})\b/i;

const NZ_REGIONS = [
  "Northland", "Auckland", "Waikato", "Bay of Plenty", "Gisborne",
  "Hawke's Bay", "Taranaki", "Manawatu", "Wellington", "Nelson",
  "Marlborough", "West Coast", "Canterbury", "Otago", "Southland",
] as const;

const BROWSE_PATHS = new Set([
  "/",
  "/vehicles",
  "/digital",
  "/services",
  "/rentals",
]);

export type PageShortcutResult = {
  reply: string;
  navigateTo?: string;
  profileFill?: SkyAiProfileFill;
  source: "rules";
};

function normalizePath(pathname: string): string {
  return pathname.split("?")[0].replace(/\/$/, "") || "/";
}

export function isExplicitNavigationRequest(message: string): boolean {
  const n = message.toLowerCase();
  return NAVIGATE_PATTERNS.test(n) || EXPLICIT_BROWSE_INTENT.test(n);
}

export function isBioGenerationIntent(message: string): boolean {
  return BIO_INTENT.test(message.toLowerCase());
}

export function isProfileWorkflowIntent(message: string): boolean {
  const n = message.toLowerCase();
  return (
    isBioGenerationIntent(message) ||
    PROFILE_SETUP_INTENT.test(n) ||
    SELLER_CONTEXT_INTENT.test(n) ||
    NAME_INTENT.test(message)
  );
}

export function shouldAllowNavigation(pathname: string, message: string): boolean {
  const base = normalizePath(pathname);
  if (base === "/profile" || base.startsWith("/profile")) {
    return isExplicitNavigationRequest(message);
  }
  if (base === "/post/ai") {
    if (isProfileWorkflowIntent(message) && !isExplicitNavigationRequest(message)) {
      return false;
    }
    if (isListingDetailMessage(message) && !isExplicitNavigationRequest(message)) {
      return false;
    }
  }
  return true;
}

function extractRegion(text: string): string | undefined {
  const n = text.toLowerCase();
  for (const region of NZ_REGIONS) {
    if (n.includes(region.toLowerCase())) return region;
  }
  return undefined;
}

function detectSellTopics(text: string): string[] {
  const n = text.toLowerCase();
  const topics: string[] = [];
  if (/\b(cars?|vehicles?|motors?)\b/.test(n)) topics.push("vehicles");
  if (/\b(collectable|collectible|vintage|antique)\b/.test(n)) topics.push("collectables");
  if (/\b(gaming|games?|console)\b/.test(n)) topics.push("gaming");
  return topics;
}

function buildBioFromMessage(text: string, existingBio?: string): string {
  const region = extractRegion(text);
  const topics = detectSellTopics(text);
  const place = region ? `${region}-based` : "NZ";

  if (topics.includes("vehicles") && topics.includes("collectables")) {
    return `${place} seller buying and selling quality vehicles and collectables. Honest descriptions, fast replies, and help finding the right item.`;
  }
  if (topics.includes("vehicles")) {
    return `${place} vehicle seller with a passion for quality cars and helping buyers find the right vehicle.`;
  }
  if (topics.includes("collectables")) {
    return `${place} seller specialising in collectables and vintage finds. Carefully described items and reliable communication.`;
  }
  if (topics.includes("gaming")) {
    return `${place} seller of gaming gear and collectables. Fast replies and items described honestly.`;
  }
  if (region) {
    return `${place} Sky Drop seller — friendly service, clear listings, and quick replies.`;
  }
  return existingBio?.trim() || "Friendly NZ seller on Sky Drop — honest listings and quick replies.";
}

function extractUsernameHint(text: string): string | undefined {
  const m = text.match(NAME_INTENT);
  if (!m?.[1]) return undefined;
  const raw = m[1].toLowerCase();
  if (raw.length < 3 || raw.length > 30) return undefined;
  return raw.replace(/[^a-z0-9_]/g, "");
}

export function buildProfileFillFromMessage(
  message: string,
  current: SkyAiProfileContext | null
): SkyAiProfileFill {
  const raw: Record<string, unknown> = { ...(current || {}) };
  const region = extractRegion(message);
  if (region) raw.region = region;

  const username = extractUsernameHint(message);
  if (username) raw.username = username;

  if (isBioGenerationIntent(message) || SELLER_CONTEXT_INTENT.test(message.toLowerCase())) {
    raw.bio = buildBioFromMessage(message, current?.bio);
  }

  return normalizeSkyAiProfileFill(raw);
}

export type ListingFormActionShortcutResult = {
  reply: string;
  listingFill: SkyAiListingFill;
  source: "rules";
};

export function tryListingFormActionsShortcut(
  message: string,
  pathname: string,
  listingContext: SkyAiListingContext | null
): ListingFormActionShortcutResult | null {
  const base = normalizePath(pathname);
  if (base !== "/post/ai") return null;

  const hasDraft = hasActiveListingDraft(listingContext);
  if (!isFormTweakOnlyMessage(message, hasDraft)) return null;

  const actions = parseFormActionsFromMessage(message);
  if (!hasFormActionContent(actions)) return null;

  const fill = mergeListingFillWithDraft(
    listingContext,
    mergeFormActionsIntoFill({}, actions)
  );

  const changes = describeFormActions(actions);
  const changeNote =
    changes.length > 0
      ? `I've updated your listing form: **${changes.join("**, **")}**.`
      : "I've updated your listing form toggles.";

  return {
    reply: `${changeNote} Check the form below — adjust anything else and publish when ready.`,
    listingFill: fill,
    source: "rules",
  };
}

export function tryProfilePageShortcut(
  message: string,
  pathname: string,
  profileContext: SkyAiProfileContext | null
): PageShortcutResult | null {
  const base = normalizePath(pathname);
  if (base !== "/profile") return null;
  if (!isProfileWorkflowIntent(message)) return null;

  const merged = mergeProfileFill(
    profileContext || {},
    buildProfileFillFromMessage(message, profileContext)
  );

  if (!hasProfileFillContent(merged)) {
    return {
      reply:
        "Tell me what you sell and where you're based — I'll draft your bio and update your profile fields.",
      source: "rules",
    };
  }

  const preview = merged.bio ? `**Bio preview:**\n${merged.bio}\n\n` : "";
  const updated: string[] = [];
  if (merged.username && merged.username !== profileContext?.username) updated.push("username");
  if (merged.region && merged.region !== profileContext?.region) updated.push("region");
  if (merged.bio && merged.bio !== profileContext?.bio) updated.push("bio");

  const changeNote =
    updated.length > 0
      ? `I've updated your profile draft (${updated.join(", ")}).`
      : "I've refreshed your profile draft.";

  return {
    reply: `${preview}${changeNote} Check the fields below — happy with it? Tap **Save**. Want tweaks? Just tell me.`,
    profileFill: merged,
    source: "rules",
  };
}

export function finalizePageAwareResponse(
  pathname: string,
  message: string,
  profileContext: SkyAiProfileContext | null,
  result: {
    reply: string;
    navigateTo?: string;
    profileFill?: SkyAiProfileFill;
  }
): {
  reply: string;
  navigateTo?: string;
  profileFill?: SkyAiProfileFill;
} {
  let { reply, navigateTo, profileFill } = result;
  const base = normalizePath(pathname);

  if (base === "/profile" || base.startsWith("/profile")) {
    if (!isExplicitNavigationRequest(message)) {
      navigateTo = undefined;
    } else if (navigateTo && BROWSE_PATHS.has(navigateTo.split("#")[0])) {
      /* explicit browse from profile is allowed */
    }

    const badNavReply = /\b(taking you to|opening)\b/i.test(reply);
    if (isProfileWorkflowIntent(message) || badNavReply) {
      navigateTo = undefined;
      const rule = tryProfilePageShortcut(message, pathname, profileContext);
      if (rule) {
        if (rule.profileFill) profileFill = rule.profileFill;
        if (badNavReply || !hasProfileFillContent(profileFill)) {
          reply = rule.reply;
        } else if (!/\b(save|preview|updated|draft|happy)\b/i.test(reply)) {
          reply = `${reply.trim()}\n\n${rule.reply.split("\n\n").pop()}`;
        }
      }
    }
  }

  return { reply, navigateTo, profileFill };
}
