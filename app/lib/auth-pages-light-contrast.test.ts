import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/**
 * /signup and /forgot-password are hard-coded dark surfaces (#090d14 page, #111722 card) like /login, so in the light
 * theme the global `:root.light .text-white / .text-slate-300|400|500` remaps made their copy dark-on-dark
 * (measured in headless Chrome: headings 1.08:1). They reuse the `login-dark-surface` pins from the login pack.
 */
describe("auth pages keep their dark-surface text colours in the light theme", () => {
  for (const page of ["app/signup/page.tsx", "app/forgot-password/page.tsx", "app/login/page.tsx"]) {
    it(`${page} <main> carries login-dark-surface next to bg-[#090d14]`, () => {
      const src = read(page);
      expect(src).toMatch(/<main className="login-dark-surface [^"]*bg-\[#090d14\][^"]*"/);
    });
  }

  it("every hard-coded #090d14 auth surface is scoped (no page left with the bare pattern)", () => {
    for (const page of ["app/signup/page.tsx", "app/forgot-password/page.tsx", "app/login/page.tsx"]) {
      const mains = read(page).match(/<main className="[^"]*bg-\[#090d14\][^"]*"/g) || [];
      expect(mains.length).toBeGreaterThan(0);
      for (const m of mains) expect(m).toContain("login-dark-surface");
    }
  });

  it("the scoped light-theme pins exist in globals.css (from the login pack)", () => {
    const css = read("app/globals.css");
    expect(css).toContain(":root.light .login-dark-surface .text-white");
    expect(css).toContain(":root.light .login-dark-surface .text-slate-300");
    expect(css).toContain(":root.light .login-dark-surface .text-slate-400");
  });
});
