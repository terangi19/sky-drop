import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

/**
 * Source-guard + numeric contrast test (repo has no jsdom). /login is a hard-coded dark surface
 * (#090d14 page, #111722 card) in both themes, but the light-theme global remaps
 * (`.text-white` / `.text-slate-300` -> --foreground, `.text-slate-400/500` -> --muted) made its
 * heading + subtitle dark-on-dark. Measured in headless Chrome (light theme):
 * heading 1.08:1 -> 17.96:1, subtitle 1.08:1 -> 12.09:1, helper text 2.81:1 -> 7.00:1.
 */
const root = process.cwd();
const css = readFileSync(path.join(root, "app/globals.css"), "utf8");
const login = readFileSync(path.join(root, "app/login/page.tsx"), "utf8");

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
const CARD = "#111722";

describe("/login copy stays readable on its always-dark card in the light theme", () => {
  it("page opts into the dark-surface scope; card colours are unchanged", () => {
    expect(login).toMatch(/<main className="login-dark-surface [^"]*bg-\[#090d14\]/);
    expect(login).toContain("bg-[#111722]");
  });

  it("light-theme remaps that caused the bug are pinned back for this page only", () => {
    const pin = (cls: string, color: string) =>
      expect(css).toMatch(new RegExp(`:root\\.light \\.login-dark-surface \\.${cls}(?:,[^{]*)?\\s*\\{\\s*color: ${color} !important;`));
    pin("text-white", "#ffffff");
    pin("text-slate-300", "#cbd5e1");
    pin("text-slate-400", "#94a3b8");
    pin("text-slate-500", "#64748b");
    // the global remaps are untouched
    expect(css).toContain(":root.light .text-white { color: var(--foreground) !important; }");
    expect(css).toContain(":root.light .text-slate-300 { color: var(--foreground) !important; }");
  });

  it("pinned colours on the #111722 card: heading/subtitle/helper >= 4.5:1 (AA); old dark foreground was 1.08:1", () => {
    expect(contrast("#0c0d10", CARD)).toBeLessThan(1.2); // the bug
    expect(contrast("#ffffff", CARD)).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#cbd5e1", CARD)).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#94a3b8", CARD)).toBeGreaterThanOrEqual(4.5);
    // slate-500 is only used for the "NEW TO SKY DROP?" divider and the legal footnote (same as dark theme)
    expect(contrast("#64748b", CARD)).toBeGreaterThanOrEqual(3);
  });
});
