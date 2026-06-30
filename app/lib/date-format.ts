/**
 * Comprehensive date/time formatting utilities for consistent display across the app
 */

type FirestoreDateLike = {
  toDate?: () => Date;
  toMillis?: () => number;
  seconds?: number;
  _seconds?: number;
};

/** Parse Firestore Timestamp, Admin JSON, ISO string, or epoch ms. */
export function parseFirestoreDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== "object") return null;

  const raw = value as FirestoreDateLike;
  if (typeof raw.toDate === "function") return raw.toDate();
  if (typeof raw.toMillis === "function") return new Date(raw.toMillis());
  const seconds = raw.seconds ?? raw._seconds;
  if (typeof seconds === "number") return new Date(seconds * 1000);
  return null;
}

export function formatTime(timestamp: { toDate?: () => Date } | Date | string | number): string {
  const date = parseFirestoreDate(timestamp);
  if (!date) return "Now";

  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function formatFullTime(timestamp: { toDate?: () => Date } | Date | string | number): string {
  let date: Date;
  
  if (timestamp instanceof Date) {
    date = timestamp;
  } else if (typeof timestamp === "string") {
    date = new Date(timestamp);
  } else if (typeof timestamp === "number") {
    date = new Date(timestamp);
  } else if (timestamp?.toDate) {
    date = timestamp.toDate();
  } else {
    return "Now";
  }

  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
}

export function formatDate(timestamp: { toDate?: () => Date } | Date | string | number): string {
  let date: Date;
  
  if (timestamp instanceof Date) {
    date = timestamp;
  } else if (typeof timestamp === "string") {
    date = new Date(timestamp);
  } else if (typeof timestamp === "number") {
    date = new Date(timestamp);
  } else if (timestamp?.toDate) {
    date = timestamp.toDate();
  } else {
    return "Today";
  }

  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const isYesterday = date.toDateString() === new Date(now.getTime() - 86400000).toDateString();
  
  if (isToday) {
    return "Today";
  } else if (isYesterday) {
    return "Yesterday";
  } else {
    return date.toLocaleDateString([], { month: "short", day: "numeric", year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
  }
}

export function formatDateTime(timestamp: { toDate?: () => Date } | Date | string | number): string {
  return `${formatDate(timestamp)} at ${formatTime(timestamp)}`;
}

export function timeAgo(seconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - seconds;
  
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return `${Math.floor(diff / 604800)}w ago`;
}

export function timeAgoFromTimestamp(timestamp: { toDate?: () => Date } | Date | string | number): string {
  let date: Date;
  
  if (timestamp instanceof Date) {
    date = timestamp;
  } else if (typeof timestamp === "string") {
    date = new Date(timestamp);
  } else if (typeof timestamp === "number") {
    date = new Date(timestamp);
  } else if (timestamp?.toDate) {
    date = timestamp.toDate();
  } else {
    return "Just now";
  }

  const seconds = Math.floor(date.getTime() / 1000);
  return timeAgo(seconds);
}

export function formatRelativeTime(timestamp: { toDate?: () => Date } | Date | string | number): string {
  let date: Date;
  
  if (timestamp instanceof Date) {
    date = timestamp;
  } else if (typeof timestamp === "string") {
    date = new Date(timestamp);
  } else if (typeof timestamp === "number") {
    date = new Date(timestamp);
  } else if (timestamp?.toDate) {
    date = timestamp.toDate();
  } else {
    return "Just now";
  }

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return formatDate(date);
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return `${seconds}s`;
  }
}

export function formatAuctionEndsAt(timestamp: { toDate?: () => Date } | Date | string | number): string {
  let date: Date;
  
  if (timestamp instanceof Date) {
    date = timestamp;
  } else if (typeof timestamp === "string") {
    date = new Date(timestamp);
  } else if (typeof timestamp === "number") {
    date = new Date(timestamp);
  } else if (timestamp?.toDate) {
    date = timestamp.toDate();
  } else {
    return "Ends soon";
  }

  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  
  if (diffMs <= 0) return "Ended";
  
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 60) return `${diffMins}m left`;
  if (diffHours < 24) return `${diffHours}h left`;
  if (diffDays < 7) return `${diffDays}d left`;
  
  return `Ends ${formatDate(date)}`;
}
