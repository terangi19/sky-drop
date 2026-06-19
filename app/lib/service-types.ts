/**
 * Service listing & quote data model.
 * Quotes currently live on `messages` (type: offer, offerType: quote).
 * `ServiceQuoteRecord` is the canonical shape for a future `service_quotes` collection.
 */

export type ServicePricingType = "fixed" | "hourly" | "request_quote";

export type ServiceDeliveryMethod = "online" | "in_person" | "both";

export type ServiceDurationPreset =
  | "1_day"
  | "3_days"
  | "1_week"
  | "2_weeks"
  | "1_month"
  | "custom";

export type ServiceQuoteStatus =
  | "draft"
  | "sent"
  | "accepted"
  | "declined"
  | "expired"
  | "paid";

/** Future-first quote record — maps to message + purchase today */
export type ServiceQuoteRecord = {
  id: string;
  listingId: string;
  conversationId: string;
  sellerEmail: string;
  buyerEmail: string;
  amount: number;
  currency: "NZD";
  status: ServiceQuoteStatus;
  /** Firestore messages doc when sent via chat */
  messageId?: string;
  purchaseId?: string;
  scopeSummary?: string;
  deliveryMethod?: ServiceDeliveryMethod;
  estimatedDelivery?: string;
  createdAt: string;
  sentAt?: string;
  acceptedAt?: string;
  paidAt?: string;
  expiresAt?: string;
};

export const SERVICE_DURATION_PRESETS: {
  value: ServiceDurationPreset;
  label: string;
}[] = [
  { value: "1_day", label: "1 Day" },
  { value: "3_days", label: "3 Days" },
  { value: "1_week", label: "1 Week" },
  { value: "2_weeks", label: "2 Weeks" },
  { value: "1_month", label: "1 Month" },
  { value: "custom", label: "Custom" },
];

export const SERVICE_DELIVERY_OPTIONS: {
  value: ServiceDeliveryMethod;
  label: string;
  hint: string;
}[] = [
  { value: "online", label: "Online", hint: "Web design, SEO, remote consulting" },
  { value: "in_person", label: "In Person", hint: "Lawn mowing, local trades" },
  { value: "both", label: "Both", hint: "Photography, hybrid services" },
];

export function deliveryMethodLabel(method?: string | null): string {
  if (method === "online") return "Online";
  if (method === "in_person") return "In Person";
  if (method === "both") return "Online & In Person";
  return "";
}

export function resolveServiceDuration(
  preset: ServiceDurationPreset | "",
  custom: string
): string {
  if (preset === "custom") return custom.trim().slice(0, 120);
  const match = SERVICE_DURATION_PRESETS.find((p) => p.value === preset);
  return match?.label || "";
}

export function inferDurationPreset(stored?: string | null): {
  preset: ServiceDurationPreset | "";
  custom: string;
} {
  if (!stored?.trim()) return { preset: "", custom: "" };
  const hit = SERVICE_DURATION_PRESETS.find(
    (p) => p.value !== "custom" && p.label.toLowerCase() === stored.trim().toLowerCase()
  );
  if (hit) return { preset: hit.value, custom: "" };
  return { preset: "custom", custom: stored.trim() };
}
