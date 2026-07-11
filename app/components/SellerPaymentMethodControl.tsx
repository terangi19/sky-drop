"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { auth } from "../lib/firebase";
import { getClientCsrfToken } from "../lib/csrf-client";
import { showToast } from "./Toast";
import { paymentMethodSummary } from "../lib/purchase-button-labels";
import { STRIPE_CONNECT_REQUIRED_MSG } from "../lib/seller-payments";

type Props = {
  listingId: string;
  paymentType?: string | null;
  disabled?: boolean;
};

export default function SellerPaymentMethodControl({
  listingId,
  paymentType,
  disabled = false,
}: Props) {
  const current = paymentType === "stripe" ? "stripe" : "contact";
  const [selected, setSelected] = useState<"contact" | "stripe">(current);
  const [saving, setSaving] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(true);

  useEffect(() => {
    setSelected(current);
  }, [current]);

  const refreshStripeStatus = useCallback(async () => {
    setStripeLoading(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        setStripeConnected(false);
        return;
      }
      const res = await fetch("/api/stripe-connect", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStripeConnected(!!data.connected);
      }
    } catch {
      setStripeConnected(false);
    } finally {
      setStripeLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshStripeStatus();
  }, [refreshStripeStatus]);

  async function save(next: "contact" | "stripe") {
    if (next === selected || saving || disabled) return;
    if (next === "stripe" && !stripeConnected) {
      showToast(STRIPE_CONNECT_REQUIRED_MSG, "error");
      return;
    }

    setSaving(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) {
        showToast("Please sign in again", "error");
        return;
      }
      const csrfToken = await getClientCsrfToken();
      const res = await fetch("/api/update-listing", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
        },
        body: JSON.stringify({ listingId, paymentType: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        showToast(data.error || "Failed to update payment method", "error");
        return;
      }
      setSelected(next);
      showToast(
        next === "stripe"
          ? "Buyers will now see Stripe Checkout"
          : "Buyers will now see Arrange Purchase",
        "success"
      );
    } catch {
      showToast("Failed to update payment method", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-white">Buyer payment method</p>
        <span className="text-[11px] font-medium text-sky-400">
          {paymentMethodSummary(selected)}
        </span>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-[var(--muted)]">
        This controls what buyers see on this listing right now.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={saving || disabled}
          onClick={() => void save("contact")}
          className={`rounded-lg border px-3 py-2.5 text-left text-xs font-bold transition-all ${
            selected === "contact"
              ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
              : "border-white/[0.06] bg-white/[0.02] text-[var(--muted)] hover:bg-white/[0.04]"
          } disabled:opacity-50`}
        >
          Arrange Purchase
        </button>
        <button
          type="button"
          disabled={saving || disabled || !stripeConnected}
          title={stripeConnected ? "Card checkout via Stripe" : STRIPE_CONNECT_REQUIRED_MSG}
          onClick={() => void save("stripe")}
          className={`rounded-lg border px-3 py-2.5 text-left text-xs font-bold transition-all ${
            selected === "stripe"
              ? "border-sky-500/40 bg-sky-500/10 text-sky-300"
              : "border-white/[0.06] bg-white/[0.02] text-[var(--muted)] hover:bg-white/[0.04]"
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          Stripe Checkout
        </button>
      </div>
      {stripeLoading ? (
        <p className="mt-2 text-[10px] text-zinc-500">Checking Stripe connection…</p>
      ) : !stripeConnected ? (
        <p className="mt-2 text-[10px] leading-relaxed text-amber-400/90">
          Connect Stripe in{" "}
          <Link href="/profile?tab=payments" className="underline hover:text-amber-300">
            Profile → Payments
          </Link>{" "}
          to enable card checkout.
        </p>
      ) : saving ? (
        <p className="mt-2 text-[10px] text-zinc-500">Saving…</p>
      ) : null}
    </div>
  );
}
