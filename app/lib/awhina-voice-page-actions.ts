/** DOM actions for contextual voice commands (search results, listing pages). */

export function findListingCards(): HTMLElement[] {
  if (typeof document === "undefined") return [];
  return Array.from(document.querySelectorAll<HTMLElement>(".listing-card"));
}

export function findListingLinks(): HTMLAnchorElement[] {
  if (typeof document === "undefined") return [];
  const anchors = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('a[href*="/post/listing/"]')
  );
  const seen = new Set<string>();
  return anchors.filter((a) => {
    const href = a.getAttribute("href") || "";
    if (!href.includes("/post/listing/") || seen.has(href)) return false;
    seen.add(href);
    return true;
  });
}

function listingPathFromElement(el: HTMLElement): string | null {
  const link = el.querySelector<HTMLAnchorElement>('a[href*="/post/listing/"]');
  const href = link?.getAttribute("href");
  return href ? href.split("?")[0] : null;
}

export function openListingByIndex(index: number): { ok: true; path: string } | { ok: false } {
  const cards = findListingCards();
  if (cards[index]) {
    cards[index].click();
    const path = listingPathFromElement(cards[index]);
    if (path) return { ok: true, path };
  }

  const links = findListingLinks();
  const link = links[index];
  if (!link) return { ok: false };
  const href = link.getAttribute("href");
  if (!href) return { ok: false };
  link.click();
  return { ok: true, path: href.split("?")[0] };
}

export function messageSellerOnPage(): { ok: true; path?: string } | { ok: false } {
  if (typeof document === "undefined") return { ok: false };

  const messageBtn = document.querySelector<HTMLElement>(
    'a[href*="/messages"], button[data-voice="message-seller"], [aria-label*="message" i], [aria-label*="Message seller" i]'
  );
  if (messageBtn) {
    messageBtn.click();
    const href = messageBtn instanceof HTMLAnchorElement ? messageBtn.href : undefined;
    return { ok: true, path: href };
  }

  const contact = document.querySelector<HTMLAnchorElement>('a[href*="#contact"], a[href*="/messages/"]');
  if (contact) {
    contact.click();
    return { ok: true, path: contact.getAttribute("href") || undefined };
  }

  return { ok: false };
}

/**
 * Switch to a tab on the current page by finding the tab button with
 * matching role="tab" and aria-selected or text content.
 */
export function switchTab(tabId: string): { ok: true; path?: string } | { ok: false } {
  if (typeof document === "undefined") return { ok: false };

  const tabs = document.querySelectorAll<HTMLElement>('[role="tab"]');
  for (const tab of tabs) {
    const match =
      tab.getAttribute("data-tab") === tabId ||
      tab.textContent?.toLowerCase().trim() === tabId.toLowerCase() ||
      tab.getAttribute("aria-controls") === tabId;
    if (match) {
      tab.click();
      return { ok: true, path: `#${tabId}` };
    }
  }

  const buttons = document.querySelectorAll<HTMLButtonElement>("button");
  for (const btn of buttons) {
    const text = btn.textContent?.toLowerCase().trim();
    if (text === tabId.toLowerCase()) {
      btn.click();
      return { ok: true, path: `#${tabId}` };
    }
  }

  return { ok: false };
}
