"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import { addDoc, collection, doc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { User } from "firebase/auth";
import { auth, db, onAuthStateChanged } from "../lib/firebase";

const CATEGORIES = ["All", "Web Development", "Design & Creative", "Writing & Translation", "Video & Animation", "Music & Audio", "Consulting", "Photography", "Tutoring"];

export default function ServicesPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [listings, setListings] = useState<any[]>([]);
  const [category, setCategory] = useState("All");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "listings"), where("type", "==", "service"));
    const unsub = onSnapshot(q, (snap) => {
      const items: any[] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any)).filter((i: any) => i.status === "live");
      items.sort((a: any, b: any) => ((b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0)));
      setListings(items);
    }, (err) => { console.error("Failed to load services:", err); });
    return () => unsub();
  }, []);

  const filtered = category === "All" ? listings : listings.filter((l) => l.category === category);

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background /><Navbar />

      <section className="relative z-10 mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {/* Hero */}
        <div className="mb-10 relative overflow-hidden rounded-3xl border border-white/[0.04] bg-gradient-to-b from-white/[0.04] via-transparent to-transparent p-8 sm:p-10 text-center sm:text-left">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(139,92,246,0.12),transparent)] pointer-events-none" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/15 bg-violet-500/5 px-3.5 py-1 text-[10px] font-semibold text-violet-400 mb-4 tracking-wide uppercase">Freelance Services</div>
            <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
              <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">Services</span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
              Hire talented freelancers for web development, design, writing, video, music, and more. Discuss scope in messages and pay securely.
            </p>
            <Link href="/post/ai?type=service" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-violet-500/30 hover:scale-105 active:scale-95">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Offer a Service
            </Link>
          </div>
        </div>

        {/* How It Works */}
        <div className="mb-10 rounded-2xl border border-violet-500/10 bg-gradient-to-b from-violet-500/[0.03] to-transparent p-6">
          <h2 className="mb-5 text-xs font-bold uppercase tracking-[0.12em] text-violet-400">📖 How It Works</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-sm">🔍</span>
              <div>
                <p className="text-sm font-bold text-[var(--foreground)]">Browse & Choose</p>
                <p className="mt-0.5 text-xs text-zinc-500">Find a service you need and check the price and delivery time.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-sm">💬</span>
              <div>
                <p className="text-sm font-bold text-[var(--foreground)]">Discuss Scope</p>
                <p className="mt-0.5 text-xs text-zinc-500">Message the seller to agree on details, timeline, and price.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-sm">💰</span>
              <div>
                <p className="text-sm font-bold text-[var(--foreground)]">Agree & Pay</p>
                <p className="mt-0.5 text-xs text-zinc-500">Send an offer or accept the price. Pay securely through Stripe.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/10 text-sm">✅</span>
              <div>
                <p className="text-sm font-bold text-[var(--foreground)]">Service Delivered</p>
                <p className="mt-0.5 text-xs text-zinc-500">Seller completes the work. You mark complete and funds are released.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Safety Warning */}
        <div className="mb-10 rounded-xl border border-red-500/10 bg-red-500/[0.03] p-4">
          <p className="text-xs text-red-400/80">
            ⚠️ <span className="font-bold text-red-400">Stay safe.</span> Never pay outside Sky Drop. Keep all communication in our chat. Report suspicious behaviour immediately.
          </p>
        </div>

        {/* Category filters */}
        <div className="mb-8 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCategory(c)}
              className={`rounded-full px-4 py-2 text-xs font-bold tracking-wide transition-all duration-200 ${
                category === c
                  ? "bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/25"
                  : "border border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
              }`}>
              {c}
            </button>
          ))}
        </div>

        {/* Listing grid */}
        {filtered.length === 0 ? (
          <div className="mx-auto max-w-md mt-12 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <span className="text-3xl">🤝</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">No services listed yet</h2>
            <p className="mt-2 text-sm text-zinc-500">Be the first to offer a service.</p>
            <Link href="/post/ai?type=service" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-violet-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-violet-500/30 hover:scale-105 active:scale-95">
              Offer a Service
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((item) => (
              <Link key={item.id} href={`/post/listing/${item.id}`} className="group relative overflow-hidden rounded-2xl border border-white/[0.04] bg-white/[0.02] transition-all duration-300 hover:bg-white/[0.04] hover:border-violet-500/30 hover:-translate-y-1 hover:shadow-[0_10px_40px_-10px_rgba(139,92,246,0.15)]">
                {/* Preview */}
                <div className="relative h-36 overflow-hidden bg-gradient-to-br from-violet-900/20 to-fuchsia-900/20">
                  {item.images?.[0] || item.imageUrl || item.image ? (
                    <img src={item.images?.[0] || item.imageUrl || item.image} alt={item.title} className="h-full w-full object-cover transition-all duration-500 group-hover:scale-110" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-5xl opacity-30">🤝</div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="absolute top-3 left-3 rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[9px] font-bold text-violet-400 backdrop-blur-sm">Service</div>
                </div>

                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[var(--foreground)] group-hover:text-violet-400 transition-colors duration-300">{item.title}</p>
                      <p className="mt-0.5 text-[11px] text-zinc-500">{item.category}</p>
                    </div>
                    <span className="shrink-0 text-lg font-black text-violet-400 drop-shadow-[0_0_8px_rgba(139,92,246,0.3)]">{item.price ? `$${item.price}` : "Negotiable"}</span>
                  </div>

                  {item.serviceDuration && (
                    <p className="mt-2 text-[10px] text-zinc-500">⏱ {item.serviceDuration}</p>
                  )}

                  <div className="mt-4 flex items-center justify-between border-t border-zinc-800/50 pt-4">
                    <Link href={`/seller/${item.sellerEmail || item.sellerUsername}`} onClick={(e) => e.stopPropagation()} className="text-[11px] text-zinc-500 hover:text-violet-400 transition-colors">
                      {item.sellerUsername || item.sellerEmail?.split("@")[0] || "Seller"}
                    </Link>
                    {user?.email === item.sellerEmail ? (
                      <Link href={`/post/ai?edit=${item.id}`} onClick={(e) => e.stopPropagation()}
                        className="rounded-lg border border-zinc-700 px-4 py-1.5 text-[11px] font-bold text-zinc-400 transition-all duration-200 hover:border-zinc-600 hover:text-white">
                        Edit
                      </Link>
                    ) : (
                      <button onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const convKey = `listing_${item.id}`;
                          const existingConv = await getDocs(
                            query(
                              collection(db, "conversations"),
                              where("convKey", "==", convKey),
                              where("participants", "array-contains", user!.email!)
                            )
                          );

                          let convId: string;
                          if (!existingConv.empty) {
                            convId = existingConv.docs[0].id;
                            await updateDoc(doc(db, "conversations", convId), {
                              updatedAt: serverTimestamp(),
                              lastMessage: `Service inquiry started`,
                            });
                          } else {
                            const convRef = await addDoc(collection(db, "conversations"), {
                              convKey,
                              participants: [user!.email!, item.sellerEmail],
                              buyerEmail: user!.email!,
                              sellerEmail: item.sellerEmail,
                              listingId: item.id,
                              listingTitle: item.title,
                              listingPrice: item.price,
                              listingImage: item.images?.[0] || item.imageUrl || item.image || "",
                              createdAt: serverTimestamp(),
                              updatedAt: serverTimestamp(),
                              lastMessage: `Service inquiry started`,
                            });
                            convId = convRef.id;
                          }

                          await addDoc(collection(db, "messages"), {
                            type: "system",
                            text: `🛠️ Service inquiry started for "${item.title}"\n\nYou're now connected with the service provider.\n\nUse this chat to discuss:\n• project scope\n• pricing\n• delivery timeframe\n• revisions\n• requirements/files\n• payment details\n\nPlease keep all communication and payments inside Sky Drop for protection.\n\nService Status: 🟢 Inquiry Active`,
                            sender: "system",
                            receiver: item.sellerEmail,
                            participants: [user!.email!, item.sellerEmail],
                            conversationId: convId,
                            listingId: item.id,
                            listingTitle: item.title,
                            read: false,
                            createdAt: serverTimestamp(),
                          });

                          await addDoc(collection(db, "messages"), {
                            type: "text",
                            text: `🟢 A user is interested in hiring your service.\n\nUse this chat to discuss:\n• project requirements\n• pricing\n• deadlines\n• revisions\n• delivery expectations\n\nKeep all communication inside Sky Drop for protection.`,
                            sender: "system",
                            receiver: item.sellerEmail,
                            participants: [user!.email!, item.sellerEmail],
                            conversationId: convId,
                            listingId: item.id,
                            listingTitle: item.title,
                            read: false,
                            createdAt: serverTimestamp(),
                          });
                        } catch (e) {
                          console.error("Service inquiry failed:", e);
                        }
                        router.push(`/messages?user=${encodeURIComponent(item.sellerEmail || "")}&listing=${encodeURIComponent(item.id)}`);
                      }}
                        className="rounded-lg border border-violet-500/30 bg-violet-500/10 px-4 py-1.5 text-[11px] font-bold text-violet-400 transition-all duration-200 hover:bg-violet-500/20 hover:scale-105 active:scale-95">
                        Hire
                      </button>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
