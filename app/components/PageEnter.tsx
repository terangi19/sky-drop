"use client";

import { usePathname } from "next/navigation";

/** Subtle fade when navigating between routes. */
export default function PageEnter({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="animate-page-enter flex-1 flex flex-col min-h-0">
      {children}
    </div>
  );
}
