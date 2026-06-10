"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";

const STATIC_PAGES = [
  { label: "Home", path: "/", icon: "🏠" },
  { label: "Trade Feed", path: "/trade-feed", icon: "📊" },
  { label: "My Listings", path: "/list-list", icon: "📋" },
  { label: "Dashboard", path: "/dashboard", icon: "📈" },
  { label: "Messages", path: "/messages", icon: "💬" },
  { label: "Profile", path: "/profile", icon: "👤" },
  { label: "Purchases", path: "/purchases", icon: "🛒" },
  { label: "Sales", path: "/sales", icon: "💰" },
  { label: "Watchlist", path: "/watchlist", icon: "⭐" },
  { label: "FAQs", path: "/faqs", icon: "❓" },
  { label: "Terms", path: "/terms", icon: "📄" },
  { label: "Privacy", path: "/privacy", icon: "🔒" },
  { label: "About", path: "/about", icon: "ℹ️" },
];

export default function Spotlight() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query_text, setQuery] = useState("");
  const [listings, setListings] = useState<any[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((p) => !p);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setListings([]);
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!query_text.trim()) { setListings([]); return; }
    const timer = setTimeout(async () => {
      try {
        const q = query(
          collection(db, "listings"),
          where("title", ">=", query_text),
          where("title", "<=", query_text + "\uf8ff"),
          limit(5)
        );
        const snap = await getDocs(q);
        setListings(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch { setListings([]); }
    }, 200);
    return () => clearTimeout(timer);
  }, [query_text]);

  const filteredPages = useMemo(() => {
    if (!query_text.trim()) return STATIC_PAGES;
    const q = query_text.toLowerCase();
    return STATIC_PAGES.filter((p) => p.label.toLowerCase().includes(q) || p.path.includes(q));
  }, [query_text]);

  const results = useMemo(() => {
    const items: { label: string; path: string; icon: string; type: string }[] = [];
    for (const p of filteredPages) items.push({ ...p, type: "page" });
    for (const l of listings) items.push({ label: l.title, path: `/post/listing/${l.id}`, icon: "📦", type: "listing" });
    return items;
  }, [filteredPages, listings]);

  useEffect(() => {
    if (selectedIndex >= results.length) setSelectedIndex(Math.max(0, results.length - 1));
  }, [results, selectedIndex]);

  if (!open) return null;

  function navigate(item: { path: string }) {
    setOpen(false);
    router.push(item.path);
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh] bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden animate-slide-down" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-zinc-800 px-5 py-4">
          <svg className="h-5 w-5 shrink-0 text-[var(--muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search pages, listings..."
            value={query_text}
            onChange={(e) => { setQuery(e.target.value); setSelectedIndex(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIndex((i) => Math.min(i + 1, results.length - 1)); }
              if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIndex((i) => Math.max(i - 1, 0)); }
              if (e.key === "Enter" && results[selectedIndex]) navigate(results[selectedIndex]);
              if (e.key === "Escape") setOpen(false);
            }}
            className="flex-1 bg-transparent text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)]"
            autoFocus
          />
          <kbd className="hidden sm:inline-flex items-center rounded-md border border-zinc-700 bg-zinc-800/50 px-1.5 py-0.5 text-[10px] text-[var(--muted)]">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--muted)]">{query_text ? "No results found" : "Start typing to search..."}</p>
          ) : (
            results.map((item, i) => (
              <button
                key={item.path + item.label}
                onClick={() => navigate(item)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={`flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-left text-sm transition ${
                  i === selectedIndex ? "bg-sky-500/10 text-sky-400" : "text-[var(--foreground)] hover:bg-zinc-800/50"
                }`}
              >
                <span>{item.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.label}</p>
                  <p className="truncate text-[11px] text-[var(--muted)]">{item.path}</p>
                </div>
                <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                  item.type === "page" ? "bg-zinc-800 text-[var(--muted)]" : "bg-sky-500/10 text-sky-400"
                }`}>{item.type}</span>
              </button>
            ))
          )}
        </div>
        <div className="border-t border-zinc-800 px-4 py-2.5 text-[10px] text-[var(--muted)] flex items-center gap-3">
          <span><kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 py-0.5">↑↓</kbd> Navigate</span>
          <span><kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 py-0.5">↵</kbd> Open</span>
          <span><kbd className="rounded border border-zinc-700 bg-zinc-800 px-1 py-0.5">ESC</kbd> Close</span>
        </div>
      </div>
    </div>
  );
}
