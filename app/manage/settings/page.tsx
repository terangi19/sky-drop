"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "../../lib/admin-fetch.client";
import { PageHeader, Panel, Btn, LoadingBlock } from "../../components/manage/ManageUI";
import { showToast } from "../../components/Toast";

export default function ManageSettingsPage() {
  const [settings, setSettings] = useState<any>({});
  const [features, setFeatures] = useState<any>({});
  const [announcement, setAnnouncement] = useState({ message: "", active: false, type: "info" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    adminFetch("/api/admin/settings")
      .then((data) => {
        setSettings(data.settings || {});
        setFeatures(data.features || {});
        if (data.announcement) {
          setAnnouncement({
            message: data.announcement.message || "",
            active: !!data.announcement.active,
            type: data.announcement.type || "info",
          });
        }
      })
      .catch(() => showToast("Failed to load settings", "error"))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      await adminFetch("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify({ settings, features, announcement }),
      });
      showToast("Settings saved", "success");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Save failed", "error");
    }
    setSaving(false);
  }

  if (loading) return <LoadingBlock />;

  return (
    <div>
      <PageHeader title="Site Settings" description="Configure platform behaviour without code changes. Super admin only." />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="p-4 space-y-4">
          <h2 className="text-sm font-bold">General</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!settings.maintenanceMode}
              onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })}
            />
            Maintenance mode
          </label>
          <label className="block text-sm">
            <span className="text-[var(--muted)]">Referral reward ($)</span>
            <input
              type="number"
              value={settings.referralRewardAmount ?? 10}
              onChange={(e) => setSettings({ ...settings, referralRewardAmount: Number(e.target.value) })}
              className="mt-1 w-full rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--muted)]">Listing limit per user</span>
            <input
              type="number"
              value={settings.listingLimitPerUser ?? 50}
              onChange={(e) => setSettings({ ...settings, listingLimitPerUser: Number(e.target.value) })}
              className="mt-1 w-full rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--muted)]">Upload limit (MB)</span>
            <input
              type="number"
              value={settings.uploadLimitMb ?? 10}
              onChange={(e) => setSettings({ ...settings, uploadLimitMb: Number(e.target.value) })}
              className="mt-1 w-full rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2"
            />
          </label>
        </Panel>

        <Panel className="p-4 space-y-4">
          <h2 className="text-sm font-bold">Announcement banner</h2>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!announcement.active}
              onChange={(e) => setAnnouncement({ ...announcement, active: e.target.checked })}
            />
            Show site-wide banner
          </label>
          <textarea
            value={announcement.message}
            onChange={(e) => setAnnouncement({ ...announcement, message: e.target.value })}
            rows={3}
            placeholder="Announcement message..."
            className="w-full rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
          />
          <select
            value={announcement.type}
            onChange={(e) => setAnnouncement({ ...announcement, type: e.target.value })}
            className="rounded-md border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-sm"
          >
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="alert">Alert</option>
          </select>
        </Panel>

        <Panel className="p-4 space-y-3 lg:col-span-2">
          <h2 className="text-sm font-bold">Feature toggles</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {["radars", "matchmaking", "wantedFeed", "referrals"].map((key) => (
              <label key={key} className="flex items-center gap-2 rounded-md border border-[var(--card-border)] px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!features[key]}
                  onChange={(e) => setFeatures({ ...features, [key]: e.target.checked })}
                />
                {key}
              </label>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-4">
        <Btn onClick={save} disabled={saving}>{saving ? "Saving..." : "Save settings"}</Btn>
      </div>
    </div>
  );
}
