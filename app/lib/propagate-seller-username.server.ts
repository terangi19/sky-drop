import { getAdminDb } from "./firebase-admin";

/** Firestore batches accept 500 ops; stay under that. */
const CHUNK = 400;
/** One profile save must not scan or rewrite an unbounded set of docs. */
const CAP = 2000;

type DocRef = { id: string };

type DocSnap = {
  ref: DocRef;
};

type QuerySnap = {
  docs: DocSnap[];
  size: number;
};

type UsernameDb = {
  collection: (name: string) => {
    where: (
      field: string,
      op: string,
      value: string
    ) => {
      limit: (n: number) => { get: () => Promise<QuerySnap> };
    };
  };
  batch: () => {
    update: (ref: DocRef, data: { sellerUsername: string }) => void;
    commit: () => Promise<unknown>;
  };
};

export type SellerUsernamePropagation = {
  listings: number;
  tradePosts: number;
  capped: boolean;
};

/**
 * Copy a server-validated username onto the caller's listings and trade posts.
 * Selector matches the old client batch: sellerEmail equality. The email must
 * be the verified token email, never a request body value.
 */
export async function propagateSellerUsername(
  sellerEmail: string,
  username: string,
  db: UsernameDb = getAdminDb() as unknown as UsernameDb
): Promise<SellerUsernamePropagation> {
  const email = sellerEmail.trim();
  if (!email || !username) {
    return { listings: 0, tradePosts: 0, capped: false };
  }

  const listings = await loadOwned(db, "listings", email, CAP);
  const tradePosts = await loadOwned(db, "tradePosts", email, CAP - listings.length);
  const total = listings.length + tradePosts.length;
  const capped = total >= CAP;

  const docs = [...listings, ...tradePosts];
  for (let i = 0; i < docs.length; i += CHUNK) {
    const slice = docs.slice(i, i + CHUNK);
    const batch = db.batch();
    for (const doc of slice) {
      batch.update(doc.ref, { sellerUsername: username });
    }
    await batch.commit();
  }

  return { listings: listings.length, tradePosts: tradePosts.length, capped };
}

async function loadOwned(
  db: UsernameDb,
  collectionName: "listings" | "tradePosts",
  sellerEmail: string,
  max: number
): Promise<DocSnap[]> {
  if (max <= 0) return [];
  const snap = await db
    .collection(collectionName)
    .where("sellerEmail", "==", sellerEmail)
    .limit(max)
    .get();
  return snap.docs;
}
