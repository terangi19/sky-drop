import type { SkyAiProfileFill } from "./sky-ai-profile-fill";

const STORAGE_KEY = "skyAiProfileDraft";

export type SkyAiProfileContext = SkyAiProfileFill;

export function syncProfileDraftToSkyAi(draft: SkyAiProfileContext) {
  if (typeof window === "undefined") return;
  try {
    const hasData = Object.values(draft).some((v) => typeof v === "string" && v.trim());
    if (!hasData) {
      sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* ignore */
  }
}

export function readProfileDraftFromSkyAi(): SkyAiProfileContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SkyAiProfileContext;
  } catch {
    return null;
  }
}

export function formatProfileDraftPreview(ctx: SkyAiProfileContext): string {
  const lines: string[] = [];
  if (ctx.username) lines.push(`Username: @${ctx.username}`);
  if (ctx.bio) lines.push(`Bio: ${ctx.bio}`);
  if (ctx.region) lines.push(`Region: ${ctx.region}`);
  if (ctx.discord) lines.push(`Discord: ${ctx.discord}`);
  if (ctx.instagram) lines.push(`Instagram: @${ctx.instagram}`);
  if (ctx.tiktok) lines.push(`TikTok: @${ctx.tiktok}`);
  if (ctx.website) lines.push(`Website: ${ctx.website}`);
  return lines.length ? lines.join("\n") : "(empty)";
}
