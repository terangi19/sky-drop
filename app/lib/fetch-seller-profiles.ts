import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { auth, db } from "./firebase";

/** Profile docs keyed by seller email. Uses public get-by-uid; email list queries only when signed in. */
export async function fetchSellerProfilesByListing(
  listings: { sellerEmail?: string; sellerId?: string }[]
): Promise<Map<string, Record<string, unknown>>> {
  const byEmail = new Map<string, Record<string, unknown>>();

  const uniqueIds = [
    ...new Set(listings.map((l) => l.sellerId).filter(Boolean)),
  ] as string[];

  await Promise.all(
    uniqueIds.map(async (uid) => {
      try {
        const snap = await getDoc(doc(db, "profiles", uid));
        if (!snap.exists()) return;
        const data = snap.data();
        const email = data.email as string | undefined;
        if (email) byEmail.set(email, data);
      } catch {
        /* public get may fail offline — skip */
      }
    })
  );

  const unresolved = new Set<string>();
  for (const listing of listings) {
    const email = listing.sellerEmail;
    if (email && !byEmail.has(email)) unresolved.add(email);
  }

  if (unresolved.size === 0 || !auth.currentUser) return byEmail;

  const emails = [...unresolved];
  for (let i = 0; i < emails.length; i += 10) {
    const chunk = emails.slice(i, i + 10);
    try {
      const snap = await getDocs(
        query(collection(db, "profiles"), where("email", "in", chunk), limit(10))
      );
      snap.docs.forEach((d) => {
        const data = d.data();
        const email = data.email as string | undefined;
        if (email) byEmail.set(email, data);
      });
    } catch {
      /* list requires auth — legacy listings without sellerId skip badges */
    }
  }

  return byEmail;
}
