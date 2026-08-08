"use client";

import { useEffect } from "react";
import { installDevRequestInstrumentation } from "../lib/dev-request-instrumentation";

/** Mount once from DeferredAppChrome — no UI, prod no-op. */
export default function DevRequestInstrumentation() {
  useEffect(() => {
    installDevRequestInstrumentation();
  }, []);
  return null;
}
