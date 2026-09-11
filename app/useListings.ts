"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "./lib/firebase";
import { Listing } from "../types/firestore";
import { LISTINGS_POLL_MS, SEARCH_LISTINGS_LIMIT } from "./lib/firestore-query-limits";

/** Marketplace search / browse needs services + rentals, not only the newest physicals. */
const GLOBAL_LISTINGS_LIMIT = SEARCH_LISTINGS_LIMIT;

export function useListings(sellerEmail?: string) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    let inFlight: Promise<void> | null = null;

    const constraints: Array<ReturnType<typeof where> | ReturnType<typeof orderBy> | ReturnType<typeof limit>> = [];
    if (sellerEmail) {
      constraints.push(where("sellerEmail", "==", sellerEmail));
    }
    constraints.push(orderBy("createdAt", "desc"));
    constraints.push(limit(sellerEmail ? 100 : GLOBAL_LISTINGS_LIMIT));
    const listingsQuery = query(collection(db, "listings"), ...constraints);

    async function fetchListings() {
      if (!mounted) return;
      if (inFlight) return inFlight;

      inFlight = (async () => {
        try {
          const snapshot = await getDocs(listingsQuery);
          if (!mounted) return;
          const items = snapshot.docs.map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as Omit<Listing, "id">),
          })) as Listing[];
          setListings(items);
          setError(false);
          setLoading(false);
        } catch (err) {
          console.error("Listings fetch error:", err);
          if (mounted) {
            setError(true);
            setLoading(false);
          }
        } finally {
          inFlight = null;
        }
      })();

      return inFlight;
    }

    fetchListings();
    const interval = setInterval(fetchListings, LISTINGS_POLL_MS);
    const onVisibility = () => {
      if (document.visibilityState === "visible") void fetchListings();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      mounted = false;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [sellerEmail]);

  return { listings, loading, error };
}
