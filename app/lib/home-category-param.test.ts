import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import {
  HOME_RESET_EVENT,
  homeCategoryHref,
  resolveHomeCategoryParam,
} from "./home-category-param";

const CHIPS = ["Cars", "Tech", "Gaming", "Fashion", "Home", "Collectibles", "Sports"];
const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

describe("resolveHomeCategoryParam (/?category= applied on load)", () => {
  it("returns All for missing / empty / whitespace / 'all'", () => {
    expect(resolveHomeCategoryParam(null, CHIPS)).toBe("All");
    expect(resolveHomeCategoryParam(undefined, CHIPS)).toBe("All");
    expect(resolveHomeCategoryParam("", CHIPS)).toBe("All");
    expect(resolveHomeCategoryParam("   ", CHIPS)).toBe("All");
    expect(resolveHomeCategoryParam("All", CHIPS)).toBe("All");
    expect(resolveHomeCategoryParam("all", CHIPS)).toBe("All");
  });

  it("maps a chip name to itself", () => {
    expect(resolveHomeCategoryParam("Tech", CHIPS)).toBe("Tech");
    expect(resolveHomeCategoryParam("Collectibles", CHIPS)).toBe("Collectibles");
  });

  it("is case-insensitive and trims (Launch hit /?category=cars|tech)", () => {
    expect(resolveHomeCategoryParam("cars", CHIPS)).toBe("Cars");
    expect(resolveHomeCategoryParam("TECH", CHIPS)).toBe("Tech");
    expect(resolveHomeCategoryParam("  gaming ", CHIPS)).toBe("Gaming");
  });

  it("falls back to All for unknown categories (no /vehicles-style aliasing)", () => {
    expect(resolveHomeCategoryParam("vehicles", CHIPS)).toBe("All");
    expect(resolveHomeCategoryParam("<script>", CHIPS)).toBe("All");
  });
});

describe("homeCategoryHref (chips update the URL)", () => {
  it("writes ?category= for a chip", () => {
    expect(homeCategoryHref("", "Tech")).toBe("/?category=Tech");
    expect(homeCategoryHref("", "Home")).toBe("/?category=Home");
  });

  it("removes the param for All and returns bare /", () => {
    expect(homeCategoryHref("category=Tech", "All")).toBe("/");
    expect(homeCategoryHref("", "All")).toBe("/");
  });

  it("replaces an existing category and preserves other params", () => {
    expect(homeCategoryHref("category=Tech", "Cars")).toBe("/?category=Cars");
    expect(homeCategoryHref("ref=abc&category=Tech", "Gaming")).toBe("/?ref=abc&category=Gaming");
    expect(homeCategoryHref("ref=abc&category=Tech", "All")).toBe("/?ref=abc");
  });

  it("encodes special characters", () => {
    expect(homeCategoryHref("", "A&B")).toBe("/?category=A%26B");
  });

  it("never produces path aliases like /cars", () => {
    for (const name of CHIPS) expect(homeCategoryHref("", name).startsWith("/?category=")).toBe(true);
  });
});

describe("M13 source guards (no jsdom in this repo)", () => {
  const page = read("app/page.tsx");
  const navbar = read("app/components/Navbar.tsx");
  const logo = read("app/components/SkyDropLogo.tsx");

  it("homepage seeds from useSearchParams and chips go through setCategoryAndUrl", () => {
    expect(page).toContain('import { useRouter, useSearchParams } from "next/navigation"');
    expect(page).toContain('searchParams.get("category")');
    expect(page).toContain("resolveHomeCategoryParam(categoryParam");
    expect(page).toContain('onClick={() => setCategoryAndUrl("All")}');
    expect(page).toContain("onClick={() => setCategoryAndUrl(cat.name)}");
    expect(page).not.toContain("onClick={() => setSelectedCategory(");
    expect(page).toContain("router.replace(homeCategoryHref(searchParams.toString(), name), { scroll: false })");
  });

  it("both Clear-filters paths strip ?category= via setCategoryAndUrl", () => {
    expect(page).not.toMatch(/setSelectedCategory\("All"\); setSelectedCondition/);
    expect(page).toMatch(/onAction=\{\(\) => \{\s*setCategoryAndUrl\("All"\);/);
  });

  it("homepage resets all filters on the logo event", () => {
    const at = page.indexOf("window.addEventListener(HOME_RESET_EVENT, reset)");
    expect(at).toBeGreaterThan(0);
    const body = page.slice(page.lastIndexOf("const reset = () => {", at), at);
    for (const call of [
      'setSelectedCategory("All")',
      'setSelectedCondition("All")',
      'setSelectedRegion("All")',
      'setSearch("")',
      'setSortBy("newest")',
    ]) {
      expect(body).toContain(call);
    }
  });

  it("logo stays href=\"/\" and only fires the reset event for \"/\"", () => {
    expect(HOME_RESET_EVENT).toBe("skydrop:home");
    expect(logo).toContain('href === "/" ? () => window.dispatchEvent(new CustomEvent(HOME_RESET_EVENT))');
    expect(navbar).toContain('<SkyDropLogo size="lg" href="/"');
  });

  it("Browse trigger is a button, has a pt-2 hover bridge and focus-within, and no gap margin", () => {
    const start = navbar.indexOf('aria-haspopup="true"');
    expect(start).toBeGreaterThan(0);
    const block = navbar.slice(start - 80, navbar.indexOf("{user && (", start));
    expect(block).toContain("<button type=\"button\"");
    expect(block).not.toMatch(/<Link href="\/" className=\{`flex items-center gap-1/);
    expect(block).toContain("pt-2");
    expect(block).not.toContain("mt-2");
    expect(block).toContain("group-focus-within:opacity-100");
    expect(block).toContain("group-focus-within:visible");
    expect(block).toContain("group-hover:opacity-100");
    expect(block).toContain("BROWSE_LINKS.map");
  });

  it("BROWSE_LINKS routes are unchanged and no chip alias routes were added", () => {
    for (const href of ['"/"', '"/vehicles"', '"/services"', '"/rentals"', '"/wanted"']) {
      expect(navbar).toContain(`href: ${href}`);
    }
    for (const alias of ["cars", "tech", "gaming", "home"]) {
      expect(() => readFileSync(path.join(process.cwd(), "app", alias, "page.tsx"))).toThrow();
    }
  });
});
