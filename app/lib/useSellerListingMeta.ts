"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";

/** Seller review averages and profile badges for listing cards. */
export function useSellerListingMeta(listings: { sellerEmail?: string }[]) {
  const [sellerReviewStats, setSellerReviewStats] = useState<
    Record<string, { avg: number; count: number }>
  >({});
  const [sellerBadges, setSellerBadges] = useState<Record<string, string>>({});
  const [sellerHandles, setSellerHandles] = useState<Record<string, string>>({});

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
      const uniqueEmails = [
        ...new Set(listings.map((l) => l.sellerEmail).filter(Boolean)),
      ] as string[];
      if (uniqueEmails.length === 0 || cancelled) return;

      const badges: Record<string, string> = {};
      const handles: Record<string, string> = {};
      for (let i = 0; i < uniqueEmails.length; i += 10) {
        const chunk = uniqueEmails.slice(i, i + 10);
        try {
          const snap = await getDocs(
            query(collection(db, "profiles"), where("email", "in", chunk))
          );
          if (cancelled) return;
          snap.docs.forEach((d) => {
            const data = d.data();
            const email = data.email as string;
            if (data.profileBadge) badges[email] = data.profileBadge as string;
            if (data.username) handles[email] = data.username as string;
          });
        } catch (e) {
          console.error("Badge fetch error:", e);
        }
      }
      if (!cancelled) setSellerBadges(badges);
      if (!cancelled) setSellerHandles(handles);
    })();

    return () => {
      cancelled = true;
    };
  }, [listings]);

  return { sellerReviewStats, sellerBadges, sellerHandles };
}
