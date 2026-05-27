"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";

const CATEGORIES = ["All", "IT & Tech", "Sales & Marketing", "Accounting & Finance", "Construction & Trades", "Healthcare & Education", "Hospitality & Tourism", "Other"];

export default function JobsPage() {
  const [listings, setListings] = useState<any[]>([]);
  const [category, setCategory] = useState("All");

  useEffect(() => {
    const q = query(collection(db, "listings"), where("type", "==", "job"), where("status", "==", "live"));
    const unsub = onSnapshot(q, (snap) => {
      const items: any[] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      items.sort((a, b) => ((b.createdAt?.toDate?.() || 0) - (a.createdAt?.toDate?.() || 0)));
      setListings(items);
    }, (err) => { console.error("Failed to load jobs:", err); });
    return () => unsub();
  }, []);

  const filtered = category === "All" ? listings : listings.filter((l) => l.category === category);

  function formatSalary(item: any): string {
    if (item.salaryMin && item.salaryMax) return `$${Number(item.salaryMin).toLocaleString()} - $${Number(item.salaryMax).toLocaleString()}`;
    if (item.salaryMin) return `From $${Number(item.salaryMin).toLocaleString()}`;
    if (item.salaryMax) return `Up to $${Number(item.salaryMax).toLocaleString()}`;
    return `$${item.price}`;
  }

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background /><Navbar />

      <section className="relative z-10 mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="mb-10 relative overflow-hidden rounded-3xl border border-white/[0.04] bg-gradient-to-b from-white/[0.04] via-transparent to-transparent p-8 sm:p-10 text-center sm:text-left">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(34,211,238,0.12),transparent)] pointer-events-none" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/15 bg-cyan-500/5 px-3.5 py-1 text-[10px] font-semibold text-cyan-400 mb-4 tracking-wide uppercase">Job Listings</div>
            <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
              <span className="bg-gradient-to-r from-cyan-400 to-teal-400 bg-clip-text text-transparent">Jobs</span>
            </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
            Find your next role — browse job listings across New Zealand. Message employers directly.
          </p>
          <Link href="/post/ai" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-cyan-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-cyan-500/30 hover:scale-105 active:scale-95">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Post a Job
          </Link>
          </div>
        </div>

        <div className="mb-8 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCategory(c)}
              className={`rounded-full px-4 py-2 text-xs font-bold tracking-wide transition-all duration-200 ${
                category === c
                  ? "bg-gradient-to-r from-cyan-500 to-teal-500 text-white shadow-lg shadow-cyan-500/25"
                  : "border border-zinc-800 bg-zinc-900/40 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300"
              }`}>
              {c}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="mx-auto max-w-md mt-12 text-center">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-white/[0.03] border border-white/[0.06]">
              <span className="text-3xl">💼</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-white">No jobs listed yet</h2>
            <p className="mt-2 text-sm text-zinc-500">Be the first to post a job.</p>
            <Link href="/post/ai" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-cyan-500/20 transition-all duration-200 hover:shadow-xl hover:shadow-cyan-500/30 hover:scale-105 active:scale-95">
              Post a Job
            </Link>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((item) => (
              <div key={item.id} className="group relative overflow-hidden rounded-2xl border border-white/[0.04] bg-white/[0.02] transition-all duration-300 hover:bg-white/[0.04] hover:border-cyan-500/30 hover:-translate-y-1 hover:shadow-[0_10px_40px_-10px_rgba(34,211,238,0.15)]">
                <div className="relative h-36 overflow-hidden bg-gradient-to-br from-cyan-900/20 to-teal-900/20">
                  {item.images?.[0] || item.imageUrl || item.image ? (
                    <img src={item.images?.[0] || item.imageUrl || item.image} alt="" className="h-full w-full object-cover transition-all duration-500 group-hover:scale-110" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-5xl opacity-30">💼</div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-900/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="absolute top-3 left-3 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-bold text-cyan-400 backdrop-blur-sm">Job</div>
                </div>

                <Link href={`/post/listing/${item.id}`} className="block p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-[var(--foreground)] group-hover:text-cyan-400 transition-colors duration-300">{item.title}</p>
                      <p className="mt-0.5 text-[11px] text-zinc-500">{item.company || item.category}</p>
                    </div>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-black text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.3)]">{formatSalary(item)}</span>
                    </span>
                  </div>

                  <div className="mt-2 text-[10px] text-zinc-500">
                    {item.employmentType && <span>{item.employmentType}</span>}
                    {item.location && <span> · {item.location}</span>}
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-zinc-800/50 pt-4">
                    <span className="text-[11px] text-zinc-500">{item.sellerUsername || item.sellerEmail?.split("@")[0] || "Employer"}</span>
                    <Link href={`/post/listing/${item.id}`} className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-4 py-1.5 text-[11px] font-bold text-cyan-400 transition-all duration-200 hover:bg-cyan-500/20 hover:scale-105 active:scale-95">
                      View Job
                    </Link>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
