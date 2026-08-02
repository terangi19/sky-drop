/** Canonical listing checkout mode — only "stripe" enables Stripe; everything else is Arrange/contact. */

export type ListingPaymentType = "contact" | "stripe";

export function normalizePaymentType(raw: unknown): ListingPaymentType {
  return String(raw || "").trim().toLowerCase() === "stripe" ? "stripe" : "contact";
}

export function isStripePaymentType(raw: unknown): boolean {
  return normalizePaymentType(raw) === "stripe";
}

export function isContactPaymentType(raw: unknown): boolean {
  return normalizePaymentType(raw) === "contact";
}
