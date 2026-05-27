"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "./lib/firebase";
import { Listing } from "../types/firestore";

export function useListings(sellerEmail?: string) {
  const [listings, setListings] = useState<Listing[]>([]);
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
        ...(doc.data() as Omit<Listing, "id">),
      })) as Listing[];
      if (!sellerEmail) {
        items.sort((a, b) => {
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
