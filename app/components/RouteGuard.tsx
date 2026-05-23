"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";

const PROTECTED_ROUTES = [
  "/messages",
  "/profile",
  "/post",
  "/post/ai",
  "/list-list",
  "/watchlist",
  "/trade-feed",
  "/reports",
  "/reviews",
];

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      const isProtected = PROTECTED_ROUTES.some((route) =>
        pathname.startsWith(route)
      );
      if (isProtected && !user) {
        router.replace("/login");
      } else {
        setChecking(false);
      }
    });
    return () => unsub();
  }, [pathname, router]);

  if (checking) return null;

  return <div key={pathname}>{children}</div>;
}
