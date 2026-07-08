/** DOM-based page actions for Āwhina Voice — open listings, message seller, scroll, switch tabs. */

export type PageActionResult = { ok: boolean; path?: string };

export function findListingCards(): NodeListOf<Element> {
  return document.querySelectorAll(".listing-card");
}

export function findListingLinks(): { href: string; el: HTMLAnchorElement }[] {
  const seen = new Set<string>();
  const links: { href: string; el: HTMLAnchorElement }[] = [];
  for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href*='/post/listing/']")) {
    if (!seen.has(a.href)) {
      seen.add(a.href);
      links.push({ href: a.href, el: a });
    }
  }
  return links;
}

export function openListingByIndex(index: number): PageActionResult {
  const cards = findListingCards();
  if (cards.length > index) {
    const card = cards[index] as HTMLElement;
    const link = card.querySelector<HTMLAnchorElement>("a[href*='/post/listing/']");
    if (link) {
      link.click();
      return { ok: true, path: link.href };
    }
    card.click();
    return { ok: true };
  }
  const links = findListingLinks();
  if (links.length > index) {
    links[index].el.click();
    return { ok: true, path: links[index].href };
  }
  return { ok: false };
}

export function messageSellerOnPage(): PageActionResult {
  const sel =
    document.querySelector<HTMLAnchorElement>('a[href*="/messages"]') ??
    document.querySelector<HTMLButtonElement>('button[data-voice="message-seller"]') ??
    document.querySelector<HTMLElement>('[aria-label*="message"]') ??
    document.querySelector<HTMLElement>('[aria-label*="Message seller"]');
  if (sel) {
    sel.click();
    const path = sel.getAttribute("href") ?? undefined;
    return { ok: true, path };
  }
  const fallback =
    document.querySelector<HTMLAnchorElement>('a[href*="#contact"]') ??
    document.querySelector<HTMLAnchorElement>('a[href*="/messages/"]');
  if (fallback) {
    fallback.click();
    return { ok: true, path: fallback.href };
  }
  return { ok: false };
}

function updateSearchUrl(mutator: (params: URLSearchParams) => void): string | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  mutator(url.searchParams);
  return `${url.pathname}?${url.searchParams.toString()}`;
}

export function refineSearchOnPage(
  refinement:
    | { type: "location"; value: string }
    | { type: "maxPrice"; value: string }
    | { type: "saleType"; value: "auction" | "buy_now" | "auction_buy_now" }
    | { type: "sortBy"; value: "price-low" | "price-high" | "newest" | "popular" }
): PageActionResult {
  if (typeof window === "undefined" || !window.location.pathname.startsWith("/search")) {
    return { ok: false };
  }
  const next = updateSearchUrl((params) => {
    if (refinement.type === "location") {
      params.set("location", refinement.value.toLowerCase());
      return;
    }
    if (refinement.type === "maxPrice") {
      params.set("maxPrice", refinement.value);
      return;
    }
    if (refinement.type === "saleType") {
      params.set("saleType", refinement.value);
      return;
    }
    params.set("sortBy", refinement.value);
  });
  if (!next) return { ok: false };
  window.location.assign(next);
  return { ok: true, path: next };
}

export function showSimilarListingsOnPage(): PageActionResult {
  if (typeof window === "undefined" || !window.location.pathname.includes("/post/listing/")) {
    return { ok: false };
  }
  const title =
    document.querySelector("h1")?.textContent?.trim() ||
    document.title.split("—")[0]?.trim() ||
    "";
  const category =
    document.querySelector('[class*="rounded-full"][class*="text-sky-400"]')?.textContent?.trim() || "";
  const seed = `${title} ${category}`.trim();
  if (!seed) return { ok: false };
  const q = encodeURIComponent(seed.split(/\s+/).slice(0, 6).join(" "));
  const path = `/search?q=${q}`;
  window.location.assign(path);
  return { ok: true, path };
}

export function prepareOfferOnPage(amount: string): PageActionResult {
  const offerInput =
    document.querySelector<HTMLInputElement>('input[placeholder*="offer" i]') ??
    document.querySelector<HTMLInputElement>('input[type="number"]');
  const offerButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find((btn) =>
    /make offer|send offer|offer/i.test(btn.textContent || "")
  );
  if (!offerInput || !offerButton) return { ok: false };
  offerInput.focus();
  offerInput.value = amount;
  offerInput.dispatchEvent(new Event("input", { bubbles: true }));
  return { ok: true };
}

export function switchTab(tabId: string): PageActionResult {
  const tab =
    document.querySelector<HTMLElement>(`[role="tab"][data-tab="${tabId}"]`) ??
    document.querySelector<HTMLElement>(`[role="tab"][aria-controls="${tabId.toLowerCase()}"]`) ??
    findTabByText(tabId);
  if (tab) {
    tab.click();
    return { ok: true, path: `#${tabId}` };
  }
  return { ok: false };
}

function findTabByText(text: string): HTMLElement | null {
  const lower = text.toLowerCase();
  for (const el of document.querySelectorAll<HTMLElement>('[role="tab"]')) {
    if (el.textContent?.trim().toLowerCase() === lower) return el;
  }
  for (const el of document.querySelectorAll<HTMLButtonElement>("button")) {
    if (el.textContent?.trim().toLowerCase() === lower) return el;
  }
  return null;
}

/* ── Scroll Actions ── */

export function scrollDown(): PageActionResult {
  window.scrollBy({ top: window.innerHeight * 0.7, behavior: "smooth" });
  return { ok: true };
}

export function scrollUp(): PageActionResult {
  window.scrollBy({ top: -window.innerHeight * 0.7, behavior: "smooth" });
  return { ok: true };
}

export function scrollToTop(): PageActionResult {
  window.scrollTo({ top: 0, behavior: "smooth" });
  return { ok: true };
}

export function scrollToBottom(): PageActionResult {
  window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  return { ok: true };
}
