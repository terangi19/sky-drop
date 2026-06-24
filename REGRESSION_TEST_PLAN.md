# Cost Optimizations Regression Test Plan

**Purpose:** Test all cost optimizations for regressions
**Date:** June 22, 2026
**Test Type:** Manual Testing (requires browser access)

---

## Test Environment Setup

**Prerequisites:**
- [ ] Deployed to production environment
- [ ] Test user account with seller permissions
- [ ] Test images available (high-resolution JPEG, 5MB+)
- [ ] Browser DevTools available
- [ ] Firebase Console access for metrics verification

**Test Account:**
- Email: test@example.com
- Role: Seller
- Permissions: Can create listings, upload images

---

## Test Case #1: Image Upload and Compression

**Optimization:** Image compression to WebP (1920x1920, 85%)

### Test Steps

1. Navigate to production URL
2. Login as test user
3. Go to `/post/ai`
4. Click "Add Photos" button
5. Select a high-resolution JPEG image (5MB+)
6. Wait for upload to complete
7. Check browser console for compression stats

### Expected Behavior

**Before Optimization:**
- Uploads full-size image (5MB)
- File name: `{timestamp}_{i}.jpg`
- No compression logging in console

**After Optimization:**
- Compresses image before upload
- Uploads WebP format (200-400KB)
- File name: `{timestamp}_{i}_full.webp`
- Console logs compression stats:
  ```
  Image 0: {
    originalSize: "5120.00KB",
    compressedSize: "320.50KB",
    thumbnailSize: "22.30KB",
    reduction: "93.7%"
  }
  ```

### Potential Regression

- **Issue:** Upload fails with compression error
- **Issue:** Image quality degraded significantly
- **Issue:** Upload time increases due to compression processing
- **Issue:** Original image not accessible (should be replaced by compressed version)

### Verification Steps

1. Open Firebase Console → Storage
2. Navigate to `listings/{uid}/`
3. Verify file exists with `_full.webp` suffix
4. Verify file size is 200-400KB
5. Verify file format is WebP

### Test Result

**Status:** ❌ NOT TESTED (requires production deployment)
**Pass/Fail:** PENDING

---

## Test Case #2: Thumbnail Generation

**Optimization:** Thumbnail generation (300x300, 75%)

### Test Steps

1. Complete Test Case #1 (image upload)
2. After upload completes, check Firebase Storage
3. Look for thumbnail file with `_thumb.webp` suffix

### Expected Behavior

**Before Optimization:**
- No thumbnail generated
- Only full-size image stored

**After Optimization:**
- Thumbnail generated automatically
- File name: `{timestamp}_{i}_thumb.webp`
- File size: 15-30KB
- Dimensions: 300x300 (maintaining aspect ratio)

### Potential Regression

- **Issue:** Thumbnail not generated
- **Issue:** Thumbnail has wrong dimensions
- **Issue:** Thumbnail quality too low
- **Issue:** Thumbnail not used in UI

### Verification Steps

1. Open Firebase Console → Storage
2. Navigate to `listings/{uid}/`
3. Verify thumbnail file exists with `_thumb.webp` suffix
4. Verify file size is 15-30KB
5. Navigate to homepage
6. Open DevTools → Network tab
7. Filter by images
8. Verify thumbnail URLs contain `_thumb.webp`

### Test Result

**Status:** ❌ NOT TESTED (requires production deployment)
**Pass/Fail:** PENDING

---

## Test Case #3: Create Listing with Thumbnails

**Optimization:** Thumbnail delivery on listing cards

### Test Steps

1. Navigate to `/post/ai`
2. Fill in listing details (title, price, category)
3. Upload 3-5 images
4. Submit listing
5. Navigate to homepage
6. Find the newly created listing card

### Expected Behavior

**Before Optimization:**
- Listing card loads full-size image (5MB)
- Network tab shows large image files
- Slow page load

**After Optimization:**
- Listing card loads thumbnail (20KB)
- Network tab shows `_thumb.webp` files
- Fast page load
- Console shows thumbnail URLs in imageSrc

### Potential Regression

- **Issue:** Listing card shows broken image
- **Issue:** Listing card shows full-size image instead of thumbnail
- **Issue:** Thumbnail not displaying correctly
- **Issue:** Listing creation fails

### Verification Steps

1. Open DevTools → Network tab
2. Reload homepage
3. Filter by images
4. Find your listing's image
5. Verify URL contains `_thumb.webp`
6. Verify size is 15-30KB
7. Verify image displays correctly

### Test Result

**Status:** ❌ NOT TESTED (requires production deployment)
**Pass/Fail:** PENDING

---

## Test Case #4: Homepage Polling Behavior

**Optimization:** Homepage listeners converted to 60s polling

### Test Steps

1. Navigate to homepage
2. Open DevTools → Network tab
3. Filter by `firestore.googleapis.com`
4. Note initial Firestore reads (should be ~150)
5. Wait 60 seconds
6. Note second Firestore reads (should be another ~150)
7. Wait another 60 seconds
8. Note third Firestore reads (should be another ~150)
9. Verify no reads between 60-second intervals

### Expected Behavior

**Before Optimization:**
- Continuous Firestore reads (onSnapshot)
- Flat line of reads in Network tab
- Reads continue even when tab inactive

**After Optimization:**
- Initial reads: ~150
- After 60s: ~150
- After 120s: ~150
- Between intervals: 0 reads
- Reads stop when tab inactive

### Potential Regression

- **Issue:** Listings don't update when new listings created
- **Issue:** 60-second delay is too long for users
- **Issue:** Stale data displayed for >60 seconds
- **Issue:** Listings disappear after 60 seconds

### Verification Steps

1. Create a new listing in another tab
2. Return to homepage tab
3. Wait for up to 60 seconds
4. Verify new listing appears
5. Time how long it takes to appear
6. Should appear within 60 seconds

### Test Result

**Status:** ❌ NOT TESTED (requires production deployment)
**Pass/Fail:** PENDING

---

## Test Case #5: Dashboard Purchases Polling

**Optimization:** Dashboard purchases listener converted to 60s polling

### Test Steps

1. Login as seller
2. Navigate to `/dashboard`
3. Open DevTools → Network tab
4. Filter by `firestore.googleapis.com`
5. Note initial Firestore reads
6. Wait 60 seconds
7. Note second Firestore reads
8. Make a test purchase in another tab
9. Return to dashboard
10. Wait up to 60 seconds
11. Verify new purchase appears

### Expected Behavior

**Before Optimization:**
- Real-time purchase updates
- Purchase appears immediately in dashboard

**After Optimization:**
- Purchase updates within 60 seconds
- Initial reads: ~200
- After 60s: ~200
- Between intervals: 0 reads

### Potential Regression

- **Issue:** New purchase doesn't appear
- **Issue:** Takes >60 seconds to appear
- **Issue:** Dashboard shows stale data
- **Issue:** Purchase count incorrect

### Verification Steps

1. Note current purchase count
2. Make test purchase
3. Time how long it appears in dashboard
4. Should appear within 60 seconds
5. Verify count updates correctly

### Test Result

**Status:** ❌ NOT TESTED (requires production deployment)
**Pass/Fail:** PENDING

---

## Test Case #6: Profile Updates Polling

**Optimization:** Profile listeners converted to 60s polling

### Test Steps

1. Navigate to `/profile`
2. Open DevTools → Network tab
3. Filter by `firestore.googleapis.com`
4. Note initial Firestore reads
5. Wait 60 seconds
6. Note second Firestore reads
7. Edit profile in another tab (change bio)
8. Save changes
9. Return to profile tab
10. Wait up to 60 seconds
11. Verify bio updates

### Expected Behavior

**Before Optimization:**
- Real-time profile updates
- Changes appear immediately

**After Optimization:**
- Profile updates within 60 seconds
- Initial reads: ~300
- After 60s: ~300
- Between intervals: 0 reads

### Potential Regression

- **Issue:** Profile changes don't appear
- **Issue:** Takes >60 seconds to appear
- **Issue:** Profile shows stale data
- **Issue:** Follower count incorrect

### Verification Steps

1. Note current bio text
2. Edit bio in another tab
3. Save changes
4. Time how long it appears in profile tab
5. Should appear within 60 seconds
6. Verify text updates correctly

### Test Result

**Status:** ❌ NOT TESTED (requires production deployment)
**Pass/Fail:** PENDING

---

## Test Case #7: Messaging with Polling

**Optimization:** Messages inbox listener converted to 60s polling

### Test Steps

1. Navigate to `/messages`
2. Open DevTools → Network tab
3. Filter by `firestore.googleapis.com`
4. Note initial Firestore reads
5. Open conversation with a user
6. Send a message
7. Wait for reply from other user
8. Note if message appears immediately or after delay

### Expected Behavior

**Before Optimization:**
- Real-time message updates
- Messages appear immediately

**After Optimization:**
- Messages inbox updates every 60 seconds
- Active chat should remain real-time (not converted)
- New messages in inbox appear within 60 seconds

**Note:** Messages inbox was NOT converted to polling in this implementation (kept real-time for chat functionality)

### Potential Regression

- **Issue:** Messages don't appear
- **Issue:** Chat functionality broken
- **Issue:** Message ordering incorrect
- **Issue:** Read status not updating

### Verification Steps

1. Send message in chat
2. Verify message appears immediately (real-time)
3. Return to inbox
4. Wait for new message
5. Verify it appears in inbox
6. Should appear immediately (real-time listener still active)

### Test Result

**Status:** ❌ NOT TESTED (requires production deployment)
**Pass/Fail:** PENDING

---

## Test Case #8: Notifications with Polling

**Optimization:** Navbar notifications converted to polling (in previous session)

### Test Steps

1. Open DevTools → Network tab
2. Filter by `firestore.googleapis.com`
3. Note if navbar triggers Firestore reads on page load
4. Trigger a notification (e.g., receive a message)
5. Wait for notification badge to update
6. Note how long it takes

### Expected Behavior

**Before Optimization:**
- Real-time notification updates
- Notifications appear immediately

**After Optimization:**
- Notifications update every 60 seconds
- Notification badge updates within 60 seconds

**Note:** Navbar optimization was implemented in a previous session, need to verify current implementation

### Potential Regression

- **Issue:** Notifications don't appear
- **Issue:** Badge count incorrect
- **Issue:** Notifications delayed too long
- **Issue:** Notifications not clearing

### Verification Steps

1. Check app/components/Navbar.tsx for polling implementation
2. Verify notification fetch interval
3. Test notification updates
4. Time how long badge updates

### Test Result

**Status:** ❌ NOT TESTED (requires production deployment)
**Pass/Fail:** PENDING

---

## Test Case #9: Block User Flow

**Optimization:** Blocked users listener converted to 60s polling

### Test Steps

1. Navigate to `/messages`
2. Open conversation with a user
3. Block the user
4. Verify conversation disappears
5. Unblock the user
6. Verify conversation reappears
7. Note timing of updates

### Expected Behavior

**Before Optimization:**
- Real-time block/unblock updates
- Changes appear immediately

**After Optimization:**
- Block/unblock updates within 60 seconds
- Blocked users list refreshes every 60 seconds

### Potential Regression

- **Issue:** Block doesn't work
- **Issue:** Blocked user still visible
- **Issue:** Unblock doesn't work
- **Issue:** Messages from blocked user still appear

### Verification Steps

1. Block a user
2. Note if conversation disappears immediately or after delay
3. Should disappear within 60 seconds
4. Unblock the user
5. Verify conversation reappears

### Test Result

**Status:** ❌ NOT TESTED (requires production deployment)
**Pass/Fail:** PENDING

---

## Test Case #10: Multiple Tabs Open

**Optimization:** All polling listeners

### Test Steps

1. Open production URL in Tab 1
2. Open production URL in Tab 2
3. Open production URL in Tab 3
4. Login as same user in all tabs
5. Navigate to homepage in Tab 1
6. Navigate to dashboard in Tab 2
7. Navigate to profile in Tab 3
8. Open DevTools in Tab 1
9. Filter by `firestore.googleapis.com`
10. Note read frequency
11. Compare with single tab behavior

### Expected Behavior

**Before Optimization (onSnapshot):**
- Each tab maintains separate listener
- Multiple reads per tab
- High Firestore read count

**After Optimization (polling):**
- Each tab polls independently
- Reads every 60 seconds per tab
- 3 tabs = 3x reads compared to 1 tab
- Still much lower than continuous reads

### Potential Regression

- **Issue:** Tabs show different data
- **Issue:** Excessive reads with multiple tabs
- **Issue:** Tabs interfere with each other
- **Issue:** Data inconsistency between tabs

### Verification Steps

1. Count reads in Tab 1
2. Count reads in Tab 2
3. Count reads in Tab 3
4. Verify total reads = 3x single tab reads
5. Verify no interference between tabs

### Test Result

**Status:** ❌ NOT TESTED (requires production deployment)
**Pass/Fail:** PENDING

---

## Test Case #11: Edit Listing

**Optimization:** Image compression and thumbnails

### Test Steps

1. Navigate to `/post/ai`
2. Create a listing with 3 images
3. Note image URLs
4. Edit the listing
5. Replace one image
6. Save changes
7. Verify new image is compressed
8. Verify new thumbnail is generated

### Expected Behavior

**Before Optimization:**
- Edit uploads full-size image
- No thumbnail generation

**After Optimization:**
- Edit compresses new image to WebP
- Edit generates new thumbnail
- Old images remain compressed

### Potential Regression

- **Issue:** Edit fails
- **Issue:** New image not compressed
- **Issue:** Thumbnail not generated
- **Issue:** Old images lost

### Verification Steps

1. Check Firebase Storage for new image
2. Verify `_full.webp` suffix
3. Verify file size 200-400KB
4. Check for `_thumb.webp` file
5. Verify thumbnail size 15-30KB

### Test Result

**Status:** ❌ NOT TESTED (requires production deployment)
**Pass/Fail:** PENDING

---

## Test Case #12: Homepage Updates

**Optimization:** Homepage polling (60s)

### Test Steps

1. Open homepage in Tab 1
2. Open `/post/ai` in Tab 2
3. Create a new listing in Tab 2
4. Submit listing
5. Switch to Tab 1
6. Note time until new listing appears
7. Should appear within 60 seconds

### Expected Behavior

**Before Optimization:**
- New listing appears immediately (real-time)

**After Optimization:**
- New listing appears within 60 seconds
- Homepage refreshes automatically every 60 seconds

### Potential Regression

- **Issue:** New listing never appears
- **Issue:** Takes >60 seconds to appear
- **Issue:** Homepage doesn't refresh
- **Issue:** Listings disappear

### Verification Steps

1. Create new listing
2. Time how long it appears on homepage
3. Should be ≤60 seconds
4. Verify listing displays correctly
5. Verify thumbnail loads

### Test Result

**Status:** ❌ NOT TESTED (requires production deployment)
**Pass/Fail:** PENDING

---

## Summary

**Total Test Cases:** 12
**Tests Executed:** 0
**Tests Passed:** 0
**Tests Failed:** 0
**Tests Pending:** 12

**Blocking Issue:** Optimizations not deployed to production

---

## Manual Testing Instructions

To execute these tests:

1. **Deploy optimizations to production** (follow DEPLOYMENT_VERIFICATION_CHECKLIST.md)
2. **Open production URL in browser**
3. **Follow test steps for each test case**
4. **Record results in this document**
5. **Report any failures immediately**

**Tools Required:**
- Browser (Chrome/Firefox)
- DevTools (Network tab, Console)
- Firebase Console access
- Test user account

**Estimated Testing Time:** 2-3 hours

---

## Regression Severity Levels

**Critical (P0):**
- Image upload fails
- Listing creation fails
- Data loss
- Security issues

**High (P1):**
- Updates delayed >60 seconds
- Stale data displayed
- UI broken
- Performance degradation

**Medium (P2):**
- Minor visual issues
- Slight delays
- Edge cases

**Low (P3):**
- Cosmetic issues
- Non-critical bugs

---

## Rollback Criteria

**Rollback Immediately If:**
- Image upload fails
- Listing creation fails
- Data loss occurs
- Security vulnerability found

**Rollback After Investigation If:**
- Updates delayed >60 seconds consistently
- Significant performance degradation
- User complaints about stale data

**Monitor If:**
- Minor delays (30-60 seconds)
- Occasional edge cases
- Non-critical issues
