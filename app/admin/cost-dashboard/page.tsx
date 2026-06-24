"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "../../lib/firebase";

interface DailyMetrics {
  date: string;
  firestore: {
    reads: number;
    writes: number;
  };
  storage: {
    bandwidthGB: number;
    storageGB: number;
  };
  vercel: {
    bandwidthGB: number;
  };
  openai: {
    spendUSD: number;
  };
  email: {
    volume: number;
  };
}

interface CostSummary {
  currentCost: number;
  projectedMonthlyCost: number;
  trend: number; // percentage change
}

export default function CostDashboard() {
  const [metrics, setMetrics] = useState<DailyMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null);

  useEffect(() => {
    loadMetrics();
  }, []);

  async function loadMetrics() {
    try {
      setLoading(true);
      const metricsRef = collection(db, "metrics");
      const snapshot = await getDocs(metricsRef);
      const metricsData: DailyMetrics[] = [];

      snapshot.forEach((doc) => {
        metricsData.push({
          date: doc.id,
          ...(doc.data() as Omit<DailyMetrics, "date">),
        });
      });

      // Sort by date descending
      metricsData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      setMetrics(metricsData);
      calculateCostSummary(metricsData);
    } catch (error) {
      console.error("Failed to load metrics:", error);
    } finally {
      setLoading(false);
    }
  }

  function calculateCostSummary(data: DailyMetrics[]) {
    if (data.length === 0) return;

    // Get today's metrics
    const today = data[0];
    const yesterday = data[1];

    // Calculate daily costs
    const firestoreCost = (today.firestore.reads / 100000) * 0.18 + (today.firestore.writes / 100000) * 0.06;
    const storageBandwidthCost = today.storage.bandwidthGB * 0.12;
    const storageStorageCost = today.storage.storageGB * 0.026;
    const vercelCost = today.vercel.bandwidthGB * 0.40;
    const openaiCost = today.openai.spendUSD;
    const emailCost = today.email.volume * 0.001; // $0.001 per email

    const currentCost = firestoreCost + storageBandwidthCost + storageStorageCost + vercelCost + openaiCost + emailCost;

    // Projected monthly cost (current daily cost × 30)
    const projectedMonthlyCost = currentCost * 30;

    // Calculate trend (compare with yesterday)
    let trend = 0;
    if (yesterday) {
      const yesterdayFirestoreCost = (yesterday.firestore.reads / 100000) * 0.18 + (yesterday.firestore.writes / 100000) * 0.06;
      const yesterdayStorageBandwidthCost = yesterday.storage.bandwidthGB * 0.12;
      const yesterdayStorageStorageCost = yesterday.storage.storageGB * 0.026;
      const yesterdayVercelCost = yesterday.vercel.bandwidthGB * 0.40;
      const yesterdayOpenaiCost = yesterday.openai.spendUSD;
      const yesterdayEmailCost = yesterday.email.volume * 0.001;

      const yesterdayCost = yesterdayFirestoreCost + yesterdayStorageBandwidthCost + yesterdayStorageStorageCost + yesterdayVercelCost + yesterdayOpenaiCost + yesterdayEmailCost;

      trend = ((currentCost - yesterdayCost) / yesterdayCost) * 100;
    }

    setCostSummary({
      currentCost,
      projectedMonthlyCost,
      trend,
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-3xl font-bold mb-8">Production Cost Dashboard</h1>
          <div className="text-gray-400">Loading metrics...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Production Cost Dashboard</h1>

        {/* Cost Summary Cards */}
        {costSummary && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
              <div className="text-sm text-gray-400 mb-2">Current Daily Cost</div>
              <div className="text-3xl font-bold">${costSummary.currentCost.toFixed(2)}</div>
              <div className={`text-sm mt-2 ${costSummary.trend >= 0 ? "text-red-400" : "text-green-400"}`}>
                {costSummary.trend >= 0 ? "↑" : "↓"} {Math.abs(costSummary.trend).toFixed(1)}% vs yesterday
              </div>
            </div>

            <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
              <div className="text-sm text-gray-400 mb-2">Projected Monthly Cost</div>
              <div className="text-3xl font-bold">${costSummary.projectedMonthlyCost.toFixed(2)}</div>
              <div className="text-sm text-gray-400 mt-2">Based on current daily usage</div>
            </div>

            <div className="bg-zinc-900 rounded-xl p-6 border border-zinc-800">
              <div className="text-sm text-gray-400 mb-2">Days of Data</div>
              <div className="text-3xl font-bold">{metrics.length}</div>
              <div className="text-sm text-gray-400 mt-2">Last {metrics.length} days</div>
            </div>
          </div>
        )}

        {/* Metrics Table */}
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
          <div className="p-6 border-b border-zinc-800">
            <h2 className="text-xl font-bold">Daily Metrics</h2>
            <div className="text-sm text-gray-400 mt-1">Last 30 days of actual production data</div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-zinc-800">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Firestore Reads</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Firestore Writes</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Storage Bandwidth (GB)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Storage Size (GB)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Vercel Bandwidth (GB)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">OpenAI Spend ($)</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Email Volume</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {metrics.map((metric) => (
                  <tr key={metric.date} className="hover:bg-zinc-800/50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{metric.date}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{metric.firestore.reads.toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{metric.firestore.writes.toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{metric.storage.bandwidthGB.toFixed(2)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{metric.storage.storageGB.toFixed(2)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{metric.vercel.bandwidthGB.toFixed(2)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">${metric.openai.spendUSD.toFixed(2)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{metric.email.volume.toLocaleString()}</td>
                  </tr>
                ))}
                {metrics.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-6 py-12 text-center text-gray-400">
                      No metrics data available. Configure metrics collection to start tracking.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Setup Instructions */}
        {metrics.length === 0 && (
          <div className="mt-8 bg-zinc-900 rounded-xl p-6 border border-zinc-800">
            <h3 className="text-lg font-bold mb-4">Setup Instructions</h3>
            <div className="space-y-4 text-sm text-gray-400">
              <div>
                <strong className="text-white">1. Set METRICS_API_KEY environment variable</strong>
                <p className="mt-1">Generate a secure API key and add it to your environment variables.</p>
              </div>
              <div>
                <strong className="text-white">2. Configure metrics collection cron job</strong>
                <p className="mt-1">
                  Call POST /api/metrics/collect daily with metrics data from your monitoring system.
                  Example payload:
                </p>
                <pre className="mt-2 bg-zinc-800 p-4 rounded text-xs overflow-x-auto">
{`{
  "firestore": { "reads": 100000, "writes": 10000 },
  "storage": { "bandwidthGB": 100, "storageGB": 50 },
  "vercel": { "bandwidthGB": 50 },
  "openai": { "spendUSD": 10 },
  "email": { "volume": 1000 }
}`}
                </pre>
              </div>
              <div>
                <strong className="text-white">3. Integrate with service APIs</strong>
                <p className="mt-1">
                  Configure automated metrics collection from Firebase Console, Vercel Analytics, OpenAI Dashboard, and email provider.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
