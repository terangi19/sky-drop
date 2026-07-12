"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { fetchPublicHandle } from "../lib/fetch-public-profile-client";
import { MENU_PANEL_CLASS } from "./ui/AppMenu";
import { isEmailLike } from "../lib/public-display";

type NotificationItem = {
  id: string;
  sender: string;
  senderEmail: string;
  listingTitle: string;
  listingId: string;
  type: string;
  time: string;
  href: string;
  unread: boolean;
};

type NotificationDropdownProps = {
  notifications?: NotificationItem[];
  onClose?: () => void;
  onMarkSeen?: (id: string, type?: string) => void;
  onClearAll?: () => void;
};

const TYPE_META: Record<
  string,
  { icon: string; color: string; priority: "high" | "medium" | "low" }
> = {
  message: {
    icon: "\uD83D\uDCAC",
    color: "bg-sky-500/20 border-sky-500/30",
    priority: "low",
  },
  offer: {
    icon: "\uD83D\uDCB0",
    color: "bg-sky-500/20 border-sky-500/30",
    priority: "high",
  },
  sold: {
    icon: "\u2705",
    color: "bg-sky-500/20 border-sky-500/30",
    priority: "high",
  },
  verification: {
    icon: "\uD83D\uDD10",
    color: "bg-sky-500/20 border-sky-500/30",
    priority: "high",
  },
  warning: {
    icon: "\u26A0\uFE0F",
    color: "bg-red-500/20 border-red-500/30",
    priority: "high",
  },
  watchlist: {
    icon: "\u2B50",
    color: "bg-sky-500/20 border-sky-500/30",
    priority: "medium",
  },
  purchase: {
    icon: "\uD83D\uDCEB",
    color: "bg-sky-500/20 border-sky-500/30",
    priority: "high",
  },
  price_drop: {
    icon: "\uD83D\uDCC9",
    color: "bg-sky-500/20 border-sky-500/30",
    priority: "high",
  },
  saved_search_match: {
    icon: "\uD83D\uDD0D",
    color: "bg-sky-500/20 border-sky-500/30",
    priority: "medium",
  },
};

export default function NotificationDropdown({
  notifications = [],
  onClose,
  onMarkSeen,
  onClearAll,
}: NotificationDropdownProps) {
  const [usernames, setUsernames] =
    useState<Record<string, string>>({});
  const fetchRef = useRef<number>(0);

  useEffect(() => {
    const emails = [
      ...new Set(
        notifications
          .map((n) => n.senderEmail)
          .filter(Boolean)
      ),
    ];
    if (emails.length === 0) return;
    const id = ++fetchRef.current;
    const timer = setTimeout(async () => {
      const batch = emails.slice(0, 10);
      try {
        const entries = await Promise.all(
          batch.map(async (email) => [email, await fetchPublicHandle(email, "User")] as const)
        );
        if (id !== fetchRef.current) return;
        const map = Object.fromEntries(entries);
        setUsernames((prev) => ({ ...prev, ...map }));
      } catch (e) { console.error("Failed to fetch usernames:", e); }
    }, 300);
    return () => { clearTimeout(timer); };
  }, [notifications]);

  function handleClearAll() {
    if (onClearAll) {
      onClearAll();
    } else {
      notifications.forEach((n) =>
        onMarkSeen?.(n.id, n.type)
      );
    }
    onClose?.();
  }

  return (
    <div className={`absolute right-0 top-[58px] z-50 w-[340px] animate-slide-down ${MENU_PANEL_CLASS}`}>
      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-[var(--card-border)] px-4 py-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--muted)]">
            Notifications
          </p>
          <h2 className="mt-0.5 text-[15px] font-semibold text-[var(--foreground)]">
            Activity
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {notifications.length > 0 && (
            <button
              onClick={handleClearAll}
              className="rounded-lg px-2.5 py-1 text-[10px] font-medium text-[var(--muted)] transition hover:bg-white/[0.04] hover:text-[var(--foreground)]"
            >
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* LIST */}
      <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06]">
              <svg
                className="h-5 w-5 text-[var(--muted)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0"
                />
              </svg>
            </div>
            <p className="mt-4 text-[13px] font-medium text-[var(--foreground)]">
              No new activity
            </p>
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              Messages, offers, and updates will appear here.
            </p>
            <Link
              href="/notifications"
              onClick={() => onClose?.()}
              className="mt-4 rounded-lg bg-sky-500/10 px-4 py-2 text-[12px] font-bold text-sky-400 transition hover:bg-sky-500/20"
            >
              View all notifications
            </Link>
          </div>
        ) : (
          <div className="py-1.5">
            {notifications.map(
              (notification, index) => {
                const typeMeta =
                  TYPE_META[
                    notification.type
                  ] || TYPE_META.message;
                const mapped = usernames[notification.senderEmail] || "";
                const displaySender =
                  mapped ||
                  (notification.sender && !isEmailLike(notification.sender)
                    ? notification.sender.startsWith("@")
                      ? notification.sender
                      : `@${notification.sender}`
                    : "User");
                const isUnread =
                  notification.unread;

                return (
                  <div
                    key={
                      notification.id
                        ? `${notification.id}-${index}`
                        : `notif-${index}`
                    }
                    className="relative mx-1.5 mb-0.5"
                  >
                    <Link
                      href={
                        notification.href
                      }
                      onClick={() => {
                        onMarkSeen?.(
                          notification.id,
                          notification.type
                        );
                        onClose?.();
                      }}
                      className={`relative flex items-start gap-3 rounded-xl px-3 py-3 transition-all duration-200 ${
                        isUnread
                          ? `border ${typeMeta.color} hover:opacity-80 shadow-lg shadow-black/10`
                          : "border border-transparent hover:border-white/[0.06] hover:bg-white/[0.03]"
                      }`}
                    >
                      {/* AVATAR + TYPE BADGE */}
                      <div className="relative flex-shrink-0">
                        <div
                          className={`flex h-10 w-10 items-center justify-center rounded-xl text-[11px] font-bold text-[var(--foreground)] border ${typeMeta.color}`}
                        >
                          {notification.sender?.[0]?.toUpperCase() ||
                            "?"}
                        </div>
                        <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#111318] text-[8px] leading-none ring-1 ring-white/[0.06] shadow-md">
                          {typeMeta.icon}
                        </span>
                        {typeMeta.priority === "high" && (
                          <span className="absolute -top-0.5 -right-0.5 flex h-3 w-3 items-center justify-center rounded-full bg-red-500 ring-2 ring-[#111318]">
                            <span className="text-[6px]">!</span>
                          </span>
                        )}
                      </div>

                      {/* CONTENT */}
                      <div className="min-w-0 flex-1">
                        {notification.listingTitle ? (
                          <p className="truncate text-[13px] font-bold text-[var(--foreground)]">
                            {
                              notification.listingTitle
                            }
                          </p>
                        ) : (
                          <p className="text-[12px] font-bold text-[var(--foreground)]">
                            {displaySender}
                          </p>
                        )}
                        <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                          {notification.listingTitle ? (
                            <p className="truncate text-[11px] text-[var(--muted)]">
                              by {displaySender}
                            </p>
                          ) : (
                            <p className="text-[11px] text-[var(--muted)]">
                              {notification.type === "offer"
                                ? "Made an offer"
                                : notification.type === "purchase"
                                  ? "Purchase update"
                                  : "Sent a message"}
                            </p>
                          )}
                          {notification.type ===
                            "offer" && (
                            <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[8px] font-bold text-sky-400 border border-sky-500/30">
                              Offer
                            </span>
                          )}
                          {notification.type ===
                            "sold" && (
                            <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[8px] font-bold text-sky-400 border border-sky-500/30">
                              Sold
                            </span>
                          )}
                          {notification.type ===
                            "purchase" && (
                            <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[8px] font-bold text-sky-400 border border-sky-500/30">
                              Purchase
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                          {notification.time}
                        </p>
                      </div>

                      {/* UNREAD DOT */}
                      {isUnread && (
                        <span className="absolute right-2.5 top-3 h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_6px_rgba(56,189,248,0.4)] animate-pulse" />
                      )}
                    </Link>
                    {/* ACTION BUTTON */}
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        onMarkSeen?.(notification.id, notification.type);
                      }}
                      className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Mark as read"
                    >
                      <svg className="h-3 w-3 text-[var(--muted)] hover:text-[var(--foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                  </div>
                );
              }
            )}
          </div>
        )}
      </div>
      <Link
        href="/notifications"
        onClick={() => onClose?.()}
        className="block border-t border-white/[0.04] px-4 py-2.5 text-center text-[11px] font-bold text-sky-400 transition hover:bg-white/[0.02]"
      >
        View all notifications →
      </Link>
    </div>
  );
}
