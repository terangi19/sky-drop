import type { ServiceDeliveryMethod, ServicePricingType } from "./service-types";

export type { ServicePricingType, ServiceDeliveryMethod };

export const SERVICE_PRICING_OPTIONS: {
  value: ServicePricingType;
  label: string;
  hint: string;
}[] = [
  {
    value: "fixed",
    label: "Fixed Price",
    hint: "One set price for the service",
  },
  {
    value: "starting_at",
    label: "Starting At",
    hint: "Show a minimum price — final quote may vary",
  },
  {
    value: "request_quote",
    label: "Request Quote",
    hint: "Custom scope — buyers request a formal quote",
  },
];

export function normalizeServicePricingType(
  raw?: string | null,
  price?: string | number | null
): ServicePricingType {
  if (raw === "fixed" || raw === "starting_at" || raw === "request_quote") return raw;
  if (raw === "starting_from") return "starting_at";
  if (price != null && String(price).trim() !== "") return "fixed";
  return "request_quote";
}

export function servicePriceRequired(pricingType: ServicePricingType): boolean {
  return pricingType === "fixed" || pricingType === "starting_at";
}

export function offersDisabledForService(pricingType?: string | null): boolean {
  return normalizeServicePricingType(pricingType, null) === "request_quote";
}

export function formatServicePriceDisplay(listing: {
  price?: string | number | null;
  servicePricingType?: string | null;
}): string {
  const type = normalizeServicePricingType(listing.servicePricingType, listing.price);
  const price =
    listing.price != null && String(listing.price).trim() !== "" ? String(listing.price) : "";

  if (type === "request_quote") return "Quote Required";
  if (!price) return type === "starting_at" ? "Price on request" : "Contact for price";
  if (type === "starting_at") return `Starting At — $${price}`;
  return `$${price}`;
}

export type ServicePricingBadge = {
  emoji: string;
  label: string;
  detail: string;
  tone: "emerald" | "sky" | "violet";
};

export function getServicePricingBadge(listing: {
  price?: string | number | null;
  servicePricingType?: string | null;
}): ServicePricingBadge {
  const type = normalizeServicePricingType(listing.servicePricingType, listing.price);
  const price =
    listing.price != null && String(listing.price).trim() !== "" ? String(listing.price) : "";

  if (type === "request_quote") {
    return { emoji: "🟣", label: "Quote Required", detail: "", tone: "violet" };
  }
  if (type === "starting_at") {
    return {
      emoji: "🔵",
      label: "Starting At",
      detail: price ? `— $${price}` : "",
      tone: "sky",
    };
  }
  return {
    emoji: "🟢",
    label: "Fixed Price",
    detail: price ? `— $${price}` : "",
    tone: "emerald",
  };
}

export function getServicePrimaryCta(
  pricingType?: string | null,
  price?: string | number | null
): string {
  const type = normalizeServicePricingType(pricingType, price);
  if (type === "fixed") return "Purchase Service";
  if (type === "starting_at") return "Discuss Project";
  return "Request Quote";
}

export type ServiceBuyerAction = "checkout" | "inquiry";

export function getServiceBuyerAction(
  pricingType?: string | null,
  price?: string | number | null,
  paymentType?: string | null
): ServiceBuyerAction {
  const type = normalizeServicePricingType(pricingType, price);
  if (
    type === "fixed" &&
    price != null &&
    String(price).trim() !== "" &&
    paymentType === "stripe"
  ) {
    return "checkout";
  }
  return "inquiry";
}

export function buildServiceInquiryCopy(
  title: string,
  pricingType?: string | null,
  price?: string | number | null
): { buyerMsg: string; sellerMsg: string; lastMessage: string } {
  const type = normalizeServicePricingType(pricingType, price);
  const lastMessage =
    type === "request_quote"
      ? "Quote request started"
      : type === "starting_at"
        ? "Project discussion started"
        : "Service inquiry started";

  const buyerIntro =
    type === "request_quote"
      ? `📋 Quote request started for "${title}"`
      : type === "starting_at"
        ? `💬 Project discussion started for "${title}"`
        : `🛠️ Service inquiry started for "${title}"`;

  const buyerMsg = `${buyerIntro}

You're now connected with the service provider.

Use this chat to discuss:
• project scope
• pricing
• delivery timeframe
• revisions
• requirements/files

Please keep all communication and payments inside Sky Drop for protection.

${type === "request_quote" ? "The seller will send you a **formal quote** here. Once you accept, you can pay securely through Sky Drop." : "Once you agree on scope and price, the seller can send a formal quote for you to accept and pay."}

Service Status: 🟢 Inquiry Active`;

  const sellerMsg =
    type === "request_quote"
      ? `🟢 A buyer requested a quote for your service.\n\nDiscuss requirements, then send a **formal quote** from this chat. After they accept, they can pay through Sky Drop.`
      : `🟢 A buyer wants to discuss your service.\n\nClarify requirements, then send a **formal quote** when ready. After they accept, they can pay through Sky Drop.`;

  return { buyerMsg, sellerMsg, lastMessage };
}
