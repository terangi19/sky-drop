import { doc, getDoc, increment, updateDoc } from "firebase/firestore";
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
    const snap = await getDoc(profileRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const today = new Date().toISOString().slice(0, 10);
    const lastDate = data.lastDailyXpDate || "";
    const dailyEarned = lastDate === today ? (data.dailyXpEarned || 0) : 0;

    if (dailyEarned >= 30) return;

    const clamped = Math.min(amount, 30 - dailyEarned);
    await updateDoc(profileRef, {
      xp: increment(clamped),
      dailyXpEarned: dailyEarned + clamped,
      lastDailyXpDate: today,
    });
    return;
  }

  await updateDoc(doc(db, "profiles", userId), {
    xp: increment(amount),
  });
}
