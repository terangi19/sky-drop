"use client";

/** Same-origin channel so logout/login in one tab updates every open Sky Drop tab. */
export const AUTH_BROADCAST_CHANNEL = "skydrop-auth";

export type AuthBroadcastMessage =
  | { type: "signed-out" }
  | { type: "signed-in"; uid: string };

export function publishAuthBroadcast(message: AuthBroadcastMessage) {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
    channel.postMessage(message);
    channel.close();
  } catch {
    /* BroadcastChannel unavailable — Firebase persistence remains the fallback. */
  }
}

export function subscribeAuthBroadcast(onMessage: (message: AuthBroadcastMessage) => void) {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") {
    return () => {};
  }
  try {
    const channel = new BroadcastChannel(AUTH_BROADCAST_CHANNEL);
    channel.onmessage = (event) => {
      const data = event.data as AuthBroadcastMessage | null;
      if (!data || typeof data !== "object" || !("type" in data)) return;
      onMessage(data);
    };
    return () => channel.close();
  } catch {
    return () => {};
  }
}
