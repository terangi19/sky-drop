import { parseFirestoreDate } from "./date-format";

const PROFILE_DATE_FIELDS = [
  "memberSince",
  "createdAt",
  "lastActive",
  "updatedAt",
  "verifiedAt",
] as const;

/** Convert Firestore timestamp fields to ISO strings for JSON API responses. */
export function serializeProfileForClient(
  data: Record<string, unknown>
): Record<string, unknown> {
  const profile = { ...data };
  for (const key of PROFILE_DATE_FIELDS) {
    const value = profile[key];
    if (value == null) continue;
    const date = parseFirestoreDate(value);
    if (date) profile[key] = date.toISOString();
  }
  return profile;
}
