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
    hint: "One set price — e.g. lawn mowing $50",
  },
  {
    value: "hourly",
    label: "Hourly Rate",
    hint: "Charge per hour — e.g. handyman $60/hr",
  },
  {
    value: "request_quote",
    label: "Quote Required",
    hint: "Custom jobs — buyers contact you for a quote",
  },
];

export function normalizeServicePricingType(
  raw?: string | null,
  price?: string | number | null,
  hintText?: string | null
): ServicePricingType {
  if (raw) {
    const lower = raw.trim().toLowerCase();
    if (lower === "fixed" || lower === "fixed price") return "fixed";
    if (
      lower === "hourly" ||
      lower === "hourly rate" ||
      lower === "per hour" ||
      lower === "starting_at" ||
      lower === "starting_from"
    ) {
      return "hourly";
    }
    if (
      lower === "quote" ||
      lower === "request_quote" ||
      lower === "quote required" ||
      lower === "contact for quote"
    ) {
      return "request_quote";
    }
  }

  const blob = (hintText || "").toLowerCase();
  if (
    /quote required|request a quote|contact.*quote|price varies|depends on the job|custom job|custom work|commercial cleaning|renovation|landscaping/i.test(
      blob
    )
  ) {
    return "request_quote";
  }
  if (
    /\$?\d+(\.\d+)?\s*(\/|\s*per\s*)h(?:ou)?r\b|\ban hour\b|\bper hour\b|\bhourly\b|\/hr\b|\/hour\b/i.test(
      blob
    )
  ) {
    return "hourly";
  }
  if (price != null && String(price).trim() !== "") return "fixed";
  return "request_quote";
}

export function servicePriceRequired(pricingType: ServicePricingType): boolean {
  return pricingType === "fixed" || pricingType === "hourly";
}

export function offersDisabledForService(pricingType?: string | null): boolean {
  return normalizeServicePricingType(pricingType, null) === "request_quote";
}

export function formatServicePriceDisplay(listing: {
  price?: string | number | null;
  servicePricingType?: string | null;
}): string {
  const type = normalizeServicePricingType(
    listing.servicePricingType,
    listing.price,
    listing.servicePricingType || ""
  );
  const price =
    listing.price != null && String(listing.price).trim() !== "" ? String(listing.price) : "";

  if (type === "request_quote") return "Contact for quote";
  if (type === "hourly") {
    return price ? `$${price} / hr` : "Hourly rate on request";
  }
  if (!price) return "Contact for price";
  return `$${price}`;
}

export type ServicePricingBadge = {
  emoji: string;
  label: string;
  detail: string;
  tone: "sky" | "sky" | "sky";
};

export function getServicePricingBadge(listing: {
  price?: string | number | null;
  servicePricingType?: string | null;
}): ServicePricingBadge {
  const type = normalizeServicePricingType(listing.servicePricingType, listing.price);
  const price =
    listing.price != null && String(listing.price).trim() !== "" ? String(listing.price) : "";

  if (type === "request_quote") {
    return { emoji: "🟣", label: "Quote Required", detail: "", tone: "sky" };
  }
  if (type === "hourly") {
    return {
      emoji: "🕐",
      label: "Hourly Rate",
      detail: price ? `— $${price}/hr` : "",
      tone: "sky",
    };
  }
  return {
    emoji: "🟢",
    label: "Fixed Price",
    detail: price ? `— $${price}` : "",
    tone: "sky",
  };
}

export function getServicePrimaryCta(
  pricingType?: string | null,
  price?: string | number | null
): string {
  const type = normalizeServicePricingType(pricingType, price);
  if (type === "request_quote") return "Request Quote";
  return "Message Provider";
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
      : type === "hourly"
        ? "Service inquiry started"
        : "Service inquiry started";

  const buyerIntro =
    type === "request_quote"
      ? `📋 Quote request started for "${title}"`
      : type === "hourly"
        ? `🕐 Hourly service inquiry started for "${title}"${price ? ` ($${price}/hr)` : ""}`
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
      : type === "hourly"
        ? `🟢 A buyer is interested in your hourly service${price ? ` ($${price}/hr)` : ""}.\n\nClarify hours, scope, and availability, then send a **formal quote** when ready.`
        : `🟢 A buyer wants to discuss your service.\n\nClarify requirements, then send a **formal quote** when ready. After they accept, they can pay through Sky Drop.`;

  return { buyerMsg, sellerMsg, lastMessage };
}
