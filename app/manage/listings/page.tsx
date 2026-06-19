"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminFetch, fmtDate } from "../../lib/admin-fetch.client";
import {
  PageHeader, Panel, DataTable, Th, Td, EmptyRow, Btn, Badge, LoadingBlock, confirmAction,
} from "../../components/manage/ManageUI";
import { showToast } from "../../components/Toast";

const FILTERS = ["all", "active", "sold", "draft", "expired", "reported"] as const;

export default function ManageListingsPage() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [listings, setListings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch(`/api/admin/listings?filter=${filter}`);
      setListings(data.listings || []);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load", "error");
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  async function action(listingId: string, act: "hide" | "restore" | "delete", title: string) {
    const msg =
      act === "delete"
        ? `Delete listing "${title}" permanently?`
        : act === "hide"
          ? `Hide listing "${title}" from the marketplace?`
          : `Restore listing "${title}"?`;
    if (!(await confirmAction(msg))) return;
    try {
      await adminFetch("/api/admin/listings", { method: "POST", body: JSON.stringify({ listingId, action: act }) });
      showToast("Done", "success");
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  return (
    <div>
      <PageHeader title="Listings" description="Admin view of all marketplace listings." />
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md border px-3 py-1.5 text-[11px] font-bold capitalize ${
              filter === f ? "border-sky-500/30 bg-sky-500/10 text-sky-400" : "border-[var(--card-border)] text-[var(--muted)]"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <Panel>
        {loading ? (
          <LoadingBlock />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Title</Th>
                <Th>Seller</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th>Created</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {listings.length === 0 ? (
                <EmptyRow colSpan={6} message="No listings in this filter" />
              ) : (
                listings.map((l) => (
                  <tr key={l.id}>
                    <Td>
                      <p className="font-medium">{l.title}</p>
                      {l.flagged && <Badge tone="red">Reported</Badge>}
                    </Td>
                    <Td className="text-xs">
                      {l.sellerUsername ? `@${l.sellerUsername}` : l.sellerEmail}
                    </Td>
                    <Td className="text-xs">{l.type}</Td>
                    <Td><Badge tone={l.status === "sold" ? "sky" : l.hidden ? "amber" : "neutral"}>{l.hidden ? "hidden" : l.status}</Badge></Td>
                    <Td className="text-xs">{fmtDate(l.createdAtMs)}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <Link href={`/post/listing/${l.id}`} target="_blank"><Btn>View</Btn></Link>
                        <Link href={`/post/ai?edit=${l.id}`} target="_blank"><Btn>Edit</Btn></Link>
                        <Btn onClick={() => action(l.id, "hide", l.title)}>Hide</Btn>
                        <Btn onClick={() => action(l.id, "restore", l.title)}>Restore</Btn>
                        <Btn variant="danger" onClick={() => action(l.id, "delete", l.title)}>Delete</Btn>
                      </div>
                    </Td>
                  </tr>
                ))
              )}
            </tbody>
          </DataTable>
        )}
      </Panel>
    </div>
  );
}
