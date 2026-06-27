"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Navbar from "../components/Navbar";
import Background from "../components/Background";

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function verifyEmail() {
      const token = searchParams.get("token");
      if (!token) {
        setStatus("error");
        setMessage("Invalid verification link.");
        return;
      }

      try {
        const res = await fetch("/api/verify-email-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = await res.json();
        
        if (res.ok && data.success) {
          setStatus("success");
          setMessage("Your email has been verified successfully!");
          setTimeout(() => router.push("/"), 3000);
        } else {
          setStatus("error");
          setMessage(data.error || "Verification failed. The link may have expired.");
        }
      } catch (e: any) {
        setStatus("error");
        setMessage(e.message || "Verification failed. Please try again.");
      }
    }

    verifyEmail();
  }, [searchParams, router]);

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Navbar />
      <Background />

      <section className="relative z-10 mx-auto flex min-h-[calc(100vh-4rem)] max-w-md flex-col justify-center px-6 py-12">
        <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/80 p-8 shadow-xl backdrop-blur-sm text-center">
          {status === "loading" && (
            <>
              <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-sky-500/30 border-t-sky-500"></div>
              <h1 className="text-xl font-bold text-white">Verifying your email...</h1>
              <p className="mt-2 text-sm text-zinc-400">Please wait while we verify your email address.</p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-white">Email Verified!</h1>
              <p className="mt-2 text-sm text-zinc-400">{message}</p>
              <p className="mt-4 text-xs text-zinc-500">Redirecting to home page...</p>
            </>
          )}

          {status === "error" && (
            <>
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/20 text-red-400">
                <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-white">Verification Failed</h1>
              <p className="mt-2 text-sm text-zinc-400">{message}</p>
              <button
                onClick={() => router.push("/")}
                className="mt-6 rounded-lg bg-sky-500 px-6 py-2.5 text-sm font-bold text-white hover:bg-sky-400 transition"
              >
                Go to Home
              </button>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
