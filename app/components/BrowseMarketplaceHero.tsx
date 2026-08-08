"use client";

import type { ReactNode } from "react";
import BrowseAwhinaAssistantPanel from "./BrowseAwhinaAssistantPanel";

type Props = {
  badge: string;
  title: string;
  children?: ReactNode;
  showAssistantPanel?: boolean;
};

/** Browse-tab page hero — calm surface matching homepage inventory chrome. */
export default function BrowseMarketplaceHero({
  badge,
  title,
  children,
  showAssistantPanel = true,
}: Props) {
  return (
    <header
      className="relative mb-5 overflow-hidden rounded-2xl border border-[var(--card-border)] bg-[var(--card)] shadow-[var(--shadow-xs)]"
    >
      <div className="relative flex flex-col items-center px-5 py-5 text-center sm:px-8 sm:py-6">
        <div className="mb-2 inline-flex items-center rounded-md border border-[var(--card-border)] bg-[var(--soft-card)] px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
          {badge}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)] sm:text-3xl lg:text-4xl">
          {title}
        </h1>
        {showAssistantPanel && <BrowseAwhinaAssistantPanel />}
        {children}
      </div>
    </header>
  );
}
