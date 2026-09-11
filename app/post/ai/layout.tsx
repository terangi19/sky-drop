"use client";

import { AuthGatePlaceholder, useRequireAuth } from "../../lib/use-require-auth";

/**
 * Gate the listing workspace the same way /list-list is gated.
 * Kept in this layout so app/post/ai/page.tsx (Āwhina) is not rewritten.
 */
export default function PostAiLayout({ children }: { children: React.ReactNode }) {
  const { user, authReady } = useRequireAuth("/post/ai");
  if (!authReady || !user) {
    return <AuthGatePlaceholder fallbackPath="/post/ai" message="Sign in to create a listing." />;
  }
  return children;
}
