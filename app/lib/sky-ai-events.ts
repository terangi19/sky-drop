export const SKY_AI_OPEN_EVENT = "sky-ai-open";

export type SkyAiOpenDetail = {
  query?: string;
};

export function dispatchSkyAiOpen(query?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<SkyAiOpenDetail>(SKY_AI_OPEN_EVENT, {
      detail: query ? { query } : {},
    })
  );
}

const VOICE_SELL_NAV_KEY = "awhina-voice-sell-nav";

/** Set before voice navigation to Sell — skips first-visit intro overlay. */
export function markVoiceSellNavigation() {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(VOICE_SELL_NAV_KEY, "1");
}

export function consumeVoiceSellNavigation(): boolean {
  if (typeof window === "undefined") return false;
  if (sessionStorage.getItem(VOICE_SELL_NAV_KEY) !== "1") return false;
  sessionStorage.removeItem(VOICE_SELL_NAV_KEY);
  return true;
}

export function isVoiceSellNavigationPending(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(VOICE_SELL_NAV_KEY) === "1";
}
