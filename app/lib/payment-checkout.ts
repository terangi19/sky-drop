const ALLOWED_CHECKOUT_COLLECTIONS = new Set(["listings", "tradePosts"]);

export function sanitizeCheckoutCollectionName(input: unknown): "listings" | "tradePosts" {
  const value = typeof input === "string" ? input.trim() : "";
  return value === "tradePosts" && ALLOWED_CHECKOUT_COLLECTIONS.has(value)
    ? "tradePosts"
    : "listings";
}

export function isReservationHeldByOtherBuyer(
  listing: { reservedAt?: { toMillis?: () => number } | string; reservedBy?: unknown },
  buyerUid: string,
  reservationMs: number,
  now = Date.now()
): boolean {
  const reservedBy = String(listing.reservedBy || "");
  if (!reservedBy || reservedBy === buyerUid) return false;

  const reservedAt = listing.reservedAt;
  let reservedAtMs: number | null = null;
  if (reservedAt && typeof reservedAt === "object" && typeof reservedAt.toMillis === "function") {
    reservedAtMs = reservedAt.toMillis();
  } else if (typeof reservedAt === "string") {
    const parsed = new Date(reservedAt).getTime();
    reservedAtMs = Number.isFinite(parsed) ? parsed : null;
  }

  if (reservedAtMs == null) return false;
  return now - reservedAtMs < reservationMs;
}

export function buildCheckoutSuccessUrl(
  origin: string,
  params: {
    listingId: string;
    purchaseId?: string;
    title?: string;
    price?: string;
    badgeForSale?: string;
    type?: string;
    digitalStoragePath?: string;
    digitalFileName?: string;
  }
): string {
  const url = new URL("/checkout/success", origin);
  url.searchParams.set("listingId", params.listingId);
  if (params.purchaseId) url.searchParams.set("purchaseId", params.purchaseId);
  if (params.title) url.searchParams.set("title", params.title);
  if (params.price) url.searchParams.set("price", params.price);
  if (params.badgeForSale) url.searchParams.set("badgeForSale", params.badgeForSale);
  if (params.type) url.searchParams.set("type", params.type);
  if (params.digitalStoragePath) {
    url.searchParams.set("digitalStoragePath", params.digitalStoragePath);
  }
  if (params.digitalFileName) {
    url.searchParams.set("digitalFileName", params.digitalFileName);
  }
  return url.toString();
}
