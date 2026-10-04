/**
 * Homepage category chips <-> `?category=` URL sync (M13).
 * Shareable chip URL is `/?category=Tech` (query only) — chip names are listing
 * categories, not routes, so there are no /cars-style path aliases.
 */

/** Resolve a raw `?category=` value to a known chip name (case-insensitive), else "All". */
export function resolveHomeCategoryParam(
  raw: string | null | undefined,
  knownNames: readonly string[]
): string {
  const wanted = (raw ?? "").trim().toLowerCase();
  if (!wanted || wanted === "all") return "All";
  const hit = knownNames.find((name) => name.toLowerCase() === wanted);
  return hit ?? "All";
}

/**
 * Href for the homepage with the category set (or removed for "All"),
 * preserving any other query params.
 */
export function homeCategoryHref(currentQuery: string, name: string): string {
  const params = new URLSearchParams(currentQuery);
  if (!name || name === "All") params.delete("category");
  else params.set("category", name);
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

/** Window event fired by the Sky Drop logo when it links to "/" (clears homepage filters). */
export const HOME_RESET_EVENT = "skydrop:home";
