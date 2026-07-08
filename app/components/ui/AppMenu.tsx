"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Shared panel styling for dropdowns and popover menus. */
export const MENU_PANEL_CLASS =
  "app-menu-panel overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--soft-card)]/95 shadow-xl shadow-black/25 backdrop-blur-xl";

export const MENU_PANEL_ARROW_CLASS =
  "absolute h-2.5 w-2.5 rotate-45 border-t border-l border-[var(--card-border)] bg-[var(--soft-card)]";

type AppMenuPanelProps = {
  children: ReactNode;
  className?: string;
  /** Show a small caret arrow (desktop flyouts). */
  arrow?: "top-right" | "none";
};

export function AppMenuPanel({
  children,
  className = "",
  arrow = "none",
}: AppMenuPanelProps) {
  return (
    <div className={`relative ${MENU_PANEL_CLASS} ${className}`.trim()}>
      {arrow === "top-right" && (
        <div className={`${MENU_PANEL_ARROW_CLASS} -top-1.5 right-4`} aria-hidden />
      )}
      <div className="p-1.5">{children}</div>
    </div>
  );
}

export function AppMenuHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="px-2.5 pb-2 pt-1.5">
      <p className="truncate text-[13px] font-semibold text-[var(--foreground)]">{title}</p>
      {subtitle ? (
        <p className="truncate text-[11px] text-[var(--muted)]">{subtitle}</p>
      ) : null}
    </div>
  );
}

export function AppMenuDivider() {
  return <div className="my-1 border-t border-[var(--card-border)]" role="separator" />;
}

type AppMenuItemProps = {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  badge?: number;
  destructive?: boolean;
  onClick?: () => void;
};

const itemBase =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40";

function itemClasses(active?: boolean, destructive?: boolean) {
  if (destructive) {
    return `${itemBase} text-red-500 hover:bg-red-500/10 active:bg-red-500/15`;
  }
  if (active) {
    return `${itemBase} bg-sky-500/10 text-sky-500`;
  }
  return `${itemBase} text-[var(--foreground)] hover:bg-white/[0.06] active:bg-white/[0.08]`;
}

function MenuIcon({
  icon: Icon,
  active,
  destructive,
}: {
  icon: LucideIcon;
  active?: boolean;
  destructive?: boolean;
}) {
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
        destructive
          ? "bg-red-500/10 text-red-500"
          : active
            ? "bg-sky-500/15 text-sky-500"
            : "bg-white/[0.04] text-[var(--muted)]"
      }`}
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
    </span>
  );
}

function MenuLabel({ label, badge }: { label: string; badge?: number }) {
  return (
    <>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge != null && badge > 0 ? (
        <span className="ml-auto flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-sky-500 px-1.5 text-[10px] font-bold text-white">
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
    </>
  );
}

export function AppMenuLink({
  href,
  icon,
  label,
  active,
  badge,
  destructive,
  onNavigate,
}: AppMenuItemProps & { href: string; onNavigate?: () => void }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={itemClasses(active, destructive)}
    >
      <MenuIcon icon={icon} active={active} destructive={destructive} />
      <MenuLabel label={label} badge={badge} />
    </Link>
  );
}

export function AppMenuButton({
  icon,
  label,
  active,
  badge,
  destructive,
  onClick,
}: AppMenuItemProps) {
  return (
    <button type="button" onClick={onClick} className={itemClasses(active, destructive)}>
      <MenuIcon icon={icon} active={active} destructive={destructive} />
      <MenuLabel label={label} badge={badge} />
    </button>
  );
}
