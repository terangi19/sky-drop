"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useAwhinaPageInsight } from "../contexts/AwhinaPageInsightContext";
import { resolveAwhinaPageIntro } from "../lib/awhina-insights";
import AwhinaInsightCard from "./AwhinaInsightCard";

type Props = {
  className?: string;
};

function findGuideInsertPoint(): { parent: HTMLElement; before: ChildNode | null } | null {
  if (typeof document === "undefined") return null;

  const anchor = document.querySelector("[data-awhina-after-h1]");
  if (anchor?.parentElement) {
    return { parent: anchor.parentElement, before: anchor.nextSibling };
  }

  const h1 = document.querySelector("main h1");
  if (h1) {
    let el: HTMLElement | null = h1 as HTMLElement;
    for (let i = 0; i < 6 && el; i++) {
      const cls = typeof el.className === "string" ? el.className : "";
      if (/\bmb-(6|8|10)\b/.test(cls) && el.parentElement) {
        return { parent: el.parentElement, before: el.nextSibling };
      }
      el = el.parentElement;
    }

    const block = (h1 as HTMLElement).closest("div.relative, section.relative");
    if (block?.parentElement) {
      return { parent: block.parentElement, before: block.nextSibling };
    }
  }

  const section = document.querySelector(
    "main section.relative.z-10, main > div.relative.z-10, main > section.relative"
  );
  if (section?.parentElement) {
    return { parent: section.parentElement, before: section.nextSibling };
  }

  return null;
}

/** Renders Āwhina inside page content — after the page header, not below the navbar. */
export default function AwhinaInPageGuide({ className = "mb-6 sm:mb-8" }: Props) {
  const pathname = usePathname();
  const { insight } = useAwhinaPageInsight();
  const intro = useMemo(() => resolveAwhinaPageIntro(pathname), [pathname]);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = false;
    let slotEl: HTMLDivElement | null = null;

    function mount() {
      if (mounted) return;
      const point = findGuideInsertPoint();
      if (!point) return;

      slotEl = document.createElement("div");
      slotEl.setAttribute("data-awhina-guide", "true");
      slotEl.className = "awhina-guide-slot";
      point.parent.insertBefore(slotEl, point.before);
      mounted = true;
      setSlot(slotEl);
    }

    function cleanup() {
      mounted = false;
      slotEl?.remove();
      slotEl = null;
      setSlot(null);
    }

    cleanup();
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(mount);
    });
    const retry = window.setTimeout(mount, 120);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(retry);
      cleanup();
    };
  }, [pathname]);

  if (!intro || !slot) return null;

  return createPortal(
    <AwhinaInsightCard key={pathname} intro={intro} insight={insight} className={className} />,
    slot
  );
}
