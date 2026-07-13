import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "./firebase";

export type ProfileReview = {
  id: string;
  rating: number;
  comment?: string;
  reviewText?: string;
  reviewerUsername?: string;
  buyerName?: string;
  role?: string;
  createdAt?: { toMillis?: () => number; seconds?: number };
};

function reviewTime(r: ProfileReview): number {
  if (r.createdAt?.toMillis) return r.createdAt.toMillis();
  if (typeof r.createdAt?.seconds === "number") return r.createdAt.seconds * 1000;
  return 0;
}

/** Reviews received by a user (new revieweeId docs + legacy sellerEmail buyer reviews). */
export async function loadReviewsForUser(
  uid: string,
  email?: string
): Promise<ProfileReview[]> {
  const byId = new Map<string, ProfileReview>();

  if (uid) {
    const snap = await getDocs(
      query(collection(db, "reviews"), where("revieweeId", "==", uid), limit(50))
    );
    snap.docs.forEach((d) => {
      byId.set(d.id, { id: d.id, ...(d.data() as Omit<ProfileReview, "id">) });
    });
  }

  if (email) {
    const legacy = await getDocs(
      query(collection(db, "reviews"), where("sellerEmail", "==", email), limit(50))
    );
    legacy.docs.forEach((d) => {
      if (!byId.has(d.id)) {
        byId.set(d.id, { id: d.id, ...(d.data() as Omit<ProfileReview, "id">) });
      }
    });
  }

  return [...byId.values()].sort((a, b) => reviewTime(b) - reviewTime(a));
}

export function averageFromReviews(reviews: ProfileReview[]): number {
  if (reviews.length === 0) return 0;
  return reviews.reduce((sum, r) => sum + (r.rating || 0), 0) / reviews.length;
}

export function reviewerDisplayName(r: ProfileReview): string {
  return r.reviewerUsername || r.buyerName || "Member";
}

export function reviewComment(r: ProfileReview): string {
  return (r.comment || r.reviewText || "").trim();
}
