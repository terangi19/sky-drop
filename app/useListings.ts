"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "./lib/firebase";
import { Listing } from "../types/firestore";
import { LISTINGS_POLL_MS, SEARCH_LISTINGS_LIMIT } from "./lib/firestore-query-limits";
import {
  BROWSE_SWR_TTL_MS,
  dedupeAsync,
  startVisibilityPolledFetch,
} from "./lib/polled-firestore";
import {
  assertAuthoritativeListingSnapshot,
  isListingSnapshotNotAuthoritative,
} from "./lib/marketplace-listing-count";

/** Marketplace search / browse needs services + rentals, not only the newest physicals. */
const GLOBAL_LISTINGS_LIMIT = SEARCH_LISTINGS_LIMIT;

export function useListings(sellerEmail?: string) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;

    const constraints: Array<ReturnType<typeof where> | ReturnType<typeof orderBy> | ReturnType<typeof limit>> = [];
    if (sellerEmail) {
      constraints.push(where("sellerEmail", "==", sellerEmail));
    }
    constraints.push(orderBy("createdAt", "desc"));
    constraints.push(limit(sellerEmail ? 100 : GLOBAL_LISTINGS_LIMIT));
    const listingsQuery = query(collection(db, "listings"), ...constraints);

    async function fetchListings() {
      if (!mounted) return;
      try {
        const items = await dedupeAsync(
          `search-listings:${sellerEmail || "all"}`,
          BROWSE_SWR_TTL_MS,
          async () => {
            const snapshot = await getDocs(listingsQuery);
            assertAuthoritativeListingSnapshot(snapshot);
            return snapshot.docs.map((docSnap) => ({
              id: docSnap.id,
              ...(docSnap.data() as Omit<Listing, "id">),
            })) as Listing[];
          }
        );
        if (!mounted) return;
        setListings(items);
        setError(false);
        setLoading(false);
      } catch (err) {
        if (isListingSnapshotNotAuthoritative(err)) {
          return;
        }
        console.error("Listings fetch error:", err);
        if (mounted) {
          setError(true);
          setLoading(false);
        }
      }
    }

    const stop = startVisibilityPolledFetch(fetchListings, LISTINGS_POLL_MS);
    return () => {
      mounted = false;
      stop();
    };
  }, [sellerEmail]);

  return { listings, loading, error };
}
