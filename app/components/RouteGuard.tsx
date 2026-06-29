"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { auth, onAuthStateChanged } from "../lib/firebase";

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [checking, setChecking] = useState(() => typeof window !== "undefined" && !!auth.currentUser);

  useEffect(() => {
    if (auth.currentUser) {
      setChecking(false);
      return;
    }
    const unsub = onAuthStateChanged(auth, () => setChecking(false));
    return () => unsub();
  }, [pathname]);

  if (checking) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500/30 border-t-sky-400" />
      </div>
    );
  }

  return <>{children}</>;
}
