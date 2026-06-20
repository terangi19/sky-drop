"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/message-flags", label: "Flags" },
  { href: "/admin/disputes", label: "Disputes" },
  { href: "/admin/verification", label: "KYC" },
  { href: "/admin/security-dashboard", label: "Security" },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <div className="mb-6 flex gap-2">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition ${
            pathname === link.href
              ? "bg-sky-500/15 text-sky-400 border border-sky-500/25"
              : "border border-white/[0.08] text-[var(--muted)] hover:text-[var(--foreground)] hover:bg-white/[0.03]"
          }`}
        >
          {link.label}
        </Link>
      ))}
    </div>
  );
}
