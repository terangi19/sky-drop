"use client";

import {
  Bell,
  LayoutDashboard,
  LogOut,
  Package,
  Shield,
  User,
} from "lucide-react";
import {
  AppMenuButton,
  AppMenuDivider,
  AppMenuHeader,
  AppMenuLink,
} from "./ui/AppMenu";

type AccountMenuContentProps = {
  pathname: string;
  username?: string | null;
  userEmail?: string | null;
  activityCount?: number;
  isAdmin?: boolean;
  onLogout: () => void;
  /** Called after navigation actions (e.g. close mobile drawer). */
  onNavigate?: () => void;
};

function isPathActive(pathname: string, path: string): boolean {
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

/**
 * Account menu items shared by desktop profile dropdown and mobile drawer.
 * Icons are SVG-only — labels appear once (fixes duplicate "Manage Manage" bug).
 */
export default function AccountMenuContent({
  pathname,
  username,
  userEmail,
  activityCount = 0,
  isAdmin = false,
  onLogout,
  onNavigate,
}: AccountMenuContentProps) {
  return (
    <>
      <AppMenuHeader
        title={username || "Account"}
        subtitle={userEmail || undefined}
      />
      <AppMenuDivider />
      <nav className="flex flex-col gap-0.5" aria-label="Account menu">
        <AppMenuLink
          href="/dashboard"
          icon={LayoutDashboard}
          label="Dashboard"
          active={isPathActive(pathname, "/dashboard")}
          onNavigate={onNavigate}
        />
        <AppMenuLink
          href="/profile"
          icon={User}
          label="Profile"
          active={isPathActive(pathname, "/profile")}
          onNavigate={onNavigate}
        />
        <AppMenuLink
          href="/notifications"
          icon={Bell}
          label="Notifications"
          active={isPathActive(pathname, "/notifications")}
          badge={activityCount}
          onNavigate={onNavigate}
        />
        <AppMenuLink
          href="/list-list"
          icon={Package}
          label="My Listings"
          active={isPathActive(pathname, "/list-list")}
          onNavigate={onNavigate}
        />
        {isAdmin ? (
          <AppMenuLink
            href="/manage"
            icon={Shield}
            label="Admin"
            active={isPathActive(pathname, "/manage")}
            onNavigate={onNavigate}
          />
        ) : null}
      </nav>
      <AppMenuDivider />
      <AppMenuButton
        icon={LogOut}
        label="Log out"
        destructive
        onClick={() => {
          onLogout();
          onNavigate?.();
        }}
      />
    </>
  );
}
