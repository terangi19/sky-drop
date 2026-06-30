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
