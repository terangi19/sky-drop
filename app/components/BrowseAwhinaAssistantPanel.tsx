"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { getAwhinaNavbarPageIntro } from "../lib/awhina-insights";
import { useAwhinaPageInsight } from "../contexts/AwhinaPageInsightContext";
import AwhinaInsightCard from "./AwhinaInsightCard";

type Props = {
  className?: string;
  /** Override pathname when intro is passed explicitly */
  intro?: string[] | null;
};

/** Āwhina assistant panel — sits under the page header and explains where you are. */
export default function BrowseAwhinaAssistantPanel({
  className = "mt-4 mb-0 mx-auto w-full max-w-2xl text-left",
  intro: introOverride,
}: Props) {
  const pathname = usePathname();
  const { insight } = useAwhinaPageInsight();
  const intro = useMemo(
    () => introOverride ?? getAwhinaNavbarPageIntro(pathname),
    [introOverride, pathname]
  );

  if (!intro?.length) return null;

  return (
    <div aria-label="Awhina Assistant Panel">
      <AwhinaInsightCard intro={intro} insight={insight} className={className} />
    </div>
  );
}
