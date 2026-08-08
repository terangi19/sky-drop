/**
 * Canonical profile AI tools.
 * Allowlisted editable fields only — never admin/verification/ratings/trust/UID/role.
 */

import type { AwhinaToolCall } from "./awhina-types";
import { validateToolCall } from "./awhina-tool-registry";
import {
  hasProfileFillContent,
  mergeProfileFill,
  normalizeSkyAiProfileFill,
  type SkyAiProfileFill,
} from "./sky-ai-profile-fill";
import type { SkyAiProfileContext } from "./sky-ai-profile-context";
import {
  buildProfileFillFromMessage,
  isExplicitNavigationRequest,
  isProfileWorkflowIntent,
  tryProfilePageShortcut,
} from "./sky-ai-page-intent";

const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 400;

export type ProfileDraftSession = {
  draft: SkyAiProfileFill;
  updatedAt: number;
};

const sessions = new Map<string, ProfileDraftSession>();

/** Fields Āwhina may propose — app logic is source of truth after validation. */
export const PROFILE_EDITABLE_FIELDS = [
  "username",
  "bio",
  "region",
  "discord",
  "instagram",
  "facebook",
  "tiktok",
  "youtube",
  "website",
  "businessName",
  "favouriteCategories",
] as const;

export type ProfileEditableField = (typeof PROFILE_EDITABLE_FIELDS)[number];

const EDITABLE_SET = new Set<string>(PROFILE_EDITABLE_FIELDS);

/** Never accept these as profile tool writes. */
const FORBIDDEN_PROFILE_FIELDS = new Set([
  "admin",
  "role",
  "verified",
  "verification",
  "kyc",
  "trust",
  "rating",
  "ratings",
  "reviews",
  "review",
  "uid",
  "userId",
  "permissions",
  "permission",
  "isAdmin",
  "superAdmin",
  "moderator",
  "badge",
  "emailVerified",
  "phoneVerified",
  "idVerified",
  "sellerVerified",
  "trustScore",
  "riskFlag",
]);

const FORBIDDEN_INTENT_RE =
  /\b(verify(?:\s+me)?|verification|make\s+me\s+(?:an?\s+)?admin|grant\s+admin|change\s+(?:my\s+)?role|set\s+(?:my\s+)?role|trust\s+score|give\s+me\s+(?:5\s+)?stars?|fake\s+reviews?|boost\s+(?:my\s+)?rating|mark\s+(?:me\s+)?verified|kyc\s+bypass|change\s+(?:my\s+)?uid)\b/i;

const NZ_REGIONS = [
  "Northland",
  "Auckland",
  "Waikato",
  "Bay of Plenty",
  "Gisborne",
  "Hawke's Bay",
  "Taranaki",
  "Manawatu",
  "Wellington",
  "Nelson",
  "Marlborough",
  "West Coast",
  "Canterbury",
  "Otago",
  "Southland",
] as const;

/** Common suburbs → parent NZ region (for clarifying location follow-ups). */
const SUBURB_TO_REGION: Record<string, (typeof NZ_REGIONS)[number]> = {
  henderson: "Auckland",
  manukau: "Auckland",
  albany: "Auckland",
  takapuna: "Auckland",
  remuera: "Auckland",
  "new lynn": "Auckland",
  papakura: "Auckland",
  waitakere: "Auckland",
  lowerhutt: "Wellington",
  "lower hutt": "Wellington",
  "upper hutt": "Wellington",
  porirua: "Wellington",
  petone: "Wellington",
  riccarton: "Canterbury",
  sydenham: "Canterbury",
  ilam: "Canterbury",
};

function pruneSessions(): void {
  const now = Date.now();
  for (const [k, v] of sessions) {
    if (now - v.updatedAt > SESSION_TTL_MS) sessions.delete(k);
  }
  if (sessions.size > MAX_SESSIONS) {
    const oldest = [...sessions.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
    for (let i = 0; i < oldest.length - MAX_SESSIONS; i++) {
      sessions.delete(oldest[i][0]);
    }
  }
}

export function profileDraftSessionKey(opts: {
  conversationId?: string;
  uid?: string | null;
  pathname?: string;
}): string {
  if (opts.conversationId) return `prof:c:${opts.conversationId}`;
  if (opts.uid) return `prof:u:${opts.uid}`;
  return `prof:anon:${opts.pathname || "/profile"}`;
}

export function getProfileDraftSession(key: string): ProfileDraftSession | null {
  pruneSessions();
  const s = sessions.get(key);
  if (!s) return null;
  if (Date.now() - s.updatedAt > SESSION_TTL_MS) {
    sessions.delete(key);
    return null;
  }
  return s;
}

export function rememberProfileDraft(key: string, draft: SkyAiProfileFill): SkyAiProfileFill {
  pruneSessions();
  const prev = sessions.get(key)?.draft || {};
  const merged = mergeProfileFill(prev, draft);
  sessions.set(key, { draft: merged, updatedAt: Date.now() });
  return merged;
}

export function clearProfileDraftSession(key: string): void {
  sessions.delete(key);
}

export function isForbiddenProfileField(field: string): boolean {
  const f = field.trim().toLowerCase();
  return FORBIDDEN_PROFILE_FIELDS.has(f) || FORBIDDEN_PROFILE_FIELDS.has(field.trim());
}

export function isEditableProfileField(field: string): field is ProfileEditableField {
  return EDITABLE_SET.has(field);
}

/**
 * Strip forbidden keys; only allowlisted fields survive.
 * Never lets raw tool args become writes without this gate.
 */
export function sanitizeProfileFillProposal(
  raw: Record<string, unknown> | SkyAiProfileFill | null | undefined
): { ok: true; fill: SkyAiProfileFill; rejected: string[] } | { ok: false; error: string; rejected: string[] } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "No profile fields", rejected: [] };
  }
  const rejected: string[] = [];
  const allowed: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (isForbiddenProfileField(key)) {
      rejected.push(key);
      continue;
    }
    if (!isEditableProfileField(key)) {
      rejected.push(key);
      continue;
    }
    allowed[key] = value;
  }

  if (rejected.length > 0 && Object.keys(allowed).length === 0) {
    return {
      ok: false,
      error: `Those fields can't be changed here (${rejected.join(", ")}).`,
      rejected,
    };
  }

  const fill = normalizeSkyAiProfileFill(allowed);
  if (!hasProfileFillContent(fill) && rejected.length > 0) {
    return {
      ok: false,
      error: `Those fields can't be changed here (${rejected.join(", ")}).`,
      rejected,
    };
  }
  if (!hasProfileFillContent(fill)) {
    return { ok: false, error: "No valid editable profile fields", rejected };
  }
  return { ok: true, fill, rejected };
}

export function validateUpdateProfileToolArgs(
  field: string,
  value: unknown
): { ok: true; field: ProfileEditableField; value: string } | { ok: false; error: string } {
  if (isForbiddenProfileField(field)) {
    return { ok: false, error: `Field "${field}" is not editable via Āwhina` };
  }
  if (!isEditableProfileField(field)) {
    return { ok: false, error: `Field "${field}" is not in the profile allowlist` };
  }
  if (typeof value !== "string" && typeof value !== "number") {
    return { ok: false, error: "Profile value must be a string" };
  }
  const str = String(value).trim();
  if (!str) return { ok: false, error: "Profile value is empty" };
  if (field === "bio" && str.length > 300) {
    return { ok: false, error: "Bio max 300 characters" };
  }
  if (field === "username" && !/^[a-z0-9_]{3,30}$/i.test(str.replace(/^@/, ""))) {
    return { ok: false, error: "Username must be 3–30 letters, numbers, or _" };
  }
  if (field === "region") {
    const match = NZ_REGIONS.find((r) => r.toLowerCase() === str.toLowerCase());
    if (!match) return { ok: false, error: "Region must be a valid NZ region" };
    return { ok: true, field, value: match };
  }
  return { ok: true, field, value: str.slice(0, field === "bio" ? 300 : 200) };
}

function extractRegion(text: string): string | undefined {
  const n = text.toLowerCase();
  for (const region of NZ_REGIONS) {
    if (n.includes(region.toLowerCase())) return region;
  }
  return undefined;
}

function extractSuburb(text: string): { suburb: string; region: (typeof NZ_REGIONS)[number] } | undefined {
  const n = text.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  for (const [suburb, region] of Object.entries(SUBURB_TO_REGION)) {
    if (n === suburb || n.includes(suburb)) {
      return { suburb, region };
    }
  }
  return undefined;
}

function extractBioExplicit(message: string): string | undefined {
  const m = message.match(
    /\b(?:bio(?:\s+is)?|about me|set(?:\s+my)?\s+bio(?:\s+to)?|update(?:\s+my)?\s+bio(?:\s+to)?)\s*[:\-]?\s*(.{8,300})\s*$/i
  );
  return m?.[1]?.trim().slice(0, 300);
}

function extractDisplayName(message: string): string | undefined {
  const m = message.match(
    /\b(?:(?:display\s+)?name(?:\s+is)?|call me|i'?m|i am|username(?:\s+is)?|my name is)\s+@?([a-z][a-z0-9_]{2,29})\b/i
  );
  if (!m?.[1]) return undefined;
  const u = m[1].toLowerCase();
  if (/^(in|at|from|a|an|the|selling)$/i.test(u)) return undefined;
  return u;
}

function extractSocial(message: string): Partial<SkyAiProfileFill> {
  const out: Partial<SkyAiProfileFill> = {};
  const ig = message.match(/\b(?:instagram|ig)\s*(?:is|=|:)?\s*@?([a-z0-9._]{2,30})\b/i);
  if (ig?.[1]) out.instagram = ig[1];
  const tt = message.match(/\b(?:tiktok)\s*(?:is|=|:)?\s*@?([a-z0-9._]{2,30})\b/i);
  if (tt?.[1]) out.tiktok = tt[1];
  const dc = message.match(/\b(?:discord)\s*(?:is|=|:)?\s*([^\s,]{2,60})/i);
  if (dc?.[1]) out.discord = dc[1];
  const fb = message.match(/\b(?:facebook|fb)\s*(?:is|=|:)?\s*@?([a-z0-9.]{2,40})\b/i);
  if (fb?.[1]) out.facebook = fb[1];
  const web = message.match(/\b(?:website|site)\s*(?:is|=|:)?\s*(https?:\/\/\S+|www\.\S+)/i);
  if (web?.[1]) out.website = web[1].slice(0, 200);
  return out;
}

export type ProfileToolResult =
  | {
      handled: true;
      reply: string;
      profileFill?: SkyAiProfileFill;
      navigateTo?: string;
      clarify?: boolean;
      toolCall?: AwhinaToolCall;
      intent: string;
      rejectedFields?: string[];
    }
  | { handled: false };

export function processProfileMessage(
  message: string,
  opts: {
    pathname?: string;
    profileContext?: SkyAiProfileContext | null;
    sessionKey?: string;
  } = {}
): ProfileToolResult {
  const pathname = opts.pathname || "/";
  const onProfile = pathname === "/profile" || pathname.startsWith("/profile");
  const trimmed = message.trim();
  if (!trimmed) return { handled: false };

  // Forbidden permission / verification / trust attempts — never become tools
  if (FORBIDDEN_INTENT_RE.test(trimmed)) {
    return {
      handled: true,
      reply:
        "I can't change verification, admin, roles, ratings, or trust from chat. Those stay with Sky Drop's normal security checks. I can update your **display name, bio, region, or social links** — what would you like?",
      clarify: true,
      intent: "profile_blocked",
      rejectedFields: ["verification/admin/role/trust"],
    };
  }

  // Explicit invalid field requests
  const invalidField = trimmed.match(
    /\b(?:set|change|update|make)\s+(?:my\s+)?(admin|role|verified|verification|trust|rating|uid|permissions?)\b/i
  );
  if (invalidField?.[1]) {
    return {
      handled: true,
      reply: `I can't update **${invalidField[1]}** — that isn't an editable profile field.`,
      clarify: true,
      intent: "profile_blocked",
      rejectedFields: [invalidField[1].toLowerCase()],
    };
  }

  // Navigate to profile / settings (allowlisted paths)
  if (/\b(open|go to|take me to|show)\s+(my\s+)?(profile|settings)\b/i.test(trimmed) ||
      /^(profile|settings)$/i.test(trimmed)) {
    const toSettings = /\bsettings\b/i.test(trimmed);
    const path = toSettings ? "/profile/settings" : "/profile";
    const already = onProfile && !toSettings;
    const toolCall: AwhinaToolCall = {
      tool: "navigate",
      args: { navigate: { path, reason: "Open profile" } },
      confidence: 1,
    };
    const validated = validateToolCall(toolCall);
    return {
      handled: true,
      reply: already
        ? "You're already on **Profile**. Tell me a bio, region, or username to update."
        : toSettings
          ? "Opening **Profile settings**."
          : "Opening **Profile**.",
      navigateTo: already ? undefined : path,
      intent: "navigation",
      toolCall: validated.ok ? toolCall : undefined,
    };
  }

  if (!onProfile && !isProfileWorkflowIntent(trimmed) && !/\b(bio|username|region|instagram|location)\b/i.test(trimmed)) {
    return { handled: false };
  }

  // Prefer existing page shortcut for rich bio generation
  const shortcut = tryProfilePageShortcut(trimmed, onProfile ? "/profile" : pathname, opts.profileContext || null);
  if (shortcut?.profileFill) {
    const sanitized = sanitizeProfileFillProposal(shortcut.profileFill);
    if (!sanitized.ok) {
      return {
        handled: true,
        reply: sanitized.error,
        clarify: true,
        intent: "profile_blocked",
        rejectedFields: sanitized.rejected,
      };
    }
    const key = opts.sessionKey || profileDraftSessionKey({ pathname });
    rememberProfileDraft(key, sanitized.fill);
    return finishProfile(shortcut.reply, sanitized.fill, sanitized.rejected);
  }

  const sessionKey = opts.sessionKey || profileDraftSessionKey({ pathname });
  const sessionDraft = getProfileDraftSession(sessionKey)?.draft;
  const current: SkyAiProfileFill = {
    ...(opts.profileContext || {}),
    ...(sessionDraft || {}),
  };

  const proposal: Record<string, unknown> = {};
  const notes: string[] = [];

  // Location / region
  const region = extractRegion(trimmed);
  const suburb = extractSuburb(trimmed);
  if (region) {
    proposal.region = region;
    notes.push(`region ${region}`);
  } else if (suburb) {
    // Follow-up like "Henderson" after Auckland — map suburb → region, confirm
    proposal.region = suburb.region;
    notes.push(`region ${suburb.region} (${suburb.suburb})`);
  } else if (/\b(?:location|region|based|live(?:s)? in|from)\b/i.test(trimmed)) {
    // Asked for location but not a known region
    const guess = trimmed
      .replace(/.*\b(?:location|region|based(?:\s+in)?|live(?:s)?\s+in|from|in)\s+/i, "")
      .replace(/[?.!].*$/, "")
      .trim();
    if (guess && guess.length < 40 && !extractRegion(guess)) {
      return {
        handled: true,
        reply: `"${guess}" isn't a NZ region I can set. Pick one like **Auckland**, **Wellington**, or **Canterbury** — or name a suburb I know (e.g. Henderson).`,
        clarify: true,
        intent: "profile_update",
      };
    }
  }

  const bio = extractBioExplicit(trimmed);
  if (bio) {
    proposal.bio = bio;
    notes.push("bio");
  }

  const name = extractDisplayName(trimmed);
  if (name && !/^(a|an|the|in|at)$/i.test(name)) {
    // Only treat as username when clearly a name/username intent
    if (/\b(name|username|call me|i'?m|i am)\b/i.test(trimmed)) {
      proposal.username = name;
      notes.push(`username @${name}`);
    }
  }

  Object.assign(proposal, extractSocial(trimmed));
  if (proposal.instagram) notes.push("Instagram");
  if (proposal.tiktok) notes.push("TikTok");
  if (proposal.discord) notes.push("Discord");
  if (proposal.facebook) notes.push("Facebook");
  if (proposal.website) notes.push("website");

  // Fallback to buildProfileFillFromMessage for seller-context bios
  if (Object.keys(proposal).length === 0 && isProfileWorkflowIntent(trimmed)) {
    const built = buildProfileFillFromMessage(trimmed, current);
    Object.assign(proposal, built);
    if (built.bio) notes.push("bio");
    if (built.region) notes.push(`region ${built.region}`);
    if (built.username) notes.push(`username @${built.username}`);
  }

  if (Object.keys(proposal).length === 0) {
    if (onProfile && trimmed.length > 2 && !isExplicitNavigationRequest(trimmed)) {
      return {
        handled: true,
        reply:
          "I can update your **username, bio, region, or social links**. Example: \"I'm in Auckland\" or \"Bio: friendly NZ seller\".",
        clarify: true,
        intent: "profile_update",
      };
    }
    return { handled: false };
  }

  const sanitized = sanitizeProfileFillProposal(proposal);
  if (!sanitized.ok) {
    return {
      handled: true,
      reply: sanitized.error,
      clarify: true,
      intent: "profile_blocked",
      rejectedFields: sanitized.rejected,
    };
  }

  // Meaningful change confirmation for bio/username when replacing existing
  const meaningfulConfirm =
    (sanitized.fill.bio && current.bio && sanitized.fill.bio !== current.bio && sanitized.fill.bio.length > 40) ||
    (sanitized.fill.username && current.username && sanitized.fill.username !== current.username);

  const merged = mergeProfileFill(current, sanitized.fill);
  rememberProfileDraft(sessionKey, sanitized.fill);

  const changeNote =
    notes.length > 0
      ? `Updated your profile draft: **${notes.join("**, **")}**.`
      : "Updated your profile draft.";

  const confirmNote = meaningfulConfirm
    ? " Check it below — tap **Save** to keep the change."
    : " Check the fields below — tap **Save** when you're happy.";

  return finishProfile(`${changeNote}${confirmNote}`, merged, sanitized.rejected);
}

function finishProfile(
  reply: string,
  profileFill: SkyAiProfileFill,
  rejected: string[] = []
): ProfileToolResult {
  // Represent as updateProfile for the first changed scalar field (tool registry contract)
  const firstField = PROFILE_EDITABLE_FIELDS.find((f) => {
    const v = profileFill[f];
    return typeof v === "string" && v.trim().length > 0;
  });
  let toolCall: AwhinaToolCall | undefined;
  if (firstField) {
    const value = String(profileFill[firstField]);
    const check = validateUpdateProfileToolArgs(firstField, value);
    if (check.ok) {
      const tc: AwhinaToolCall = {
        tool: "updateProfile",
        args: { updateProfile: { field: check.field, value: check.value } },
        confidence: 0.9,
      };
      const validated = validateToolCall(tc);
      if (validated.ok) toolCall = tc;
    }
  }
  return {
    handled: true,
    reply,
    profileFill,
    intent: "profile_update",
    toolCall,
    rejectedFields: rejected.length ? rejected : undefined,
  };
}
