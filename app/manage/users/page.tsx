"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { adminFetch, fmtDate, fmtDateTime } from "../../lib/admin-fetch.client";
import {
  PageHeader, Panel, SearchInput, DataTable, Th, Td, EmptyRow, Btn, Badge, LoadingBlock, confirmAction,
} from "../../components/manage/ManageUI";
import { showToast } from "../../components/Toast";

type UserRow = {
  id: string;
  username: string;
  displayName: string;
  email: string;
  joinDateMs: number | null;
  lastActiveMs: number | null;
  listingsCount: number;
  salesCount: number;
  purchasesCount: number;
  status: string;
};

function statusTone(status: string) {
  if (status === "Banned" || status === "Suspended") return "red" as const;
  if (status === "Restricted") return "amber" as const;
  if (status === "Verified") return "green" as const;
  return "neutral" as const;
}

export default function ManageUsersPage() {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const url = q ? `/api/admin/users?q=${encodeURIComponent(q)}` : "/api/admin/users";
      const data = await adminFetch(url);
      setUsers(data.users || []);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load users", "error");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function runAction(uid: string, action: string, confirmMsg: string) {
    if (!(await confirmAction(confirmMsg))) return;
    setBusy(`${action}-${uid}`);
    try {
      await adminFetch("/api/admin/user-action", {
        method: "POST",
        body: JSON.stringify({ uid, action }),
      });
      showToast("Done", "success");
      await load(query || undefined);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed", "error");
    }
    setBusy(null);
  }

  return (
    <div>
      <PageHeader title="Users" description="Search and manage marketplace accounts." />
      <Panel className="mb-4 p-3">
        <div className="flex gap-2">
          <SearchInput value={query} onChange={setQuery} placeholder="Email, username, or UID..." onSubmit={() => load(query)} />
          <Btn onClick={() => load(query)}>Search</Btn>
          <Btn onClick={() => { setQuery(""); load(); }}>Reset</Btn>
        </div>
      </Panel>

      <Panel>
        {loading ? (
          <LoadingBlock />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>User</Th>
                <Th>Email</Th>
                <Th>Joined</Th>
                <Th>Last Active</Th>
                <Th>Listings</Th>
                <Th>Sales</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <EmptyRow colSpan={8} message="No users found" />
              ) : (
                users.map((u) => (
                  <tr key={u.id}>
                    <Td>
                      <p className="font-semibold">{u.username ? `@${u.username}` : "—"}</p>
                      <p className="text-xs text-[var(--muted)]">{u.displayName || u.id.slice(0, 8)}</p>
                    </Td>
                    <Td className="text-xs">{u.email}</Td>
                    <Td className="text-xs">{fmtDate(u.joinDateMs)}</Td>
                    <Td className="text-xs">{fmtDateTime(u.lastActiveMs)}</Td>
                    <Td>{u.listingsCount}</Td>
                    <Td>{u.salesCount}</Td>
                    <Td><Badge tone={statusTone(u.status)}>{u.status}</Badge></Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <Link href={`/seller/${encodeURIComponent(u.username || u.email)}`} target="_blank">
                          <Btn>View</Btn>
                        </Link>
                        <Btn
                          disabled={!!busy}
                          onClick={() => runAction(u.id, "verify", `Verify ${u.email}?`)}
                        >
                          Verify
                        </Btn>
                        <Btn
                          variant="danger"
                          disabled={!!busy}
                          onClick={() => runAction(u.id, "suspend", `Suspend ${u.email}? They will be restricted.`)}
                        >
                          Suspend
                        </Btn>
                        <Btn
                          variant="danger"
                          disabled={!!busy}
                          onClick={() => runAction(u.id, "ban", `BAN ${u.email}? This is severe and removes listings.`)}
                        >
                          Ban
                        </Btn>
                        <Btn
                          disabled={!!busy}
                          onClick={() => runAction(u.id, "unban", `Unban / lift restrictions for ${u.email}?`)}
                        >
                          Unban
                        </Btn>
                        <Btn
                          variant="danger"
                          disabled={!!busy}
                          onClick={() => runAction(u.id, "delete", `DELETE ${u.email} permanently? This cannot be undone.`)}
                        >
                          Delete
                        </Btn>
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
