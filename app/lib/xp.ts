import { doc, runTransaction } from "firebase/firestore";
import { db } from "./firebase";

const XP_PER_LEVEL = 150;

export function getLevelInfo(totalXP: number): { level: number; progress: number; xpToNext: number } {
  const level = Math.floor(totalXP / XP_PER_LEVEL) + 1;
  const progress = totalXP % XP_PER_LEVEL;
  return { level, progress, xpToNext: XP_PER_LEVEL };
}

export async function awardXP(
  userId: string,
  amount: number,
  options?: { capped?: boolean }
): Promise<void> {
  if (!userId || amount <= 0) return;

  if (options?.capped) {
    const profileRef = doc(db, "profiles", userId);
    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(profileRef);
        if (!snap.exists()) return;

        const data = snap.data();
        const today = new Date().toISOString().slice(0, 10);
        const lastDate = data.lastDailyXpDate || "";
        const dailyEarned = lastDate === today ? (data.dailyXpEarned || 0) : 0;

        if (dailyEarned >= 30) return;

        const clamped = Math.min(amount, 30 - dailyEarned);
        transaction.update(profileRef, {
          xp: (data.xp || 0) + clamped,
          dailyXpEarned: dailyEarned + clamped,
          lastDailyXpDate: today,
        });
      });
    } catch (e) {
      console.error("XP award transaction failed:", e);
    }
    return;
  }

  const profileRef = doc(db, "profiles", userId);
  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(profileRef);
      if (!snap.exists()) return;
      transaction.update(profileRef, {
        xp: (snap.data().xp || 0) + amount,
      });
    });
  } catch (e) {
    console.error("XP award transaction failed:", e);
  }
}
