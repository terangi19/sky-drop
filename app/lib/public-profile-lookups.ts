/**
 * Email→UID resolution is an account-existence oracle (see #18).
 * Unauthenticated callers may look up public profiles by UID only.
 * Signed-in callers may also resolve emails (inbox / legacy listings).
 */
export function selectPublicProfileLookups(opts: {
  uids: string[];
  emails: string[];
  authenticated: boolean;
}): { uids: string[]; emails: string[] } {
  return {
    uids: opts.uids,
    emails: opts.authenticated ? opts.emails : [],
  };
}
