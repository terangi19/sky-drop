"use client";

import { useEffect, useState } from "react";
import { adminFetch } from "../../lib/admin-fetch.client";
import { PageHeader, LoadingBlock } from "../../components/manage/ManageUI";
import { MiniBarChart, CategoryList } from "../../components/manage/SimpleChart";

export default function ManageAnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminFetch("/api/admin/analytics")
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingBlock message="Loading analytics..." />;

  return (
    <div>
      <PageHeader title="Analytics" description="Platform growth and category performance (last 30 days)." />
      <div className="grid gap-4 lg:grid-cols-2">
        <MiniBarChart data={data?.userGrowth || []} label="User Growth" />
        <MiniBarChart data={data?.listingsGrowth || []} label="Listings Growth" />
        <MiniBarChart data={data?.dailyListings || []} label="Daily Listings" />
        <MiniBarChart data={data?.dailySales || []} label="Daily Sales" />
        <div className="lg:col-span-2">
          <CategoryList items={data?.categoryPerformance || []} label="Category Performance" />
        </div>
      </div>
    </div>
  );
}
