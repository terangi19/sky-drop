# Firestore Query Limit & Pagination Audit

**Purpose:** Verify every Firestore query has appropriate limit and pagination
**Date:** June 22, 2026

---

## CRITICAL FINDINGS: Queries with NO LIMIT

### #1: Profile Page - Listings Query (CRITICAL BUG)
**File:** app/profile/page.tsx
**Line:** 509-527

**Code:**
```typescript
const q = query(
  collection(db, "listings"),
  where("sellerEmail", "==", user.email)
);
const unsub = onSnapshot(q, (snap) => {
  const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Listing);
  setListings(items);
});
```

**Issue:** NO LIMIT clause
**Impact:** Power seller with 1,000 listings = 1,000 reads per profile visit
**Grows with user count:** YES - sellers with more listings pay more
**Pagination:** NO
**Fix:** Add `limit(100)`

---

### #2: Profile Page - Purchases Query (CRITICAL BUG)
**File:** app/profile/page.tsx
**Line:** 539-542

**Code:**
```typescript
const q = query(
  collection(db, "purchases"),
  where("sellerEmail", "==", user.email)
);
const unsub = onSnapshot(q, (snap) => {
  setSellerPurchases(snap.docs.map((d) => d.data()));
});
```

**Issue:** NO LIMIT clause
**Impact:** Power seller with 1,000 purchases = 1,000 reads per profile visit
**Grows with user count:** YES - sellers with more purchases pay more
**Pagination:** NO
**Fix:** Add `limit(100)`

---

### #3: Profile Page - Followers Query (following) (CRITICAL BUG)
**File:** app/profile/page.tsx
**Line:** 485-487

**Code:**
```typescript
const q = query(collection(db, "followers"), where("followerId", "==", user.uid));
const unsub = onSnapshot(q, (snap) => {
  setFollowingList(snap.docs.map((d) => d.data() as any));
});
```

**Issue:** NO LIMIT clause
**Impact:** User following 1,000 users = 1,000 reads per profile visit
**Grows with user count:** YES - users with more followings pay more
**Pagination:** NO
**Fix:** Add `limit(100)`

---

### #4: Profile Page - Followers Query (seller) (CRITICAL BUG)
**File:** app/profile/page.tsx
**Line:** 495-497

**Code:**
```typescript
const q = query(collection(db, "followers"), where("sellerId", "==", user.uid));
const unsub = onSnapshot(q, (snap) => {
  setFollowerCount(snap.size);
});
```

**Issue:** NO LIMIT clause
**Impact:** Popular seller with 10,000 followers = 10,000 reads per profile visit
**Grows with user count:** YES - popular sellers pay exponentially more
**Pagination:** NO
**Fix:** Add `limit(100)` or use count() query instead

---

### #5: Post Listing Page - Favorites Query (HIGH RISK)
**File:** app/post/listing/page.tsx
**Line:** 127-142

**Code:**
```typescript
const favoritesRef = collection(db, "users", user.uid, "favorites");
const unsubscribe = onSnapshot(favoritesRef, (snapshot) => {
  const saved = snapshot.docs.map((doc) => doc.id);
  setFavorites(saved);
});
```

**Issue:** NO LIMIT clause (relies on default 100 limit)
**Impact:** User with 1,000 favorites = up to 1,000 reads
**Grows with user count:** YES - users with more favorites pay more
**Pagination:** NO
**Fix:** Add explicit `limit(100)`

---

### #6: Messages Page - Blocked Users Query (MEDIUM RISK)
**File:** app/messages/page.tsx
**Line:** 181-191

**Code:**
```typescript
const blockedQ = collection(db, "users", user.uid, "blocked");
const unsub = onSnapshot(blockedQ, (snap) => {
  const emails = blockedEmailsFromDocs(snap.docs);
  setBlockedUsers(emails);
});
```

**Issue:** NO LIMIT clause (relies on default 100 limit)
**Impact:** User who blocked 1,000 users = up to 1,000 reads
**Grows with user count:** YES - users who block many pay more
**Pagination:** NO
**Fix:** Add explicit `limit(100)`

---

### #7: useListings Hook - Listings Query (MEDIUM RISK)
**File:** app/useListings.ts
**Line:** 22-32

**Code:**
```typescript
const listingsQuery = query(collection(db, "listings"), ...constraints);
// constraints include limit(50 or 100) depending on sellerEmail
```

**Issue:** Has limit, but used in multiple pages causing duplication
**Impact:** Duplicate reads across pages
**Grows with user count:** NO - has limit
**Pagination:** NO
**Fix:** Remove hook, use shared state or direct queries

---

## QUERIES WITH LIMITS (SAFE)

### Homepage - Listings Query
**File:** app/page.tsx
**Line:** 273-281
**Status:** ✅ Has limit(100)

### Homepage - Trade Posts Query
**File:** app/page.tsx
**Line:** 283-291
**Status:** ✅ Has limit(50)

### Navbar - Blocked Users Query
**File:** app/components/Navbar.tsx
**Line:** 152-162
**Status:** ✅ Has limit(100)

### Navbar - Messages Query
**File:** app/components/Navbar.tsx
**Line:** 218-262
**Status:** ✅ Has limit(100)

### Navbar - Notifications Query
**File:** app/components/Navbar.tsx
**Line:** 270-317
**Status:** ✅ Has limit(50)

### Dashboard - Purchases Query
**File:** app/dashboard/page.tsx
**Line:** 73-81
**Status:** ✅ Has limit(50)

### Dashboard - Listings Query
**File:** app/dashboard/page.tsx
**Line:** 82-90
**Status:** ✅ Has limit(50)

### Dashboard - Reviews Query
**File:** app/dashboard/page.tsx
**Line:** 91-98
**Status:** ✅ Has limit(50)

### Post Listing Page - Listings Query
**File:** app/post/listing/page.tsx
**Line:** 86-107
**Status:** ✅ Has limit(50)

---

## PAGINATION STRATEGY AUDIT

### Finding: NO PAGINATION IMPLEMENTED

**Current State:** All queries use simple `limit()` with no pagination
**Impact:** Users cannot see beyond the first N items (50-100)
**Scalability Issue:** As collections grow, users cannot access older data

**Recommended Pagination Strategy:**
1. Implement cursor-based pagination using `startAfter()` and `limit()`
2. Add "Load More" buttons for infinite scroll
3. Cache paginated results in memory

**Priority:** MEDIUM - Not blocking, but limits UX at scale

---

## QUERIES THAT GROW WITH USER COUNT

### HIGH RISK (Unbounded)

1. **Profile listings** - Grows with seller's listing count
2. **Profile purchases** - Grows with seller's purchase count
3. **Profile followers (both queries)** - Grows with follower/following count
4. **Favorites** - Grows with user's favorite count
5. **Blocked users** - Grows with user's blocked count

### MEDIUM RISK (Bounded but frequent)

1. **Navbar messages** - Fixed 100, but on every page visit
2. **Navbar notifications** - Fixed 50, but on every page visit
3. **Dashboard queries** - Fixed 50 each, but on dashboard visit

### LOW RISK (Bounded and infrequent)

1. **Homepage listings** - Fixed 100, only on homepage
2. **Homepage trade posts** - Fixed 50, only on homepage

---

## COST IMPACT CALCULATION

### Unbounded Queries at 10,000 Users

**Assumptions:**
- 20% of users are sellers with avg 50 listings
- 10% of users are power sellers with 500 listings
- 5% of users are power sellers with 1,000 listings
- Avg profile visits per user: 2/day

**Profile Listings Query:**
- Normal sellers: 2,000 users × 50 listings × 2 visits = 200,000 reads/day
- Power sellers (500): 500 users × 500 listings × 2 visits = 500,000 reads/day
- Power sellers (1,000): 500 users × 1,000 listings × 2 visits = 1,000,000 reads/day
- **Total:** 1,700,000 reads/day
- **Monthly:** 51,000,000 reads
- **Cost:** $91.80/month (Flame plan)

**With limit(100):**
- All users: 10,000 users × 100 reads × 2 visits = 2,000,000 reads/day
- **Monthly:** 60,000,000 reads
- **Cost:** $108/month (Flame plan)

**Wait - this shows limit(100) is MORE expensive?**

**Correction:** The unbounded query reads ALL listings for power sellers. Let me recalculate:

**Unbounded (actual):**
- 500 power sellers with 1,000 listings × 2 visits = 1,000,000 reads/day
- 500 power sellers with 500 listings × 2 visits = 500,000 reads/day
- 2,000 normal sellers with 50 listings × 2 visits = 200,000 reads/day
- 7,000 non-sellers with 0 listings × 2 visits = 0 reads/day
- **Total:** 1,700,000 reads/day
- **Monthly:** 51,000,000 reads
- **Cost:** $91.80/month

**With limit(100):**
- 10,000 users × 100 reads × 2 visits = 2,000,000 reads/day
- **Monthly:** 60,000,000 reads
- **Cost:** $108/month

**Analysis:** The unbounded query is actually CHEAPER because most users have few listings. However, it's a SCALABILITY BOMB - as power sellers grow, cost grows linearly.

**At 100,000 users with 10% power sellers:**
- 10,000 power sellers with 1,000 listings × 2 visits = 20,000,000 reads/day
- **Monthly:** 600,000,000 reads
- **Cost:** $1,080/month (just this one query!)

**With limit(100):**
- 100,000 users × 100 reads × 2 visits = 20,000,000 reads/day
- **Monthly:** 600,000,000 reads
- **Cost:** $1,080/month

**Conclusion:** At scale, they're equal. But limit(100) provides predictable costs and prevents runaway costs from super-users.

---

## SUMMARY

### Critical Bugs (NO LIMIT)
1. app/profile/page.tsx:509-527 - Listings query
2. app/profile/page.tsx:539-542 - Purchases query
3. app/profile/page.tsx:485-487 - Followers (following)
4. app/profile/page.tsx:495-497 - Followers (seller)
5. app/post/listing/page.tsx:127-142 - Favorites
6. app/messages/page.tsx:181-191 - Blocked users

### Queries with Limits (Safe)
- Homepage: 2 queries with limits
- Navbar: 3 queries with limits
- Dashboard: 3 queries with limits
- Post listing: 1 query with limit

### Pagination Status
- **NO PAGINATION** - All queries use simple limit()
- **Recommendation:** Implement cursor-based pagination for scalability

### Queries Growing with User Count
- 5 unbounded queries (CRITICAL)
- 2 bounded but frequent queries (MEDIUM)
- 2 bounded and infrequent queries (LOW)

---

## IMMEDIATE ACTIONS REQUIRED

### Priority 1 (This Hour)
1. Add limit(100) to app/profile/page.tsx:509-527
2. Add limit(100) to app/profile/page.tsx:539-542
3. Add limit(100) to app/profile/page.tsx:485-487
4. Add limit(100) to app/profile/page.tsx:495-497

### Priority 2 (This Week)
5. Add limit(100) to app/post/listing/page.tsx:127-142
6. Add limit(100) to app/messages/page.tsx:181-191
7. Remove duplicate useListings hook

### Priority 3 (This Month)
8. Implement cursor-based pagination for all list views
9. Add "Load More" buttons for infinite scroll
10. Cache paginated results
