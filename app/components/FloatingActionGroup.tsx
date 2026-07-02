"use client";

import { type ReactNode } from "react";

interface FloatingActionGroupProps {
  children: ReactNode;
}

export default function FloatingActionGroup({ children }: FloatingActionGroupProps) {
  return (
    <div className="fixed bottom-6 right-6 z-[10002] flex flex-col items-end gap-4 pointer-events-none max-md:bottom-24 max-md:right-4">
      <div className="flex flex-col items-end gap-4 pointer-events-auto">
        {children}
      </div>
    </div>
  );
}
