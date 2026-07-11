/** Purchase-flow tracing — remove after checkout routing is verified stable. */
export type PurchaseFlowStage =
  | "firestore-snapshot"
  | "firestore-server-api"
  | "react-listing-paymentType"
  | "button-paymentType"
  | "click-handler-paymentType"
  | "routing-decision"
  | "modal-chosen"
  | "modal-mounted"
  | "modal-blocked"
  | "invariant-violation";

const TRACE_PREFIX = "[purchase-trace]";

export function logPurchaseFlow(
  stage: PurchaseFlowStage,
  payload: Record<string, unknown>
): void {
  if (typeof window === "undefined") return;
  console.info(`${TRACE_PREFIX} ${stage}`, payload);
}

/** Human-readable single-line summary for DevTools filtering. */
export function logPurchaseSummary(fields: {
  firestorePaymentType?: string | null;
  reactListingPaymentType?: string | null;
  buttonPaymentType?: string | null;
  clickHandlerPaymentType?: string | null;
  serverPaymentType?: string | null;
  modalChosen?: string | null;
  source?: string | null;
}): void {
  if (typeof window === "undefined") return;
  console.info(`${TRACE_PREFIX} SUMMARY`, {
    "Firestore paymentType": fields.firestorePaymentType ?? "(unknown)",
    "React listing paymentType": fields.reactListingPaymentType ?? "(unknown)",
    "Button paymentType": fields.buttonPaymentType ?? "(unknown)",
    "Click handler paymentType": fields.clickHandlerPaymentType ?? "(unknown)",
    "Server API paymentType": fields.serverPaymentType ?? "(unknown)",
    "Modal chosen": fields.modalChosen ?? "(none)",
    source: fields.source ?? "(none)",
  });
}

export function assertStripeNeverArrange(
  serverPaymentType: string | undefined | null,
  action: "arrange" | "stripe",
  source?: string
): void {
  if (serverPaymentType === "stripe" && action === "arrange") {
    console.error(`${TRACE_PREFIX} invariant-violation`, {
      serverPaymentType,
      action,
      source,
      message: "Server says stripe but routing chose arrange",
    });
  }
}

export function logModalMounted(
  modal: "CheckoutModal" | "ArrangePurchaseModal",
  context: Record<string, unknown>
): void {
  logPurchaseFlow("modal-mounted", { modal, ...context });
  console.info(`${TRACE_PREFIX} Modal opened: ${modal}`, context);
}
