/**
 * Shared client caller for /api/awhina-vision.
 * Used by /post/ai listing upload, chat composer, and global bubble.
 */

"use client";

import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import type { SkyAiListingContext } from "./sky-ai-types";
import { getFreshIdToken } from "./api-auth";
import { prepareVisionListingImages } from "./awhina-vision-preprocess.client";
import { isAwhinaVisionListingVisibleClient } from "./awhina-vision-listing-flags";

export const AWHINA_VISION_BRIDGE_DONE_EVENT = "awhina-vision-bridge-done";

export type AwhinaVisionBridgeDoneDetail = {
  ok: boolean;
  identity?: string;
  errorMessage?: string;
};

export type AwhinaVisionClientResult = {
  ok: boolean;
  listingFill: SkyAiListingFill | null;
  displayIdentity: string;
  needsIdentityConfirm: boolean;
  missingPrompts: string[];
  reply: string;
  error?: string;
  code?: string;
  enabled: boolean;
};

export function dispatchVisionBridgeDone(detail: AwhinaVisionBridgeDoneDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<AwhinaVisionBridgeDoneDetail>(AWHINA_VISION_BRIDGE_DONE_EVENT, {
      detail,
    })
  );
}

export function waitForVisionBridgeDone(timeoutMs = 60_000): Promise<AwhinaVisionBridgeDoneDetail> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") {
      resolve({ ok: false, errorMessage: "No window" });
      return;
    }
    let settled = false;
    const finish = (detail: AwhinaVisionBridgeDoneDetail) => {
      if (settled) return;
      settled = true;
      window.removeEventListener(AWHINA_VISION_BRIDGE_DONE_EVENT, onDone as EventListener);
      clearTimeout(timer);
      resolve(detail);
    };
    const onDone = (e: Event) => {
      const detail = (e as CustomEvent<AwhinaVisionBridgeDoneDetail>).detail;
      finish(detail || { ok: false });
    };
    const timer = setTimeout(
      () => finish({ ok: false, errorMessage: "Vision timed out. Describe the item in a sentence." }),
      timeoutMs
    );
    window.addEventListener(AWHINA_VISION_BRIDGE_DONE_EVENT, onDone as EventListener);
  });
}

async function authHeaders(): Promise<Record<string, string>> {
  try {
    const token = await getFreshIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

/** Call vision API with already-prepared data URLs (chat attachments). */
export async function fetchAwhinaVisionListing(opts: {
  images: string[];
  message?: string;
  listingContext?: SkyAiListingContext | null;
  draftKey?: string;
  force?: boolean;
  pathname?: string;
}): Promise<AwhinaVisionClientResult> {
  const enabled = isAwhinaVisionListingVisibleClient();
  if (!enabled) {
    if (typeof console !== "undefined") {
      console.warn(
        "[awhina-vision] client flag OFF — set NEXT_PUBLIC_AWHINA_VISION_LISTINGS_ENABLED=true"
      );
    }
    return {
      ok: false,
      enabled: false,
      listingFill: null,
      displayIdentity: "",
      needsIdentityConfirm: false,
      missingPrompts: [],
      reply: "",
      error: "Vision listing is not enabled",
      code: "vision_listing_disabled",
    };
  }

  const images = (opts.images || [])
    .filter((s) => typeof s === "string" && s.startsWith("data:image/"))
    .slice(0, 4);
  if (!images.length) {
    return {
      ok: false,
      enabled: true,
      listingFill: null,
      displayIdentity: "",
      needsIdentityConfirm: false,
      missingPrompts: [],
      reply: "Add a product photo to continue.",
      error: "no_images",
      code: "no_images",
    };
  }

  try {
    const res = await fetch("/api/awhina-vision", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({
        images,
        message: opts.message || "",
        listingContext: opts.listingContext || null,
        draftKey: opts.draftKey || "sell",
        force: opts.force === true,
        pathname: opts.pathname || "/post/ai",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!data.ok || !data.listingFill) {
      return {
        ok: false,
        enabled: data.enabled !== false,
        listingFill: null,
        displayIdentity: "",
        needsIdentityConfirm: false,
        missingPrompts: [],
        reply: data.reply || data.error || "Couldn't read those photos.",
        error: data.error || data.reply,
        code: data.code,
      };
    }
    return {
      ok: true,
      enabled: true,
      listingFill: data.listingFill as SkyAiListingFill,
      displayIdentity: data.displayIdentity || data.listingFill.title || "your item",
      needsIdentityConfirm: Boolean(data.needsIdentityConfirm),
      missingPrompts: Array.isArray(data.missingPrompts) ? data.missingPrompts : [],
      reply: data.reply || "",
    };
  } catch {
    return {
      ok: false,
      enabled: true,
      listingFill: null,
      displayIdentity: "",
      needsIdentityConfirm: false,
      missingPrompts: [],
      reply: "Vision check failed. Describe the item in chat instead.",
      error: "fetch_failed",
      code: "vision_route_error",
    };
  }
}

/** File[] → preprocess → /api/awhina-vision (listing camera path). */
export async function analyzeVisionListingFiles(opts: {
  files: File[];
  message?: string;
  listingContext?: SkyAiListingContext | null;
  draftKey?: string;
  force?: boolean;
  pathname?: string;
}): Promise<AwhinaVisionClientResult> {
  if (!isAwhinaVisionListingVisibleClient()) {
    return fetchAwhinaVisionListing({ images: [], ...opts });
  }
  if (!opts.files.length) {
    return {
      ok: false,
      enabled: true,
      listingFill: null,
      displayIdentity: "",
      needsIdentityConfirm: false,
      missingPrompts: [],
      reply: "Add a product photo to continue.",
      code: "no_images",
    };
  }
  const prepared = await prepareVisionListingImages(opts.files.slice(0, 4));
  if ("error" in prepared) {
    return {
      ok: false,
      enabled: true,
      listingFill: null,
      displayIdentity: "",
      needsIdentityConfirm: false,
      missingPrompts: [],
      reply: prepared.error,
      error: prepared.error,
      code: "preprocess_error",
    };
  }
  return fetchAwhinaVisionListing({
    images: prepared.dataUrls,
    message: opts.message,
    listingContext: opts.listingContext,
    draftKey: opts.draftKey,
    force: opts.force,
    pathname: opts.pathname,
  });
}
