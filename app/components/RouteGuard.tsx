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
    const unsub = onAuthStateChanged(auth, (user) => {
      const isPublic = PUBLIC_ROUTES.some((route) =>
        pathname.startsWith(route)
      );
      if (!isPublic && !user) {
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
