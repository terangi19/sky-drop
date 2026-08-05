"use client";

import type { ReactNode } from "react";
import { HOME_MARKETPLACE_THEME as t } from "../lib/browse-category-config";
import BrowseAwhinaAssistantPanel from "./BrowseAwhinaAssistantPanel";

type Props = {
  badge: string;
  title: string;
  children?: ReactNode;
  showAssistantPanel?: boolean;
};

/** Browse-tab page hero — same sky palette as the homepage header. */
export default function BrowseMarketplaceHero({
  badge,
  title,
  children,
  showAssistantPanel = true,
}: Props) {
  return (
    <header
      className={`relative mb-5 overflow-hidden rounded-2xl border border-sky-500/15 bg-gradient-to-b from-sky-500/[0.07] via-transparent to-transparent ${t.heroShadow}`}
    >
      <div className={`pointer-events-none absolute inset-0 ${t.radial}`} />
      <div className="relative flex flex-col items-center px-5 py-5 text-center sm:px-8 sm:py-7">
        <div className={t.badge}>{badge}</div>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)] sm:text-4xl lg:text-5xl">
          {title}
        </h1>
        {showAssistantPanel && <BrowseAwhinaAssistantPanel />}
        {children}
      </div>
    </header>
  );
}
