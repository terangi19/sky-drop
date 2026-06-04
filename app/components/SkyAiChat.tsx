"use client";

import { usePathname } from "next/navigation";
import SkyAiChatPanel from "./SkyAiChatPanel";

export default function SkyAiChat() {
  const pathname = usePathname() || "/";

  if (pathname.startsWith("/admin") || pathname.startsWith("/post/ai")) {
    return null;
  }

  return <SkyAiChatPanel mode="sheet" />;
}
