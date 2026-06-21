export type SkyAiProfileFill = {
  username?: string;
  bio?: string;
  region?: string;
  discord?: string;
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  youtube?: string;
  website?: string;
  businessName?: string;
  favouriteCategories?: string[];
};

export const SKY_AI_PROFILE_FILL_TAG =
  /\[\[PROFILE_FILL\]\]\s*([\s\S]*?)\s*\[\[\/PROFILE_FILL\]\]/gi;

export const PENDING_PROFILE_FILL_KEY = "skyAiProfileFillPending";

const NZ_REGIONS = new Set([
  "Northland", "Auckland", "Waikato", "Bay of Plenty", "Gisborne",
  "Hawke's Bay", "Taranaki", "Manawatu", "Wellington", "Nelson",
  "Marlborough", "West Coast", "Canterbury", "Otago", "Southland",
]);

function pickString(raw: unknown, max = 500): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim();
  return s ? s.slice(0, max) : undefined;
}

function normalizeUsername(raw: string): string | undefined {
  const s = raw.replace(/^@/, "").trim().toLowerCase();
  if (!s || !/^[a-z0-9_]{3,30}$/.test(s)) return undefined;
  return s;
}

function normalizeRegion(raw: string): string | undefined {
  const s = raw.trim();
  const match = [...NZ_REGIONS].find((r) => r.toLowerCase() === s.toLowerCase());
  return match;
}

function normalizeSocial(raw: string, stripAt = false): string | undefined {
  let s = raw.trim();
  if (stripAt) s = s.replace(/^@/, "");
  return s ? s.slice(0, 80) : undefined;
}

export function normalizeSkyAiProfileFill(raw: Record<string, unknown>): SkyAiProfileFill {
  const out: SkyAiProfileFill = {};
  if (raw.username) {
    const u = normalizeUsername(String(raw.username));
    if (u) out.username = u;
  }
  const bio = pickString(raw.bio, 300);
  if (bio) out.bio = bio;
  if (raw.region) {
    const r = normalizeRegion(String(raw.region));
    if (r) out.region = r;
  }
  const discord = pickString(raw.discord, 60);
  if (discord) out.discord = discord;
  const instagram = raw.instagram ? normalizeSocial(String(raw.instagram), true) : undefined;
  if (instagram) out.instagram = instagram;
  const facebook = raw.facebook ? normalizeSocial(String(raw.facebook), true) : undefined;
  if (facebook) out.facebook = facebook;
  const tiktok = raw.tiktok ? normalizeSocial(String(raw.tiktok), true) : undefined;
  if (tiktok) out.tiktok = tiktok;
  const youtube = raw.youtube ? normalizeSocial(String(raw.youtube), true) : undefined;
  if (youtube) out.youtube = youtube;
  const website = pickString(raw.website, 200);
  if (website) out.website = website;
  const businessName = pickString(raw.businessName, 100);
  if (businessName) out.businessName = businessName;
  if (Array.isArray(raw.favouriteCategories)) {
    const cats = raw.favouriteCategories.map((c: any) => String(c).trim()).filter(Boolean);
    if (cats.length > 0) out.favouriteCategories = cats.slice(0, 10);
  }
  return out;
}

export function extractProfileFill(reply: string): SkyAiProfileFill | null {
  const re = new RegExp(SKY_AI_PROFILE_FILL_TAG.source, "i");
  const match = re.exec(reply);
  if (!match?.[1]) return null;
  try {
    const parsed = normalizeSkyAiProfileFill(JSON.parse(match[1].trim()));
    return Object.keys(parsed).length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export function hasProfileFillContent(fill: SkyAiProfileFill | null | undefined): boolean {
  if (!fill) return false;
  return Object.values(fill).some((v) => typeof v === "string" && v.trim().length > 0);
}

export function queueProfileFill(fill: SkyAiProfileFill) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(PENDING_PROFILE_FILL_KEY, JSON.stringify(fill));
  } catch {
    /* ignore */
  }
}

export function consumePendingProfileFill(): SkyAiProfileFill | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_PROFILE_FILL_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_PROFILE_FILL_KEY);
    const parsed = normalizeSkyAiProfileFill(JSON.parse(raw));
    return hasProfileFillContent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export const SKY_AI_PROFILE_FILL_EVENT = "sky-ai-profile-fill";

export type ProfileDraftChecklist = {
  username: boolean;
  region: boolean;
  bio: boolean;
  social: boolean;
};

export function profileDraftChecklist(draft: SkyAiProfileFill): ProfileDraftChecklist {
  return {
    username: !!draft.username?.trim(),
    region: !!draft.region?.trim(),
    bio: !!draft.bio?.trim(),
    social: !!(
      draft.discord?.trim() ||
      draft.instagram?.trim() ||
      draft.facebook?.trim() ||
      draft.tiktok?.trim() ||
      draft.youtube?.trim() ||
      draft.website?.trim()
    ),
  };
}

export function mergeProfileFill(
  current: SkyAiProfileFill,
  incoming: SkyAiProfileFill
): SkyAiProfileFill {
  return normalizeSkyAiProfileFill({ ...current, ...incoming });
}

export function dispatchProfileFill(fill: SkyAiProfileFill) {
  if (typeof window === "undefined") return;
  queueProfileFill(fill);
  window.dispatchEvent(
    new CustomEvent<SkyAiProfileFill>(SKY_AI_PROFILE_FILL_EVENT, { detail: fill })
  );
}
