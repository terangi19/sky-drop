"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { fetchSellerProfilesByListing } from "./fetch-seller-profiles";
import { isFullyVerifiedSeller } from "./seller-verified";

/** Seller review averages and profile badges for listing cards. */
export function useSellerListingMeta(
  listings: { sellerEmail?: string; sellerId?: string }[]
) {
  const [sellerReviewStats, setSellerReviewStats] = useState<
    Record<string, { avg: number; count: number }>
  >({});
  const [sellerBadges, setSellerBadges] = useState<Record<string, string>>({});
  const [sellerHandles, setSellerHandles] = useState<Record<string, string>>({});
  const [sellerFullyVerified, setSellerFullyVerified] = useState<Record<string, boolean>>({});
  const [sellerJoinedDate, setSellerJoinedDate] = useState<Record<string, string>>({});
  const [sellerListingCount, setSellerListingCount] = useState<Record<string, number>>({});

  useEffect(() => {
    if (listings.length === 0) return;
    let cancelled = false;

    (async () => {
      const uniqueEmails = [
        ...new Set(listings.map((l) => l.sellerEmail).filter(Boolean)),
      ] as string[];
      if (uniqueEmails.length === 0 || cancelled) return;

      const stats: Record<string, { avg: number; count: number }> = {};
      for (let i = 0; i < uniqueEmails.length; i += 10) {
        const chunk = uniqueEmails.slice(i, i + 10);
        try {
          const snap = await getDocs(
            query(collection(db, "reviews"), where("sellerEmail", "in", chunk))
          );
          if (cancelled) return;
          const grouped: Record<string, number[]> = {};
          snap.docs.forEach((d) => {
            const data = d.data();
            const email = data.sellerEmail as string;
            if (!grouped[email]) grouped[email] = [];
            grouped[email].push(data.rating || 0);
          });
          for (const email of chunk) {
            const ratings = grouped[email] || [];
            if (ratings.length > 0) {
              stats[email] = {
                avg: ratings.reduce((a, b) => a + b, 0) / ratings.length,
                count: ratings.length,
              };
            }
          }
        } catch (e) {
          console.error(e);
        }
      }
      if (!cancelled) setSellerReviewStats(stats);
    })();

    return () => {
      cancelled = true;
    };
  }, [listings]);

  useEffect(() => {
    if (listings.length === 0) return;
    let cancelled = false;

    (async () => {
      if (cancelled) return;

      const badges: Record<string, string> = {};
      const handles: Record<string, string> = {};
      const verifiedMap: Record<string, boolean> = {};
      const joinedDates: Record<string, string> = {};
      const listingCounts: Record<string, number> = {};

      try {
        const profiles = await fetchSellerProfilesByListing(listings);
        if (cancelled) return;
        profiles.forEach((data, email) => {
          if (data.profileBadge) badges[email] = data.profileBadge as string;
          if (data.username) handles[email] = data.username as string;
          if (isFullyVerifiedSeller(data)) verifiedMap[email] = true;
          if (data.createdAt) joinedDates[email] = data.createdAt as string;
        });
      } catch {
        /* badges are optional — skip on permission/offline errors */
      }

      // Calculate listing count per seller from the listings array
      const counts: Record<string, number> = {};
      listings.forEach((listing) => {
        const email = listing.sellerEmail;
        if (email) {
          counts[email] = (counts[email] || 0) + 1;
        }
      });

      if (!cancelled) setSellerBadges(badges);
      if (!cancelled) setSellerHandles(handles);
      if (!cancelled) setSellerFullyVerified(verifiedMap);
      if (!cancelled) setSellerJoinedDate(joinedDates);
      if (!cancelled) setSellerListingCount(counts);
    })();

    return () => {
      cancelled = true;
    };
  }, [listings]);

  return { sellerReviewStats, sellerBadges, sellerHandles, sellerFullyVerified, sellerJoinedDate, sellerListingCount };
}
