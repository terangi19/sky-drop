"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function CheckoutRedirect() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const listingId = searchParams.get("listingId");
    if (listingId) {
      router.replace(`/post/listing/${listingId}?buy=1`);
    } else {
      router.replace("/");
    }
  }, [searchParams, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--background)]">
      <p className="text-sm text-[var(--muted)]">Redirecting...</p>
    </main>
  );
}
