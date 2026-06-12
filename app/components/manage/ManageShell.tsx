"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode, useState } from "react";
import {
  LayoutDashboard,
  Users,
  Package,
  Flag,
  Scale,
  BarChart3,
  Radio,
  Bell,
  Settings,
  Shield,
  Menu,
  X,
} from "lucide-react";

const NAV = [
  { href: "/manage", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/manage/users", label: "Users", icon: Users },
  { href: "/manage/listings", label: "Listings", icon: Package },
  { href: "/manage/reports", label: "Reports", icon: Flag },
  { href: "/manage/disputes", label: "Disputes", icon: Scale },
  { href: "/manage/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/manage/activity", label: "Live Activity", icon: Radio },
  { href: "/manage/notifications", label: "Notifications", icon: Bell },
  { href: "/manage/settings", label: "Site Settings", icon: Settings },
  { href: "/manage/admins", label: "Admins", icon: Shield },
];

function NavLink({
  href,
  label,
  icon: Icon,
  exact,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition ${
        active
          ? "bg-sky-500/15 text-sky-400"
          : "text-[var(--muted)] hover:bg-white/5 hover:text-[var(--foreground)]"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </Link>
  );
}

export default function ManageShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <div className="flex min-h-screen">
        <aside className="hidden w-56 shrink-0 border-r border-[var(--card-border)] bg-[var(--soft-card)] lg:block">
          <div className="sticky top-0 flex h-screen flex-col">
            <div className="border-b border-[var(--card-border)] px-4 py-4">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-sky-400">Sky Drop</p>
              <p className="text-sm font-bold text-[var(--foreground)]">Control Center</p>
            </div>
            <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
              {NAV.map((item) => (
                <NavLink key={item.href} {...item} />
              ))}
            </nav>
            <div className="border-t border-[var(--card-border)] p-3">
              <Link href="/" className="text-xs text-[var(--muted)] hover:text-sky-400 transition">
                &larr; Back to marketplace
              </Link>
            </div>
          </div>
        </aside>

        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <button className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} aria-label="Close menu" />
            <aside className="relative h-full w-64 border-r border-[var(--card-border)] bg-[var(--soft-card)] p-3">
              <div className="mb-3 flex items-center justify-between px-1">
                <p className="text-sm font-bold">Control Center</p>
                <button onClick={() => setMobileOpen(false)} className="text-[var(--muted)]"><X className="h-5 w-5" /></button>
              </div>
              <nav className="space-y-0.5">
                {NAV.map((item) => (
                  <NavLink key={item.href} {...item} onNavigate={() => setMobileOpen(false)} />
                ))}
              </nav>
            </aside>
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-[var(--card-border)] bg-[var(--background)]/95 px-4 py-3 backdrop-blur lg:hidden">
            <button onClick={() => setMobileOpen(true)} className="rounded-md border border-[var(--card-border)] p-2 text-[var(--muted)]">
              <Menu className="h-4 w-4" />
            </button>
            <p className="text-sm font-bold">Sky Drop Control Center</p>
          </header>
          <main className="flex-1 p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
