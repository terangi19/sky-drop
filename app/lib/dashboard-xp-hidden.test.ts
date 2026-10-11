import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * profiles.xp / level / badges are server-managed (firestore.rules profile create/update deny-lists),
 * and nothing server-side awards XP, so every client awardXP / setUserLevel write is denied and the
 * dashboard "Level N · X XP" chip was frozen. V1 hides it.
 */
describe("V1 dashboard does not show XP / level", () => {
  const dash = read("app/dashboard/page.tsx");

  it("no Level chip, XP bar, or XP helpers on /dashboard", () => {
    expect(dash).not.toMatch(/Level \{/);
    expect(dash).not.toMatch(/\} XP</);
    expect(dash).not.toContain("getLevelInfo");
    expect(dash).not.toContain("setUserLevel");
    expect(dash).not.toMatch(/from "\.\.\/lib\/xp"/);
  });

  it("keeps the admin shortcut", () => {
    expect(dash).toMatch(/isAdminEmail\(user\.email\) && \(\s*<Link\s+href="\/admin"/);
  });

  it("xp/level stay server-managed in firestore.rules (not loosened)", () => {
    const rules = read("firestore.rules");
    const hits = rules.match(/'badges', 'xp', 'level'/g) || [];
    expect(hits.length).toBeGreaterThanOrEqual(2); // create + update deny-lists
  });

  it("no other mounted V1 page/component renders XP or level", () => {
    for (const f of [
      "app/profile/ProfileAccountClient.tsx",
      "app/seller/[username]/page.tsx",
      "app/components/Navbar.tsx",
      "app/components/AccountMenu.tsx",
    ]) {
      const src = read(f);
      expect(src, f).not.toMatch(/\{[^}]*\bxp\b[^}]*\}\s*XP/);
      expect(src, f).not.toContain("getLevelInfo");
    }
  });
});
