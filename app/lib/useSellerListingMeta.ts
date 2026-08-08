"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import {
  fetchSellerProfilesByListing,
  sellerLabelFromPublicProfile,
} from "./fetch-seller-profiles";
import { getListingOwnerId } from "./listing-owner";
import { isFullyVerifiedSeller } from "./seller-verified";

function safeUsername(value: unknown): string | null {
  const raw = String(value || "").trim();
  if (!raw || raw.includes("@")) return null;
  if (/^[A-Za-z0-9_-]{16,}$/.test(raw) || /^uid[-_]/i.test(raw)) return null;
  return raw.startsWith("@") ? raw.slice(1) : raw;
}

/** Seller review averages and public-profile identity for listing cards. */
export function useSellerListingMeta(
  listings: {
    sellerEmail?: string;
    sellerId?: string;
    userId?: string;
    ownerId?: string;
    sellerUid?: string;
    uid?: string;
  }[]
) {
  const [sellerReviewStats, setSellerReviewStats] = useState<
    Record<string, { avg: number; count: number }>
  >({});
  const [sellerBadges, setSellerBadges] = useState<Record<string, string>>({});
  /** Live usernames keyed by owner UID + sellerEmail — used for profile slugs */
  const [sellerHandles, setSellerHandles] = useState<Record<string, string>>({});
  /** Live display names keyed by owner UID + sellerEmail — preferred card labels */
  const [sellerDisplayNames, setSellerDisplayNames] = useState<Record<string, string>>({});
  const [sellerAvatars, setSellerAvatars] = useState<Record<string, string>>({});
  const [sellerFullyVerified, setSellerFullyVerified] = useState<Record<string, boolean>>({});
  const [sellerJoinedDate, setSellerJoinedDate] = useState<Record<string, string>>({});
  const [sellerListingCount, setSellerListingCount] = useState<Record<string, number>>({});
  const [sellerMetaReady, setSellerMetaReady] = useState(false);

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
    if (listings.length === 0) {
      setSellerMetaReady(true);
      return;
    }
    let cancelled = false;
    setSellerMetaReady(false);

    (async () => {
      const badges: Record<string, string> = {};
      const handles: Record<string, string> = {};
      const displayNames: Record<string, string> = {};
      const avatars: Record<string, string> = {};
      const verifiedMap: Record<string, boolean> = {};
      const joinedDates: Record<string, string> = {};

      try {
        const profiles = await fetchSellerProfilesByListing(listings);
        if (cancelled) return;

        const applyKeys = (keys: string[], data: Record<string, unknown>) => {
          const username = safeUsername(data.username);
          const label = sellerLabelFromPublicProfile(data as any, "");
          const photo = String(data.photoURL || "").trim();
          for (const key of keys) {
            if (!key) continue;
            if (data.profileBadge) badges[key] = data.profileBadge as string;
            if (username) handles[key] = username;
            if (label) displayNames[key] = label;
            if (photo) avatars[key] = photo;
            if (isFullyVerifiedSeller(data)) verifiedMap[key] = true;
            if (data.createdAt || data.memberSince) {
              const val = (data.createdAt || data.memberSince) as any;
              if (typeof val?.toDate === "function") {
                joinedDates[key] = val.toDate().toISOString();
              } else if (typeof val === "string") {
                joinedDates[key] = val;
              } else if (val?.seconds != null) {
                joinedDates[key] = new Date(val.seconds * 1000).toISOString();
              }
            }
          }
        };

        // Deduplicate profile applications by UID while dual-keying email.
        const seen = new Set<string>();
        for (const listing of listings) {
          const ownerId = getListingOwnerId(listing);
          const email = String(listing.sellerEmail || "").trim();
          const profile =
            (ownerId && profiles.get(ownerId)) ||
            (email && profiles.get(email)) ||
            null;
          if (!profile) continue;
          const uid = String(profile.uid || ownerId || "").trim();
          if (uid && seen.has(uid)) {
            // Still dual-key email if this listing introduces it
            if (email && !handles[email] && !displayNames[email]) {
              applyKeys([email], profile);
            }
            continue;
          }
          if (uid) seen.add(uid);
          applyKeys([uid, email].filter(Boolean), profile);
        }
      } catch {
        /* identity is optional — skip on network errors */
      }

      const counts: Record<string, number> = {};
      listings.forEach((listing) => {
        const ownerId = getListingOwnerId(listing);
        const email = listing.sellerEmail;
        const key = ownerId || email;
        if (key) counts[key] = (counts[key] || 0) + 1;
        if (ownerId && email && ownerId !== email) {
          counts[email] = counts[ownerId];
        }
      });

      if (!cancelled) {
        setSellerBadges(badges);
        setSellerHandles(handles);
        setSellerDisplayNames(displayNames);
        setSellerAvatars(avatars);
        setSellerFullyVerified(verifiedMap);
        setSellerJoinedDate(joinedDates);
        setSellerListingCount(counts);
        setSellerMetaReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [listings]);

  return {
    sellerReviewStats,
    sellerBadges,
    sellerHandles,
    sellerDisplayNames,
    sellerAvatars,
    sellerFullyVerified,
    sellerJoinedDate,
    sellerListingCount,
    sellerMetaReady,
  };
}
