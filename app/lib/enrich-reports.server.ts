import { getAdminDb } from "./firebase-admin";
import { serializeTimestamp } from "./admin-request";

export type EnrichedReport = Record<string, unknown> & {
  id: string;
  createdAtMs: number | null;
  reportedUsername?: string | null;
  reporterUsername?: string | null;
  reportedUserId?: string | null;
  listingTitle?: string | null;
  reportsAgainstUser?: number;
};

type ProfileInfo = { username?: string; uid: string; email?: string };

async function loadProfilesByEmail(emails: string[]): Promise<Map<string, ProfileInfo>> {
  const db = getAdminDb();
  const map = new Map<string, ProfileInfo>();
  const unique = [...new Set(emails.filter(Boolean).map((e) => e.toLowerCase()))];

  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30);
    const snap = await db.collection("profiles").where("email", "in", chunk).get();
    snap.docs.forEach((doc) => {
      const data = doc.data();
      const email = String(data.email || "").toLowerCase();
      if (email) {
        map.set(email, { username: data.username, uid: doc.id, email });
      }
    });
  }
  return map;
}

async function loadProfilesByUid(uids: string[]): Promise<Map<string, ProfileInfo>> {
  const db = getAdminDb();
  const map = new Map<string, ProfileInfo>();
  const unique = [...new Set(uids.filter(Boolean))];

  await Promise.all(
    unique.map(async (uid) => {
      const snap = await db.collection("profiles").doc(uid).get();
      if (!snap.exists) return;
      const data = snap.data()!;
      map.set(uid, {
        username: data.username,
        uid,
        email: data.email,
      });
    })
  );
  return map;
}

export async function enrichReports(
  docs: Array<{ id: string; data: FirebaseFirestore.DocumentData }>
): Promise<EnrichedReport[]> {
  if (docs.length === 0) return [];

  const db = getAdminDb();
  const emails: string[] = [];
  const uids: string[] = [];
  const listingIds = new Set<string>();

  for (const { data } of docs) {
    if (data.reportedUserEmail) emails.push(String(data.reportedUserEmail));
    if (data.reporterUserEmail) emails.push(String(data.reporterUserEmail));
    if (data.reportedUserId) uids.push(String(data.reportedUserId));
    if (data.reporterUserId) uids.push(String(data.reporterUserId));
    if (data.listingId) listingIds.add(String(data.listingId));
  }

  const [byEmail, byUid] = await Promise.all([
    loadProfilesByEmail(emails),
    loadProfilesByUid(uids),
  ]);

  const listingTitles = new Map<string, string>();
  await Promise.all(
    [...listingIds].map(async (id) => {
      const snap = await db.collection("listings").doc(id).get();
      if (snap.exists) listingTitles.set(id, String(snap.data()?.title || ""));
    })
  );

  const againstCounts = new Map<string, number>();
  for (const { data } of docs) {
    const email = String(data.reportedUserEmail || "").toLowerCase();
    if (!email) continue;
    againstCounts.set(email, (againstCounts.get(email) || 0) + 1);
  }

  const uniqueAgainst = [...new Set(docs.map((d) => String(d.data.reportedUserEmail || "").toLowerCase()).filter(Boolean))];
  const totalAgainst = new Map<string, number>();
  await Promise.all(
    uniqueAgainst.map(async (email) => {
      try {
        const snap = await db.collection("reports").where("reportedUserEmail", "==", email).count().get();
        totalAgainst.set(email, snap.data().count);
      } catch {
        totalAgainst.set(email, againstCounts.get(email) || 0);
      }
    })
  );

  return docs.map(({ id, data }) => {
    const reportedEmail = String(data.reportedUserEmail || "").toLowerCase();
    const reporterEmail = String(data.reporterUserEmail || "").toLowerCase();
    const reportedProfile =
      (data.reportedUserId && byUid.get(String(data.reportedUserId))) ||
      (reportedEmail && byEmail.get(reportedEmail));
    const reporterProfile =
      (data.reporterUserId && byUid.get(String(data.reporterUserId))) ||
      (reporterEmail && byEmail.get(reporterEmail));

    const listingId = data.listingId ? String(data.listingId) : "";

    return {
      id,
      ...data,
      createdAtMs: serializeTimestamp(data.createdAt),
      reportedUserId: data.reportedUserId || reportedProfile?.uid || null,
      reporterUserId: data.reporterUserId || reporterProfile?.uid || null,
      reportedUsername:
        data.reportedUsername ||
        reportedProfile?.username ||
        null,
      reporterUsername: data.reporterUsername || reporterProfile?.username || null,
      listingTitle: listingId ? listingTitles.get(listingId) || null : null,
      reportsAgainstUser: reportedEmail ? totalAgainst.get(reportedEmail) || 0 : 0,
    };
  });
}
