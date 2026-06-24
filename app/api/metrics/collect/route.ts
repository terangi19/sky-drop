import { NextRequest, NextResponse } from "next/server";
import { doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";

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

export async function POST(request: NextRequest) {
  try {
    // Verify authentication (admin only)
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader !== `Bearer ${process.env.METRICS_API_KEY}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body: MetricsData = await request.json();

    // Validate required fields
    if (!body.firestore || !body.storage) {
      return NextResponse.json({ error: "Missing required metrics" }, { status: 400 });
    }

    // Store daily metrics
    const today = new Date().toISOString().split("T")[0];
    const metricsRef = doc(db, "metrics", today);

    await setDoc(metricsRef, {
      ...body,
      date: today,
      collectedAt: serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ success: true, date: today });
  } catch (error) {
    console.error("Failed to collect metrics:", error);
    return NextResponse.json({ error: "Failed to collect metrics" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get("authorization");
    if (!authHeader || authHeader !== `Bearer ${process.env.METRICS_API_KEY}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get metrics for the last 30 days
    const metrics: any[] = [];
    const today = new Date();

    for (let i = 0; i < 30; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split("T")[0];

      const docRef = doc(db, "metrics", dateStr);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
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
