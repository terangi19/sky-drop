"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminFetch, fmtDateTime } from "../../lib/admin-fetch.client";
import {
  PageHeader, Panel, DataTable, Th, Td, EmptyRow, Btn, Badge, LoadingBlock, confirmAction,
} from "../../components/manage/ManageUI";
import { showToast } from "../../components/Toast";

export default function ManageDisputesPage() {
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetch("/api/admin/disputes-manage");
      setDisputes(data.disputes || []);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load", "error");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runAction(disputeId: string, action: "review" | "resolve" | "close", label: string) {
    if (!(await confirmAction(`${label} this dispute?`))) return;
    try {
      await adminFetch("/api/admin/disputes-manage", {
        method: "POST",
        body: JSON.stringify({ disputeId, action }),
      });
      showToast("Updated", "success");
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  return (
    <div>
      <PageHeader title="Disputes" description="Marketplace dispute center — review and resolve purchase conflicts." />
      <Panel>
        {loading ? (
          <LoadingBlock />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Buyer</Th>
                <Th>Seller</Th>
                <Th>Listing</Th>
                <Th>Opened</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {disputes.length === 0 ? (
                <EmptyRow colSpan={6} message="No disputes" />
              ) : (
                disputes.map((d) => (
                  <tr key={d.id}>
                    <Td className="text-xs">{d.buyerEmail}</Td>
                    <Td className="text-xs">{d.sellerEmail}</Td>
                    <Td>
                      <p className="text-sm font-medium">{d.listingTitle || "—"}</p>
                      {d.listingId && (
                        <Link href={`/post/listing/${d.listingId}`} className="text-[11px] text-sky-400 hover:underline" target="_blank">
                          View listing
                        </Link>
                      )}
                    </Td>
                    <Td className="text-xs">{fmtDateTime(d.createdAtMs)}</Td>
                    <Td>
                      <Badge tone={d.status === "open" ? "red" : d.status === "under_review" ? "amber" : "sky"}>
                        {d.status || "open"}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <Link
                          href={`/messages?user=${encodeURIComponent(d.buyerEmail || d.sellerEmail || "")}&listing=${d.listingId || ""}`}
                          target="_blank"
                        >
                          <Btn>Evidence</Btn>
                        </Link>
                        <Link href={`/messages?user=${encodeURIComponent(d.sellerEmail || "")}`} target="_blank">
                          <Btn>Contact</Btn>
                        </Link>
                        <Btn onClick={() => runAction(d.id, "review", "Mark under review")}>Review</Btn>
                        <Btn onClick={() => runAction(d.id, "resolve", "Resolve for buyer")}>Resolve</Btn>
                        <Btn variant="danger" onClick={() => runAction(d.id, "close", "Close")}>Close</Btn>
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
