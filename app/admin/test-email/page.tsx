"use client";

import { useEffect, useState } from "react";
import { User } from "firebase/auth";
import { auth, onAuthStateChanged } from "../../lib/firebase";
import { buildEmailHtml, notificationToEmail } from "../../lib/email";
import Navbar from "../../components/Navbar";
import Background from "../../components/Background";

import { isAdminEmail } from "../../lib/admin-check";

const ALL_TYPES = [
  "purchase_confirmation", "offer_accepted", "offer_declined",
  "order_confirmed", "item_shipped", "delivered",
  "message", "bid", "outbid", "auction_won",
] as const;

const SAMPLE_LISTING = "PlayStation 5 — Like New";
const SAMPLE_TOTAL = 549;

function typeLabel(t: string): string {
  const map: Record<string, string> = {
    purchase_confirmation: "🛒 Purchase confirmed (buyer)",
    offer_accepted: "✅ Offer accepted (buyer)",
    offer_declined: "❌ Offer declined (buyer)",
    order_confirmed: "📦 Order confirmed (buyer)",
    item_shipped: "🚚 Item shipped (buyer)",
    delivered: "✅ Delivered (buyer)",
    message: "💬 New message",
    bid: "🔨 Bid received (seller)",
    outbid: "� Outbid (buyer)",
    auction_won: "🎉 Auction won (winner)",
  };
  return map[t] || t;
}

export default function TestEmailPage() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [selectedType, setSelectedType] = useState<string>("purchase_confirmation");
  const [previewHtml, setPreviewHtml] = useState("");
  const [sendStatus, setSendStatus] = useState("");
  const [testEmail, setTestEmail] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { setUser(u); setChecking(false); });
    return () => unsub();
  }, []);

  useEffect(() => {
    const email = notificationToEmail(selectedType, typeLabel(selectedType), SAMPLE_LISTING, SAMPLE_TOTAL);
    const html = buildEmailHtml({
      to: user?.email || "test@example.com",
      subject: email.subject,
      title: email.title,
      message: email.message,
      listingImage: "",
      listingTitle: SAMPLE_LISTING,
      sellerName: "testuser",
      orderId: "SK123ABC",
      date: new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" }),
      total: `$${SAMPLE_TOTAL.toFixed(2)}`,
      statusBadge: email.statusBadge,
      summaryRows: email.summaryRows,
      whatHappensNext: email.whatHappensNext,
      ctas: [
        { label: "View Order", url: "https://skydrop.nz/post/listing/sample123", primary: true },
        { label: "Open Messages", url: "https://skydrop.nz/messages", primary: false },
      ],
    });
    setPreviewHtml(html);
  }, [selectedType, user]);

  async function sendTest() {
    if (!testEmail.trim()) { setSendStatus("Enter a test email"); return; }
    setSendStatus("Sending...");
    try {
      const email = notificationToEmail(selectedType, typeLabel(selectedType), SAMPLE_LISTING, SAMPLE_TOTAL);
      const html = buildEmailHtml({
        to: testEmail,
        subject: email.subject,
        title: email.title,
        message: email.message,
        listingImage: "",
        listingTitle: SAMPLE_LISTING,
        sellerName: "testuser",
        orderId: "SK123ABC",
        date: new Date().toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" }),
        total: `$${SAMPLE_TOTAL.toFixed(2)}`,
        statusBadge: email.statusBadge,
        summaryRows: email.summaryRows,
        whatHappensNext: email.whatHappensNext,
        ctas: [
          { label: "View Order", url: "https://skydrop.nz/post/listing/sample123", primary: true },
          { label: "Open Messages", url: "https://skydrop.nz/messages", primary: false },
        ],
      });
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/send-notification-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to: testEmail, subject: email.subject, html }),
      });
      if (res.ok) setSendStatus(`✅ Sent to ${testEmail}`);
      else setSendStatus(`❌ ${res.status} — ${(await res.json()).error}`);
    } catch (e: any) {
      setSendStatus(`❌ ${e.message}`);
    }
  }

  if (checking) return <main className="flex min-h-screen items-center justify-center bg-[var(--background)]"><p className="text-sm text-zinc-500">Loading...</p></main>;

  const isAdmin = isAdminEmail(user?.email);

  if (!user || !isAdmin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <p className="text-sm text-zinc-500">Admin access only</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background /><Navbar />
      <section className="relative z-10 mx-auto max-w-6xl px-4 py-12">
        <h1 className="text-3xl font-black mb-2">📧 Email Template Preview</h1>
        <p className="text-sm text-zinc-500 mb-8">Preview and send test emails for all notification types.</p>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8">
          {/* Sidebar */}
          <div className="space-y-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 mb-3">Email Type</p>
            {ALL_TYPES.map((t) => (
              <button key={t} onClick={() => setSelectedType(t)}
                className={`w-full text-left rounded-lg px-3 py-2 text-xs transition ${
                  selectedType === t ? "bg-sky-500/10 text-sky-400 border border-sky-500/20" : "text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.02]"
                }`}>
                {typeLabel(t)}
              </button>
            ))}
          </div>

          {/* Preview */}
          <div className="space-y-6">
            {/* Send test */}
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 mb-1 block">Send test to</label>
                <input type="email" value={testEmail} onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800/80 px-4 py-2.5 text-sm outline-none focus:border-sky-500/40" />
              </div>
              <button onClick={sendTest}
                className="rounded-xl bg-sky-500 px-6 py-2.5 text-sm font-bold text-white transition hover:bg-sky-400">
                Send Test
              </button>
            </div>
            {sendStatus && <p className="text-xs text-zinc-500">{sendStatus}</p>}

            {/* Subject line */}
            <div className="rounded-xl border border-zinc-700/50 bg-zinc-800/40 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 mb-1">Subject Line</p>
              <p className="text-sm font-medium text-zinc-300">
                {notificationToEmail(selectedType, typeLabel(selectedType), SAMPLE_LISTING, SAMPLE_TOTAL).subject}
              </p>
            </div>

            {/* Rendered preview */}
            <div className="rounded-xl border border-zinc-700/50 overflow-hidden">
              <div className="bg-zinc-800/60 px-4 py-2 border-b border-zinc-700/50">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">Rendered Preview</p>
              </div>
              <iframe srcDoc={previewHtml} className="w-full h-[600px] bg-black" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
