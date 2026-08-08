export const SKY_AI_OPEN_EVENT = "sky-ai-open";
export const SKY_AI_COMPOSER_ACTIVE_EVENT = "sky-ai-composer-active";
/** Fired when homepage → /post/ai expand completes so workspace can auto-open. */
export const SKY_AI_WORKSPACE_HANDOFF_EVENT = "sky-ai-workspace-handoff";

export type SkyAiOpenDetail = {
  query?: string;
};

export type SkyAiWorkspaceHandoffDetail = {
  autoOpen?: boolean;
  autoContinue?: boolean;
};

export type SkyAiComposerActiveDetail = {
  active: boolean;
};

export function dispatchSkyAiComposerActive(active: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<SkyAiComposerActiveDetail>(SKY_AI_COMPOSER_ACTIVE_EVENT, {
      detail: { active },
    })
  );
}

export function dispatchSkyAiOpen(query?: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<SkyAiOpenDetail>(SKY_AI_OPEN_EVENT, {
      detail: query ? { query } : {},
    })
  );
}

export function dispatchWorkspaceHandoff(detail?: SkyAiWorkspaceHandoffDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<SkyAiWorkspaceHandoffDetail>(SKY_AI_WORKSPACE_HANDOFF_EVENT, {
      detail: detail || { autoOpen: true, autoContinue: true },
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
