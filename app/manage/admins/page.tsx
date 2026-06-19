"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "../../lib/admin-fetch.client";
import {
  PageHeader, Panel, DataTable, Th, Td, EmptyRow, Btn, Badge, LoadingBlock, SearchInput, confirmAction,
} from "../../components/manage/ManageUI";
import { showToast } from "../../components/Toast";

const ROLES = ["super_admin", "admin", "moderator", "support"] as const;

export default function ManageAdminsPage() {
  const [admins, setAdmins] = useState<any[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<(typeof ROLES)[number]>("moderator");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await adminFetch("/api/admin/admins");
      setAdmins(data.admins || []);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed to load", "error");
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function addAdmin() {
    if (!email.trim()) return;
    if (!(await confirmAction(`Add ${email} as ${role}?`))) return;
    try {
      await adminFetch("/api/admin/admins", {
        method: "POST",
        body: JSON.stringify({ action: "add", email: email.trim(), role }),
      });
      setEmail("");
      showToast("Admin added", "success");
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function removeAdmin(adminEmail: string) {
    if (!(await confirmAction(`Remove admin access for ${adminEmail}?`))) return;
    try {
      await adminFetch("/api/admin/admins", {
        method: "POST",
        body: JSON.stringify({ action: "remove", email: adminEmail }),
      });
      showToast("Removed", "success");
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  async function updateRole(adminEmail: string, newRole: string) {
    try {
      await adminFetch("/api/admin/admins", {
        method: "POST",
        body: JSON.stringify({ action: "update", email: adminEmail, role: newRole }),
      });
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  return (
    <div>
      <PageHeader title="Admins" description="Role management — Super Admin, Admin, Moderator, Support." />

      <Panel className="mb-4 p-3">
        <div className="flex flex-wrap gap-2">
          <div className="min-w-[200px] flex-1">
            <SearchInput value={email} onChange={setEmail} placeholder="admin@email.com" onSubmit={addAdmin} />
          </div>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as (typeof ROLES)[number])}
            className="rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r.replace("_", " ")}</option>
            ))}
          </select>
          <Btn onClick={addAdmin}>Add admin</Btn>
        </div>
      </Panel>

      <Panel>
        {loading ? (
          <LoadingBlock />
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Email</Th>
                <Th>Role</Th>
                <Th>Added</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {admins.length === 0 ? (
                <EmptyRow colSpan={4} message="No admins configured" />
              ) : (
                admins.map((a) => (
                  <tr key={a.email}>
                    <Td className="text-sm">{a.email}</Td>
                    <Td>
                      <select
                        value={a.role}
                        onChange={(e) => updateRole(a.email, e.target.value)}
                        className="rounded border border-[var(--card-border)] bg-[var(--soft-card)] px-2 py-1 text-xs"
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </Td>
                    <Td className="text-xs text-[var(--muted)]">{a.addedAt?.slice(0, 10) || "—"}</Td>
                    <Td>
                      <Badge tone={a.role === "super_admin" ? "sky" : "neutral"}>{a.role}</Badge>
                      <Btn variant="danger" onClick={() => removeAdmin(a.email)}>Remove</Btn>
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
