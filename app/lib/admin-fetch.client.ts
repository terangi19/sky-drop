import { auth } from "./firebase";

export async function adminFetch(path: string, init: RequestInit = {}) {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new Error("Not signed in");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(path, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof data.error === "string" ? data.error : `Request failed (${res.status})`);
  }
  return data;
}

export function fmtDateTime(ms?: number | null) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function fmtDate(ms?: number | null) {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString();
}

export function timeAgo(ms?: number | null) {
  if (!ms) return "";
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function accountStatus(profile: {
  restricted?: boolean;
  suspended?: boolean;
  bannedAt?: unknown;
  kycStatus?: string;
}) {
  if (profile.bannedAt || profile.kycStatus === "banned_fake") return "Banned";
  if (profile.suspended) return "Suspended";
  if (profile.restricted) return "Restricted";
  if (profile.kycStatus === "approved") return "Verified";
  return "Active";
}
