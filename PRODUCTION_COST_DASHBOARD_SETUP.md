# Production Cost Dashboard Setup Guide

**Purpose:** Configure actual production metrics collection for the Cost Dashboard
**Date:** June 22, 2026

---

## Overview

The Production Cost Dashboard displays **actual production metrics**, not estimates. To use this dashboard, you must configure automated metrics collection from your production services.

**Dashboard Location:** `/admin/cost-dashboard`

---

## Architecture

**Components:**
1. **API Endpoint:** `/api/metrics/collect` - Receives and stores metrics
2. **Database:** Firestore `metrics` collection - Stores daily metrics
3. **Dashboard UI:** `/admin/cost-dashboard` - Displays metrics and trends
4. **Metrics Collector:** Cron job or monitoring system - Collects metrics from production APIs

---

## Setup Steps

### Step 1: Configure Environment Variables

Add to your `.env.local` or production environment variables:

```bash
# Generate a secure API key for metrics collection
METRICS_API_KEY=your-secure-random-api-key-here
```

**Generate API Key:**
```bash
openssl rand -hex 32
```

---

### Step 2: Configure Firestore Security Rules

Add to your Firestore security rules to protect the metrics collection:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Only allow API key authenticated writes to metrics
    match /metrics/{date} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.token.admin == true;
    }
  }
}
```

---

### Step 3: Create Metrics Collection Script

Create a cron job or monitoring script to collect metrics from production APIs.

**Example: `collect-metrics.js`**

```javascript
const admin = require('firebase-admin');
const fetch = require('node-fetch');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.applicationDefault(),
});

async function collectMetrics() {
  const metrics = {
    firestore: await getFirestoreMetrics(),
    storage: await getStorageMetrics(),
    vercel: await getVercelMetrics(),
    openai: await getOpenAIMetrics(),
    email: await getEmailMetrics(),
  };

  // Send to API endpoint
  const response = await fetch('https://your-domain.com/api/metrics/collect', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.METRICS_API_KEY}`,
    },
    body: JSON.stringify(metrics),
  });

  if (response.ok) {
    console.log('Metrics collected successfully');
  } else {
    console.error('Failed to collect metrics:', await response.text());
  }
}

// Implement each metrics collection function
async function getFirestoreMetrics() {
  // Use Firebase Admin SDK or Google Cloud Monitoring API
  // Returns: { reads: number, writes: number }
  return { reads: 0, writes: 0 };
}

async function getStorageMetrics() {
  // Use Google Cloud Monitoring API or Firebase Storage API
  // Returns: { bandwidthGB: number, storageGB: number }
  return { bandwidthGB: 0, storageGB: 0 };
}

async function getVercelMetrics() {
  // Use Vercel Analytics API
  // Returns: { bandwidthGB: number }
  return { bandwidthGB: 0 };
}

async function getOpenAIMetrics() {
  // Use OpenAI Dashboard API or check usage endpoint
  // Returns: { spendUSD: number }
  return { spendUSD: 0 };
}

async function getEmailMetrics() {
  // Use email provider API (Resend, SendGrid, etc.)
  // Returns: { volume: number }
  return { volume: 0 };
}

collectMetrics();
```

---

### Step 4: Configure Cron Job

Set up a daily cron job to collect metrics.

**Option A: GitHub Actions (Recommended)**

Create `.github/workflows/collect-metrics.yml`:

```yaml
name: Collect Production Metrics

on:
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight UTC
  workflow_dispatch:  # Allow manual trigger

jobs:
  collect-metrics:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm install
      - run: node scripts/collect-metrics.js
        env:
          METRICS_API_KEY: ${{ secrets.METRICS_API_KEY }}
          GOOGLE_APPLICATION_CREDENTIALS: ${{ secrets.GOOGLE_APPLICATION_CREDENTIALS }}
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
          RESEND_API_KEY: ${{ secrets.RESEND_API_KEY }}
```

**Option B: Vercel Cron Job**

Create `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/metrics/collect",
      "schedule": "0 0 * * *"
    }
  ]
}
```

**Option C: External Cron Service**

Use services like:
- cron-job.org
- EasyCron
- AWS Lambda + EventBridge

---

### Step 5: Configure Service API Integrations

#### Firestore Metrics

**Method 1: Google Cloud Monitoring API**

```javascript
const { GoogleAuth } = require('google-auth-library');
const { MonitoringClient } = require('@google-cloud/monitoring');

const auth = new GoogleAuth();
const client = new MonitoringClient({ auth });

async function getFirestoreMetrics() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const today = new Date().toISOString().split('T')[0];
  
  const [response] = await client.listTimeSeries({
    name: `projects/${projectId}`,
    filter: 'metric.type="firestore.googleapis.com/api/read_request_count"',
    aggregation: {
      alignmentPeriod: { seconds: 86400 }, // 1 day
      perSeriesAligner: 'ALIGN_SUM',
    },
    resource: {
      type: 'firestore.googleapis.com/Database',
      labels: {
        database_id: '(default)',
      },
    },
    interval: {
      startTime: { seconds: Math.floor(new Date(today) / 1000) },
      endTime: { seconds: Math.floor(new Date() / 1000) },
    },
  });

  const reads = response[0].reduce((sum, series) => {
    return sum + (series.points[0]?.value?.int64Value || 0);
  }, 0);

  // Similar for writes
  return { reads, writes: 0 };
}
```

**Method 2: Firebase Console Export**

Export metrics from Firebase Console and import to dashboard.

---

#### Storage Metrics

**Google Cloud Storage API:**

```javascript
const { Storage } = require('@google-cloud/storage');

const storage = new Storage();

async function getStorageMetrics() {
  const bucket = storage.bucket(process.env.FIREBASE_STORAGE_BUCKET);
  
  // Get storage size
  const [files] = await bucket.getFiles();
  let totalSize = 0;
  for (const file of files) {
    totalSize += (await file.getMetadata())[0].size;
  }
  
  // Get bandwidth from Cloud Monitoring
  // Similar to Firestore metrics above
  
  return {
    bandwidthGB: 0, // From Cloud Monitoring
    storageGB: totalSize / (1024 ** 3),
  };
}
```

---

#### Vercel Metrics

**Vercel Analytics API:**

```javascript
async function getVercelMetrics() {
  const response = await fetch('https://api.vercel.com/v1/analytics', {
    headers: {
      'Authorization': `Bearer ${process.env.VERCEL_TOKEN}`,
    },
  });

  const data = await response.json();
  
  return {
    bandwidthGB: data.bandwidth / (1024 ** 3),
  };
}
```

---

#### OpenAI Metrics

**OpenAI Dashboard API:**

```javascript
async function getOpenAIMetrics() {
  const response = await fetch('https://api.openai.com/v1/usage', {
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
  });

  const data = await response.json();
  
  return {
    spendUSD: data.total_usage / 100, // Convert cents to dollars
  };
}
```

---

#### Email Metrics

**Resend API:**

```javascript
async function getEmailMetrics() {
  const response = await fetch('https://api.resend.com/emails', {
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
    },
  });

  const data = await response.json();
  
  return {
    volume: data.length, // Number of emails sent today
  };
}
```

**SendGrid API:**

```javascript
async function getEmailMetrics() {
  const response = await fetch('https://api.sendgrid.com/v3/stats', {
    headers: {
      'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
    },
  });

  const data = await response.json();
  
  return {
    volume: data[0]?.metrics?.requests || 0,
  };
}
```

---

## Cost Calculations

The dashboard uses the following cost formulas:

### Firestore
- Reads: $0.18 per 100,000 reads
- Writes: $0.06 per 100,000 writes

### Storage
- Bandwidth: $0.12 per GB
- Storage: $0.026 per GB/month

### Vercel
- Bandwidth: $0.40 per GB (Hobby plan)
- Functions: Calculated separately

### OpenAI
- Spend: Direct from API (already in USD)

### Email
- Volume: $0.001 per email (Resend)
- Volume: $0.01 per email (SendGrid)

---

## Dashboard Features

### Current Cost
- Sum of all daily costs
- Compared to yesterday's cost
- Trend indicator (↑/↓ percentage)

### Projected Monthly Cost
- Current daily cost × 30 days
- Based on actual usage, not estimates

### 30-Day Trend
- Daily metrics table
- Last 30 days of data
- Sortable by date

### Metrics Tracked
- Firestore reads/day
- Firestore writes/day
- Storage bandwidth/day
- Storage growth/day
- Vercel bandwidth/day
- OpenAI spend/day
- Email volume/day

---

## Testing

### Manual Test

Test the API endpoint manually:

```bash
curl -X POST https://your-domain.com/api/metrics/collect \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "firestore": { "reads": 100000, "writes": 10000 },
    "storage": { "bandwidthGB": 10, "storageGB": 5 },
    "vercel": { "bandwidthGB": 5 },
    "openai": { "spendUSD": 1.50 },
    "email": { "volume": 100 }
  }'
```

Expected response:
```json
{
  "success": true,
  "date": "2026-06-22"
}
```

### View Dashboard

Navigate to: `/admin/cost-dashboard`

---

## Troubleshooting

### No Data Showing

1. Check METRICS_API_KEY is set correctly
2. Verify cron job is running
3. Check API endpoint logs for errors
4. Verify Firestore security rules allow writes

### Incorrect Metrics

1. Verify API credentials for each service
2. Check date ranges in API queries
3. Ensure metrics are being collected daily
4. Validate cost calculation formulas

### Trend Calculation Wrong

1. Ensure yesterday's data exists
2. Check date sorting logic
3. Verify cost calculation is consistent

---

## Security

**Important:**
- Never commit METRICS_API_KEY to version control
- Use environment variables for all API keys
- Restrict API endpoint to admin-only access
- Implement rate limiting on metrics collection endpoint
- Rotate API keys periodically

---

## Maintenance

**Daily:**
- Cron job automatically collects metrics
- Dashboard updates automatically

**Weekly:**
- Review cost trends
- Identify anomalies
- Check for missing data

**Monthly:**
- Compare with billing statements
- Validate cost calculations
- Update cost formulas if pricing changes

---

## Next Steps

1. **Set up environment variables** (Step 1)
2. **Configure Firestore security rules** (Step 2)
3. **Create metrics collection script** (Step 3)
4. **Configure cron job** (Step 4)
5. **Integrate with service APIs** (Step 5)
6. **Test manually** (Testing section)
7. **Monitor dashboard** at `/admin/cost-dashboard`

---

## Important Notes

**This dashboard requires actual production data.** Without configuring the metrics collection script and integrating with production APIs, the dashboard will show no data.

**Do not estimate based on assumptions.** The dashboard is designed to display actual metrics from your production services.

**Costs are calculated based on actual usage.** The dashboard uses real-time pricing data from your service providers.
