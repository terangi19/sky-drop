# Debugging: Unexpected New Tabs / Navigation

Investigation notes for reports of unwanted new tabs or stray navigation (e.g. `/profile//login`).

## Enable diagnostics

Add `?debugTabs=1` to any URL, or run in the browser console:

```js
localStorage.setItem("skydrop:debugTabs", "1");
location.reload();
```

Disable:

```js
localStorage.removeItem("skydrop:debugTabs");
location.reload();
```

With diagnostics on, `app/layout.tsx` logs:

- Every `window.open()` call with URL, target, and stack trace
- `history.pushState` / `history.replaceState` with destination and stack
- Clicks on `a[target="_blank"]` links

Filter the console for `[skydrop:debugTabs]`.

## Investigation checklist

### 1. `window.open` override (layout.tsx)

Primary signal for code-driven new tabs. If nothing logs when a tab opens, the source is likely:

- A browser extension
- A service worker (`clients.openWindow` in `public/firebase-messaging-sw.js` on notification click)
- A native `target="_blank"` navigation the browser handles without calling `window.open`

### 2. Browser extensions

Temporarily disable ad blockers, privacy extensions, and password managers. Re-test in a clean Chrome profile or Incognito with extensions off.

Common false positives:

- Extensions injecting login/overlay iframes
- Coupon/shopping extensions rewriting links

### 3. PWA / notification permission (PWAProvider)

`app/components/PWAProvider.tsx` registers FCM and requests notification permission when a user is signed in.

**Previous behaviour:** `Notification.requestPermission()` ran on every `onAuthStateChanged` fire (including silent token refresh). That can re-trigger permission UI or focus changes that feel like a new tab.

**Fix applied:** Only prompt when `Notification.permission === "default"`, once per page load. If already granted, fetch the FCM token without re-prompting.

Background notification clicks still open tabs via the service worker — that is expected when the user clicks a push notification.

### 4. Auth redirects and `/profile//login`

Login/signup read `?redirect=` and call `router.push(redirectTo)` after auth.

**Risk:** Malformed values like `/profile//login` or `//evil.com` pass through unchecked.

**Fix applied:** `sanitizeRedirectPath()` in `app/lib/safe-redirect.ts` normalizes duplicate slashes and rejects open redirects.

Profile sign-in link now includes `?redirect=/profile` so users return to profile after login.

### 5. Known legitimate new-tab sources in app code

| Source | File | Trigger |
|--------|------|---------|
| `target="_blank"` links | Footer (Gmail, Stripe), listing payment help, admin manage pages | User click |
| Stripe Connect onboarding | `app/profile/page.tsx` | `window.location.href` (same tab) |
| FCM notification click | `public/firebase-messaging-sw.js` | `clients.openWindow(url)` |

No app code calls `window.open()` directly.

## Repro steps to capture a trace

1. Enable `?debugTabs=1`
2. Reproduce the unwanted tab
3. Check console for `[skydrop:debugTabs]` entries
4. If empty → check extensions and service worker notification clicks
5. Note current URL, auth state, and whether a notification permission prompt appeared

## Auth state churn

Multiple components subscribe to `onAuthStateChanged` (AuthProvider, ProfileProvider, PWAProvider, RouteGuard, Navbar, profile page). Token refresh fires all of them without signing the user out. Only PWAProvider had side effects (permission prompt); others update React state only.
