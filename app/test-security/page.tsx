"use client";

import { useState } from "react";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import ThemeToggle from "../components/ThemeToggle";
import { detectScam } from "../lib/scamdetection";
import { detectSuspiciousPrice } from "../lib/pricedetection";

const TEST_SCAM_INPUTS = [
  { label: "Bank transfer + crypto", text: "Please pay via bank transfer only or crypto" },
  { label: "Pay outside + WhatsApp", text: "Contact me on WhatsApp to pay outside the platform" },
  { label: "Urgent gift card", text: "Urgent payment needed via gift card friends and family" },
  { label: "Shipping agent scam", text: "Use my shipping agent send money first via western union" },
  { label: "DM privately + no refunds", text: "DM privately for details no refunds pay before viewing" },
  { label: "Clean listing (no scam)", text: "Selling my used iPhone 14 in great condition pickup Auckland" },
];

const TEST_PRICE_INPUTS = [
  { label: "Car under $1000", price: 500, category: "Cars" },
  { label: "Tech under $50", price: 20, category: "Tech" },
  { label: "Gaming under $30", price: 15, category: "Gaming" },
  { label: "Normal price car", price: 15000, category: "Cars" },
  { label: "Normal price tech", price: 200, category: "Tech" },
];

export default function TestSecurityPage() {
  const [scamResults, setScamResults] = useState<Record<number, any>>({});
  const [priceResults, setPriceResults] = useState<Record<number, any>>({});
  const [customInput, setCustomInput] = useState("");
  const [customResult, setCustomResult] = useState<any>(null);
  const [reportCooldownTest, setReportCooldownTest] = useState<string | null>(null);

  function runScamTest(index: number, text: string) {
    const result = detectScam(text);
    setScamResults((prev) => ({ ...prev, [index]: result }));
  }

  function runAllScamTests() {
    TEST_SCAM_INPUTS.forEach((_, i) => {
      setTimeout(() => runScamTest(i, TEST_SCAM_INPUTS[i].text), i * 100);
    });
  }

  function testCustomInput() {
    if (!customInput.trim()) return;
    setCustomResult(detectScam(customInput));
  }

  function runPriceTest(index: number, price: number, category: string) {
    const result = detectSuspiciousPrice(price, category);
    setPriceResults((prev) => ({ ...prev, [index]: { suspicious: result, price, category } }));
  }

  function runAllPriceTests() {
    TEST_PRICE_INPUTS.forEach((_, i) => {
      setTimeout(() => runPriceTest(i, TEST_PRICE_INPUTS[i].price, TEST_PRICE_INPUTS[i].category), i * 100);
    });
  }

  function testReportCooldown() {
    const key = "report_cooldown_listing_test123";
    const existing = localStorage.getItem(key);
    if (existing) {
      const elapsed = Date.now() - Number(existing);
      const hoursLeft = Math.ceil((24 * 60 * 60 * 1000 - elapsed) / (1000 * 60 * 60));
      setReportCooldownTest(`Cooldown active — ${hoursLeft}h remaining (set ${Math.round(elapsed / 1000)}s ago)`);
    } else {
      localStorage.setItem(key, String(Date.now()));
      setReportCooldownTest("Cooldown started — submit again to see the block");
    }
  }

  function clearCooldown() {
    localStorage.removeItem("report_cooldown_listing_test123");
    setReportCooldownTest(null);
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <Background />
      <Navbar />
      <ThemeToggle />

      <section className="relative z-10 mx-auto max-w-5xl px-6 py-12">
        <div className="mb-8">
          <h1 className="text-4xl font-black text-red-400">Security Test Suite</h1>
          <p className="mt-2 text-[var(--muted)]">
            Simulate scam behaviors to verify all detection systems are working. No data is written to the database.
          </p>
        </div>

        {/* SCAM DETECTION */}
        <div className="mb-10 rounded-2xl border border-zinc-700/40 bg-zinc-900/60 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-black">Scam Keyword Detection</h2>
            <button onClick={runAllScamTests} className="rounded-xl bg-sky-500 px-5 py-2 text-sm font-bold hover:bg-sky-400 active:scale-[0.98]">
              Run All
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {TEST_SCAM_INPUTS.map((test, i) => (
              <div key={i} className="rounded-xl border border-zinc-800/50 bg-zinc-800/30 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold">{test.label}</span>
                  <button onClick={() => runScamTest(i, test.text)} className="rounded-lg bg-zinc-700/60 px-3 py-1 text-[11px] font-semibold hover:bg-zinc-600/60 active:scale-95">
                    Test
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-[var(--muted)] line-clamp-2">{test.text}</p>
                {scamResults[i] && (
                  <div className={`mt-2 rounded-lg p-2 text-[11px] ${scamResults[i].isScam ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                    {scamResults[i].isScam ? (
                      <>Detected ({scamResults[i].severity}) — Keywords: {scamResults[i].keywords.join(", ")}</>
                    ) : (
                      "Clean — no scam keywords found"
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Custom test */}
          <div className="mt-4 flex gap-3">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              placeholder="Type custom text to test..."
              className="flex-1 rounded-xl border border-zinc-700/40 bg-zinc-800/50 px-4 py-2.5 text-sm outline-none focus:border-sky-500/40"
            />
            <button onClick={testCustomInput} className="rounded-xl bg-zinc-700/60 px-5 py-2.5 text-sm font-bold hover:bg-zinc-600/60 active:scale-[0.98]">
              Test
            </button>
          </div>
          {customResult && (
            <div className={`mt-2 rounded-xl p-3 text-sm ${customResult.isScam ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
              {customResult.isScam ? `Scam detected (${customResult.severity}) — Keywords: ${customResult.keywords.join(", ")}` : "Clean"}
            </div>
          )}
        </div>

        {/* PRICE DETECTION */}
        <div className="mb-10 rounded-2xl border border-zinc-700/40 bg-zinc-900/60 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-black">Suspicious Price Detection</h2>
            <button onClick={runAllPriceTests} className="rounded-xl bg-sky-500 px-5 py-2 text-sm font-bold hover:bg-sky-400 active:scale-[0.98]">
              Run All
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {TEST_PRICE_INPUTS.map((test, i) => (
              <div key={i} className="rounded-xl border border-zinc-800/50 bg-zinc-800/30 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold">{test.label}</span>
                  <button onClick={() => runPriceTest(i, test.price, test.category)} className="rounded-lg bg-zinc-700/60 px-3 py-1 text-[11px] font-semibold hover:bg-zinc-600/60 active:scale-95">
                    Test
                  </button>
                </div>
                <p className="mt-1.5 text-[11px] text-[var(--muted)]">${test.price} — {test.category}</p>
                {priceResults[i] && (
                  <div className={`mt-2 rounded-lg p-2 text-[11px] ${priceResults[i].suspicious ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                    {priceResults[i].suspicious ? "Suspicious — unusually low" : "Price looks normal"}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* REPORT COOLDOWN */}
        <div className="mb-10 rounded-2xl border border-zinc-700/40 bg-zinc-900/60 p-6">
          <h2 className="text-xl font-black mb-4">Report Rate Limiting</h2>
          <div className="flex flex-wrap gap-3">
            <button onClick={testReportCooldown} className="rounded-xl bg-amber-500/15 px-5 py-2.5 text-sm font-bold text-amber-400 hover:bg-amber-500/25 active:scale-[0.98]">
              Simulate Report Submit
            </button>
            <button onClick={clearCooldown} className="rounded-xl bg-zinc-700/50 px-5 py-2.5 text-sm font-bold hover:bg-zinc-600/50 active:scale-[0.98]">
              Clear Cooldown
            </button>
          </div>
          {reportCooldownTest && (
            <div className="mt-3 rounded-xl bg-zinc-800/50 p-3 text-sm">{reportCooldownTest}</div>
          )}
          <p className="mt-3 text-xs text-[var(--muted)]">
            Reports are rate-limited to 1 per target per 24 hours via localStorage.
          </p>
        </div>

        {/* LIVE INTEGRATION TEST CHECKLIST */}
        <div className="rounded-2xl border border-zinc-700/40 bg-zinc-900/60 p-6">
          <h2 className="text-xl font-black mb-4">Live Feature Checklist</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-zinc-800/50 bg-zinc-800/30 p-4">
              <h3 className="font-bold text-sky-400">1. Listing Creation Filtering</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">Go to /post, include scam keywords in title/desc, submit → should see warning modal</p>
            </div>
            <div className="rounded-xl border border-zinc-800/50 bg-zinc-800/30 p-4">
              <h3 className="font-bold text-sky-400">2. Incoming Message Scam</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">Send a message with scam keywords from another account → receiver sees ⚠️ Caution badge</p>
            </div>
            <div className="rounded-xl border border-zinc-800/50 bg-zinc-800/30 p-4">
              <h3 className="font-bold text-sky-400">3. CAPTCHA Timer</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">Open /post and submit within 3s → blocked. Wait 3s+ → allowed</p>
            </div>
            <div className="rounded-xl border border-zinc-800/50 bg-zinc-800/30 p-4">
              <h3 className="font-bold text-sky-400">4. Report Rate Limit</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">Report a listing → wait → report again → blocked for 24h</p>
            </div>
            <div className="rounded-xl border border-zinc-800/50 bg-zinc-800/30 p-4">
              <h3 className="font-bold text-sky-400">5. Admin Pending Count</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">Login as rangitr16@gmail.com → /admin → see Pending count → click Active → /admin/reports</p>
            </div>
            <div className="rounded-xl border border-zinc-800/50 bg-zinc-800/30 p-4">
              <h3 className="font-bold text-sky-400">6. Listing Price Warning</h3>
              <p className="mt-1 text-xs text-[var(--muted)]">Set Tech category with $20 price → submit → see low price warning</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
