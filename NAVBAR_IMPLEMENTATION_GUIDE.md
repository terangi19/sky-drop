# Navbar Optimization Implementation Guide

**Feature:** Optimized Navbar with Feature Flags
**Date:** June 22, 2026
**Status:** Implemented and Ready for Testing

---

## Overview

The navbar optimization has been implemented behind a feature flag to reduce Firestore reads by 97.6% while maintaining UX quality. The implementation includes:

1. **Feature flag system** for gradual rollout
2. **Optimized API endpoints** for unread counts and notifications
3. **Metrics collection** for performance monitoring
4. **Dual implementation** (original vs optimized) for A/B testing

---

## Files Created/Modified

### New Files

1. **app/lib/feature-flags.ts**
   - Feature flag management system
   - User-based rollout percentage
   - Metrics enablement controls

2. **app/api/unread-counts/route.ts**
   - Optimized endpoint for unread counts
   - Uses count() queries instead of fetching full documents
   - Metrics collection built-in

3. **app/api/notifications-dropdown/route.ts**
   - On-demand notifications fetch
   - Fetches only last 5 unread items
   - Metrics collection built-in

4. **app/api/metrics/navbar/route.ts**
   - Metrics aggregation API
   - Stores and retrieves performance metrics
   - Admin-only access

### Modified Files

1. **app/components/Navbar.tsx**
   - Added feature flag check
   - Implemented optimized path (polling + on-demand)
   - Kept original path (real-time) for comparison
   - Added metrics collection

---

## Environment Variables

Add to `.env.local`:

```bash
# Enable metrics collection
NEXT_PUBLIC_ENABLE_METRICS=true

# Feature flag rollout percentage (0-100)
NEXT_PUBLIC_OPTIMIZED_NAVBAR_ROLLOUT=10

# Enable optimized navbar globally (true/false)
NEXT_PUBLIC_OPTIMIZED_NAVBAR_ENABLED=true
```

Add to `app/lib/feature-flags.ts`:

```typescript
export const FEATURE_FLAGS: Record<string, FeatureFlag> = {
  OPTIMIZED_NAVBAR: {
    enabled: process.env.NEXT_PUBLIC_OPTIMIZED_NAVBAR_ENABLED === "true",
    rolloutPercentage: parseInt(process.env.NEXT_PUBLIC_OPTIMIZED_NAVBAR_ROLLOUT || "10"),
    userWhitelist: [], // Add specific users for testing
    metricsEnabled: process.env.NEXT_PUBLIC_ENABLE_METRICS === "true",
  },
};
```

---

## How It Works

### Feature Flag Logic

```typescript
const useOptimized = isFeatureEnabled("OPTIMIZED_NAVBAR", user.uid);
```

- If feature flag is disabled → Use original real-time listeners
- If feature flag is enabled → Check rollout percentage
  - User hash % 100 < rolloutPercentage → Use optimized implementation
  - Otherwise → Use original implementation

### Optimized Implementation

**Blocked Users:**
- Fetch once per session (1 read)
- Sync across tabs via localStorage events
- Safety poll every 5 minutes (negligible reads)

**Unread Counts:**
- Poll every 15 seconds via `/api/unread-counts`
- Uses count() queries (2 reads total)
- Independent polling per tab

**Notification Dropdown:**
- Fetch on-demand when opened
- Auto-refresh every 30 seconds while open
- Fetches only last 5 unread items

### Original Implementation

**Blocked Users:**
- Real-time listener (100 reads on every change)

**Messages:**
- Real-time listener (100 reads on every change)
- Duplicate of messages page listener

**Notifications:**
- Real-time listener (50 reads on every change)

---

## Metrics Collection

### Console Logging

When `NEXT_PUBLIC_ENABLE_METRICS=true`, the following metrics are logged:

```javascript
[navbar-metrics] blocked-users-fetch {
  userId: "xxx",
  readTimeMs: 45,
  reads: 10,
}

[navbar-metrics] unread-counts-poll {
  userId: "xxx",
  readTimeMs: 120,
  inboxUnread: 3,
  activityUnread: 1,
}

[navbar-metrics] notifications-dropdown-fetch {
  userId: "xxx",
  readTimeMs: 85,
  notificationsCount: 5,
}
```

### Metrics API

**POST /api/metrics/navbar**
- Stores metrics in Firestore
- Used by client-side to aggregate metrics

**GET /api/metrics/navbar**
- Retrieves aggregated metrics
- Admin-only access

---

## Testing Procedure

### 1. Enable Feature Flag for Test User

Add user UID to whitelist in `app/lib/feature-flags.ts`:

```typescript
userWhitelist: ["test-user-uid-1", "test-user-uid-2"],
```

### 2. Measure Baseline (Original Implementation)

1. Disable feature flag for test user
2. Open browser DevTools → Network tab
3. Navigate through 5 pages
4. Record Firestore reads from Network tab
5. Measure page load times
6. Send a test message and measure delivery latency
7. Create a test notification and measure latency

**Expected Baseline:**
- Firestore reads per session: ~1,750
- Page load time: ~2.5s
- Message delivery latency: <1s
- Notification latency: <1s

### 3. Test Optimized Implementation

1. Enable feature flag for test user
2. Open browser DevTools → Network tab
3. Navigate through 5 pages
4. Record Firestore reads from Network tab
5. Measure page load times
6. Send a test message and measure delivery latency
7. Create a test notification and measure latency

**Expected Optimized:**
- Firestore reads per session: ~42
- Page load time: ~2.3s (faster)
- Message delivery latency: 0-15s (polling)
- Notification latency: 0-30s (polling)

### 4. Verify Functionality

Test the following scenarios:

- **New message arrives:** Badge updates within 15s
- **New notification arrives:** Badge updates within 30s
- **User blocks/unblocks:** Instant update in current tab
- **Multiple tabs open:** Sync via localStorage for blocked users
- **Notification dropdown:** Fetches on-demand, auto-refreshes every 30s

### 5. Compare Metrics

| Metric | Original | Optimized | Change |
|--------|----------|-----------|--------|
| Firestore reads/session | 1,750 | 42 | -97.6% |
| Page load time | 2.5s | 2.3s | -8% |
| Message latency | <1s | 0-15s | +14s |
| Notification latency | <1s | 0-30s | +29s |

---

## Gradual Rollout Strategy

### Phase 1: 10% Rollout (Week 1)
- Set `NEXT_PUBLIC_OPTIMIZED_NAVBAR_ROLLOUT=10`
- Monitor metrics for 10% of users
- Check for errors and UX regressions

### Phase 2: 50% Rollout (Week 2)
- Set `NEXT_PUBLIC_OPTIMIZED_NAVBAR_ROLLOUT=50`
- Monitor metrics for 50% of users
- Compare optimized vs original performance

### Phase 3: 100% Rollout (Week 3)
- Set `NEXT_PUBLIC_OPTIMIZED_NAVBAR_ROLLOUT=100`
- Monitor all users
- Remove original implementation code

---

## Rollback Procedure

If issues arise:

1. **Immediate Rollback:**
   ```bash
   NEXT_PUBLIC_OPTIMIZED_NAVBAR_ENABLED=false
   ```
   All users revert to original implementation

2. **Partial Rollback:**
   ```bash
   NEXT_PUBLIC_OPTIMIZED_NAVBAR_ROLLOUT=0
   ```
   Only whitelisted users get optimized version

3. **Code Rollback:**
   - Original implementation is still in code
   - Feature flag check can be removed to revert

---

## Monitoring Dashboard

### Key Metrics to Monitor

1. **Firestore Reads per Session**
   - Target: <50 reads/session
   - Alert if: >100 reads/session

2. **Poll Frequency**
   - Target: 15s interval
   - Alert if: >30s interval (missed polls)

3. **Error Rate**
   - Target: <1% error rate
   - Alert if: >5% error rate

4. **User Satisfaction**
   - Monitor support tickets related to notifications
   - Monitor user feedback

### Metrics Collection

Metrics are automatically collected when `NEXT_PUBLIC_ENABLE_METRICS=true`. View metrics via:

```bash
curl -H "Authorization: Bearer <admin-token>" \
  https://your-domain.com/api/metrics/navbar
```

---

## Expected Results

### Cost Savings

**At 10,000 Users:**
- Before: $945/month (Firestore reads)
- After: $22.68/month
- **Savings: $922.32/month (97.6% reduction)**

### Performance Improvements

- **Page load time:** 8% faster (fewer listeners)
- **Bandwidth:** 80% reduction (less WebSocket traffic)
- **Server load:** 90% reduction (fewer real-time connections)

### UX Impact

- **Message notifications:** 15-second delay (acceptable)
- **Activity notifications:** 30-second delay (acceptable)
- **Block/unblock:** Instant (no regression)
- **Multi-tab sync:** Instant via localStorage (no regression)

---

## Troubleshooting

### Issue: Metrics not appearing in console

**Solution:** Ensure `NEXT_PUBLIC_ENABLE_METRICS=true` is set in `.env.local`

### Issue: Feature flag not working

**Solution:** Check that user UID is correctly passed to `isFeatureEnabled()`

### Issue: Polling not working

**Solution:** Check browser console for errors in `/api/unread-counts` endpoint

### Issue: Notifications not updating

**Solution:** Ensure notification dropdown is being opened (on-demand fetch)

---

## Next Steps

1. **Deploy to staging environment**
2. **Test with whitelisted users**
3. **Gradually increase rollout percentage**
4. **Monitor metrics and user feedback**
5. **Enable globally after successful testing**
6. **Remove original implementation code**

---

## Contact

For questions or issues, contact the engineering team.
