"use client";

import dynamic from "next/dynamic";

const AwhinaInPageGuide = dynamic(() => import("./AwhinaInPageGuide"), { ssr: false });

/** Mounted once in the root layout — portals the guide into each page's content area. */
export default function AwhinaPageGuideLayer() {
  return <AwhinaInPageGuide />;
}
