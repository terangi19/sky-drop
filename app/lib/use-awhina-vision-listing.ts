"use client";

import { useCallback, useRef, useState } from "react";
import type { SkyAiListingFill } from "./sky-ai-listing-fill";
import type { SkyAiListingContext } from "./sky-ai-types";
import { isAwhinaVisionListingVisibleClient } from "./awhina-vision-listing-flags";
import { prepareVisionListingImages } from "./awhina-vision-preprocess.client";
import { getFreshIdToken } from "./api-auth";

export type VisionUiStatus = "idle" | "checking" | "found" | "error";

export type VisionListingUiState = {
  status: VisionUiStatus;
  identity: string;
  message: string;
  listingFill: SkyAiListingFill | null;
  needsIdentityConfirm: boolean;
  missingPrompts: string[];
  lastFingerprint: string;
};

const idleState = (): VisionListingUiState => ({
  status: "idle",
  identity: "",
  message: "",
  listingFill: null,
  needsIdentityConfirm: false,
  missingPrompts: [],
  lastFingerprint: "",
});

function fingerprintFiles(files: File[]): string {
  return files.map((f) => `${f.name}:${f.size}:${f.lastModified}`).join("|");
}

/**
 * Client hook: instant thumbs elsewhere; async vision via /api/awhina-vision.
 * One batch → one recognition; cache-aware server-side.
 */
export function useAwhinaVisionListing() {
  const enabled = isAwhinaVisionListingVisibleClient();
  const [state, setState] = useState<VisionListingUiState>(idleState);
  const inFlightRef = useRef(false);
  const runIdRef = useRef(0);
  const lastFpRef = useRef("");
  const stateRef = useRef(state);
  stateRef.current = state;

  const reset = useCallback(() => {
    lastFpRef.current = "";
    setState(idleState());
  }, []);

  const analyze = useCallback(
    async (opts: {
      files: File[];
      message?: string;
      listingContext?: SkyAiListingContext | null;
      draftKey?: string;
      force?: boolean;
    }) => {
      if (!opts.files.length) return null;
      if (!enabled) {
        console.warn(
          "[awhina-vision] analyze skipped — NEXT_PUBLIC_AWHINA_VISION_LISTINGS_ENABLED is not true at build time"
        );
        return null;
      }
      const fp = fingerprintFiles(opts.files.slice(0, 4));
      if (
        !opts.force &&
        fp === lastFpRef.current &&
        stateRef.current.status === "found"
      ) {
        return stateRef.current;
      }
      if (inFlightRef.current && !opts.force) return null;

      const runId = ++runIdRef.current;
      inFlightRef.current = true;
      setState((s) => ({
        ...s,
        status: "checking",
        message: "",
        lastFingerprint: fp,
      }));

      try {
        const prepared = await prepareVisionListingImages(opts.files.slice(0, 4));
        if ("error" in prepared) {
          if (runId !== runIdRef.current) return null;
          setState({
            ...idleState(),
            status: "error",
            message: prepared.error,
            lastFingerprint: fp,
          });
          return null;
        }

        let authHeader: Record<string, string> = {};
        try {
          const token = await getFreshIdToken();
          if (token) authHeader = { Authorization: `Bearer ${token}` };
        } catch {
          /* anon ok */
        }

        const res = await fetch("/api/awhina-vision", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeader },
          body: JSON.stringify({
            images: prepared.dataUrls,
            message: opts.message || "",
            listingContext: opts.listingContext || null,
            draftKey: opts.draftKey || "sell",
            force: opts.force === true,
            pathname: "/post/ai",
          }),
        });

        const data = await res.json();
        if (runId !== runIdRef.current) return null;

        if (!data.ok || !data.listingFill) {
          setState({
            ...idleState(),
            status: "error",
            message: data.reply || data.error || "Couldn't read those photos.",
            lastFingerprint: fp,
          });
          return null;
        }

        const next: VisionListingUiState = {
          status: "found",
          identity: data.displayIdentity || data.listingFill.title || "your item",
          message: data.needsIdentityConfirm
            ? "Tap Yes to continue, or Change to correct it."
            : data.missingPrompts?.length
              ? `Still need: ${data.missingPrompts.join(", ")}.`
              : "Looking good — add anything missing, then publish.",
          listingFill: data.listingFill as SkyAiListingFill,
          needsIdentityConfirm: Boolean(data.needsIdentityConfirm),
          missingPrompts: Array.isArray(data.missingPrompts) ? data.missingPrompts : [],
          lastFingerprint: fp,
        };
        lastFpRef.current = fp;
        setState(next);
        return next;
      } catch {
        if (runId !== runIdRef.current) return null;
        setState({
          ...idleState(),
          status: "error",
          message: "Vision check failed. Describe the item in chat instead.",
          lastFingerprint: fp,
        });
        return null;
      } finally {
        if (runId === runIdRef.current) inFlightRef.current = false;
      }
    },
    [enabled]
  );

  return { enabled, state, analyze, reset, setState };
}
