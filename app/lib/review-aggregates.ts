import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "./firebase-admin";

/** Increment reviewCount and rolling averageRating on profiles/{revieweeId}. */
export async function incrementProfileReviewAggregates(
  revieweeId: string,
  rating: number
): Promise<void> {
  if (!revieweeId) return;
  const db = getAdminDb();
  const profileRef = db.collection("profiles").doc(revieweeId);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(profileRef);
    const data = snap.data() || {};
    const count = Number(data.reviewCount || 0);
    const avg = Number(data.averageRating || 0);
    const newCount = count + 1;
    const newAvg = (avg * count + rating) / newCount;
    tx.set(
      profileRef,
      {
        averageRating: Math.round(newAvg * 10) / 10,
        reviewCount: newCount,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  });
}
