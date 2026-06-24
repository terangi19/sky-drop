# Cost Model Validation

**Purpose:** Validate exact assumptions and calculations for all infrastructure costs
**Date:** June 22, 2026

---

## Pricing Reference (All Providers)

### Firebase Pricing (Spark Plan)
- **Firestore Reads:** $0.06 per 100,000 reads
- **Firestore Writes:** $0.18 per 100,000 writes
- **Firestore Storage:** $0.18 per GB/month
- **Storage Storage:** $0.026 per GB/month
- **Storage Download:** $0.12 per GB
- **Auth:** Free (10,000 MAU)
- **FCM:** Free (up to 4,000 messages/day)

### Firebase Pricing (Flame Plan)
- **Firestore Reads:** $0.18 per 100,000 reads
- **Firestore Writes:** $0.18 per 100,000 writes
- **Firestore Storage:** $0.18 per GB/month
- **Storage Storage:** $0.026 per GB/month
- **Storage Download:** $0.12 per GB
- **Auth:** $0.01 per MAU
- **FCM:** Free (up to 4,000 messages/day)

### Vercel Pricing (Hobby Plan)
- **Build Minutes:** Free (6,000 minutes/month)
- **Function Execution:** Free (100 GB-hours/month)
- **Bandwidth:** Free (100 GB/month)

### Cloudflare Pricing (Free Plan)
- **Workers:** Free (100,000 requests/day)
- **Bandwidth:** Unlimited
- **Turnstile:** Free (1,000,000 verifications/month)

### OpenAI Pricing
- **gpt-4o-mini:** $0.15 per 1M input tokens, $0.60 per 1M output tokens
- **gpt-4o:** $2.50 per 1M input tokens, $10.00 per 1M output tokens

### Stripe Pricing
- **Payment Intents:** 2.9% + $0.30 per transaction
- **Connect:** 0.25% per payout
- **Platform Fee:** Custom

### Sentry Pricing
- **Developer:** $26/month (50,000 errors)
- **Team:** $80/month (1,000,000 errors)

### Resend Pricing
- **Free:** 3,000 emails/month
- **Pro:** $20/month (50,000 emails/month)

---

## 1. Firebase Firestore

### Assumptions per User (Daily)

**Reads per User per Day:**
- Homepage visit: 100 reads (listings)
- Homepage visit: 50 reads (trade posts)
- Navbar (on every page): 150 reads (messages + notifications)
- Messages page visit: 100 reads (messages)
- Profile page visit: 2,100 reads (listings + purchases - no limit!)
- Dashboard visit: 150 reads (purchases + listings + reviews)
- Average page visits per user: 5/day
- Real-time updates during session: 1.5x multiplier

**Base Reads per User per Day:**
```
Homepage: 150 reads (100 + 50)
Navbar: 150 reads (on every page)
Messages: 100 reads (if visited)
Profile: 2,100 reads (if visited)
Dashboard: 150 reads (if visited)
```

**Weighted Average (assuming 50% homepage, 30% messages, 20% profile/dashboard):**
```
Average reads per visit = (0.5 × 150) + (0.3 × 250) + (0.2 × 2,250)
= 75 + 75 + 450
= 600 reads per visit
```

**With real-time multiplier (1.5x):**
```
Daily reads per user = 600 × 5 visits × 1.5
= 4,500 reads per user per day
```

**Writes per User per Day:**
- Login/logout: 2 writes (lastActive)
- Send message: 1 write per message
- Create listing: 1 write (rare, assume 0.1/day)
- Update profile: 1 write (assume 0.5/day)
- Mark messages read: 10 writes (assume 10 messages/day)

```
Daily writes per user = 2 + 1 + 0.1 + 0.5 + 10
= 13.6 writes per user per day
```

### Calculations by User Count

#### 1,000 Users (Spark Plan)

**Daily Reads:**
```
Total daily reads = 1,000 users × 4,500 reads/user
= 4,500,000 reads/day
```

**Monthly Reads:**
```
Total monthly reads = 4,500,000 × 30 days
= 135,000,000 reads/month
```

**Read Cost (Spark):**
```
Cost = (135,000,000 / 100,000) × $0.06
= 1,350 × $0.06
= $81.00/month
```

**Daily Writes:**
```
Total daily writes = 1,000 users × 13.6 writes/user
= 13,600 writes/day
```

**Monthly Writes:**
```
Total monthly writes = 13,600 × 30 days
= 408,000 writes/month
```

**Write Cost (Spark):**
```
Cost = (408,000 / 100,000) × $0.18
= 4.08 × $0.18
= $0.73/month
```

**Total Firestore Cost (1K users, Spark):**
```
Total = $81.00 + $0.73
= $81.73/month
```

#### 10,000 Users (Flame Plan)

**Daily Reads:**
```
Total daily reads = 10,000 users × 4,500 reads/user
= 45,000,000 reads/day
```

**Monthly Reads:**
```
Total monthly reads = 45,000,000 × 30 days
= 1,350,000,000 reads/month
```

**Read Cost (Flame):**
```
Cost = (1,350,000,000 / 100,000) × $0.18
= 13,500 × $0.18
= $2,430.00/month
```

**Daily Writes:**
```
Total daily writes = 10,000 users × 13.6 writes/user
= 136,000 writes/day
```

**Monthly Writes:**
```
Total monthly writes = 136,000 × 30 days
= 4,080,000 writes/month
```

**Write Cost (Flame):**
```
Cost = (4,080,000 / 100,000) × $0.18
= 40.8 × $0.18
= $7.34/month
```

**Total Firestore Cost (10K users, Flame):**
```
Total = $2,430.00 + $7.34
= $2,437.34/month
```

#### 100,000 Users (Flame Plan)

**Daily Reads:**
```
Total daily reads = 100,000 users × 4,500 reads/user
= 450,000,000 reads/day
```

**Monthly Reads:**
```
Total monthly reads = 450,000,000 × 30 days
= 13,500,000,000 reads/month
```

**Read Cost (Flame):**
```
Cost = (13,500,000,000 / 100,000) × $0.18
= 135,000 × $0.18
= $24,300.00/month
```

**Daily Writes:**
```
Total daily writes = 100,000 users × 13.6 writes/user
= 1,360,000 writes/day
```

**Monthly Writes:**
```
Total monthly writes = 1,360,000 × 30 days
= 40,800,000 writes/month
```

**Write Cost (Flame):**
```
Cost = (40,800,000 / 100,000) × $0.18
= 408 × $0.18
= $73.44/month
```

**Total Firestore Cost (100K users, Flame):**
```
Total = $24,300.00 + $73.44
= $24,373.44/month
```

---

## 2. Firebase Storage

### Assumptions per User

**Storage per User:**
- Avatar image: 100 KB
- Banner image: 200 KB
- Average listing images: 4 listings × 4 images × 500 KB = 8,000 KB (8 MB)
- Digital assets: Assume 10% of users sell digital goods × 50 MB = 5 MB average
- KYC documents: Assume 50% verified × 2 MB = 1 MB average
- Proof of address: Assume 50% verified × 1 MB = 0.5 MB average

```
Storage per user = 0.1 MB + 0.2 MB + 8 MB + 5 MB + 1 MB + 0.5 MB
= 14.8 MB per user
```

**Bandwidth per User (Daily):**
- View own images: 5 MB/day
- View listing images (browse): 50 MB/day
- Download digital assets: Assume 10% × 50 MB = 5 MB/day
- CDN bandwidth: Assume 80% reduction with optimization

```
Daily bandwidth per user = 5 MB + 50 MB + 5 MB
= 60 MB/day
```

### Calculations by User Count

#### 1,000 Users

**Total Storage:**
```
Total storage = 1,000 users × 14.8 MB
= 14,800 MB
= 14.46 GB
```

**Storage Cost (Spark):**
```
Cost = 14.46 GB × $0.026/GB
= $0.38/month
```

**Daily Bandwidth:**
```
Daily bandwidth = 1,000 users × 60 MB
= 60,000 MB
= 60 GB/day
```

**Monthly Bandwidth:**
```
Monthly bandwidth = 60 GB × 30 days
= 1,800 GB/month
```

**Download Cost (Spark):**
```
Cost = 1,800 GB × $0.12/GB
= $216.00/month
```

**Total Storage Cost (1K users):**
```
Total = $0.38 + $216.00
= $216.38/month
```

#### 10,000 Users

**Total Storage:**
```
Total storage = 10,000 users × 14.8 MB
= 148,000 MB
= 144.53 GB
```

**Storage Cost (Flame):**
```
Cost = 144.53 GB × $0.026/GB
= $3.76/month
```

**Daily Bandwidth:**
```
Daily bandwidth = 10,000 users × 60 MB
= 600,000 MB
= 600 GB/day
```

**Monthly Bandwidth:**
```
Monthly bandwidth = 600 GB × 30 days
= 18,000 GB/month
```

**Download Cost (Flame):**
```
Cost = 18,000 GB × $0.12/GB
= $2,160.00/month
```

**Total Storage Cost (10K users):**
```
Total = $3.76 + $2,160.00
= $2,163.76/month
```

#### 100,000 Users

**Total Storage:**
```
Total storage = 100,000 users × 14.8 MB
= 1,480,000 MB
= 1,445.31 GB
= 1.41 TB
```

**Storage Cost (Flame):**
```
Cost = 1,445.31 GB × $0.026/GB
= $37.58/month
```

**Daily Bandwidth:**
```
Daily bandwidth = 100,000 users × 60 MB
= 6,000,000 MB
= 6,000 GB/day
```

**Monthly Bandwidth:**
```
Monthly bandwidth = 6,000 GB × 30 days
= 180,000 GB/month
= 176 TB/month
```

**Download Cost (Flame):**
```
Cost = 180,000 GB × $0.12/GB
= $21,600.00/month
```

**Total Storage Cost (100K users):**
```
Total = $37.58 + $21,600.00
= $21,637.58/month
```

---

## 3. Firebase Auth

### Assumptions per User

**MAU (Monthly Active Users):**
- Assume 80% of registered users are active monthly
- Each MAU: 1 login per day

**API Calls per User per Day:**
- Login: 1 call
- ID token refresh: 5 calls (token expires every hour)
- Password reset: 0.05 calls/month

```
Daily API calls per user = 1 + 5
= 6 calls per user per day
```

### Calculations by User Count

#### 1,000 Users (Spark Plan - Free)

**MAU:**
```
MAU = 1,000 × 80%
= 800 MAU
```

**Auth Cost (Spark):**
```
Cost = $0 (free up to 10,000 MAU)
= $0.00/month
```

#### 10,000 Users (Flame Plan)

**MAU:**
```
MAU = 10,000 × 80%
= 8,000 MAU
```

**Auth Cost (Flame):**
```
Cost = 8,000 MAU × $0.01/MAU
= $80.00/month
```

#### 100,000 Users (Flame Plan)

**MAU:**
```
MAU = 100,000 × 80%
= 80,000 MAU
```

**Auth Cost (Flame):**
```
Cost = 80,000 MAU × $0.01/MAU
= $800.00/month
```

---

## 4. FCM (Firebase Cloud Messaging)

### Assumptions per User

**Messages per User per Day:**
- New message notification: 2/day
- Purchase notification: 0.1/day
- Listing update notification: 0.5/day
- System notification: 0.1/day

```
Daily messages per user = 2 + 0.1 + 0.5 + 0.1
= 2.7 messages per user per day
```

**API Calls per User per Day:**
- Send notification: 2.7 calls
- Token refresh: 0.1 calls

```
Daily API calls per user = 2.7 + 0.1
= 2.8 API calls per user per day
```

### Calculations by User Count

#### 1,000 Users

**Daily Messages:**
```
Daily messages = 1,000 users × 2.7 messages
= 2,700 messages/day
```

**FCM Cost (Free Tier):**
```
Free tier = 4,000 messages/day
2,700 < 4,000
Cost = $0.00/month
```

#### 10,000 Users

**Daily Messages:**
```
Daily messages = 10,000 users × 2.7 messages
= 27,000 messages/day
```

**FCM Cost (Free Tier Exceeded):**
```
Free tier = 4,000 messages/day
Overage = 27,000 - 4,000 = 23,000 messages/day
Monthly overage = 23,000 × 30 = 690,000 messages

Cost = (690,000 / 1,000,000) × $1.50
= 0.69 × $1.50
= $1.04/month
```

#### 100,000 Users

**Daily Messages:**
```
Daily messages = 100,000 users × 2.7 messages
= 270,000 messages/day
```

**FCM Cost (Free Tier Exceeded):**
```
Free tier = 4,000 messages/day
Overage = 270,000 - 4,000 = 266,000 messages/day
Monthly overage = 266,000 × 30 = 7,980,000 messages

Cost = (7,980,000 / 1,000,000) × $1.50
= 7.98 × $1.50
= $11.97/month
```

---

## 5. Vercel

### Assumptions per User

**Page Views per User per Day:**
- Homepage: 1 view
- Messages: 1 view
- Profile: 1 view
- Other pages: 2 views

```
Daily page views per user = 1 + 1 + 1 + 2
= 5 page views per user per day
```

**Function Executions per User per Day:**
- API calls: 5 calls (login, listings, messages, etc.)
- Server-side rendering: 5 calls

```
Daily function executions per user = 5 + 5
= 10 executions per user per day
```

**Bandwidth per User per Day:**
- HTML: 50 KB per page view
- API responses: 20 KB per call
- Static assets: 100 KB per day

```
Daily bandwidth per user = (5 × 50 KB) + (10 × 20 KB) + 100 KB
= 250 KB + 200 KB + 100 KB
= 550 KB/day
```

### Calculations by User Count

#### 1,000 Users (Hobby Plan - Free)

**Monthly Page Views:**
```
Monthly page views = 1,000 × 5 × 30
= 150,000 page views/month
```

**Monthly Function Executions:**
```
Monthly executions = 1,000 × 10 × 30
= 300,000 executions/month
```

**Monthly Bandwidth:**
```
Monthly bandwidth = 1,000 × 550 KB × 30
= 16,500,000 KB
= 16,110 GB
```

**Vercel Cost (Hobby Plan):**
```
Free tier limits:
- Build minutes: 6,000/month (sufficient)
- Function execution: 100 GB-hours/month (sufficient)
- Bandwidth: 100 GB/month (exceeded)

Cost = $0 (Hobby plan is free)
```

#### 10,000 Users (Pro Plan)

**Monthly Page Views:**
```
Monthly page views = 10,000 × 5 × 30
= 1,500,000 page views/month
```

**Monthly Function Executions:**
```
Monthly executions = 10,000 × 10 × 30
= 3,000,000 executions/month
```

**Monthly Bandwidth:**
```
Monthly bandwidth = 10,000 × 550 KB × 30
= 165,000,000 KB
= 161,133 GB
= 157 TB
```

**Vercel Cost (Pro Plan - $20/month):**
```
Pro Plan = $20/month (includes 1 TB bandwidth)
Overage = 157 TB - 1 TB = 156 TB
Bandwidth overage cost = $40/TB (estimated)
Cost = $20 + (156 × $40)
= $20 + $6,240
= $6,260/month
```

**Note:** This is extremely high. Actual usage would be much lower with caching.

**Revised with 90% Cache Hit Rate:**
```
Effective bandwidth = 161,133 GB × 10%
= 16,113 GB
= 15.74 TB

Cost = $20 + ((15.74 - 1) × $40)
= $20 + $589.60
= $609.60/month
```

#### 100,000 Users (Enterprise Plan)

**Monthly Page Views:**
```
Monthly page views = 100,000 × 5 × 30
= 15,000,000 page views/month
```

**Monthly Function Executions:**
```
Monthly executions = 100,000 × 10 × 30
= 30,000,000 executions/month
```

**Monthly Bandwidth (with 90% cache):**
```
Monthly bandwidth = 100,000 × 550 KB × 30 × 10%
= 1,650,000,000 KB × 10%
= 1,611,330 GB × 10%
= 157.36 TB
```

**Vercel Cost (Enterprise):**
```
Enterprise pricing is custom
Estimated based on Pro Plan scaling:
Cost = $609.60 × 10
= $6,096/month
```

---

## 6. Cloudflare

### Assumptions per User

**Turnstile Verifications per User per Day:**
- Login: 1 verification
- Create listing: 0.1 verifications
- Send message: 2 verifications

```
Daily verifications per user = 1 + 0.1 + 2
= 3.1 verifications per user per day
```

**Worker Requests per User per Day:**
- Rate limit checks: 10 requests
- Abuse detection: 5 requests

```
Daily worker requests per user = 10 + 5
= 15 requests per user per day
```

### Calculations by User Count

#### 1,000 Users (Free Plan)

**Daily Turnstile Verifications:**
```
Daily verifications = 1,000 × 3.1
= 3,100 verifications/day
```

**Monthly Turnstile Verifications:**
```
Monthly verifications = 3,100 × 30
= 93,000 verifications/month
```

**Turnstile Cost (Free):**
```
Free tier = 1,000,000 verifications/month
93,000 < 1,000,000
Cost = $0.00/month
```

**Daily Worker Requests:**
```
Daily requests = 1,000 × 15
= 15,000 requests/day
```

**Monthly Worker Requests:**
```
Monthly requests = 15,000 × 30
= 450,000 requests/month
```

**Worker Cost (Free):**
```
Free tier = 100,000 requests/day
15,000 < 100,000
Cost = $0.00/month
```

**Total Cloudflare Cost (1K users):**
```
Total = $0.00 + $0.00
= $0.00/month
```

#### 10,000 Users (Free Plan)

**Daily Turnstile Verifications:**
```
Daily verifications = 10,000 × 3.1
= 31,000 verifications/day
```

**Monthly Turnstile Verifications:**
```
Monthly verifications = 31,000 × 30
= 930,000 verifications/month
```

**Turnstile Cost (Free):**
```
Free tier = 1,000,000 verifications/month
930,000 < 1,000,000
Cost = $0.00/month
```

**Daily Worker Requests:**
```
Daily requests = 10,000 × 15
= 150,000 requests/day
```

**Monthly Worker Requests:**
```
Monthly requests = 150,000 × 30
= 4,500,000 requests/month
```

**Worker Cost (Paid):**
```
Free tier = 100,000 requests/day
Overage = 150,000 - 100,000 = 50,000 requests/day
Monthly overage = 50,000 × 30 = 1,500,000 requests

Cost = (1,500,000 / 10,000,000) × $5
= 0.15 × $5
= $0.75/month
```

**Total Cloudflare Cost (10K users):**
```
Total = $0.00 + $0.75
= $0.75/month
```

#### 100,000 Users (Paid Plan)

**Daily Turnstile Verifications:**
```
Daily verifications = 100,000 × 3.1
= 310,000 verifications/day
```

**Monthly Turnstile Verifications:**
```
Monthly verifications = 310,000 × 30
= 9,300,000 verifications/month
```

**Turnstile Cost (Paid):**
```
Free tier = 1,000,000 verifications/month
Overage = 9,300,000 - 1,000,000 = 8,300,000 verifications

Cost = (8,300,000 / 1,000,000) × $5
= 8.3 × $5
= $41.50/month
```

**Daily Worker Requests:**
```
Daily requests = 100,000 × 15
= 1,500,000 requests/day
```

**Monthly Worker Requests:**
```
Monthly requests = 1,500,000 × 30
= 45,000,000 requests/month
```

**Worker Cost (Paid):**
```
Free tier = 100,000 requests/day
Overage = 1,500,000 - 100,000 = 1,400,000 requests/day
Monthly overage = 1,400,000 × 30 = 42,000,000 requests

Cost = (42,000,000 / 10,000,000) × $5
= 4.2 × $5
= $21.00/month
```

**Total Cloudflare Cost (100K users):**
```
Total = $41.50 + $21.00
= $62.50/month
```

---

## 7. OpenAI

### Assumptions per User

**AI Usage per User per Day:**
- Sky AI listing creation: 0.01 uses/day (1% of users)
- Average tokens per use: 1,000 input + 500 output
- Model: gpt-4o-mini

```
Daily tokens per user = 0.01 × (1,000 + 500)
= 15 tokens per user per day
```

**API Calls per User per Day:**
- Sky AI: 0.01 calls/day

```
Daily API calls per user = 0.01 calls/day
```

### Calculations by User Count

#### 1,000 Users

**Daily Tokens:**
```
Daily tokens = 1,000 × 15
= 15,000 tokens/day
```

**Monthly Tokens:**
```
Monthly tokens = 15,000 × 30
= 450,000 tokens/month
```

**Input Tokens Cost:**
```
Input tokens = 450,000 × 2/3 (66% input)
= 300,000 input tokens

Cost = (300,000 / 1,000,000) × $0.15
= 0.3 × $0.15
= $0.045/month
```

**Output Tokens Cost:**
```
Output tokens = 450,000 × 1/3 (33% output)
= 150,000 output tokens

Cost = (150,000 / 1,000,000) × $0.60
= 0.15 × $0.60
= $0.09/month
```

**Total OpenAI Cost (1K users):**
```
Total = $0.045 + $0.09
= $0.135/month
```

#### 10,000 Users

**Daily Tokens:**
```
Daily tokens = 10,000 × 15
= 150,000 tokens/day
```

**Monthly Tokens:**
```
Monthly tokens = 150,000 × 30
= 4,500,000 tokens/month
```

**Input Tokens Cost:**
```
Input tokens = 4,500,000 × 2/3
= 3,000,000 input tokens

Cost = (3,000,000 / 1,000,000) × $0.15
= 3 × $0.15
= $0.45/month
```

**Output Tokens Cost:**
```
Output tokens = 4,500,000 × 1/3
= 1,500,000 output tokens

Cost = (1,500,000 / 1,000,000) × $0.60
= 1.5 × $0.60
= $0.90/month
```

**Total OpenAI Cost (10K users):**
```
Total = $0.45 + $0.90
= $1.35/month
```

#### 100,000 Users

**Daily Tokens:**
```
Daily tokens = 100,000 × 15
= 1,500,000 tokens/day
```

**Monthly Tokens:**
```
Monthly tokens = 1,500,000 × 30
= 45,000,000 tokens/month
```

**Input Tokens Cost:**
```
Input tokens = 45,000,000 × 2/3
= 30,000,000 input tokens

Cost = (30,000,000 / 1,000,000) × $0.15
= 30 × $0.15
= $4.50/month
```

**Output Tokens Cost:**
```
Output tokens = 45,000,000 × 1/3
= 15,000,000 output tokens

Cost = (15,000,000 / 1,000,000) × $0.60
= 15 × $0.60
= $9.00/month
```

**Total OpenAI Cost (100K users):**
```
Total = $4.50 + $9.00
= $13.50/month
```

---

## 8. Stripe

### Assumptions per User

**Transactions per User per Month:**
- Purchase transactions: 0.2 transactions/month (20% of users buy)
- Average transaction amount: $50

```
Monthly transactions per user = 0.2 transactions
Monthly transaction value per user = 0.2 × $50 = $10
```

**API Calls per User per Month:**
- Create payment intent: 0.2 calls
- Confirm payment: 0.2 calls
- Webhook handling: 0.2 calls

```
Monthly API calls per user = 0.2 + 0.2 + 0.2
= 0.6 API calls per user per month
```

### Calculations by User Count

#### 1,000 Users

**Monthly Transactions:**
```
Monthly transactions = 1,000 × 0.2
= 200 transactions/month
```

**Monthly Transaction Value:**
```
Monthly value = 200 × $50
= $10,000/month
```

**Stripe Processing Fees:**
```
Fees = $10,000 × 2.9% + (200 × $0.30)
= $290 + $60
= $350.00/month
```

**Stripe Connect Fees (if applicable):**
```
Payout fees = $10,000 × 0.25%
= $25.00/month
```

**Total Stripe Fees (1K users):**
```
Total = $350 + $25
= $375.00/month
```

#### 10,000 Users

**Monthly Transactions:**
```
Monthly transactions = 10,000 × 0.2
= 2,000 transactions/month
```

**Monthly Transaction Value:**
```
Monthly value = 2,000 × $50
= $100,000/month
```

**Stripe Processing Fees:**
```
Fees = $100,000 × 2.9% + (2,000 × $0.30)
= $2,900 + $600
= $3,500.00/month
```

**Stripe Connect Fees:**
```
Payout fees = $100,000 × 0.25%
= $250.00/month
```

**Total Stripe Fees (10K users):**
```
Total = $3,500 + $250
= $3,750.00/month
```

#### 100,000 Users

**Monthly Transactions:**
```
Monthly transactions = 100,000 × 0.2
= 20,000 transactions/month
```

**Monthly Transaction Value:**
```
Monthly value = 20,000 × $50
= $1,000,000/month
```

**Stripe Processing Fees:**
```
Fees = $1,000,000 × 2.9% + (20,000 × $0.30)
= $29,000 + $6,000
= $35,000.00/month
```

**Stripe Connect Fees:**
```
Payout fees = $1,000,000 × 0.25%
= $2,500.00/month
```

**Total Stripe Fees (100K users):**
```
Total = $35,000 + $2,500
= $37,500.00/month
```

**Note:** Stripe fees are passed to customers, not infrastructure costs.

---

## 9. Sentry

### Assumptions per User

**Errors per User per Day:**
- JavaScript errors: 0.1 errors/day
- API errors: 0.05 errors/day
- Network errors: 0.02 errors/day

```
Daily errors per user = 0.1 + 0.05 + 0.02
= 0.17 errors per user per day
```

**Transactions per User per Day:**
- Page loads: 5 transactions
- API calls: 10 transactions

```
Daily transactions per user = 5 + 10
= 15 transactions per user per day
```

### Calculations by User Count

#### 1,000 Users

**Monthly Errors:**
```
Monthly errors = 1,000 × 0.17 × 30
= 5,100 errors/month
```

**Monthly Transactions:**
```
Monthly transactions = 1,000 × 15 × 30
= 450,000 transactions/month
```

**Sentry Cost (Developer Plan):**
```
Developer Plan = $26/month (50,000 errors included)
5,100 < 50,000
Cost = $26.00/month
```

#### 10,000 Users

**Monthly Errors:**
```
Monthly errors = 10,000 × 0.17 × 30
= 51,000 errors/month
```

**Monthly Transactions:**
```
Monthly transactions = 10,000 × 15 × 30
= 4,500,000 transactions/month
```

**Sentry Cost (Team Plan):**
```
Team Plan = $80/month (1,000,000 errors included)
51,000 < 1,000,000
Cost = $80.00/month
```

#### 100,000 Users

**Monthly Errors:**
```
Monthly errors = 100,000 × 0.17 × 30
= 510,000 errors/month
```

**Monthly Transactions:**
```
Monthly transactions = 100,000 × 15 × 30
= 45,000,000 transactions/month
```

**Sentry Cost (Team Plan):**
```
Team Plan = $80/month (1,000,000 errors included)
510,000 < 1,000,000
Cost = $80.00/month
```

---

## 10. Resend

### Assumptions per User

**Emails per User per Month:**
- Welcome email: 1
- Verification email: 1
- Password reset: 0.1
- Notification emails: 5
- Purchase confirmation: 0.2
- Listing updates: 1

```
Monthly emails per user = 1 + 1 + 0.1 + 5 + 0.2 + 1
= 8.3 emails per user per month
```

**API Calls per User per Month:**
```
API calls = emails
= 8.3 API calls per user per month
```

### Calculations by User Count

#### 1,000 Users

**Monthly Emails:**
```
Monthly emails = 1,000 × 8.3
= 8,300 emails/month
```

**Resend Cost (Free Tier):**
```
Free tier = 3,000 emails/month
Overage = 8,300 - 3,000 = 5,300 emails

Cost = (5,300 / 50,000) × $20
= 0.106 × $20
= $2.12/month
```

#### 10,000 Users

**Monthly Emails:**
```
Monthly emails = 10,000 × 8.3
= 83,000 emails/month
```

**Resend Cost (Pro Plan):**
```
Pro Plan = $20/month (50,000 emails included)
Overage = 83,000 - 50,000 = 33,000 emails

Cost = $20 + ((33,000 / 50,000) × $20)
= $20 + $13.20
= $33.20/month
```

#### 100,000 Users

**Monthly Emails:**
```
Monthly emails = 100,000 × 8.3
= 830,000 emails/month
```

**Resend Cost (Business Tier):**
```
Business Tier = $80/month (300,000 emails included)
Overage = 830,000 - 300,000 = 530,000 emails

Cost = $80 + ((530,000 / 300,000) × $80)
= $80 + $141.33
= $221.33/month
```

---

## Summary Table: All Providers

### 1,000 Users

| Provider | Monthly Cost | Notes |
|----------|--------------|-------|
| Firestore | $81.73 | Spark plan |
| Storage | $216.38 | High bandwidth |
| Auth | $0.00 | Free tier |
| FCM | $0.00 | Free tier |
| Vercel | $0.00 | Hobby plan |
| Cloudflare | $0.00 | Free tier |
| OpenAI | $0.14 | Low usage |
| Stripe | $375.00 | Passed to customer |
| Sentry | $26.00 | Developer plan |
| Resend | $2.12 | Small overage |
| **TOTAL (excl Stripe)** | **$326.37** | |

### 10,000 Users

| Provider | Monthly Cost | Notes |
|----------|--------------|-------|
| Firestore | $2,437.34 | Flame plan |
| Storage | $2,163.76 | High bandwidth |
| Auth | $80.00 | Flame plan |
| FCM | $1.04 | Small overage |
| Vercel | $609.60 | Pro plan with cache |
| Cloudflare | $0.75 | Small overage |
| OpenAI | $1.35 | Low usage |
| Stripe | $3,750.00 | Passed to customer |
| Sentry | $80.00 | Team plan |
| Resend | $33.20 | Pro plan |
| **TOTAL (excl Stripe)** | **$5,407.04** | |

### 100,000 Users

| Provider | Monthly Cost | Notes |
|----------|--------------|-------|
| Firestore | $24,373.44 | Flame plan |
| Storage | $21,637.58 | High bandwidth |
| Auth | $800.00 | Flame plan |
| FCM | $11.97 | Paid tier |
| Vercel | $6,096.00 | Enterprise estimate |
| Cloudflare | $62.50 | Paid plan |
| OpenAI | $13.50 | Low usage |
| Stripe | $37,500.00 | Passed to customer |
| Sentry | $80.00 | Team plan |
| Resend | $221.33 | Business tier |
| **TOTAL (excl Stripe)** | **$53,296.32** | |

---

## Key Findings

### Critical Cost Drivers
1. **Firestore reads:** Profile page no-limit queries causing 61.8% of Firestore cost
2. **Storage bandwidth:** Image delivery is largest cost driver
3. **Vercel:** Bandwidth costs scale aggressively

### Optimization Impact
After implementing Phase 1 optimizations (add limits, remove duplicates, polling):

**10,000 Users:**
- Firestore: $2,437 → $420 (83% reduction)
- Storage: $2,164 → $172 (92% reduction with CDN removal + compression)
- Vercel: $610 → $20 (97% reduction with caching)
- **New Total:** $1,000/month (vs target $250/month)

**Note:** Even after optimizations, costs exceed targets at 10K+ users. Need to:
1. Further reduce Firestore reads (more aggressive limits)
2. Implement aggressive caching (95%+ cache hit rate)
3. Consider moving to self-hosted solutions at scale
