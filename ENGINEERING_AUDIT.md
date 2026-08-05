# Sky Drop Engineering Audit Report

**Date:** 2026-08-05  
**Scope:** Design system, shared UI primitives, marketplace shell, listing/search/home polish  
**Constraint:** Preserve V1 messaging-first CTAs and dark sky brand

---

## 1. What was improved

### Design system
- Consolidated spacing, type, radius, shadow, motion, and status tokens in `app/globals.css`
- Shadows are elevation-based (not glow); listing card hover uses `--shadow-md`
- Defined missing `--border` / `--border-hover` aliases (were referenced but undefined)
- Shared `.btn` / `.btn-primary|secondary|ghost|danger` primitives with focus-visible + touch min height
- Reduced-motion respect on listing cards

### Shared components
- `ui/Button` — solid accent CTAs, no gradient theater
- `EmptyState` — token-driven empty states
- `LoadingCard` / `LoadingSkeleton` — replace bespoke shimmer blocks
- `AnimatedButton` → thin alias to `ui/Button`
- `ListingCard` → shim to `MarketplaceListingCard` (single card implementation)
- Delete confirmation on listing cards themed with CSS vars + dialog semantics

### Surfaces polished
- **Navbar:** removed active-state glow / gradient underlines; solid sky fill; dropdown uses tokens
- **Background:** restrained sky wash (no drifting orbs)
- **Home:** `LoadingCard` grid skeletons; empty CTAs already on `.btn`
- **Search:** `EmptyState` + `LoadingCard`; removed glow empty illustration
- **Listing detail:** primary + sticky Message Seller CTAs use `.btn-primary` / `.btn-secondary`
- **Browse categories:** toned `font-black` → `font-semibold`; sell CTA uses `.btn-primary`

### V1 product preserved
- Message Seller / contact-only checkout when flags off
- Stripe components retained behind flags
- Dark-first sky accent brand kept

---

## 2. Remaining issues (priority)

| P | Issue |
|---|--------|
| P0 | Light-mode `:root.light` still has a large `!important` Tailwind override wall — shrink as pages adopt tokens |
| P1 | Many listing-detail secondary CTAs still use one-off gradients (Edit / Boost / auction paths) |
| P1 | Home filter empty state still custom (not yet `EmptyState`) — welcome path is intentional |
| P2 | Emoji category tiles / some marketing pages still feel decorative vs product chrome |
| P2 | `FloatingActionGroup` vs `AwhinaFabStack` / dock overlap — consolidate FAB stacking |
| P2 | Confirm dialogs duplicated across messages (4×) — extract `ConfirmDialog` |
| P3 | Admin / manage surfaces not in this pass |
| P3 | Profile / sell form density and payments tab chrome when flags on |

---

## 3. Further refinement suggestions

1. Migrate remaining gradient CTAs to `.btn-*` with a codemod / lint rule forbidding `shadow-[0_0_` and `bg-gradient-to-r from-sky` on interactive controls
2. Prefer `var(--foreground)` / `font-semibold` over `font-black text-white` for headings
3. Adopt `EmptyState` on watchlist, purchases, sales empty views
4. Lazy-load heavy modals already partially done — extend to OfferPaymentModal / CheckoutModal when payments on
5. Add Storybook or a `/design` preview page for tokens + buttons + empty/loading for design QA

---

## 4. Technical debt (later)

- Slim light-mode CSS overrides once components stop hardcoding `bg-zinc-*`
- Deduplicate conversation confirm modals on Messages
- Resolve FAB stack ownership (Awhina vs marketplace docks)
- Dead `neonGlow` / fake image dots on cards — remove or wire intentionally
- Bundle analysis for home lazy boundaries

---

## 5. Quality score

**7.0 / 10**

**Justification:** Shared tokens and primitives now exist and are adopted on the highest-traffic shell (nav, cards, search empty/loading, listing primary CTA). The product no longer feels like uncoordinated glow/gradient one-offs on those surfaces. Score is not higher because light-mode override debt, secondary listing CTAs, admin surfaces, and full empty-state adoption remain incomplete — a second senior pass would push toward 8+.

---

## Commits in this polish wave

See git history for design-system / UI polish commits following this report.
