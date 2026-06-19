"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { auth, onAuthStateChanged } from "../lib/firebase";

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (auth.currentUser) {
      setChecking(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, () => setChecking(false));
    return () => unsub();
  }, [pathname]);

  if (checking) return null;

  return <div key={pathname}>{children}</div>;
}
