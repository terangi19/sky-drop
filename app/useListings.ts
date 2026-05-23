import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "./lib/firebase";

export function useListings(sellerEmail?: string) {
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let constraints: any[] = [];
    if (sellerEmail) {
      constraints.push(where("sellerEmail", "==", sellerEmail));
    } else {
      constraints.push(orderBy("createdAt", "desc"));
    }

    const listingsQuery = query(collection(db, "listings"), ...constraints);

    const unsubscribe = onSnapshot(listingsQuery, (snapshot) => {
      const items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      if (!sellerEmail) {
        items.sort((a: any, b: any) => {
          const ta = a.createdAt?.toMillis?.() || 0;
          const tb = b.createdAt?.toMillis?.() || 0;
          return tb - ta;
        });
      }
      setListings(items);
      setLoading(false);
    }, (err) => {
      console.error("Listings snapshot error:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [sellerEmail]);

  return { listings, loading };
}
