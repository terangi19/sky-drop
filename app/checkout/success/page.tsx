"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { auth } from "../../lib/firebase";
import stripePromise from "../../lib/stripe-client";

function SuccessInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "done" | "error">("loading");
  const [purchaseData, setPurchaseData] = useState<{ purchaseId: string; orderId: string; conversationId: string; title: string; price: string } | null>(null);

  const listingId = searchParams.get("listingId") || "";
  const title = searchParams.get("title") || "Listing";
  const price = searchParams.get("price") || "0";
  const buyerEmail = searchParams.get("buyerEmail") || "";
  const collectionName = searchParams.get("collectionName") || "listings";
  const badgeForSale = searchParams.get("badgeForSale") || "";
  const digitalParam = searchParams.get("type") || "";
  const digitalStoragePath = searchParams.get("digitalStoragePath") || "";
  const digitalFileName = searchParams.get("digitalFileName") || "";
  const sellerEmailParam = searchParams.get("sellerEmail") || "";

  const hasRun = useRef(false);

  useEffect(() => {
    if (hasRun.current) return;
    hasRun.current = true;
    let cancelled = false;

    const paymentIntentClientSecret = searchParams.get("payment_intent_client_secret") || "";

    if (paymentIntentClientSecret) {
      const cleanUrl = new URL(window.location.href);
      cleanUrl.searchParams.delete("payment_intent_client_secret");
      window.history.replaceState({}, "", cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
    }

    async function verifyAndDisplay() {
      if (!listingId || !buyerEmail || !paymentIntentClientSecret) {
        setStatus("done");
        return;
      }

      try {
        const stripe = await stripePromise;
        if (!stripe) { setStatus("error"); return; }

        const paymentIntentResult = await stripe.retrievePaymentIntent(paymentIntentClientSecret);
        if (!paymentIntentResult.paymentIntent || paymentIntentResult.error) {
          setStatus("done");
          return;
        }

        const isBadge = !!badgeForSale;
        const isDigital = digitalParam === "digital";
        const isService = digitalParam === "service";

        let resolvedDigitalURL = "";
        if (isDigital && digitalStoragePath) {
          try {
            const { ref, getDownloadURL } = await import("firebase/storage");
            const { storage } = await import("../../lib/firebase");
            resolvedDigitalURL = await getDownloadURL(ref(storage, digitalStoragePath));
          } catch {}
        }

        const token = await auth.currentUser?.getIdToken();
        const createRes = await fetch("/api/create-purchase", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { "Authorization": `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            listingId,
            listingTitle: title,
            listingImage: "",
            sellerEmail: sellerEmailParam || undefined,
            buyerName: buyerEmail,
            deliveryMethod: isBadge ? "badge" : isDigital ? "digital" : isService ? "service" : "pickup",
            total: Number(price) + 1,
            processingFee: 1.00,
            badgeTransfer: badgeForSale || "",
            type: isBadge ? "badge" : isDigital ? "digital" : isService ? "service" : "physical",
            digitalFileURL: resolvedDigitalURL,
            digitalFileName: isDigital ? (digitalFileName || "File") : "",
            status: isDigital ? "delivered" : isBadge ? "pending" : isService ? "in_progress" : "pending",
            disputeDeadline: isDigital ? new Date(Date.now() + 48 * 3600000).toISOString() : isService ? new Date(Date.now() + 7 * 86400000).toISOString() : null,
            stripePaymentIntentId: paymentIntentResult.paymentIntent.id,
            collectionName,
          }),
        });
        const createData = await createRes.json();
        if (!createRes.ok || !createData.success) {
          if (!cancelled) setStatus("done");
          return;
        }

        if (!cancelled) {
          setPurchaseData({
            purchaseId: createData.purchaseId,
            orderId: createData.orderId,
            conversationId: createData.conversationId,
            title,
            price,
          });
          setStatus("done");
        }
      } catch {
        if (!cancelled) setStatus("done");
      }
    }

    verifyAndDisplay();
    return () => { cancelled = true; };
  }, [listingId, title, price, buyerEmail, badgeForSale, digitalParam, digitalStoragePath, digitalFileName, sellerEmailParam, collectionName, searchParams]);

  const redirectToMessages = () => {
    const url = purchaseData?.conversationId
      ? `/messages/${purchaseData.conversationId}`
      : "/messages";
    router.push(url);
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto max-w-md px-6 text-center">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-950/80 p-10 shadow-2xl backdrop-blur">
          {status === "loading" ? (
            <>
              <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-sky-500 border-t-transparent" />
              <p className="mt-4 text-[var(--muted)]">Processing your order...</p>
            </>
          ) : (
            <>
              <p className="text-5xl mb-4">✅</p>
              <h1 className="text-3xl font-black">Payment Successful!</h1>
              <p className="mt-3 text-[var(--muted)]">
                Your purchase of <strong>{title}</strong> for <strong>${price}</strong> is complete.
              </p>
              {purchaseData?.orderId && (
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Order #{purchaseData.orderId.slice(-6).toUpperCase()}
                </p>
              )}
              <div className="mt-8 flex flex-col gap-3">
                <button
                  onClick={() => router.push("/")}
                  className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 font-bold text-white shadow-lg shadow-emerald-500/20 transition hover:shadow-xl active:scale-[0.97]"
                >
                  Continue Shopping
                </button>
                <button
                  onClick={redirectToMessages}
                  className="rounded-xl border border-zinc-700 px-6 py-3 font-bold text-[var(--foreground)] transition hover:bg-zinc-800"
                >
                  View Messages
                </button>
                <a
                  href="/"
                  className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                >
                  Back to Marketplace
                </a>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[var(--background)]"><p className="text-[var(--muted)]">Loading...</p></div>}>
      <SuccessInner />
    </Suspense>
  );
}
