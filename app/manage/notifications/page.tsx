"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminFetch, timeAgo } from "../../lib/admin-fetch.client";
import { PageHeader, Panel, Btn, LoadingBlock } from "../../components/manage/ManageUI";
import { showToast } from "../../components/Toast";

export default function ManageNotificationsPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await adminFetch("/api/admin/alerts");
      setAlerts(data.alerts || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  async function markRead(ids: string[]) {
    try {
      await adminFetch("/api/admin/alerts", { method: "POST", body: JSON.stringify({ alertIds: ids }) });
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Admin alerts — reports, disputes, and security events."
        action={<Btn onClick={() => markRead(alerts.filter((a) => !a.read).map((a) => a.id))}>Mark all read</Btn>}
      />
      <Panel>
        {loading ? (
          <LoadingBlock />
        ) : alerts.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-[var(--muted)]">No alerts</p>
        ) : (
          <div className="divide-y divide-[var(--card-border)]">
            {alerts.map((a) => (
              <div key={a.id} className={`flex items-start gap-3 px-4 py-3 ${a.read ? "opacity-60" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--foreground)]">{a.title}</p>
                  <p className="text-xs text-[var(--muted)]">{a.message}</p>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">{timeAgo(a.ts)} · {a.type}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {a.href && (
                    <Link href={a.href}><Btn>Open</Btn></Link>
                  )}
                  {!a.read && <Btn onClick={() => markRead([a.id])}>Read</Btn>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
