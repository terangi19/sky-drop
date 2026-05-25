"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, addDoc, collection, serverTimestamp, query, where, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";

function SuccessInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [processed, setProcessed] = useState(false);
  const [status, setStatus] = useState<"processing" | "done" | "error">("processing");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);

  const listingId = searchParams.get("listingId") || "";
  const title = searchParams.get("title") || "Listing";
  const price = searchParams.get("price") || "0";
  const buyerEmail = searchParams.get("buyerEmail") || "";
  const badgeForSale = searchParams.get("badgeForSale") || "";
  const collectionName = searchParams.get("collectionName") || "listings";

  useEffect(() => {
    async function processOrder() {
      if (processed) return;
      setProcessed(true);

      if (!listingId) {
        setStatus("done");
        return;
      }

      try {
        const listingRef = doc(db, collectionName, listingId);
        const listingSnap = await getDoc(listingRef);

        if (!listingSnap.exists()) {
          setStatus("done");
          return;
        }

        const listingData = listingSnap.data();
        const sellerEmail = listingData.sellerEmail || "";

        // Mark listing as sold
        try {
          await updateDoc(listingRef, { status: "sold" });
        } catch (e) { console.error("Failed to mark listing as sold:", e); }

        // Auto-transfer badge if applicable
        if (badgeForSale && sellerEmail && buyerEmail) {
          try {
            const { collection, query, where, getDocs } = await import("firebase/firestore");
            const { autoTransferBadge } = await import("../../lib/xpValidation");
            const sellerSnap = await getDocs(query(collection(db, "profiles"), where("email", "==", sellerEmail)));
            const buyerSnap = await getDocs(query(collection(db, "profiles"), where("email", "==", buyerEmail)));
            const sellerId = sellerSnap.docs[0]?.id;
            const buyerId = buyerSnap.docs[0]?.id;
            if (sellerId && buyerId) {
              const purchaseRef = await addDoc(collection(db, "purchases"), {
                listingId,
                listingTitle: listingData.title || title,
                listingPrice: listingData.price || price,
                listingImage: listingData.imageUrl || "",
                sellerEmail,
                buyerEmail,
                buyerName: buyerEmail,
                deliveryMethod: "badge",
                badgeTransfer: badgeForSale,
                total: Number(listingData.price || price) + 1,
                processingFee: 1.00,
                status: "pending",
                paidAt: serverTimestamp(),
                createdAt: serverTimestamp(),
              });
              await autoTransferBadge(sellerId, buyerId, badgeForSale, purchaseRef.id);
            }
          } catch (e) {
            console.error("Auto badge transfer failed:", e);
          }
        }

        // Create order record
        const orderRef = await addDoc(collection(db, "orders"), {
          listingId,
          title: listingData.title || title,
          price: listingData.price || price,
          sellerEmail,
          buyerEmail: buyerEmail || "unknown",
          status: "paid",
          createdAt: serverTimestamp(),
        });
        setOrderId(orderRef.id);

        // Find or create conversation
        const convKey = `listing_${listingId}`;
        const existingConv = await getDocs(
          query(
            collection(db, "conversations"),
            where("convKey", "==", convKey),
            where("participants", "array-contains", buyerEmail)
          )
        );

        let convId: string;
        if (!existingConv.empty) {
          convId = existingConv.docs[0].id;
          await updateDoc(doc(db, "conversations", convId), {
            updatedAt: serverTimestamp(),
            lastMessage: `Payment confirmed — $${price}`,
            orderStatus: "paid",
          });
        } else {
          const convRef = await addDoc(collection(db, "conversations"), {
            convKey,
            participants: [buyerEmail, sellerEmail],
            buyerEmail,
            sellerEmail,
            listingId,
            listingTitle: listingData.title || title,
            listingPrice: listingData.price || price,
            listingImage: listingData.imageUrl || "",
            orderStatus: "paid",
            orderId: orderRef.id,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            lastMessage: `Payment confirmed — $${price}`,
          });
          convId = convRef.id;
        }
        setConversationId(convId);

        // Send system order confirmation message
        await addDoc(collection(db, "messages"), {
          type: "order",
          orderId: orderRef.id,
          sender: "system",
          receiver: buyerEmail,
          participants: [buyerEmail, sellerEmail],
          listingId,
          listingTitle: listingData.title || title,
          listingPrice: listingData.price || price,
          orderStatus: "paid",
          text: `Payment confirmed for "${listingData.title || title}" — $${listingData.price || price}. Awaiting seller response.`,
          read: false,
          createdAt: serverTimestamp(),
        });

        // Also send to seller
        await addDoc(collection(db, "messages"), {
          type: "order",
          orderId: orderRef.id,
          sender: "system",
          receiver: sellerEmail,
          participants: [buyerEmail, sellerEmail],
          listingId,
          listingTitle: listingData.title || title,
          listingPrice: listingData.price || price,
          orderStatus: "paid",
          text: `Your listing "${listingData.title || title}" has been purchased for $${listingData.price || price}.`,
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        console.error("Order processing error:", err);
      }

      setStatus("done");
    }

    processOrder();
  }, [listingId, title, price, buyerEmail]);

  const redirectToMessages = () => {
    const url = conversationId
      ? `/messages/${conversationId}`
      : "/messages";
    router.push(url);
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[var(--background)] text-[var(--foreground)]">
      <div className="mx-auto max-w-md px-6 text-center">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-950/80 p-10 shadow-2xl backdrop-blur">
          {status === "processing" ? (
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
              <div className="mt-8 flex flex-col gap-3">
                <button
                  onClick={redirectToMessages}
                  className="rounded-xl bg-sky-500 px-6 py-3 font-bold transition hover:bg-sky-400"
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
