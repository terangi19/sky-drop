export function timeAgo(seconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - seconds;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 604800)}w ago`;
}

export function getRecentlyViewed(): { id: string }[] {
  try {
    return JSON.parse(localStorage.getItem("recentlyViewed") || "[]");
  } catch {
    return [];
  }
}

export function saveRecentlyViewed(item: Record<string, unknown> & { id: string }) {
  const recent = getRecentlyViewed().filter((r) => r.id !== item.id);
  recent.unshift({
    id: item.id,
    title: item.title,
    price: item.price,
    images: item.images,
    imageUrl: item.imageUrl,
    image: item.image,
    type: item.type,
  } as { id: string });
  localStorage.setItem("recentlyViewed", JSON.stringify(recent.slice(0, 8)));
}

export function isInWatchlist(itemId: string): boolean {
  try {
    return JSON.parse(localStorage.getItem("watchlist") || "[]").some(
      (w: { id: string }) => w.id === itemId
    );
  } catch {
    return false;
  }
}
