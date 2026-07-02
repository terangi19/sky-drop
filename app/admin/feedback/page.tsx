"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy, updateDoc, doc, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { isAdminEmail } from "../../lib/admin-check";
import { useRouter } from "next/navigation";
import { Bug, Lightbulb, Frown, Heart, Search, Filter } from "lucide-react";

interface Feedback {
  id: string;
  type: "bug" | "suggestion" | "confusing" | "liked";
  message: string;
  page: string | null;
  listingId: string | null;
  screenshot: string | null;
  browser: string | null;
  device: string | null;
  screen: string | null;
  appVersion: string | null;
  userId: string | null;
  email: string | null;
  status: "new" | "in_progress" | "resolved";
  createdAt: any;
  updatedAt: any;
}

export default function AdminFeedbackPage() {
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [filteredFeedback, setFilteredFeedback] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "bug" | "suggestion" | "confusing" | "liked">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "new" | "in_progress" | "resolved">("all");
  const [search, setSearch] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState<Feedback | null>(null);
  const router = useRouter();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      if (user.email && isAdminEmail(user.email)) {
        setIsAdmin(true);
        loadFeedback();
      } else {
        router.push("/");
      }
    });

    return () => unsubscribe();
  }, [router]);

  useEffect(() => {
    let filtered = feedback;

    if (filter !== "all") {
      filtered = filtered.filter((f) => f.type === filter);
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((f) => f.status === statusFilter);
    }

    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (f) =>
          f.message.toLowerCase().includes(searchLower) ||
          f.page?.toLowerCase().includes(searchLower) ||
          f.email?.toLowerCase().includes(searchLower)
      );
    }

    setFilteredFeedback(filtered);
  }, [feedback, filter, statusFilter, search]);

  const loadFeedback = async () => {
    try {
      const q = query(collection(db, "feedback"), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      const feedbackData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Feedback[];
      setFeedback(feedbackData);
      setFilteredFeedback(feedbackData);
    } catch (error) {
      console.error("Failed to load feedback:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateStatus = async (feedbackId: string, newStatus: "new" | "in_progress" | "resolved") => {
    try {
      await updateDoc(doc(db, "feedback", feedbackId), {
        status: newStatus,
        updatedAt: new Date(),
      });
      setFeedback((prev) =>
        prev.map((f) => (f.id === feedbackId ? { ...f, status: newStatus } : f))
      );
    } catch (error) {
      console.error("Failed to update status:", error);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "bug":
        return <Bug className="h-4 w-4 text-red-400" />;
      case "suggestion":
        return <Lightbulb className="h-4 w-4 text-yellow-400" />;
      case "confusing":
        return <Frown className="h-4 w-4 text-orange-400" />;
      case "liked":
        return <Heart className="h-4 w-4 text-pink-400" />;
      default:
        return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "new":
        return "bg-blue-500/20 text-blue-400";
      case "in_progress":
        return "bg-yellow-500/20 text-yellow-400";
      case "resolved":
        return "bg-green-500/20 text-green-400";
      default:
        return "bg-gray-500/20 text-gray-400";
    }
  };

  const getTypeCount = (type: string) => {
    return feedback.filter((f) => f.type === type).length;
  };

  const getStatusCount = (status: string) => {
    return feedback.filter((f) => f.status === status).length;
  };

  if (!isAdmin) return null;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="max-w-7xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--foreground)] mb-2">Feedback</h1>
          <p className="text-[var(--muted)]">Manage user feedback and bug reports</p>
        </div>

        {/* Analytics Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
            <div className="text-2xl font-bold text-[var(--foreground)]">{feedback.length}</div>
            <div className="text-sm text-[var(--muted)]">Total Feedback</div>
          </div>
          <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
            <div className="text-2xl font-bold text-blue-400">{getStatusCount("new")}</div>
            <div className="text-sm text-[var(--muted)]">New</div>
          </div>
          <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
            <div className="text-2xl font-bold text-yellow-400">{getStatusCount("in_progress")}</div>
            <div className="text-sm text-[var(--muted)]">In Progress</div>
          </div>
          <div className="bg-[var(--card)] rounded-xl p-4 border border-[var(--border)]">
            <div className="text-2xl font-bold text-green-400">{getStatusCount("resolved")}</div>
            <div className="text-sm text-[var(--muted)]">Resolved</div>
          </div>
        </div>

        {/* Type Filter */}
        <div className="flex flex-wrap gap-2 mb-6">
          {[
            { id: "all" as const, label: "All", count: feedback.length },
            { id: "bug" as const, label: "Bugs", count: getTypeCount("bug") },
            { id: "suggestion" as const, label: "Suggestions", count: getTypeCount("suggestion") },
            { id: "confusing" as const, label: "Confusing", count: getTypeCount("confusing") },
            { id: "liked" as const, label: "Liked", count: getTypeCount("liked") },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setFilter(item.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                filter === item.id
                  ? "border-sky-500/50 bg-sky-500/10 text-sky-400"
                  : "border-[var(--border)] bg-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {item.label} <span className="text-xs bg-[var(--card-hover)] px-2 py-0.5 rounded-full">{item.count}</span>
            </button>
          ))}
        </div>

        {/* Status Filter */}
        <div className="flex flex-wrap gap-2 mb-6">
          {[
            { id: "all" as const, label: "All Status" },
            { id: "new" as const, label: "New" },
            { id: "in_progress" as const, label: "In Progress" },
            { id: "resolved" as const, label: "Resolved" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setStatusFilter(item.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                statusFilter === item.id
                  ? "border-sky-500/50 bg-sky-500/10 text-sky-400"
                  : "border-[var(--border)] bg-transparent text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              <Filter className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-[var(--muted)]" />
            <input
              type="text"
              placeholder="Search feedback..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-[var(--card)] border border-[var(--border)] rounded-xl text-[var(--foreground)] placeholder:text-[var(--muted)] outline-none focus:border-sky-500/50 focus:ring-2 focus:ring-sky-500/10"
            />
          </div>
        </div>

        {/* Feedback List */}
        {loading ? (
          <div className="text-center py-12 text-[var(--muted)]">Loading feedback...</div>
        ) : filteredFeedback.length === 0 ? (
          <div className="text-center py-12 text-[var(--muted)]">No feedback found</div>
        ) : (
          <div className="space-y-4">
            {filteredFeedback.map((item) => (
              <div
                key={item.id}
                className="bg-[var(--card)] rounded-xl p-6 border border-[var(--border)] hover:border-[var(--border)] transition-all cursor-pointer"
                onClick={() => setSelectedFeedback(item)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {getTypeIcon(item.type)}
                    <span className="font-medium text-[var(--foreground)] capitalize">{item.type}</span>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>
                      {item.status.replace("_", " ")}
                    </span>
                  </div>
                  <div className="text-sm text-[var(--muted)]">
                    {item.createdAt?.toDate?.()?.toLocaleDateString() || new Date().toLocaleDateString()}
                  </div>
                </div>

                <p className="text-[var(--foreground)] mb-4">{item.message}</p>

                <div className="flex flex-wrap gap-4 text-xs text-[var(--muted)]">
                  {item.page && (
                    <span>Page: {item.page}</span>
                  )}
                  {item.device && (
                    <span>Device: {item.device}</span>
                  )}
                  {item.email && (
                    <span>User: {item.email}</span>
                  )}
                </div>

                <div className="flex gap-2 mt-4">
                  {item.status === "new" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateStatus(item.id, "in_progress");
                      }}
                      className="px-3 py-1.5 bg-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/30 transition-colors text-sm"
                    >
                      Mark In Progress
                    </button>
                  )}
                  {item.status === "in_progress" && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateStatus(item.id, "resolved");
                      }}
                      className="px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors text-sm"
                    >
                      Mark Resolved
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Feedback Detail Modal */}
        {selectedFeedback && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setSelectedFeedback(null)}
          >
            <div
              className="bg-[var(--card)] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-[var(--border)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-6 border-b border-[var(--border)]">
                <div className="flex items-center gap-3">
                  {getTypeIcon(selectedFeedback.type)}
                  <h2 className="text-xl font-semibold text-[var(--foreground)] capitalize">
                    {selectedFeedback.type}
                  </h2>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedFeedback.status)}`}>
                    {selectedFeedback.status.replace("_", " ")}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedFeedback(null)}
                  className="text-[var(--muted)] hover:text-[var(--foreground)] transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="p-6">
                <p className="text-[var(--foreground)] mb-6">{selectedFeedback.message}</p>

                {selectedFeedback.screenshot && (
                  <div className="mb-6">
                    <h3 className="text-sm font-medium text-[var(--foreground)] mb-2">Screenshot</h3>
                    <img
                      src={selectedFeedback.screenshot}
                      alt="Screenshot"
                      className="w-full rounded-lg border border-[var(--border)]"
                    />
                  </div>
                )}

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Page:</span>
                    <span className="text-[var(--foreground)]">{selectedFeedback.page || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Listing ID:</span>
                    <span className="text-[var(--foreground)]">{selectedFeedback.listingId || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Device:</span>
                    <span className="text-[var(--foreground)]">{selectedFeedback.device || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Screen:</span>
                    <span className="text-[var(--foreground)]">{selectedFeedback.screen || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Browser:</span>
                    <span className="text-[var(--foreground)]">{selectedFeedback.browser || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">User:</span>
                    <span className="text-[var(--foreground)]">{selectedFeedback.email || "N/A"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--muted)]">Created:</span>
                    <span className="text-[var(--foreground)]">
                      {selectedFeedback.createdAt?.toDate?.()?.toLocaleString() || "N/A"}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2 mt-6">
                  {selectedFeedback.status === "new" && (
                    <button
                      onClick={() => {
                        updateStatus(selectedFeedback.id, "in_progress");
                        setSelectedFeedback(null);
                      }}
                      className="px-4 py-2 bg-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/30 transition-colors"
                    >
                      Mark In Progress
                    </button>
                  )}
                  {selectedFeedback.status === "in_progress" && (
                    <button
                      onClick={() => {
                        updateStatus(selectedFeedback.id, "resolved");
                        setSelectedFeedback(null);
                      }}
                      className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors"
                    >
                      Mark Resolved
                    </button>
                  )}
                  {selectedFeedback.status === "resolved" && (
                    <button
                      onClick={() => {
                        updateStatus(selectedFeedback.id, "new");
                        setSelectedFeedback(null);
                      }}
                      className="px-4 py-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors"
                    >
                      Reopen
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
