/** Hide placeholder / dev listings from public marketplace UI */

export function isDemoListing(item: {
  title?: string;
  sellerEmail?: string;
}): boolean {
  const title = (item.title || "").trim();
  const lower = title.toLowerCase();
  if (!title) return false;
  if (/^test\s*\d*$/i.test(title)) return true;
  if (lower === "test" || lower.startsWith("test listing")) return true;
  if (lower.includes("placeholder") && lower.length < 24) return true;
  return false;
}
