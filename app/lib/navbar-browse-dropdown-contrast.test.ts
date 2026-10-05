import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * Source-guard + numeric contrast test (repo has no jsdom). In the LIGHT theme the navbar forces
 * `color:#fff !important` on every descendant of header.site-navbar, and the Browse panel's
 * background is the light --dropdown-bg (#fff): white-on-white (1.00:1). Panels carrying the
 * `app-menu-panel` class get the dark-on-light override; the Browse panel did not.
 * Measured in headless Chrome: before = 1.00:1, after = 19.43:1 (labels) / 6.39:1 (descriptions).
 */
const root = process.cwd();
const css = readFileSync(path.join(root, "app/globals.css"), "utf8");
const navbar = readFileSync(path.join(root, "app/components/Navbar.tsx"), "utf8");

function lum(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
function block(selector: string): string {
  const i = css.indexOf(selector + " {");
  expect(i, selector).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf("}", i));
}
function token(scope: string, name: string): string {
  const m = block(scope).match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`));
  expect(m, `${scope} ${name}`).not.toBeNull();
  return (m as RegExpMatchArray)[1];
}

describe("navbar Browse dropdown is readable in both themes", () => {
  it("the Browse panel carries app-menu-panel (gets the dark-on-light override under header.site-navbar)", () => {
    const i = navbar.indexOf("BROWSE_LINKS.map");
    const panel = navbar.slice(navbar.lastIndexOf("<div", i - 1), i);
    expect(panel).toContain("app-menu-panel");
    expect(panel).toContain("bg-[var(--dropdown-bg)]"); // design unchanged
    expect(css).toMatch(/:root\.light header\.site-navbar \.app-menu-panel \*\s*\{\s*color: var\(--foreground\) !important;/);
  });

  it("light theme: foreground / muted on --dropdown-bg meet WCAG AA (>= 4.5:1); the old white-on-white was 1.0:1", () => {
    const bg = token(":root.light", "--dropdown-bg");
    const fg = token(":root.light", "--foreground");
    const muted = token(":root.light", "--muted");
    expect(contrast("#ffffff", bg)).toBeLessThan(1.1); // the bug
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(muted, bg)).toBeGreaterThanOrEqual(4.5);
    expect(css).toMatch(/\.app-menu-panel \.text-\\\[var\\\(--muted\\\)\\\],[\s\S]{0,120}color: var\(--muted\) !important;/);
  });

  it("dark theme (unchanged): foreground / muted on the dark panel meet AA", () => {
    const surface2 = (css.match(/--surface-2:\s*(#[0-9a-fA-F]{6})/) as RegExpMatchArray)[1];
    const fg = token(":root", "--foreground");
    const muted = token(":root", "--muted");
    expect(contrast(fg, surface2)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(muted, surface2)).toBeGreaterThanOrEqual(4.5);
  });
});
