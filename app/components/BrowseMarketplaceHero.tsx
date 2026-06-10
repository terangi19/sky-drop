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
    <div
      className={`mb-5 relative overflow-hidden rounded-3xl border border-white/[0.04] bg-gradient-to-b from-white/[0.04] via-transparent to-transparent ${t.heroShadow}`}
    >
      <div className={`absolute inset-0 ${t.radial} pointer-events-none`} />
      <div className="relative flex flex-col items-center px-5 py-5 sm:px-8 sm:py-7 text-center">
        <div className={t.badge}>{badge}</div>
        <h1 className="text-3xl font-black tracking-tight sm:text-4xl lg:text-5xl 3xl:text-6xl 4xl:text-7xl leading-none">
          <span
            className={`bg-gradient-to-r bg-clip-text text-transparent ${t.titleGradient} ${t.titleDropShadow}`}
          >
            {title}
          </span>
        </h1>
        {showAssistantPanel && <BrowseAwhinaAssistantPanel />}
        {children}
      </div>
    </div>
  );
}
