# Design system (source of truth: `app/globals.css`)

Sky Drop uses a dark-sky marketplace palette. Prefer CSS variables and shared primitives over one-off gradients/glows.

## Tokens (`:root` / `:root.light`)

| Layer | Variables |
|--------|-----------|
| Spacing | `--space-1` … `--space-16` |
| Type | `--text-xs` … `--text-4xl` |
| Radius | `--radius-sm` … `--radius-2xl` |
| Shadow | `--shadow-xs` … `--shadow-lg`, `--shadow-focus` |
| Motion | `--ease-out`, `--duration-fast/normal/slow` |
| Status | `--success`, `--warning`, `--danger`, `--info` (+ muted) |
| Theme | `--background`, `--foreground`, `--card`, `--muted`, `--accent-*` |
| Listing card | `--lc-*` |

## Primitives

- **Buttons:** `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger` (+ `.btn-sm` / `.btn-lg`) or `app/components/ui/Button.tsx`
- **Focus:** global `:focus-visible` + `.focus-ring`
- **Touch:** `.touch-target` / `--touch-min` (44px)
- **Empty:** `EmptyState`
- **Skeletons:** `LoadingCard` / `LoadingSkeleton` / `.animate-shimmer`
- **Cards:** `MarketplaceListingCard` only (`ListingCard` is a shim)

## Do / don’t

- Do: solid accent CTAs, elevation via `--shadow-*`, calm borders
- Don’t: purple/fuchsia CTAs, emoji badge clusters, `shadow-[0_0_Npx]` glow as default elevation, dual listing cards
