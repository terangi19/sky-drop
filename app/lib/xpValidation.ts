import { collection, deleteDoc, doc, getDoc, getDocs, increment, query, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";
import { db } from "./firebase";
import { awardXP } from "./xp";

const VALIDATION_HOURS = 12;
const MIN_VIEWS = 5;
const MIN_ENGAGEMENT_EVENTS = 1;
const DELETE_THRESHOLD = 3;
const DELETE_WINDOW_HOURS = 24;
const DUPLICATE_WINDOW_DAYS = 7;
const PENDING_LISTING_XP = 30;

interface PendingXP {
  amount: number;
  source: "listing" | "challenge";
  sourceId: string;
  listingId?: string;
  createdAt: Timestamp;
  validated: boolean;
  awarded: boolean;
  cancelled: boolean;
  engagementViewed: boolean;
  engagementMessaged: boolean;
  engagementWatchlisted: boolean;
}

export async function createPendingXP(
  userId: string,
  source: "listing" | "challenge",
  sourceId: string,
  listingId?: string,
  amount: number = PENDING_LISTING_XP
): Promise<void> {
  if (!userId) return;
  const ref = doc(collection(db, "users", userId, "pendingXp"));
  await setDoc(ref, {
    amount,
    source,
    sourceId,
    listingId: listingId || null,
    createdAt: serverTimestamp(),
    validated: false,
    awarded: false,
    cancelled: false,
    engagementViewed: false,
    engagementMessaged: false,
    engagementWatchlisted: false,
  });
}

export async function trackEngagement(
  userId: string,
  listingId: string,
  type: "view" | "message" | "watchlist"
): Promise<void> {
  const q = query(
    collection(db, "users", userId, "pendingXp"),
    where("listingId", "==", listingId),
    where("cancelled", "==", false),
    where("awarded", "==", false)
  );
  const snap = await getDocs(q);
  if (snap.empty) return;

  const field =
    type === "view" ? "engagementViewed" :
    type === "message" ? "engagementMessaged" : "engagementWatchlisted";

  for (const d of snap.docs) {
    await updateDoc(doc(db, "users", userId, "pendingXp", d.id), { [field]: true });
  }
}

export async function validatePendingXP(userId: string): Promise<void> {
  const q = query(
    collection(db, "users", userId, "pendingXp"),
    where("validated", "==", false),
    where("awarded", "==", false),
    where("cancelled", "==", false)
  );
  const snap = await getDocs(q);
  if (snap.empty) return;

  const now = Date.now();

  for (const d of snap.docs) {
    const data = d.data() as PendingXP;
    const createdAt = data.createdAt?.toMillis?.();
    if (!createdAt) continue;

    const ageHours = (now - createdAt) / 3600000;

    if (data.source === "listing") {
      if (ageHours < VALIDATION_HOURS) continue;
      if (!data.engagementViewed && !data.engagementMessaged && !data.engagementWatchlisted) continue;

      const listingSnap = await getDoc(doc(db, "listings", data.listingId || data.sourceId));
      if (!listingSnap.exists()) {
        await updateDoc(d.ref, { cancelled: true });
        continue;
      }

      const listing = listingSnap.data();
      const views = listing.views || 0;
      if (views < MIN_VIEWS && !data.engagementMessaged && !data.engagementWatchlisted) continue;
    }

    await finalizeXP(userId, d.id, data.amount);
  }
}

async function finalizeXP(userId: string, pendingId: string, amount: number): Promise<void> {
  await runTransaction(db, async (tx) => {
    const pendingRef = doc(db, "users", userId, "pendingXp", pendingId);
    const pendingSnap = await tx.get(pendingRef);
    if (!pendingSnap.exists() || pendingSnap.data().awarded || pendingSnap.data().cancelled) return;

    tx.update(pendingRef, { validated: true, awarded: true });
    tx.update(doc(db, "profiles", userId), { xp: increment(amount) });
  });
}

export async function cancelPendingXPByListing(userId: string, listingId: string): Promise<void> {
  const q = query(
    collection(db, "users", userId, "pendingXp"),
    where("listingId", "==", listingId),
    where("awarded", "==", false),
    where("cancelled", "==", false)
  );
  const snap = await getDocs(q);
  if (snap.empty) return;

  for (const d of snap.docs) {
    await updateDoc(d.ref, { cancelled: true });
  }
}

interface AntiSpamRecord {
  listingCreations: number;
  listingDeletions: number;
  windowStart: Timestamp;
  cooldownUntil: Timestamp | null;
  recentTitles: string[];
}

const SPAM_REF = (uid: string) => doc(db, "users", uid, "spam", "tracking");

export async function checkSpamCooldown(userId: string): Promise<boolean> {
  const snap = await getDoc(SPAM_REF(userId));
  if (!snap.exists()) return false;
  const data = snap.data() as AntiSpamRecord;
  if (!data.cooldownUntil) return false;
  return data.cooldownUntil.toMillis() > Date.now();
}

export async function trackListingCreated(userId: string, title: string): Promise<boolean> {
  const ref = SPAM_REF(userId);
  const snap = await getDoc(ref);
  const now = Date.now();
  const windowMs = DELETE_WINDOW_HOURS * 3600000;

  let data: AntiSpamRecord;
  if (snap.exists()) {
    data = snap.data() as AntiSpamRecord;
    const windowStart = data.windowStart?.toMillis?.() || now;
    if (now - windowStart > windowMs) {
      data = { listingCreations: 1, listingDeletions: 0, windowStart: Timestamp.fromMillis(now), cooldownUntil: null, recentTitles: [title] };
    } else {
      data.listingCreations = (data.listingCreations || 0) + 1;
      data.recentTitles = [...(data.recentTitles || []).slice(-9), title];
    }
  } else {
    data = { listingCreations: 1, listingDeletions: 0, windowStart: Timestamp.fromMillis(now), cooldownUntil: null, recentTitles: [title] };
  }

  await setDoc(ref, data);
  return true;
}

export async function trackListingDeleted(userId: string, title: string): Promise<boolean> {
  const ref = SPAM_REF(userId);
  const snap = await getDoc(ref);
  const now = Date.now();
  const windowMs = DELETE_WINDOW_HOURS * 3600000;

  let data: AntiSpamRecord;
  if (snap.exists()) {
    data = snap.data() as AntiSpamRecord;
    const windowStart = data.windowStart?.toMillis?.() || now;
    if (now - windowStart > windowMs) {
      data = { listingCreations: 0, listingDeletions: 1, windowStart: Timestamp.fromMillis(now), cooldownUntil: null, recentTitles: [title] };
    } else {
      data.listingDeletions = (data.listingDeletions || 0) + 1;
    }
  } else {
    data = { listingCreations: 0, listingDeletions: 1, windowStart: Timestamp.fromMillis(now), cooldownUntil: null, recentTitles: [title] };
  }

  const isDuplicate = (data.recentTitles || []).filter((t) => t.toLowerCase().includes(title.toLowerCase()) || title.toLowerCase().includes(t.toLowerCase())).length > 1;
  const isAbusive = data.listingDeletions >= DELETE_THRESHOLD || isDuplicate;

  if (isAbusive) {
    data.cooldownUntil = Timestamp.fromMillis(now + 86400000);
    await cancelAllPendingXP(userId);
  }

  await setDoc(ref, data);
  return isAbusive;
}

async function cancelAllPendingXP(userId: string): Promise<void> {
  const q = query(
    collection(db, "users", userId, "pendingXp"),
    where("awarded", "==", false),
    where("cancelled", "==", false)
  );
  const snap = await getDocs(q);
  for (const d of snap.docs) {
    await updateDoc(d.ref, { cancelled: true });
  }
}

export function getValidationStatus(pending: PendingXP | null): {
  label: string;
  color: string;
  icon: string;
  progress: number;
} {
  if (!pending || pending.cancelled) {
    return { label: "Not available", color: "text-zinc-600", icon: "⛔", progress: 0 };
  }
  if (pending.awarded) {
    return { label: "Awarded", color: "text-emerald-400", icon: "✅", progress: 100 };
  }

  const createdAt = pending.createdAt?.toMillis?.();
  if (!createdAt) return { label: "Pending...", color: "text-amber-400", icon: "⏳", progress: 10 };

  const ageHours = (Date.now() - createdAt) / 3600000;
  const timeProgress = Math.min((ageHours / VALIDATION_HOURS) * 100, 100);
  const engProgress = [
    pending.engagementViewed,
    pending.engagementMessaged,
    pending.engagementWatchlisted,
  ].filter(Boolean).length;
  const totalEng = (engProgress / 3) * 100;

  const overall = Math.round(Math.min(timeProgress * 0.6 + totalEng * 0.4, 99));

  return { label: `${overall}% validating`, color: "text-sky-400", icon: "⏳", progress: overall };
}

export async function sellerReleaseBadge(userId: string, badge: string, purchaseId: string): Promise<void> {
  const profileRef = doc(db, "profiles", userId);
  const purchaseRef = doc(db, "purchases", purchaseId);

  await runTransaction(db, async (tx) => {
    const profileSnap = await tx.get(profileRef);
    if (!profileSnap.exists()) throw new Error("Profile not found");

    const badges: string[] = profileSnap.data().badges || [];
    if (!badges.includes(badge)) throw new Error("You don't own this badge");

    tx.update(profileRef, {
      badges: badges.filter((b) => b !== badge),
      profileBadge: profileSnap.data().profileBadge === badge ? "" : profileSnap.data().profileBadge,
    });

    tx.update(purchaseRef, { status: "shipped", shippedAt: serverTimestamp() });
  });
}

export async function buyerClaimBadge(userId: string, badge: string, purchaseId: string): Promise<void> {
  const profileRef = doc(db, "profiles", userId);
  const purchaseRef = doc(db, "purchases", purchaseId);

  await runTransaction(db, async (tx) => {
    const profileSnap = await tx.get(profileRef);
    if (!profileSnap.exists()) throw new Error("Profile not found");

    tx.update(profileRef, {
      badges: [...(profileSnap.data().badges || []), badge],
      profileBadge: badge,
    });

    tx.update(purchaseRef, { status: "delivered", deliveredAt: serverTimestamp() });
  });
}

export async function autoTransferBadge(sellerUid: string, buyerUid: string, badge: string, purchaseId: string): Promise<void> {
  const sellerRef = doc(db, "profiles", sellerUid);
  const buyerRef = doc(db, "profiles", buyerUid);
  const purchaseRef = doc(db, "purchases", purchaseId);

  const sellerSnap = await getDoc(sellerRef);
  if (!sellerSnap.exists()) throw new Error("Seller profile not found");

  const badges: string[] = sellerSnap.data().badges || [];
  if (!badges.includes(badge)) throw new Error("Seller doesn't own this badge");

  await updateDoc(sellerRef, {
    badges: badges.filter((b) => b !== badge),
    profileBadge: sellerSnap.data().profileBadge === badge ? "" : sellerSnap.data().profileBadge,
  });

  const buyerSnap = await getDoc(buyerRef);
  if (!buyerSnap.exists()) throw new Error("Buyer profile not found");

  await updateDoc(buyerRef, {
    badges: [...(buyerSnap.data().badges || []), badge],
    profileBadge: badge,
  });

  await updateDoc(purchaseRef, {
    status: "delivered",
    deliveredAt: serverTimestamp(),
  });
}

export async function getBadgeTransferStatus(purchaseId: string): Promise<{ sellerReleased: boolean; buyerClaimed: boolean }> {
  const snap = await getDoc(doc(db, "purchases", purchaseId));
  if (!snap.exists()) return { sellerReleased: false, buyerClaimed: false };
  const data = snap.data();
  return {
    sellerReleased: data.status === "shipped" || data.status === "delivered",
    buyerClaimed: data.status === "delivered",
  };
}
