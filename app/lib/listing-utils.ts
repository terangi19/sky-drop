/**
 * Shared utilities for listing pages to reduce code duplication
 */

export function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  if (diff < 60000) return "Just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return `${Math.floor(diff / 604800000)}w ago`;
}

export function formatPrice(price: string | number): string {
  if (typeof price === "number") {
    return `$${price.toFixed(2)}`;
  }
  return price;
}

export { getListingImage, pickListingImageUrl } from "./listing-image-url";

export function isListingExpired(expiresAt?: { toMillis?: () => number }): boolean {
  if (!expiresAt?.toMillis) return false;
  return expiresAt.toMillis() < Date.now();
}

export function isNewListing(createdAt?: { seconds?: number }): boolean {
  if (!createdAt?.seconds) return false;
  return Date.now() / 1000 - createdAt.seconds < 86400;
}
