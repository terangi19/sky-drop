"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { auth, onAuthStateChanged } from "../lib/firebase";

const PUBLIC_ROUTES = [
  "/",
  "/about",
  "/blocked",
  "/faqs",
  "/login",
  "/register",
  "/reset-password",
  "/terms",
  "/privacy",
];

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (auth.currentUser) {
      setChecking(false);
      return;
    }
    let timer = setTimeout(() => {
      const isPublic = PUBLIC_ROUTES.some((route) =>
        pathname.startsWith(route)
      );
      if (!isPublic) {
        router.replace("/login?redirect=" + encodeURIComponent(pathname));
      } else {
        setChecking(false);
      }
    }, 1500);
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        clearTimeout(timer);
        setChecking(false);
      }
    });
    return () => { unsub(); clearTimeout(timer); };
  }, [pathname, router]);

  if (checking) return null;

  return <div key={pathname}>{children}</div>;
}
