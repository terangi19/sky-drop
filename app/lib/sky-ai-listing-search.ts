export type SkyAiSearchResultCard = {
  id: string;
  title: string;
  price: string;
  image?: string;
  imageUrl?: string;
  condition?: string;
  description?: string;
  location?: string;
  createdAt?: { seconds: number };
};

export function detectListingSearchIntent(msg: string): string | null {
  const m = msg.match(/\b(find|search|show|looking for|browse)\s+(.+)/i);
  return m?.[2]?.trim() || null;
}

export function guessSearchType(query: string): string {
  if (/\b(vehicle|car|truck|bike|motorcycle|boat)\b/i.test(query)) return "vehicles";
  if (/\b(service|freelance|consult|design|develop|repair)\b/i.test(query)) return "services";
  if (/\b(rent|hire|lease)\b/i.test(query)) return "rentals";
  if (/\b(digital|ebook|software|template|download)\b/i.test(query)) return "digital";
  return "general";
}

export type SkyAiSearchMatch = Record<string, unknown> & { id: string; score: number; status?: string; soldAt?: { seconds: number }; acceptedOfferPrice?: number; vehicleMake?: string; vehicleModel?: string; vehicleYear?: string; vehicleOdometer?: string; type?: string; category?: string; title?: string; description?: string; price?: string | number; condition?: string; location?: string; image?: string }; 


export async function searchListings(query: string, type?: string, limit?: number): Promise<SkyAiSearchResultCard[]> {
  return [];
}
