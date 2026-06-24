# Deployment Verification Checklist

**Purpose:** Step-by-step plan to deploy and verify cost optimizations
**Date:** June 22, 2026

---

## Current State Assessment

### Branch Status
- **Current Branch:** main
- **Optimizations in Branch:** ❌ NO (only in working directory, not committed)
- **Committed:** ❌ NO
- **Pushed to Remote:** ❌ NO
- **Deployed to Production:** ❌ NO

### Git Status
```
Changes not staged for commit:
  modified:   app/page.tsx (homepage polling)
  modified:   app/dashboard/page.tsx (dashboard polling)
  modified:   app/profile/page.tsx (profile polling)
  modified:   app/post/ai/page.tsx (image compression)
  modified:   app/components/MarketplaceListingCard.tsx (thumbnail delivery)
  modified:   app/api/sky-ai/route.ts (reverted to original)
  
Untracked files:
  app/lib/image-optimization.ts (new library)
  app/lib/openai-spend-caps.ts (new library, not integrated)
  app/admin/cost-dashboard/ (new dashboard)
  app/api/metrics/ (new API endpoints)
```

### Latest Production Commit
- **Commit Hash:** 302734d
- **Message:** Improve Awhina profile assistant UX and messages page features
- **Date:** Before current session
- **Contains Optimizations:** ❌ NO

---

## Step-by-Step Deployment Plan

### Phase 1: Commit Optimizations (15 minutes)

**Step 1.1: Stage cost optimization files**
```bash
cd c:\Users\rangi\Desktop\sky-drop\sky-drop
git add app/page.tsx
git add app/dashboard/page.tsx
git add app/profile/page.tsx
git add app/post/ai/page.tsx
git add app/components/MarketplaceListingCard.tsx
git add app/lib/image-optimization.ts
git add app/api/sky-ai/route.ts
```

**Step 1.2: Commit with descriptive message**
```bash
git commit -m "feat: implement P0 cost optimizations

- Convert homepage listeners to polling (60s)
- Convert dashboard listeners to polling (60s)
- Convert profile listeners to polling (60s)
- Add image compression and thumbnail generation
- Update MarketplaceListingCard to use thumbnails
- Revert sky-ai route to original spending implementation

Cost Impact: $18,741/month savings at 10K users"
```

**Step 1.3: Verify commit**
```bash
git log --oneline -1
```

---

### Phase 2: Push to Remote (5 minutes)

**Step 2.1: Push to origin/main**
```bash
git push origin main
```

**Step 2.2: Verify push**
```bash
git status
```

---

### Phase 3: Deploy to Production via Vercel (5 minutes)

**Step 3.1: Trigger Vercel deployment**
- Option A: Automatic (Vercel detects push to main)
- Option B: Manual via Vercel Dashboard

**Step 3.2: Monitor deployment**
```bash
# If using Vercel CLI
vercel deploy --prod

# Or check Vercel Dashboard
# https://vercel.com/username/sky-drop/deployments
```

**Step 3.3: Wait for deployment to complete**
- Expected time: 2-5 minutes
- Check for build errors
- Check for deployment errors

---

### Phase 4: Verify Deployment (10 minutes)

**Step 4.1: Check deployment status**
```bash
# Via Vercel CLI
vercel ls
vercel inspect

# Via Vercel Dashboard
# Navigate to Deployments tab
# Verify latest deployment shows your commit hash
```

**Step 4.2: Verify production URL**
```
https://sky-drop.vercel.app
# or your custom domain
```

**Step 4.3: Check build logs**
- Verify no build errors
- Verify no TypeScript errors
- Verify no deployment errors

---

## Verification Steps per Optimization

### Optimization #1: Image Compression

**How to Verify:**
1. Go to production website
2. Create a test listing
3. Upload a high-resolution image (e.g., 5MB JPEG)
4. Check Firebase Storage Console
5. Verify file was uploaded with `_full.webp` suffix
6. Verify file size is ~300KB (not 5MB)

**Firebase Console Metrics:**
- Go to Firebase Console → Storage
- Navigate to `listings/{uid}/`
- Check uploaded file sizes
- Verify WebP format (not JPEG)

**Expected Result:**
- File name: `{timestamp}_{i}_full.webp`
- File size: 200-400 KB
- Format: WebP

**Rollback if Failed:**
```bash
git revert <commit-hash>
git push origin main
```

---

### Optimization #2: Thumbnail Delivery

**How to Verify:**
1. Go to production website
2. Navigate to homepage
3. Open browser DevTools → Network tab
4. Reload page
5. Filter by images
6. Verify thumbnail URLs contain `_thumb.webp`
7. Verify thumbnail size is ~20KB

**Browser DevTools:**
```
Network tab → Filter by "Img"
Look for: *_thumb.webp
Check size: Should be 15-30KB
```

**Vercel Metrics:**
- Vercel Dashboard → Analytics
- Monitor bandwidth usage
- Compare with baseline

**Expected Result:**
- Homepage loads 150 images
- Total bandwidth: ~3MB (not 375MB)
- Each image: ~20KB

**Rollback if Failed:**
```bash
git revert <commit-hash>
git push origin main
```

---

### Optimization #3: Homepage Polling

**How to Verify:**
1. Go to production website
2. Open browser DevTools → Network tab
3. Filter by Firestore
4. Refresh page
5. Observe initial Firestore reads (should be 150 reads)
6. Wait 60 seconds
7. Observe second Firestore reads (should be another 150 reads)
8. Verify no continuous reads between

**Firebase Console Metrics:**
- Firebase Console → Firestore → Usage
- Monitor reads per minute
- Should see spikes every 60 seconds, not continuous

**Expected Result:**
- Initial load: 150 reads
- After 60s: 150 reads
- Between: 0 reads
- Pattern: Periodic spikes, not flat line

**Rollback if Failed:**
```bash
git revert <commit-hash>
git push origin main
```

---

### Optimization #4: Dashboard Polling

**How to Verify:**
1. Go to production website
2. Login as seller
3. Navigate to dashboard
4. Open browser DevTools → Network tab
5. Filter by Firestore
6. Observe initial reads (should be ~200 reads)
7. Wait 60 seconds
8. Observe second reads (should be another ~200 reads)

**Firebase Console Metrics:**
- Firebase Console → Firestore → Usage
- Filter by collection: profiles, purchases, listings, reviews
- Monitor reads per minute
- Should see spikes every 60 seconds

**Expected Result:**
- Initial load: ~200 reads
- After 60s: ~200 reads
- Between: 0 reads

**Rollback if Failed:**
```bash
git revert <commit-hash>
git push origin main
```

---

### Optimization #5: Profile Polling

**How to Verify:**
1. Go to production website
2. Navigate to profile page
3. Open browser DevTools → Network tab
4. Filter by Firestore
5. Observe initial reads (should be ~300 reads)
6. Wait 60 seconds
7. Observe second reads (should be another ~300 reads)

**Firebase Console Metrics:**
- Firebase Console → Firestore → Usage
- Filter by collection: profiles, followers, listings, purchases
- Monitor reads per minute
- Should see spikes every 60 seconds

**Expected Result:**
- Initial load: ~300 reads
- After 60s: ~300 reads
- Between: 0 reads

**Rollback if Failed:**
```bash
git revert <commit-hash>
git push origin main
```

---

## Firebase Console Metrics to Monitor

### Firestore Reads

**Location:** Firebase Console → Firestore → Usage

**Metrics to Track:**
- Reads per day
- Reads per minute
- Reads per collection
- Total reads cost

**Expected Changes:**
- Before: Continuous reads (flat line)
- After: Periodic spikes every 60 seconds
- Reduction: ~95% reduction in total reads

**Baseline (Before):**
- Homepage: 500,000 reads/day at 10K users
- Dashboard: 600,000 reads/day at 10K users
- Profile: 2,400,000 reads/day at 10K users

**Target (After):**
- Homepage: 750,000 reads/day at 10K users
- Dashboard: 16,000 reads/day at 10K users
- Profile: 72,000 reads/day at 10K users

---

### Firebase Storage Bandwidth

**Location:** Firebase Console → Storage → Usage

**Metrics to Track:**
- Bandwidth per day (GB)
- Download bandwidth
- Number of objects
- Storage size (GB)

**Expected Changes:**
- Before: 114,000 GB/month at 10K users
- After: 1,800 GB/month at 10K users
- Reduction: 98.4%

**How to Verify:**
1. Monitor bandwidth for 24 hours after deployment
2. Compare with 24 hours before deployment
3. Calculate reduction percentage

---

### Firebase Storage File Sizes

**Location:** Firebase Console → Storage → Files

**How to Verify:**
1. Navigate to `listings/{uid}/` folder
2. Check for `_full.webp` files
3. Check for `_thumb.webp` files
4. Verify file sizes:
   - Full: 200-400 KB
   - Thumbnail: 15-30 KB
5. Verify format: WebP

---

## Vercel Metrics to Monitor

### Bandwidth Usage

**Location:** Vercel Dashboard → Analytics → Bandwidth

**Metrics to Track:**
- Total bandwidth per day
- Bandwidth per route
- Bandwidth by asset type

**Expected Changes:**
- Before: 114,000 GB/month at 10K users
- After: 1,800 GB/month at 10K users
- Reduction: 98.4%

**How to Verify:**
1. Set date range: 24 hours before deployment
2. Note total bandwidth
3. Set date range: 24 hours after deployment
4. Note total bandwidth
5. Calculate reduction

---

### Edge Cache Hit Rate

**Location:** Vercel Dashboard → Analytics → Edge Cache

**Metrics to Track:**
- Cache hit rate
- Cache miss rate
- Bandwidth served from cache

**Expected Changes:**
- Improved cache hit rate for thumbnails
- Reduced cache misses for full-size images

---

## Post-Deployment Monitoring Timeline

### Immediate (0-1 hour after deployment)
- [ ] Verify no build errors
- [ ] Verify no deployment errors
- [ ] Verify production URL loads
- [ ] Test image upload functionality
- [ ] Test homepage loads correctly
- [ ] Test dashboard loads correctly
- [ ] Test profile page loads correctly

### Short-term (1-24 hours after deployment)
- [ ] Monitor Firebase Firestore reads
- [ ] Monitor Firebase Storage bandwidth
- [ ] Monitor Vercel bandwidth
- [ ] Check for user reports of issues
- [ ] Verify no UX regressions from 60s polling
- [ ] Verify image compression is working

### Medium-term (24-48 hours after deployment)
- [ ] Compare daily Firestore reads with baseline
- [ ] Compare daily bandwidth with baseline
- [ ] Calculate actual cost savings
- [ ] Verify no performance issues
- [ ] Verify no data inconsistencies from polling

### Long-term (7 days after deployment)
- [ ] Analyze weekly cost trends
- [ ] Verify sustained cost reduction
- [ ] Identify any edge cases
- [ ] Plan next optimization phase

---

## Rollback Plan

### Immediate Rollback (if critical issues)

**Step 1: Revert commit**
```bash
git revert <commit-hash>
```

**Step 2: Push revert**
```bash
git push origin main
```

**Step 3: Vercel auto-deploys revert**

**Step 4: Verify rollback complete**
```bash
git log --oneline -1
```

### Selective Rollback (if specific optimization fails)

**Option A: Revert specific file**
```bash
git checkout <commit-hash> -- app/page.tsx
git add app/page.tsx
git commit -m "Revert homepage polling"
git push origin main
```

**Option B: Feature flag (if implemented)**
```bash
# Disable feature flag via admin panel
```

---

## Pre-Deployment Checklist

### Code Review
- [ ] All changes committed
- [ ] Commit message is descriptive
- [ ] No merge conflicts
- [ ] TypeScript compiles without errors
- [ ] No linting errors

### Testing
- [ ] Tested locally
- [ ] Image upload works
- [ ] Thumbnail generation works
- [ ] Homepage loads with polling
- [ ] Dashboard loads with polling
- [ ] Profile page loads with polling
- [ ] No console errors

### Documentation
- [ ] Rollback plan documented
- [ ] Monitoring metrics identified
- [ ] Verification steps documented
- [ ] Team notified of deployment

---

## Post-Deployment Verification Checklist

### Functionality Verification
- [ ] Homepage loads correctly
- [ ] Listings display correctly
- [ ] Dashboard loads correctly
- [ ] Profile page loads correctly
- [ ] Image upload works
- [ ] Thumbnails display on listing cards
- [ ] Full-size images display on detail pages

### Performance Verification
- [ ] Page load time acceptable
- [ ] No performance regressions
- [ ] Polling delay (60s) not noticeable to users
- [ ] No excessive re-renders

### Cost Verification
- [ ] Firestore reads reduced (check Firebase Console)
- [ ] Bandwidth reduced (check Firebase Storage + Vercel)
- [ ] Storage size reduced (check Firebase Storage)
- [ ] Calculate actual cost savings

### User Experience Verification
- [ ] No user complaints
- [ ] No reports of stale data
- [ ] No reports of missing updates
- [ ] No reports of broken functionality

---

## Success Criteria

### Technical Success
- [ ] All code deployed to production
- [ ] No build errors
- [ ] No deployment errors
- [ ] No runtime errors

### Cost Success
- [ ] Firestore reads reduced by 95%+
- [ ] Bandwidth reduced by 95%+
- [ ] Monthly cost reduced by $15,000+ at 10K users

### UX Success
- [ ] No user complaints
- [ ] No performance regressions
- [ ] No data consistency issues
- [ ] Polling delay acceptable

---

## Emergency Contacts

**Deployment Issues:**
- Vercel Dashboard: https://vercel.com/username/sky-drop
- Firebase Console: https://console.firebase.google.com

**Rollback Authorization:**
- Only authorized team members can execute rollback
- Document rollback reason in incident report

---

## Conclusion

**Current Status:** Optimizations NOT deployed (only in working directory)
**Next Step:** Commit and push changes to trigger deployment
**Verification:** Follow this checklist after deployment

**Estimated Deployment Time:** 30 minutes
**Estimated Verification Time:** 24-48 hours
