import { doc, getDoc, increment, setDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

export interface ChallengeDef {
  id: string;
  label: string;
  target: number;
  reward: number;
  icon: string;
}

export interface ChallengeProgress extends ChallengeDef {
  progress: number;
  completed: boolean;
  claimed: boolean;
}

export interface DailyChallengesData {
  date: string;
  streak: number;
  lastClaimedDate: string;
  challenges: ChallengeProgress[];
}

const ALL_CHALLENGES: ChallengeDef[] = [
  { id: "view_listings", label: "Browse listings", target: 10, reward: 15, icon: "👀" },
  { id: "send_message", label: "Message a seller", target: 1, reward: 25, icon: "💬" },
  { id: "save_watchlist", label: "Save to watchlist", target: 3, reward: 15, icon: "⭐" },
  { id: "trade_post", label: "Make a trade post", target: 1, reward: 25, icon: "📢" },
  { id: "open_crate", label: "Open a Sky Crate", target: 1, reward: 20, icon: "🎰" },
  { id: "trade_reply", label: "Reply to trades", target: 2, reward: 20, icon: "💭" },
  { id: "create_listing", label: "List an item", target: 1, reward: 30, icon: "📋" },
  { id: "visit_profile", label: "Visit your profile", target: 1, reward: 10, icon: "👤" },
  { id: "boost_item", label: "Boost a listing", target: 1, reward: 25, icon: "📈" },
  { id: "earn_review", label: "Earn a review", target: 1, reward: 40, icon: "⭐" },
];

const CHALLENGES_PER_DAY = 4;

function seededShuffle<T>(arr: T[], seed: string): T[] {
  const copy = [...arr];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }
  const seeded = () => {
    hash = (hash * 16807) % 2147483647;
    return (hash - 1) / 2147483646;
  };
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(seeded() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function pickDailyChallenges(date: string, uid: string): ChallengeDef[] {
  const seed = `${date}-${uid.slice(0, 8)}`;
  return seededShuffle(ALL_CHALLENGES, seed).slice(0, CHALLENGES_PER_DAY);
}

export function getDailyRef(uid: string) {
  return doc(db, "users", uid, "challenges", "daily");
}

export async function getOrCreateDaily(uid: string, date: string): Promise<DailyChallengesData> {
  const ref = getDailyRef(uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data() as DailyChallengesData;
    const challenges = Array.isArray(data.challenges) ? data.challenges : [];

    if (data.date === date && challenges.length > 0) {
      return { ...data, challenges };
    }

    const allClaimed = challenges.length > 0 && challenges.every((c) => c.claimed);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.toISOString().slice(0, 10);
    const wasYesterday = data.date === yStr;
    const streak = allClaimed && wasYesterday ? (data.streak || 0) + 1 : allClaimed && !wasYesterday ? 1 : 0;
    const picked = pickDailyChallenges(date, uid);
    const newData: DailyChallengesData = {
      date,
      streak,
      lastClaimedDate: data.lastClaimedDate || "",
      challenges: picked.map((c) => ({ ...c, progress: 0, completed: false, claimed: false })),
    };
    await setDoc(ref, newData);
    return newData;
  }

  const picked = pickDailyChallenges(date, uid);
  const newData: DailyChallengesData = {
    date,
    streak: 0,
    lastClaimedDate: "",
    challenges: picked.map((c) => ({ ...c, progress: 0, completed: false, claimed: false })),
  };
  await setDoc(ref, newData);
  return newData;
}

export async function trackChallenge(uid: string, type: string): Promise<void> {
  try {
    if (!uid) return;
    const today = new Date().toISOString().slice(0, 10);
    const ref = getDailyRef(uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;

    const data = snap.data() as DailyChallengesData;
    if (!data || !Array.isArray(data.challenges) || data.date !== today) return;

    const idx = data.challenges.findIndex((c) => c.id === type && !c.completed);
    if (idx === -1) return;

    const challenge = data.challenges[idx];
    const newProgress = Math.min(challenge.progress + 1, challenge.target);
    const isComplete = newProgress >= challenge.target;

    await updateDoc(ref, {
      [`challenges.${idx}.progress`]: newProgress,
      [`challenges.${idx}.completed`]: isComplete,
    });
  } catch (e) {
    console.error("trackChallenge error:", e);
  }
}

export const STREAK_REWARDS: Record<number, { label: string; icon: string }> = {
  3: { label: "50 XP bonus", icon: "🔥" },
  7: { label: "1 Drop Token", icon: "🎁" },
  14: { label: "Rare crate pull", icon: "💎" },
  30: { label: "Epic crate pull", icon: "🌟" },
};
