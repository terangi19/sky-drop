/**
 * Email→UID resolution is an account-existence oracle (see #18).
 * Unauthenticated callers may look up public profiles by UID only.
 * Signed-in callers may resolve emails only while their per-uid budget allows.
 */
export function selectPublicProfileLookups(opts: {
  uids: string[];
  emails: string[];
  authenticated: boolean;
  /** False when the per-uid minute or daily email-lookup budget is exhausted. */
  emailBudgetOk: boolean;
}): { uids: string[]; emails: string[] } {
  const allowEmails = opts.authenticated && opts.emailBudgetOk;
  return {
    uids: opts.uids,
    emails: allowEmails ? opts.emails : [],
  };
}
