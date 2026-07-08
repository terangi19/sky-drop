import type { SkyAiListingFill } from "./sky-ai-listing-fill";

export type VoiceFormCommand =
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
      requiresConfirmation: true;
      confirmationHint: string;
      confirmedStatus: string;
    }
  | {
      type: "cancel";
      status: string;
      heard: string;
      targetTitle?: string;
    };

const CORRECTION_PREFIX_RE =
  /^(?:uh|um|hmm|okay|ok|please|actually|wait|sorry|no[, ]+i meant|no[, ]+make that|i meant|change that to)\s+/i;
const CANCEL_RE = /\b(cancel|never mind|nevermind|forget it|scratch that|stop that)\b/i;
const PUBLISH_RE = /\b(publish|post it|list it now|submit listing|go live)\b/i;

function cleanTranscript(text: string): string {
  let next = text.trim();
  while (CORRECTION_PREFIX_RE.test(next)) {
    next = next.replace(CORRECTION_PREFIX_RE, "").trim();
  }
  return next.replace(/\s+/g, " ").trim();
}

function parseMoney(raw: string): string | undefined {
  const trimmed = raw.trim().toLowerCase().replace(/,/g, "");
  const match = trimmed.match(/(\d+(?:\.\d+)?)/);
  if (!match) return undefined;
  let amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  if (/\b(k|grand)\b/.test(trimmed)) amount *= 1000;
  return String(Math.round(amount));
}

function sentenceCase(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

export function resolveVoiceFormCommand(text: string): VoiceFormCommand | null {
  const heard = text.trim();
  const cleaned = cleanTranscript(text);
  if (!cleaned) return null;

  if (CANCEL_RE.test(cleaned)) {
    return {
      type: "cancel",
      heard,
      status: "Cancelled",
      targetTitle: "voice action",
    };
  }

  if (PUBLISH_RE.test(cleaned)) {
    return {
      type: "publish",
      heard,
      status: "Ready to publish",
      targetTitle: "publish listing",
      requiresConfirmation: true,
      confirmationHint: 'Publish this listing? Say "Yes" to confirm.',
      confirmedStatus: "Publishing listing",
    };
  }

  const titleMatch = cleaned.match(/(?:change|set|update|make)\s+(?:the\s+)?title(?:\s+to)?\s+(.+)$/i);
  if (titleMatch?.[1]) {
    return {
      type: "apply_fill",
      heard,
      status: "Title updated",
      targetTitle: "title",
      fill: { title: sentenceCase(titleMatch[1]) },
    };
  }

  const priceMatch = cleaned.match(
    /(?:change|set|update|make)\s+(?:the\s+)?price(?:\s+to|\s+at)?\s+\$?\s*(.+)$/i
  );
  if (priceMatch?.[1]) {
    const amount = parseMoney(priceMatch[1]);
    if (amount) {
      return {
        type: "apply_fill",
        heard,
        status: "Price updated",
        targetTitle: "price",
        fill: { price: amount },
      };
    }
  }

  const conditionMatch = cleaned.match(
    /(?:change|set|update|make)\s+(?:the\s+)?condition(?:\s+to)?\s+(.+)$/i
  );
  if (conditionMatch?.[1]) {
    return {
      type: "apply_fill",
      heard,
      status: "Condition updated",
      targetTitle: "condition",
      fill: { condition: sentenceCase(conditionMatch[1]) },
    };
  }

  const locationMatch = cleaned.match(
    /(?:change|set|update|make)\s+(?:the\s+)?location(?:\s+to)?\s+(.+)$/i
  );
  if (locationMatch?.[1]) {
    return {
      type: "apply_fill",
      heard,
      status: "Location updated",
      targetTitle: "location",
      fill: { location: sentenceCase(locationMatch[1]) },
    };
  }

  const pickupAreaMatch = cleaned.match(
    /(?:pickup|pick up)(?:\s+only)?(?:\s+in|\s+from|\s+at)?\s+(.+)$/i
  );
  if (pickupAreaMatch?.[1] && /\bpickup|pick up\b/i.test(cleaned)) {
    return {
      type: "apply_fill",
      heard,
      status: "Pickup updated",
      targetTitle: "pickup",
      fill: {
        pickupAvailable: true,
        shippingAvailable: /\bshipping too|and shipping\b/i.test(cleaned) ? true : false,
        pickupArea: sentenceCase(pickupAreaMatch[1]),
        location: sentenceCase(pickupAreaMatch[1]),
      },
    };
  }

  if (/\bpickup only\b/i.test(cleaned)) {
    return {
      type: "apply_fill",
      heard,
      status: "Pickup only added",
      targetTitle: "delivery",
      fill: { pickupAvailable: true, shippingAvailable: false },
    };
  }

  if (/\bshipping only\b/i.test(cleaned)) {
    return {
      type: "apply_fill",
      heard,
      status: "Shipping only added",
      targetTitle: "delivery",
      fill: { pickupAvailable: false, shippingAvailable: true },
    };
  }

  if (/\bpickup and shipping\b|\bshipping and pickup\b/i.test(cleaned)) {
    return {
      type: "apply_fill",
      heard,
      status: "Delivery options updated",
      targetTitle: "delivery",
      fill: { pickupAvailable: true, shippingAvailable: true },
    };
  }

  const addDescriptionMatch = cleaned.match(
    /^(?:add|include|mention)(?:\s+that)?\s+(.+)$/i
  );
  if (addDescriptionMatch?.[1]) {
    return {
      type: "append_description",
      heard,
      status: "Description updated",
      targetTitle: "description",
      text: addDescriptionMatch[1].trim(),
    };
  }

  return null;
}
