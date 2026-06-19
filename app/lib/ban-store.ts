import { getAdminDb, isAdminInitialized } from "./firebase-admin";

const BLACKLIST_COLLECTION = "banStore";
const USED_IPS_COLLECTION = "usedIps";

function hashValue(val: string): string {
  let hash = 0;
  for (let i = 0; i < val.length; i++) {
    const char = val.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export function hashPhone(phone: string): string {
  return hashValue(phone.replace(/\D/g, ""));
}

export async function isPhoneBlacklisted(phone: string): Promise<boolean> {
  if (!isAdminInitialized()) return false;
  const db = getAdminDb();
  const hash = hashPhone(phone);
  const doc = await db.collection(BLACKLIST_COLLECTION).doc(`phone:${hash}`).get();
  return doc.exists;
}

export async function blacklistPhone(phone: string): Promise<void> {
  if (!isAdminInitialized()) return;
  const db = getAdminDb();
  const hash = hashPhone(phone);
  await db.collection(BLACKLIST_COLLECTION).doc(`phone:${hash}`).set({
    type: "phone",
    hash,
    createdAt: new Date(),
  });
}

export async function isIpUsedRecently(ip: string): Promise<boolean> {
  if (!isAdminInitialized()) return false;
  const db = getAdminDb();
  const hash = hashValue(ip);
  const doc = await db.collection(USED_IPS_COLLECTION).doc(hash).get();
  if (!doc.exists) return false;
  const data = doc.data();
  if (!data) return false;
  const createdAt = data.createdAt?.toDate?.() || new Date(data.createdAt);
  const daysSince = (Date.now() - createdAt.getTime()) / 86400000;
  return daysSince < 90;
}

export async function recordUsedIp(ip: string): Promise<void> {
  if (!isAdminInitialized()) return;
  const db = getAdminDb();
  const hash = hashValue(ip);
  await db.collection(USED_IPS_COLLECTION).doc(hash).set({
    ipHash: hash,
    createdAt: new Date(),
  }, { merge: true });
}


