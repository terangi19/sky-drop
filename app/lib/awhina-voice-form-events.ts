import type { SkyAiListingFill } from "./sky-ai-listing-fill";

export const AWHINA_VOICE_FORM_ACTION_EVENT = "awhina-voice-form-action";

export type AwhinaVoiceFormAction =
  | {
      type: "apply_fill";
      fill: SkyAiListingFill;
      status: string;
      heard: string;
      targetTitle?: string;
    }
  | {
      type: "append_description";
      text: string;
      status: string;
      heard: string;
      targetTitle?: string;
    }
  | {
      type: "publish";
      status: string;
      heard: string;
      targetTitle?: string;
    };

export function dispatchAwhinaVoiceFormAction(action: AwhinaVoiceFormAction) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AwhinaVoiceFormAction>(AWHINA_VOICE_FORM_ACTION_EVENT, {
      detail: action,
    })
  );
}
