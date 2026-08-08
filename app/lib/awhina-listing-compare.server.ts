/**
 * Server-side listing fact fetch for Āwhina compare — real fields only, never invent.
 * Fail-open: returns [] if Admin/Firestore unavailable.
 */

import { getAdminDb } from "./firebase-admin";
import type { ListingFacts } from "./awhina-product-ux";

function tsToMs(v: unknown): number | null {
  if (!v || typeof v !== "object") return null;
  const t = v as { toMillis?: () => number; seconds?: number };
  if (typeof t.toMillis === "function") {
    try {
      return t.toMillis();
    } catch {
      /* ignore */
    }
  }
  if (typeof t.seconds === "number") return t.seconds * 1000;
  return null;
}

function ageLabel(ms: number | null): string | null {
  if (!ms) return null;
  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return "listed today";
  if (days === 1) return "listed yesterday";
  if (days < 14) return `listed ${days} days ago`;
  if (days < 60) return `listed ${Math.floor(days / 7)} weeks ago`;
  return `listed ${Math.floor(days / 30)} months ago`;
}

function deliveryLabel(data: Record<string, unknown>): string | null {
  const bits: string[] = [];
  if (data.pickupAvailable === true || data.pickup === true || /pickup/i.test(String(data.deliveryOptions || ""))) {
    bits.push("pickup");
  }
  if (
    data.shippingAvailable === true ||
    data.shipping === true ||
    /ship|deliver|postage/i.test(String(data.deliveryOptions || ""))
  ) {
    bits.push("shipping");
  }
  if (!bits.length) return null;
  return bits.join(" + ");
}

function reputationLabel(data: Record<string, unknown>): string | null {
  const rating = data.sellerRating ?? data.rating ?? data.averageRating;
  const reviews = data.sellerReviewCount ?? data.reviewCount ?? data.reviewsCount;
  const r = typeof rating === "number" ? rating : Number(rating);
  const n = typeof reviews === "number" ? reviews : Number(reviews);
  if (!Number.isNaN(r) && r > 0 && !Number.isNaN(n) && n > 0) {
    return `${r.toFixed(1)}★ (${n} review${n === 1 ? "" : "s"})`;
  }
  if (!Number.isNaN(r) && r > 0) return `${r.toFixed(1)}★`;
  if (!Number.isNaN(n) && n > 0) return `${n} review${n === 1 ? "" : "s"}`;
  return null;
}

export function listingDocToFacts(id: string, data: Record<string, unknown>): ListingFacts {
  const createdAtMs = tsToMs(data.createdAt);
  const year = data.vehicleYear ?? data.year;
  const mileage = data.vehicleOdometer ?? data.odometer ?? data.mileage;
  return {
    id,
    title: typeof data.title === "string" ? data.title : undefined,
    price: data.price != null ? String(data.price) : null,
    year: year != null && String(year).trim() ? String(year) : null,
    make: data.vehicleMake != null ? String(data.vehicleMake) : data.make != null ? String(data.make) : null,
    model: data.vehicleModel != null ? String(data.vehicleModel) : data.model != null ? String(data.model) : null,
    mileage: mileage != null && String(mileage).trim() ? String(mileage) : null,
    condition: data.condition != null ? String(data.condition) : null,
    location: data.location != null ? String(data.location) : null,
    sellerReputation: reputationLabel(data),
    delivery: deliveryLabel(data),
    listingAge: ageLabel(createdAtMs),
    category: data.category != null ? String(data.category) : data.type != null ? String(data.type) : null,
    createdAtMs,
  };
}

function titleMatchScore(needle: string, hay: string): number {
  const a = needle.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  const b = hay.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (b.includes(a) || a.includes(b)) return 80;
  const aw = new Set(a.split(" ").filter((w) => w.length > 1));
  const bw = b.split(" ").filter((w) => w.length > 1);
  let hit = 0;
  for (const w of bw) if (aw.has(w)) hit++;
  if (!aw.size) return 0;
  return Math.round((hit / aw.size) * 60);
}

/**
 * Match compare titles against recent active listings. Never invents fields.
 */
export async function fetchListingFactsForCompare(
  titles: string[],
  opts?: { limitScan?: number }
): Promise<ListingFacts[]> {
  const needles = titles.map((t) => t.trim()).filter((t) => t.length >= 2).slice(0, 4);
  if (!needles.length) return [];

  try {
    const db = getAdminDb();
    const scan = opts?.limitScan ?? 80;
    let snap;
    try {
      snap = await db
        .collection("listings")
        .where("status", "==", "active")
        .orderBy("createdAt", "desc")
        .limit(scan)
        .get();
    } catch {
      snap = await db.collection("listings").orderBy("createdAt", "desc").limit(scan).get();
    }

    const docs = snap.docs.map((d) => ({
      id: d.id,
      data: d.data() as Record<string, unknown>,
      title: String((d.data() as { title?: string }).title || ""),
    }));

    const used = new Set<string>();
    const out: ListingFacts[] = [];
    for (const needle of needles) {
      let best: { id: string; data: Record<string, unknown>; score: number } | null = null;
      for (const doc of docs) {
        if (used.has(doc.id)) continue;
        const score = titleMatchScore(needle, doc.title);
        if (score < 40) continue;
        if (!best || score > best.score) best = { id: doc.id, data: doc.data, score };
      }
      if (best) {
        used.add(best.id);
        out.push(listingDocToFacts(best.id, best.data));
      } else {
        // Keep title-only stub so caller can still show "not listed" honestly
        out.push({ title: needle });
      }
    }
    return out;
  } catch (e) {
    console.warn("awhina compare fetch failed:", e);
    return needles.map((title) => ({ title }));
  }
}
