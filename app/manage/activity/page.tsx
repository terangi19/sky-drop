"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch, timeAgo } from "../../lib/admin-fetch.client";
import { PageHeader, Panel, PanelHeader, LoadingBlock } from "../../components/manage/ManageUI";

const TYPE_LABELS: Record<string, string> = {
  user_joined: "User joined",
  listing_created: "Listing created",
  listing_sold: "Listing sold",
  report_submitted: "Report submitted",
  dispute_opened: "Dispute opened",
  admin_action: "Admin action",
};

export default function ManageActivityPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await adminFetch("/api/admin/activity?limit=80");
      setEvents(data.events || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div>
      <PageHeader title="Live Activity" description="Real-time platform events — auto-refreshes every 15s." />
      <Panel>
        <PanelHeader title="Event stream" right={<span className="text-[10px] text-sky-400">Live</span>} />
        {loading ? (
          <LoadingBlock />
        ) : (
          <div className="max-h-[70vh] divide-y divide-[var(--card-border)] overflow-y-auto">
            {events.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-[var(--muted)]">No events yet</p>
            ) : (
              events.map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-28 shrink-0 text-[10px] font-bold uppercase tracking-wide text-sky-400/80">
                    {TYPE_LABELS[e.type] || e.label}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm text-[var(--foreground)]">{e.detail}</p>
                  <span className="shrink-0 text-[10px] tabular-nums text-[var(--muted)]">{timeAgo(e.ts)}</span>
                </div>
              ))
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}
