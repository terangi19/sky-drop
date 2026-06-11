"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Background from "../components/Background";
import { showToast } from "../components/Toast";
import {
  collection, deleteDoc, doc, onSnapshot, orderBy, query, where,
  getDocs, Timestamp, updateDoc,
} from "firebase/firestore";
import { User } from "firebase/auth";
import { auth, db, onAuthStateChanged } from "../lib/firebase";
import { isAdminEmail } from "../lib/admin-check";

const SUPER_ADMIN_EMAILS = ["rangitr16@gmail.com"];

function todayRange() {
  const s = new Date(); s.setHours(0, 0, 0, 0);
  const e = new Date(); e.setHours(23, 59, 59, 999);
  return { start: s, end: e };
}

function thisWeekRange() {
  const now = new Date();
  const s = new Date(now); s.setDate(s.getDate() - 7); s.setHours(0, 0, 0, 0);
  return { start: s, end: now };
}

function timeAgo(d: any): string {
  if (!d?.toDate) return "";
  const diff = Date.now() - d.toDate().getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function fmtDate(d: any): string {
  if (!d) return "";
  if (d?.toDate) return d.toDate().toLocaleDateString();
  return String(d).slice(0, 10);
}

export default function SuperAdminDashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const adminReady = isAdmin && !checking;
  const isSuper = user && SUPER_ADMIN_EMAILS.includes(user.email || "");

  // Pulse
  const [usersOnline, setUsersOnline] = useState(0);
  const [newUsersToday, setNewUsersToday] = useState(0);
  const [listingsToday, setListingsToday] = useState(0);
  const [wantedToday, setWantedToday] = useState(0);
  const [messagesToday, setMessagesToday] = useState(0);
  const [matchesToday, setMatchesToday] = useState(0);

  // Growth
  const [totalUsers, setTotalUsers] = useState(0);
  const [newUsersWeek, setNewUsersWeek] = useState(0);
  const [returningUsers, setReturningUsers] = useState(0);
  const [referralSignups, setReferralSignups] = useState(0);

  // Moderation
  const [reports, setReports] = useState<any[]>([]);
  const [pendingReports, setPendingReports] = useState(0);
  const [openDisputes, setOpenDisputes] = useState(0);
  const [flaggedListings, setFlaggedListings] = useState(0);
  const [pendingVerifications, setPendingVerifications] = useState(0);
  const [pendingDigital, setPendingDigital] = useState(0);

  // Conv moderation
  const [convReports, setConvReports] = useState<any[]>([]);
  const [convDisputes, setConvDisputes] = useState<any[]>([]);
  const [totalMessages, setTotalMessages] = useState(0);

  // Feature monitoring
  const [matchmakingEvents, setMatchmakingEvents] = useState(0);
  const [notificationsSent, setNotificationsSent] = useState(0);

  // User lookup
  const [searchQuery, setSearchQuery] = useState("");
  const [lookupResult, setLookupResult] = useState<any>(null);
  const [lookupListings, setLookupListings] = useState<any[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [banning, setBanning] = useState(false);

  // Activity feed
  const [activityFeed, setActivityFeed] = useState<any[]>([]);

  // System controls (super only)
  const [features, setFeatures] = useState<Record<string, any>>({});
  const [announceMsg, setAnnounceMsg] = useState("");
  const [announceType, setAnnounceType] = useState("info");
  const [sendingAnnounce, setSendingAnnounce] = useState(false);

  const feedInited = useRef(false);

  useEffect(() => {
    if (auth.currentUser) { checkAuth(auth.currentUser); return; }
    const unsub = onAuthStateChanged(auth, checkAuth);
    return () => unsub();
    function checkAuth(u: User | null) {
      setUser(u); setChecking(false); setIsAdmin(isAdminEmail(u?.email));
    }
  }, []);

  // Main listeners
  useEffect(() => {
    if (!adminReady) return;
    const { start: td, end: te } = todayRange();
    const { start: wk } = thisWeekRange();

    const u1 = onSnapshot(query(collection(db, "profiles"), where("lastActive", ">=", td), where("lastActive", "<=", te)), (s) => setUsersOnline(s.docs.length));
    const u2 = onSnapshot(query(collection(db, "profiles"), where("createdAt", ">=", td), where("createdAt", "<=", te)), (s) => setNewUsersToday(s.docs.length));
    const u3 = onSnapshot(query(collection(db, "listings"), where("createdAt", ">=", td), where("createdAt", "<=", te)), (s) => {
      const all = s.docs.map((d) => d.data());
      setListingsToday(all.filter((d: any) => d.type !== "wanted").length);
      setWantedToday(all.filter((d: any) => d.type === "wanted").length);
    });
    const u4 = onSnapshot(query(collection(db, "messages"), where("createdAt", ">=", td), where("createdAt", "<=", te)), (s) => setMessagesToday(s.docs.length));
    const u5 = onSnapshot(query(collection(db, "reports"), orderBy("createdAt", "desc")), (s) => {
      const items = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      setReports(items);
      setPendingReports(items.filter((r: any) => !r.status || r.status === "pending").length);
    });
    const u6 = onSnapshot(query(collection(db, "disputes"), where("status", "in", ["open", "under_review"])), (s) => setOpenDisputes(s.docs.length));
    const u7 = onSnapshot(query(collection(db, "profiles"), where("proofOfAddress.status", "==", "pending")), (s) => setPendingVerifications(s.docs.length));
    const u8 = onSnapshot(query(collection(db, "tradePosts"), where("type", "==", "digital")), (s) => setPendingDigital(s.docs.filter((d) => d.data().status === "pending_review").length));
    const u9 = onSnapshot(query(collection(db, "listings"), where("flagged", "==", true)), (s) => setFlaggedListings(s.docs.length));

    // Matchmaking
    let u10: (() => void) | undefined;
    try { u10 = onSnapshot(query(collection(db, "matchmakingLogs"), where("createdAt", ">=", td), where("createdAt", "<=", te)), (s) => setMatchmakingEvents(s.docs.length)); } catch {}

    // Growth
    const u11 = onSnapshot(collection(db, "profiles"), (s) => setTotalUsers(s.docs.length));
    const u12 = onSnapshot(query(collection(db, "profiles"), where("createdAt", ">=", wk)), (s) => setNewUsersWeek(s.docs.length));
    const u13 = onSnapshot(query(collection(db, "profiles"), where("lastActive", ">=", wk)), (s) => setReturningUsers(s.docs.length));
    const u14 = onSnapshot(query(collection(db, "referralEvents"), where("createdAt", ">=", td)), (s) => setReferralSignups(s.docs.length));

    // Messages / conv
    const u15 = onSnapshot(collection(db, "messages"), (s) => setTotalMessages(s.docs.length));
    const u16 = onSnapshot(query(collection(db, "reports"), orderBy("createdAt", "desc")), (s) => setConvReports(s.docs.filter((d) => d.data().listingId).map((d) => ({ id: d.id, ...d.data() }))));
    const u17 = onSnapshot(query(collection(db, "disputes"), orderBy("createdAt", "desc")), (s) => setConvDisputes(s.docs.map((d) => ({ id: d.id, ...d.data() }))));

    // Notifications sent today
    const u18 = onSnapshot(query(collection(db, "notifications"), where("createdAt", ">=", td), where("createdAt", "<=", te)), (s) => setNotificationsSent(s.docs.length));

    return () => { u1(); u2(); u3(); u4(); u5(); u6(); u7(); u8(); u9(); u10?.(); u11(); u12(); u13(); u14(); u15(); u16(); u17(); u18(); };
  }, [adminReady]);

  // Activity feed
  useEffect(() => {
    if (!adminReady || feedInited.current) return;
    feedInited.current = true;
    const items: any[] = [];
    let loaded = 0;
    const render = () => { if (++loaded >= 4) { items.sort((a: any, b: any) => (b.ts || 0) - (a.ts || 0)); setActivityFeed(items.slice(0, 20)); } };
    onSnapshot(query(collection(db, "profiles"), orderBy("createdAt", "desc")), (s) => { s.docs.slice(0, 3).forEach((d) => { const x = d.data(); items.push({ id: `u-${d.id}`, label: "New user signed up", detail: x.email || "", time: x.createdAt, ts: x.createdAt?.toDate?.()?.getTime() || 0, icon: "👤" }); }); render(); });
    onSnapshot(query(collection(db, "listings"), orderBy("createdAt", "desc")), (s) => { s.docs.slice(0, 4).forEach((d) => { const x = d.data(); items.push({ id: `l-${d.id}`, label: x.type === "wanted" ? "Wanted request posted" : "New listing posted", detail: x.title || "", time: x.createdAt, ts: x.createdAt?.toDate?.()?.getTime() || 0, icon: x.type === "wanted" ? "📋" : "📦" }); }); render(); });
    onSnapshot(query(collection(db, "purchases"), orderBy("createdAt", "desc")), (s) => { s.docs.slice(0, 3).forEach((d) => { const x = d.data(); items.push({ id: `p-${d.id}`, label: "Listing sold", detail: x.listingTitle || "", time: x.createdAt, ts: x.createdAt?.toDate?.()?.getTime() || 0, icon: "💰" }); }); render(); });
    onSnapshot(query(collection(db, "reports"), orderBy("createdAt", "desc")), (s) => { s.docs.slice(0, 3).forEach((d) => { const x = d.data(); items.push({ id: `r-${d.id}`, label: "Report opened", detail: `${x.reason || ""} — ${x.reportedUserEmail || ""}`, time: x.createdAt, ts: x.createdAt?.toDate?.()?.getTime() || 0, icon: "🚨" }); }); render(); });
  }, [adminReady]);

  // Load features (super only)
  useEffect(() => {
    if (!adminReady || !isSuper) return;
    const unsub = onSnapshot(doc(db, "config", "features"), (s) => { if (s.exists()) setFeatures(s.data() as any); });
    return () => unsub();
  }, [adminReady, isSuper]);

  // User lookup
  async function lookupUser() {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return;
    setLookupLoading(true); setLookupResult(null); setLookupListings([]);
    try {
      let snap = await getDocs(query(collection(db, "profiles"), where("email", "==", q)));
      if (snap.empty) snap = await getDocs(query(collection(db, "profiles"), where("username", "==", q)));
      if (snap.empty) snap = await getDocs(query(collection(db, "profiles"), where("__name__", "==", q)));
      if (snap.empty) { showToast("User not found", "error"); setLookupLoading(false); return; }
      const p = { id: snap.docs[0].id, ...snap.docs[0].data() } as any;
      setLookupResult(p);
      const ls = await getDocs(query(collection(db, "listings"), where("sellerId", "==", p.id), orderBy("createdAt", "desc")));
      setLookupListings(ls.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch { showToast("Lookup failed", "error"); }
    setLookupLoading(false);
  }

  async function banUser() {
    if (!lookupResult) return;
    if (!confirm(`Ban ${lookupResult.email || lookupResult.id}? This removes their listings.`)) return;
    setBanning(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/ban-user", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uid: lookupResult.id }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || "Failed"); }
      showToast("User banned", "info");
      setLookupResult((p: any) => ({ ...p, restricted: true }));
    } catch (e: any) { showToast(e.message || "Failed", "error"); }
    setBanning(false);
  }

  async function unbanUser() {
    if (!lookupResult) return;
    if (!confirm(`Unban ${lookupResult.email || lookupResult.id}?`)) return;
    try {
      await updateDoc(doc(db, "profiles", lookupResult.id), { restricted: false, bannedAt: null, banReason: "" });
      showToast("User unbanned", "success");
      setLookupResult((p: any) => ({ ...p, restricted: false }));
    } catch { showToast("Failed", "error"); }
  }

  async function toggleFeature(key: string, value: boolean) {
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/features", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key, value }),
      });
      if (!res.ok) throw new Error();
      showToast(`${key}: ${value ? "enabled" : "disabled"}`, "success");
    } catch { showToast("Failed to toggle feature", "error"); }
  }

  async function sendAnnouncement() {
    if (!announceMsg.trim()) return;
    setSendingAnnounce(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/admin/announcement", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: announceMsg.trim(), type: announceType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      showToast(data.status === "dismissed" ? "Announcement dismissed" : "Announcement sent!", "success");
      if (data.status !== "dismissed") { setAnnounceMsg(""); }
    } catch (e: any) { showToast(e.message || "Failed", "error"); }
    setSendingAnnounce(false);
  }

  if (checking) return <main className="flex min-h-screen items-center justify-center bg-[var(--background)]"><p className="text-sm text-[var(--muted)]">Checking...</p></main>;

  if (!isAdmin) {
    return (
      <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
        <Background /><Navbar />
        <section className="relative z-10 flex min-h-screen items-center justify-center px-6">
          <div className="text-center"><h1 className="text-4xl font-black text-red-500">Access Denied</h1><p className="mt-3 text-[var(--muted)]">You do not have permission.</p></div>
        </section>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <Background /><Navbar />
      <div className="relative z-10 mx-auto max-w-7xl px-6 py-10">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/30">Super Admin</p>
            <h1 className="mt-1 text-2xl font-black text-white">Control Center</h1>
          </div>
          {isSuper && (
            <div className="flex items-center gap-1.5 rounded-lg border border-sky-500/20 bg-sky-500/[0.04] px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
              <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider">Super Admin</span>
            </div>
          )}
        </div>

        {/* === SECTION 1: Marketplace Pulse === */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-4 w-0.5 rounded-full bg-sky-500" />
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/40">Marketplace Pulse</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {[
              { label: "Active Today", value: usersOnline, note: "users" },
              { label: "New Users", value: newUsersToday, note: "today" },
              { label: "Listings", value: listingsToday, note: "posted today" },
              { label: "Wanted", value: wantedToday, note: "requests today" },
              { label: "Messages", value: messagesToday, note: "sent today" },
              { label: "Matches", value: matchesToday, note: "created today" },
            ].map((c) => (
              <div key={c.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
                <p className="text-xl font-black text-white">{c.value}</p>
                <p className="text-[11px] font-medium text-white/50 mt-0.5">{c.label}</p>
                <p className="text-[9px] text-white/30 mt-0.5">{c.note}</p>
              </div>
            ))}
          </div>
        </div>

        {/* === SECTION 2: Growth === */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-4 w-0.5 rounded-full bg-sky-500" />
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/40">Growth</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {[
              { label: "Total Users", value: totalUsers },
              { label: "New This Week", value: newUsersWeek },
              { label: "Returning (7d)", value: returningUsers },
              { label: "Referrals Today", value: referralSignups },
              { label: "Total Messages", value: totalMessages },
            ].map((c) => (
              <div key={c.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
                <p className="text-xl font-black text-white">{c.value}</p>
                <p className="text-[11px] font-medium text-white/50 mt-0.5">{c.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* === SECTION 3: Moderation === */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-4 w-0.5 rounded-full" style={{ backgroundColor: reports.length > 0 ? "#ef4444" : "rgba(255,255,255,0.2)" }} />
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/40">Moderation</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {[
              { label: "Reports", value: reports.length, href: "/manage/reports", urgent: reports.length > 0 },
              { label: "Pending", value: pendingReports, href: "/manage/reports", urgent: pendingReports > 0 },
              { label: "Disputes", value: openDisputes, href: "/manage/disputes", urgent: openDisputes > 0 },
              { label: "Flagged Listings", value: flaggedListings, href: "/manage/reports", urgent: flaggedListings > 0 },
              { label: "Address KYC", value: pendingVerifications, href: "/manage/verification", urgent: false },
              { label: "Digital Review", value: pendingDigital, href: "/manage/verification", urgent: false },
            ].map((c) => (
              <Link key={c.label} href={c.href}
                className={`group rounded-xl border px-3.5 py-3 transition-all duration-200 hover:bg-white/[0.04] ${c.urgent ? "border-red-500/15 bg-red-500/[0.03]" : "border-white/[0.06] bg-white/[0.02]"}`}
              >
                <p className={`text-xl font-black transition-colors ${c.urgent ? "text-red-400 group-hover:text-red-300" : "text-white group-hover:text-sky-300"}`}>{c.value}</p>
                <p className="text-[11px] font-medium text-white/50 mt-0.5">{c.label}</p>
              </Link>
            ))}
          </div>
        </div>

        {/* === SECTION 4: User Management === */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-4 w-0.5 rounded-full bg-sky-500" />
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/40">User Management</p>
          </div>
          <div className="flex gap-2 mb-3">
            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lookupUser()}
              placeholder="Search by email, username, or UID..."
              className="flex-1 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm text-white outline-none transition focus:border-sky-500/40 placeholder:text-white/30"
            />
            <button onClick={lookupUser} disabled={lookupLoading}
              className="rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-sky-400 disabled:opacity-50"
            >{lookupLoading ? "..." : "Search"}</button>
          </div>
          {lookupResult && (
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-base font-bold text-white">{lookupResult.username || "No username"}</p>
                    <span className="text-xs text-white/40">{lookupResult.email || ""}</span>
                    <span className="text-[10px] text-white/30">ID: {lookupResult.id?.slice(0, 12)}</span>
                    {lookupResult.restricted && <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[9px] font-bold text-red-400">BANNED</span>}
                    {lookupResult.kycStatus === "approved" && <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[9px] font-bold text-sky-400">KYC</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-white/40 flex-wrap">
                    <span>Joined: {fmtDate(lookupResult.memberSince)}</span>
                    <span>Listings: {lookupListings.length}</span>
                    <span>Phone: {lookupResult.phone || "—"}</span>
                    <span>KYC: {lookupResult.kycStatus || "none"}</span>
                    <span>Referrals: {lookupResult.referralSignups || 0}</span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0 flex-wrap">
                  {lookupResult.restricted ? (
                    <button onClick={unbanUser} className="rounded-lg border border-sky-500/30 px-3 py-1.5 text-[11px] font-bold text-sky-400 transition hover:bg-sky-500/10">Unban</button>
                  ) : (
                    <button onClick={banUser} disabled={banning} className="rounded-lg border border-red-500/30 px-3 py-1.5 text-[11px] font-bold text-red-400 transition hover:bg-red-500/10 disabled:opacity-50">{banning ? "..." : "Ban User"}</button>
                  )}
                  <Link href={`/seller/${encodeURIComponent(lookupResult.email || "")}`} className="rounded-lg border border-white/[0.06] px-3 py-1.5 text-[11px] font-bold text-white/60 transition hover:bg-white/[0.04] hover:text-white">Profile</Link>
                  <Link href={`/messages?user=${encodeURIComponent(lookupResult.email || "")}`} className="rounded-lg border border-white/[0.06] px-3 py-1.5 text-[11px] font-bold text-white/60 transition hover:bg-white/[0.04] hover:text-white">Messages</Link>
                </div>
              </div>
              {lookupListings.length > 0 && (
                <div className="mt-3 space-y-1">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/30">Recent Listings</p>
                  {lookupListings.slice(0, 5).map((l: any) => (
                    <div key={l.id} className="flex items-center gap-3 rounded-lg bg-white/[0.02] px-3 py-2">
                      <span className="text-xs">{l.type === "wanted" ? "📋" : "📦"}</span>
                      <Link href={`/post/listing/${l.id}`} className="flex-1 truncate text-xs text-white/70 hover:text-sky-400 transition-colors">{l.title || "Untitled"}</Link>
                      <span className={`text-[10px] font-medium ${l.status === "live" ? "text-green-400" : l.status === "sold" ? "text-sky-400" : "text-white/30"}`}>{l.status}</span>
                      {l.price && <span className="text-[10px] text-white/50">${l.price}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* === SECTION 5: Feature Monitoring === */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-4 w-0.5 rounded-full bg-sky-500" />
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/40">Feature Monitoring</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            {[
              { label: "Total Conversations", value: totalMessages, note: "messages" },
              { label: "Reported Conv.", value: convReports.length, note: "flagged" },
              { label: "Dispute Conv.", value: convDisputes.length, note: "open cases" },
              { label: "Matchmaking Events", value: matchmakingEvents, note: "today" },
              { label: "Notifs Sent", value: notificationsSent, note: "today" },
            ].map((c) => (
              <div key={c.label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3">
                <p className="text-xl font-black text-white">{c.value}</p>
                <p className="text-[11px] font-medium text-white/50 mt-0.5">{c.label}</p>
                <p className="text-[9px] text-white/30 mt-0.5">{c.note}</p>
              </div>
            ))}
          </div>
        </div>

        {/* === SECTION 6: Live Feed + Conversation Moderation === */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-4 w-0.5 rounded-full bg-sky-500" />
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/40">Live Marketplace Feed</p>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-sky-500" />
              </span>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.04] max-h-[400px] overflow-y-auto">
              {activityFeed.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-white/30">Loading activity...</div>
              ) : activityFeed.slice(0, 15).map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-xs">{item.icon || "📌"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-white/80">{item.label}</p>
                    <p className="text-[10px] text-white/40 truncate">{item.detail}</p>
                  </div>
                  <span className="shrink-0 text-[9px] text-white/30 tabular-nums">{timeAgo(item.time)}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Reported/Dispute Conversations */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-4 w-0.5 rounded-full" style={{ backgroundColor: convReports.length > 0 ? "#ef4444" : "rgba(255,255,255,0.2)" }} />
              <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/40">Flagged Conversations</p>
            </div>
            <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
              {convReports.length === 0 && convDisputes.length === 0 ? (
                <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] px-4 py-5 text-center text-xs text-white/30">No flagged conversations</div>
              ) : (
                <>
                  {convReports.slice(0, 4).map((r: any) => (
                    <div key={r.id} className="rounded-xl border border-red-500/10 bg-red-500/[0.02] px-4 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[9px] font-bold text-red-400 uppercase">{r.reason}</span>
                            <span className="text-[9px] text-white/30">{timeAgo(r.createdAt)}</span>
                          </div>
                          <p className="text-[11px] text-white/60 mt-0.5">{r.reportedUserEmail || "Unknown"} <span className="text-white/20">reported by</span> {r.reporterUserEmail || "Unknown"}</p>
                        </div>
                        {r.listingId && (
                          <a href={`/messages?user=${encodeURIComponent(r.reportedUserEmail || r.reporterUserEmail || "")}&listing=${r.listingId}`} target="_blank"
                            className="shrink-0 rounded-lg border border-sky-500/30 px-2.5 py-1.5 text-[9px] font-bold text-sky-400 transition hover:bg-sky-500/10"
                          >Open</a>
                        )}
                      </div>
                    </div>
                  ))}
                  {convDisputes.slice(0, 4).map((d: any) => (
                    <div key={d.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase ${d.status === "open" ? "bg-red-500/10 text-red-400" : d.status === "under_review" ? "bg-sky-500/10 text-sky-400" : "bg-zinc-500/10 text-zinc-400"}`}>{d.status}</span>
                            <span className="text-[9px] text-white/30">{timeAgo(d.createdAt)}</span>
                          </div>
                          <p className="text-[11px] text-white/60 mt-0.5">{d.listingTitle || "Purchase"} · {d.buyerEmail || ""} ↔ {d.sellerEmail || ""}</p>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <a href={`/messages?user=${encodeURIComponent(d.buyerEmail || d.sellerEmail || "")}&listing=${d.listingId || ""}`} target="_blank"
                            className="rounded-lg border border-sky-500/30 px-2.5 py-1.5 text-[9px] font-bold text-sky-400 transition hover:bg-sky-500/10"
                          >Chat</a>
                          <a href="/admin/disputes" className="rounded-lg border border-white/[0.06] px-2.5 py-1.5 text-[9px] font-bold text-white/50 transition hover:bg-white/[0.04] hover:text-white">Info</a>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>
        </div>

        {/* === SECTION 7: Super Admin Controls === */}
        {isSuper && (
          <>
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-4 w-0.5 rounded-full bg-sky-500" />
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/40">System Controls</p>
                <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[8px] font-bold text-sky-400">Super Admin Only</span>
              </div>

              {/* Feature Toggles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mb-4">
                {[
                  { key: "radars", label: "Radars", desc: "Enable radar feature" },
                  { key: "matchmaking", label: "Matchmaking", desc: "Auto matchmaking on listing create" },
                  { key: "wantedFeed", label: "Wanted Live Feed", desc: "Show wanted popup notifications" },
                  { key: "referrals", label: "Referral System", desc: "Allow referral signups" },
                ].map((f) => (
                  <div key={f.key} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-bold text-white">{f.label}</p>
                      <button onClick={() => toggleFeature(f.key, !features[f.key])}
                        className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${features[f.key] ? "bg-sky-500" : "bg-zinc-700"}`}
                      >
                        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all duration-200 shadow ${features[f.key] ? "left-4" : "left-0.5"}`} />
                      </button>
                    </div>
                    <p className="text-[10px] text-white/40">{f.desc}</p>
                    <p className="text-[9px] text-white/30 mt-0.5">Status: {features[f.key] ? "active" : "inactive"}</p>
                  </div>
                ))}
              </div>

              {/* Platform Announcement */}
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <p className="text-sm font-bold text-white mb-2">Platform Announcement</p>
                <div className="flex gap-2">
                  <input type="text" value={announceMsg} onChange={(e) => setAnnounceMsg(e.target.value)}
                    placeholder="Write an announcement that appears site-wide..."
                    className="flex-1 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-sm text-white outline-none transition focus:border-sky-500/40 placeholder:text-white/30"
                  />
                  <select value={announceType} onChange={(e) => setAnnounceType(e.target.value)}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-xs text-white outline-none"
                  >
                    <option value="info">Info</option>
                    <option value="warning">Warning</option>
                    <option value="alert">Alert</option>
                  </select>
                  <button onClick={sendAnnouncement} disabled={sendingAnnounce || !announceMsg.trim()}
                    className="rounded-xl bg-sky-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-sky-400 disabled:opacity-50"
                  >{sendingAnnounce ? "..." : features.announcement ? "Dismiss" : "Send"}</button>
                </div>
                <p className="text-[10px] text-white/30 mt-1.5">Sends a site-wide banner. Send the same message again to dismiss it.</p>
              </div>
            </div>

            {/* Quick Links */}
            <div className="mb-8">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-4 w-0.5 rounded-full bg-white/20" />
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/40">System &amp; Tools</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { href: "https://console.firebase.google.com/project/sky-drop-de459/overview", label: "Firebase Console", ext: true },
                  { href: "https://dashboard.stripe.com", label: "Stripe Dashboard", ext: true },
                  { href: "https://vercel.com", label: "Vercel", ext: true },
                  { href: "/manage/reports", label: "All Reports", ext: false },
                  { href: "/manage/disputes", label: "All Disputes", ext: false },
                  { href: "/manage/verification", label: "Verification Queue", ext: false },
                  { href: "/api/seed", label: "Seed Data", ext: false },
                  { href: "/api/create-test-listing", label: "Test Listing", ext: false },
                ].map((link) => (
                  link.ext ? (
                    <a key={link.label} href={link.href} target="_blank" rel="noopener noreferrer"
                      className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm font-bold text-white/70 transition-all duration-200 hover:bg-white/[0.04] hover:border-white/[0.12] hover:text-white"
                    ><span className="mr-2">🔗</span>{link.label}</a>
                  ) : (
                    <Link key={link.label} href={link.href}
                      className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm font-bold text-white/70 transition-all duration-200 hover:bg-white/[0.04] hover:border-white/[0.12] hover:text-white"
                    ><span className="mr-2">📋</span>{link.label}</Link>
                  )
                ))}
              </div>
            </div>
          </>
        )}

        {/* Recent Reports (admin + super admin) */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="h-4 w-0.5 rounded-full" style={{ backgroundColor: reports.length > 0 ? "#ef4444" : "rgba(255,255,255,0.2)" }} />
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/40">Recent Reports</p>
            {reports.length > 0 && <span className="text-[10px] text-white/30">({reports.length})</span>}
          </div>
          {reports.length === 0 ? (
            <div className="rounded-xl border border-white/[0.04] bg-white/[0.01] px-4 py-6 text-center text-xs text-white/30">No reports</div>
          ) : (
            <div className="space-y-1.5">
              {reports.slice(0, 8).map((r) => (
                <div key={r.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-white">{r.reportedUserEmail || "Unknown"}</p>
                        <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[9px] font-bold text-red-400 uppercase">{r.reason}</span>
                      </div>
                      <p className="text-xs text-white/40 mt-0.5">by {r.reporterUserEmail || "Unknown"} · {timeAgo(r.createdAt)}</p>
                      {r.details && <p className="text-xs text-white/50 mt-1 leading-relaxed">{r.details}</p>}
                    </div>
                    <button onClick={() => { if (!confirm("Delete?")) return; deleteDoc(doc(db, "reports", r.id)).then(() => showToast("Removed")).catch(() => showToast("Failed", "error")); }}
                      className="shrink-0 rounded-lg border border-red-500/20 px-2.5 py-1.5 text-[10px] font-bold text-red-400 transition hover:bg-red-500/10"
                    >Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </main>
  );
}
