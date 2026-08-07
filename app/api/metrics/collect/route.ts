import { NextRequest, NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, isAdminInitialized } from "../../../lib/firebase-admin";

/**
 * Metrics Collection API Endpoint
 *
 * This endpoint collects metrics from various services and stores them for the dashboard.
 * Call this endpoint from your production monitoring system or cron job.
 *
 * Metrics tracked:
 * - Firestore reads/writes
 * - Storage bandwidth/usage
 * - Vercel bandwidth
 * - OpenAI spend
 * - Email volume
 */

interface MetricsData {
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

function authorizeMetrics(request: NextRequest): NextResponse | null {
  const key = process.env.METRICS_API_KEY?.trim();
  if (!key) {
    return NextResponse.json({ error: "Metrics unavailable" }, { status: 503 });
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${key}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const denied = authorizeMetrics(request);
    if (denied) return denied;

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Metrics unavailable" }, { status: 503 });
    }

    const body: MetricsData = await request.json();

    if (!body.firestore || !body.storage) {
      return NextResponse.json({ error: "Missing required metrics" }, { status: 400 });
    }

    const today = new Date().toISOString().split("T")[0];
    const db = getAdminDb();
    await db.collection("metrics").doc(today).set(
      {
        ...body,
        date: today,
        collectedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ success: true, date: today });
  } catch (error) {
    console.error("Failed to collect metrics:", error);
    return NextResponse.json({ error: "Failed to collect metrics" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const denied = authorizeMetrics(request);
    if (denied) return denied;

    if (!isAdminInitialized()) {
      return NextResponse.json({ error: "Metrics unavailable" }, { status: 503 });
    }

    const db = getAdminDb();
    const metrics: any[] = [];
    const today = new Date();

    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      const docSnap = await db.collection("metrics").doc(dateStr).get();

      if (docSnap.exists) {
        metrics.push({
          date: dateStr,
          ...docSnap.data(),
        });
      }
    }

    return NextResponse.json({ metrics });
  } catch (error) {
    console.error("Failed to get metrics:", error);
    return NextResponse.json({ error: "Failed to get metrics" }, { status: 500 });
  }
}
