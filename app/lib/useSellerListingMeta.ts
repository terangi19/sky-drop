"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "./firebase";
import {
  fetchSellerProfilesByListing,
} from "./fetch-seller-profiles";
import { getListingOwnerId } from "./listing-owner";
import { isSafePublicHandle } from "./public-display";
import { isFullyVerifiedSeller } from "./seller-verified";
import { bumpDevRequestStat } from "./dev-request-instrumentation";

function safeUsername(value: unknown): string | null {
  return isSafePublicHandle(String(value || ""));
}

type ListingSellerInput = {
  sellerEmail?: string;
  sellerId?: string;
  userId?: string;
  ownerId?: string;
  sellerUid?: string;
  uid?: string;
};

/** Stable signature of unique sellers — listing refreshes with same sellers skip enrichment. */
function sellerIdentitySignature(listings: ListingSellerInput[]): string {
  const keys = new Set<string>();
  for (const listing of listings) {
    const ownerId = getListingOwnerId(listing);
    const email = String(listing.sellerEmail || "").trim().toLowerCase();
    if (ownerId) keys.add(`u:${ownerId}`);
    else if (email) keys.add(`e:${email}`);
  }
  return [...keys].sort().join("|");
}

/** Module-level review cache so homepage refresh does not re-query the same sellers. */
const REVIEW_CACHE_TTL_MS = 5 * 60_000;
const reviewStatsCache = new Map<
  string,
  { stats: { avg: number; count: number } | null; fetchedAt: number }
>();

function readFreshReview(email: string): { avg: number; count: number } | null | undefined {
  const entry = reviewStatsCache.get(email.toLowerCase());
  if (!entry) return undefined;
  if (Date.now() - entry.fetchedAt > REVIEW_CACHE_TTL_MS) {
    reviewStatsCache.delete(email.toLowerCase());
    return undefined;
  }
  return entry.stats;
}

function writeReviewCache(email: string, stats: { avg: number; count: number } | null) {
  reviewStatsCache.set(email.toLowerCase(), { stats, fetchedAt: Date.now() });
}

/** Seller review averages and public-profile identity for listing cards. */
export function useSellerListingMeta(
  listings: ListingSellerInput[]
) {
  const [sellerReviewStats, setSellerReviewStats] = useState<
    Record<string, { avg: number; count: number }>
  >({});
  const [sellerBadges, setSellerBadges] = useState<Record<string, string>>({});
  /** Live usernames keyed by owner UID + sellerEmail — canonical card / slug identity */
  const [sellerHandles, setSellerHandles] = useState<Record<string, string>>({});
  /** Live optional display names keyed by owner UID + sellerEmail — fallback when no username */
  const [sellerDisplayNames, setSellerDisplayNames] = useState<Record<string, string>>({});
  const [sellerAvatars, setSellerAvatars] = useState<Record<string, string>>({});
  const [sellerFullyVerified, setSellerFullyVerified] = useState<Record<string, boolean>>({});
  const [sellerJoinedDate, setSellerJoinedDate] = useState<Record<string, string>>({});
  const [sellerListingCount, setSellerListingCount] = useState<Record<string, number>>({});
  const [sellerMetaReady, setSellerMetaReady] = useState(false);

  const sellerSignature = useMemo(
    () => sellerIdentitySignature(listings),
    [listings]
  );
  const listingsRef = useRef(listings);
  listingsRef.current = listings;
  const lastSignatureRef = useRef<string>("");

  useEffect(() => {
    if (listings.length === 0) {
      setSellerMetaReady(true);
      return;
    }

    // Unchanged unique sellers → only refresh local listing counts, skip network
    if (sellerSignature && sellerSignature === lastSignatureRef.current) {
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
      setSellerListingCount(counts);
      setSellerMetaReady(true);
      return;
    }

    let cancelled = false;
    setSellerMetaReady(false);
    const snapshot = listingsRef.current;

    (async () => {
      const uniqueEmails = [
        ...new Set(snapshot.map((l) => l.sellerEmail).filter(Boolean)),
      ] as string[];

      const stats: Record<string, { avg: number; count: number }> = {};
      const emailsNeedingFetch = uniqueEmails.filter(
        (email) => readFreshReview(email) === undefined
      );

      for (const email of uniqueEmails) {
        const cached = readFreshReview(email);
        if (cached) stats[email] = cached;
      }

      const reviewChunkTasks: Array<Promise<void>> = [];
      for (let i = 0; i < emailsNeedingFetch.length; i += 10) {
        const chunk = emailsNeedingFetch.slice(i, i + 10);
        reviewChunkTasks.push(
          (async () => {
            try {
              bumpDevRequestStat("getDocs");
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
                  const entry = {
                    avg: ratings.reduce((a, b) => a + b, 0) / ratings.length,
                    count: ratings.length,
                  };
                  stats[email] = entry;
                  writeReviewCache(email, entry);
                } else {
                  writeReviewCache(email, null);
                }
              }
            } catch (e) {
              console.error(e);
            }
          })()
        );
      }
      if (reviewChunkTasks.length) await Promise.all(reviewChunkTasks);

      const badges: Record<string, string> = {};
      const handles: Record<string, string> = {};
      const displayNames: Record<string, string> = {};
      const avatars: Record<string, string> = {};
      const verifiedMap: Record<string, boolean> = {};
      const joinedDates: Record<string, string> = {};

      try {
        // Scales with unique sellers (batch + TTL cache inside fetchSellerProfilesByListing)
        const profiles = await fetchSellerProfilesByListing(snapshot);
        if (cancelled) return;

        const applyKeys = (keys: string[], data: Record<string, unknown>) => {
          const username = safeUsername(data.username);
          const displayName = safeUsername(
            String(data.displayName || data.name || "")
          );
          const photo = String(data.photoURL || "").trim();
          for (const key of keys) {
            if (!key) continue;
            if (data.profileBadge) badges[key] = data.profileBadge as string;
            if (username) handles[key] = username;
            if (displayName) displayNames[key] = displayName;
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

        const seen = new Set<string>();
        for (const listing of snapshot) {
          const ownerId = getListingOwnerId(listing);
          const email = String(listing.sellerEmail || "").trim();
          const profile =
            (ownerId && profiles.get(ownerId)) ||
            (email && profiles.get(email)) ||
            null;
          if (!profile) continue;
          const uid = String(profile.uid || ownerId || "").trim();
          if (uid && seen.has(uid)) {
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
      snapshot.forEach((listing) => {
        const ownerId = getListingOwnerId(listing);
        const email = listing.sellerEmail;
        const key = ownerId || email;
        if (key) counts[key] = (counts[key] || 0) + 1;
        if (ownerId && email && ownerId !== email) {
          counts[email] = counts[ownerId];
        }
      });

      if (!cancelled) {
        lastSignatureRef.current = sellerSignature;
        setSellerReviewStats(stats);
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
  }, [sellerSignature, listings.length]);

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
