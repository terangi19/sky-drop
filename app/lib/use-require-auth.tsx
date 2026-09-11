"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    // Firebase can stall (blocked IndexedDB, missing env). Fail closed to login
    // instead of leaving the protected shell on a spinner forever.
    const fallback = window.setTimeout(() => {
      if (mounted) setAuthReady(true);
    }, 3000);
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      if (!mounted) return;
      window.clearTimeout(fallback);
      setUser(currentUser);
      setAuthReady(true);
    });
    return () => {
      mounted = false;
      window.clearTimeout(fallback);
      unsub();
    };
  }, []);

  useEffect(() => {
    if (!authReady || user) return;
    router.replace(loginRedirectHref(currentReturnPath(fallbackPath)));
  }, [authReady, user, fallbackPath, router]);

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
    <main className="flex min-h-[40vh] flex-col items-center justify-center p-12 text-center">
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
    </main>
  );
}
