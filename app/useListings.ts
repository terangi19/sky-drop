"use client";

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { db } from "./lib/firebase";
import { Listing } from "../types/firestore";

export function useListings(sellerEmail?: string) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const constraints: Array<ReturnType<typeof where> | ReturnType<typeof orderBy> | ReturnType<typeof limit>> = [];
    if (sellerEmail) {
      constraints.push(where("sellerEmail", "==", sellerEmail));
    }
    constraints.push(orderBy("createdAt", "desc"));
    constraints.push(limit(sellerEmail ? 100 : 50));

    const listingsQuery = query(collection(db, "listings"), ...constraints);

    const unsubscribe = onSnapshot(listingsQuery, (snapshot) => {
      const items = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as Omit<Listing, "id">),
      })) as Listing[];
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
