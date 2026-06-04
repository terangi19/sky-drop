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
