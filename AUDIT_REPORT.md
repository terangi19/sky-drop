# Sky Drop Engineering Audit Report

**Date:** 2026-08-05  
**Scope:** Product shell + top funnels (home, browse, listing detail, messages, sell entry, search). Admin/manage deferred.

## Quality score: **7.4 / 10**

Solid dark-sky marketplace foundation and real token work; craft is much closer to production. Remaining gap is legacy one-off CTA/glow classes on dense pages (listing detail branches, profile, dashboard gamification) and the light-mode override wall still being brittle.

---

## 1. What improved

### Design system
- Expanded tokens: shadow scale, motion, status colors, accent, focus
- Shared `.btn` / `.btn-primary|secondary|ghost|danger` primitives + `ui/Button.tsx`
- Softened listing-card hover (elevation, not neon bloom)
- Fixed missing `.animate-shimmer`
- Light mode: restored semantic status/sky colors (no longer forced to pure black)
- Removed global light-mode button lift/glow
- Brief `DESIGN_SYSTEM.md`

### Shared components
- **Unified listing cards** — `ListingCard` → shim; Vehicles/Property use `MarketplaceListingCard`
- Card a11y: keyboard activation, `aria-label`, focus ring
- Default `neonGlow={false}`; removed runtime glow math / watchlist bloom
- `EmptyState`, `Toast`, `LoadingSpinner`/`LoadingCard`, calmer `Background`

### Surfaces
- Navbar: fixed duplicate browse links; removed duplicate Messages; SVG theme icon
- Browse hero / category config: less glow, no emoji trust/trending strings
- Home empty states + trending label cleaned
- Search: neon off
- Sell entry (`/post`): icons instead of emoji, solid CTAs
- Messages: selection glow removed
- Listing detail: fuchsia CTAs removed; primary CTA glow dialed down
- Services/rentals: emoji chips removed

---

## 2. Remaining issues (priority)

| P | Issue |
|---|--------|
| P0 | Listing detail still has many duplicated gradient CTA class strings — extract shared sticky CTA component |
| P1 | Light-mode `!important` override wall (~1k lines) still fragile; migrate surfaces to CSS vars |
| P1 | Profile / dashboard / HotThisWeek still heavier “AI polish” than home grid |
| P2 | `font-black` density on titles/prices across browse pages |
| P2 | Loot-crate / legendary animation CSS shares `globals.css` with marketplace chrome |
| P3 | Admin/manage emoji + gradient stat cards (out of scope this pass) |

---

## 3. Further refinement

1. Migrate listing-detail purchase CTAs to `.btn btn-primary` / one `ListingCta` component
2. Replace home/search bespoke skeletons with `LoadingCard`
3. Soften `HotThisWeek` neon cards to match grid
4. Progressive removal of light-mode Tailwind color hammers
5. Audit sticky mobile CTA + bottom-nav z-index once more on real devices

---

## 4. Technical debt

- Dual path `src/app/globals.css` stub (if unused, delete)
- Unused `onMakeOffer` prop on card (kept for call-site compatibility)
- `AnimatedButton` now re-exports `ui/Button` — update any docs pointing at old API
- Message-first Stripe flags preserved; do not reintroduce checkout UI when disabled

---

## 5. Score justification

| Area | /10 | Notes |
|------|-----|--------|
| Design tokens | 8.5 | Cohesive; code is source of truth |
| Component consistency | 7.5 | Cards unified; CTAs partially migrated |
| Visual craft | 7.0 | Glow/emoji cut on top funnels |
| A11y | 7.5 | Card keyboard + focus; more landmarks later |
| Motion | 8.0 | Calmer; reduced-motion on cards |
| Light mode | 6.0 | Better semantics; override wall remains |
| Completeness | 6.5 | Admin/profile/dashboard not fully polished |

**Overall 7.4** — production-team trajectory on shell + browse; not yet Stripe/Linear-level consistency on every surface.
