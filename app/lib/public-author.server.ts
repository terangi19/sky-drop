import "server-only";

import {
  isEmailDerivedName,
  resolvePublicAuthorName,
  sanitizeAuthorNameForWrite,
} from "./safe-display-name";

export type AuthorFields = {
  displayName: unknown;
  username: string;
};

type ProfileDb = {
  collection: (name: string) => {
    doc: (id: string) => {
      get: () => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
    };
  };
};

export async function loadAuthorFields(db: ProfileDb, uid: string): Promise<AuthorFields> {
  if (!uid) return { displayName: "", username: "" };
  try {
    const snap = await db.collection("profiles").doc(uid).get();
    const data = snap.exists ? snap.data() || {} : {};
    return {
      displayName: data.displayName,
      username: typeof data.username === "string" ? data.username.trim() : "",
    };
  } catch {
    console.error("[public-author] profile read failed");
    return { displayName: "", username: "" };
  }
}

/** Neutral author label. Ignores auto-assigned usernames. */
export function authorNameForWrite(
  fields: AuthorFields,
  email: string | null | undefined
): string {
  return resolvePublicAuthorName({
    displayName: fields.displayName,
    username: fields.username,
    email,
  });
}

/**
 * Persist the profile username only when it is user-chosen.
 * Auto-assigned slugs stay on the profile (routing) and are not copied into
 * shout/reply/Q&A name fields. Seller listing writes still store the slug
 * separately when it does not contain "@".
 */
export function chosenUsernameForWrite(
  fields: AuthorFields,
  email: string | null | undefined
): string {
  const username = sanitizeAuthorNameForWrite(fields.username, email);
  if (!username || username.includes("@") || isEmailDerivedName(username, email)) return "";
  return username;
}
