"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import MessagingFirstSoftBlock from "../components/MessagingFirstSoftBlock";
import { isStripeCheckoutVisibleClient } from "../lib/stripe-checkout-flags";

function CheckoutRedirectInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const stripeVisible = isStripeCheckoutVisibleClient();

  useEffect(() => {
    if (!stripeVisible) return;
    const listingId = searchParams.get("listingId");
    if (listingId) {
      router.replace(`/post/listing/${listingId}?buy=1`);
    } else {
      router.replace("/");
    }
  }, [searchParams, router, stripeVisible]);

  if (!stripeVisible) {
    return (
      <MessagingFirstSoftBlock
        title="Checkout unavailable"
        description="Online checkout is not available in Sky Drop V1. Message the seller to arrange the purchase."
      />
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)]">
      <p className="text-sm text-[var(--muted)]">Redirecting...</p>
    </main>
  );
}

export default function CheckoutRedirect() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[var(--background)]">
          <p className="text-sm text-[var(--muted)]">Loading...</p>
        </main>
      }
    >
      <CheckoutRedirectInner />
    </Suspense>
  );
}
