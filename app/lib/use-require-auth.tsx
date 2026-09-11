"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { auth, onAuthStateChanged } from "./firebase";
import { loginRedirectHref } from "./safe-redirect";

/** Current path + query for post-login return. Safe during SSR. */
export function currentReturnPath(fallback = "/"): string {
  if (typeof window === "undefined") return fallback;
  return `${window.location.pathname}${window.location.search}` || fallback;
}

/** Send the browser to a sanitized `/login?redirect=…` URL. */
export function replaceWithLoginRedirect(returnPath?: string): void {
  window.location.replace(loginRedirectHref(returnPath || currentReturnPath()));
}

/**
 * Same client gate as `/messages`: wait for Firebase auth, then send
 * logged-out visitors to login with a sanitized return URL.
 * Callers must not render protected UI while `!authReady || !user`.
 */
export function useRequireAuth(fallbackPath = "/"): {
  user: User | null;
  authReady: boolean;
} {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      if (!mounted) return;
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!authReady || user) return;
    replaceWithLoginRedirect(currentReturnPath(fallbackPath));
  }, [authReady, user, fallbackPath]);

  return { user, authReady };
}

/** Spinner + sign-in link shown instead of protected UI while redirecting. */
export function AuthGatePlaceholder({
  fallbackPath = "/",
  message = "Sign in to continue.",
}: {
  fallbackPath?: string;
  message?: string;
}) {
  const href =
    typeof window === "undefined"
      ? loginRedirectHref(fallbackPath)
      : loginRedirectHref(currentReturnPath(fallbackPath));

  return (
    <div className="flex flex-col items-center justify-center p-12 text-center">
      <div
        className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500/30 border-t-sky-400"
        aria-hidden
      />
      <p className="mt-4 text-sm text-[var(--muted)]">{message}</p>
      <a
        href={href}
        className="mt-4 inline-flex items-center rounded-lg bg-sky-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-400"
      >
        Sign in
      </a>
    </div>
  );
}
