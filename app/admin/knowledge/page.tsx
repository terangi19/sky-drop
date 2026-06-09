"use client";

import { useEffect, useState } from "react";
import { showToast } from "../../components/Toast";
import { KNOWLEDGE_CATEGORIES, type KnowledgeDoc } from "../../lib/knowledge-base";
import { User } from "firebase/auth";
import { auth, onAuthStateChanged } from "../../lib/firebase";
import { getFreshIdToken } from "../../lib/api-auth";
import { AwhinaUnderHeader } from "../../components/AwhinaOnlineBadge";

export default function AdminKnowledgePage() {
  const [user, setUser] = useState<User | null>(null);
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Partial<KnowledgeDoc> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  async function loadDocs() {
    setLoading(true);
    try {
      const token = await getFreshIdToken();
      const params = new URLSearchParams({ admin: "true", category });
      if (search) params.set("query", search);
      const res = await fetch(`/api/knowledge?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      if (data.docs) setDocs(data.docs);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  useEffect(() => { if (user) loadDocs(); }, [user, category]);

  async function saveDoc() {
    if (!editing?.title || !editing?.content) return;
    setSaving(true);
    try {
      const token = await getFreshIdToken();
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(editing),
      });
      if (!res.ok) { showToast("Failed to save", "error"); return; }
      showToast("Saved!", "success");
      setEditing(null);
      loadDocs();
    } catch { showToast("Failed to save", "error"); }
    setSaving(false);
  }

  async function deleteDoc(id: string) {
    if (!confirm("Delete this knowledge document?")) return;
    try {
      const token = await getFreshIdToken();
      await fetch(`/api/knowledge?id=${id}`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      showToast("Deleted", "success");
      loadDocs();
    } catch { showToast("Failed to delete", "error"); }
  }

  return (
    <section className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">

      <section className="relative z-10 mx-auto max-w-5xl px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-black tracking-tight mb-1 text-center">Knowledge Base</h1>
        <AwhinaUnderHeader centered className="mt-2 mb-1" />
        <p className="text-sm text-[var(--muted)] mb-6 text-center">Manage what Āwhina knows about Sky Drop.</p>

        <div className="flex flex-wrap items-center gap-3 mb-6">
          <select value={category} onChange={(e) => setCategory(e.target.value)}
            className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2 text-sm outline-none">
            <option value="all">All categories</option>
            {KNOWLEDGE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
            ))}
          </select>
          <input type="text" placeholder="Search knowledge..." value={search} onChange={(e) => setSearch(e.target.value)}
            className="flex-1 max-w-xs rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2 text-sm outline-none focus:border-sky-500/40" />
          <button onClick={loadDocs}
            className="rounded-xl border border-white/[0.06] px-4 py-2 text-sm font-bold transition hover:bg-white/[0.04]">Refresh</button>
          <button onClick={() => setEditing({ title: "", content: "", category: "general", tags: [], keywords: [], priority: 0 })}
            className="rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition hover:brightness-110">
            + New Doc
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">{[1,2,3,4].map((i) => <div key={i} className="h-20 rounded-2xl bg-white/[0.02] border border-white/[0.04] animate-pulse" />)}</div>
        ) : docs.length === 0 ? (
          <div className="text-center py-16 text-[var(--muted)]">No knowledge documents found. Click + New Doc to add one.</div>
        ) : (
          <div className="space-y-2">
            {docs.map((doc) => (
              <div key={doc.id} className="group rounded-2xl border border-white/[0.04] bg-gradient-to-b from-white/[0.02] to-transparent p-4 transition-all hover:border-sky-500/20">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-sky-400 font-bold">{KNOWLEDGE_CATEGORIES.find((c) => c.id === doc.category)?.icon} {doc.category}</span>
                      {doc.priority > 5 && <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-400">P{doc.priority}</span>}
                    </div>
                    <h3 className="text-sm font-bold mt-1">{doc.title}</h3>
                    <p className="text-xs text-[var(--muted)] mt-1 line-clamp-2">{doc.content}</p>
                    {doc.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {doc.tags.slice(0, 6).map((t) => (
                          <span key={t} className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[9px] text-zinc-400">{t}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setEditing(doc)}
                      className="rounded-lg border border-white/[0.06] px-2.5 py-1 text-[10px] font-bold transition hover:bg-white/[0.06]">Edit</button>
                    <button onClick={() => deleteDoc(doc.id)}
                      className="rounded-lg border border-red-500/20 px-2.5 py-1 text-[10px] font-bold text-red-400 transition hover:bg-red-500/10">Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Edit modal */}
        {editing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={() => setEditing(null)}>
            <div className="mx-4 w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border border-white/[0.06] bg-zinc-950/95 p-6 shadow-2xl shadow-black/40 backdrop-blur-xl" onClick={(e) => e.stopPropagation()}>
              <h2 className="text-lg font-black mb-1">{editing.id ? "Edit Document" : "New Document"}</h2>
              <p className="text-xs text-[var(--muted)] mb-4">This information will be injected into Āwhina's prompts.</p>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-zinc-400 mb-1 block">Title</label>
                  <input type="text" value={editing.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                    className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm outline-none focus:border-sky-500/40" placeholder="e.g. Card Checkout payments" />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-400 mb-1 block">Content</label>
                  <textarea value={editing.content || ""} onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                    rows={6} className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm outline-none focus:border-sky-500/40 resize-y"
                    placeholder="Full description of the topic..." />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-zinc-400 mb-1 block">Category</label>
                    <select value={editing.category || "general"} onChange={(e) => setEditing({ ...editing, category: e.target.value })}
                      className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm outline-none">
                      {KNOWLEDGE_CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id} className="bg-zinc-900">{c.icon} {c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-zinc-400 mb-1 block">Priority</label>
                    <input type="number" value={editing.priority ?? 0} onChange={(e) => setEditing({ ...editing, priority: parseInt(e.target.value) || 0 })}
                      className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm outline-none focus:border-sky-500/40" />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-400 mb-1 block">Tags <span className="text-zinc-600">(comma separated)</span></label>
                  <input type="text" value={(editing.tags || []).join(", ")} onChange={(e) => setEditing({ ...editing, tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                    className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm outline-none focus:border-sky-500/40" placeholder="stripe, payment, checkout, card" />
                </div>

                <div>
                  <label className="text-xs font-bold text-zinc-400 mb-1 block">Keywords <span className="text-zinc-600">(comma separated, for matching)</span></label>
                  <input type="text" value={(editing.keywords || []).join(", ")} onChange={(e) => setEditing({ ...editing, keywords: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
                    className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm outline-none focus:border-sky-500/40" placeholder="how to pay, stripe checkout, card payment" />
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button onClick={() => setEditing(null)} className="flex-1 rounded-xl border border-white/[0.06] py-3 text-sm font-bold transition hover:bg-white/[0.06]">Cancel</button>
                <button onClick={saveDoc} disabled={saving || !editing.title || !editing.content}
                  className="flex-1 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 py-3 text-sm font-bold text-white shadow-lg shadow-sky-500/20 transition hover:brightness-110 disabled:opacity-50">
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </section>
  );
}
