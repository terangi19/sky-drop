"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "../contexts/AuthContext";

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { loading } = useAuth();
  const [checking, setChecking] = useState(loading);

  useEffect(() => {
    setChecking(loading);
  }, [loading, pathname]);

  if (checking) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500/30 border-t-sky-400" />
      </div>
    );
  }

  return <>{children}</>;
}
