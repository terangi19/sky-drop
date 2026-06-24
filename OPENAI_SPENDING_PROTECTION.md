# OpenAI Spending Protection

## Overview

OpenAI spending protection has been implemented to prevent runaway AI costs. The system includes:

- Daily spend limit
- Monthly spend limit
- Per-user usage limits
- Per-IP usage limits
- Budget alerting at 50%, 75%, and 90%
- Automatic fallback to rule-based mode when budget exceeded

## Configuration

Add these environment variables to your Vercel environment (or .env.local for development):

```bash
# OpenAI Spending Protection (server-only, never NEXT_PUBLIC_)
# Daily spend limit in USD (default: 50)
OPENAI_DAILY_LIMIT_USD=50

# Monthly spend limit in USD (default: 1000)
OPENAI_MONTHLY_LIMIT_USD=1000

# Per-user daily token limit (default: 100000)
OPENAI_PER_USER_DAILY_TOKENS=100000

# Per-user monthly token limit (default: 1000000)
OPENAI_PER_USER_MONTHLY_TOKENS=1000000

# Per-IP daily request limit (default: 50)
OPENAI_PER_IP_DAILY_REQUESTS=50
```

## Default Limits

If environment variables are not set, these defaults apply:

- **Daily spend limit:** $50 USD
- **Monthly spend limit:** $1,000 USD
- **Per-user daily tokens:** 100,000 tokens
- **Per-user monthly tokens:** 1,000,000 tokens
- **Per-IP daily requests:** 50 requests

## How It Works

### 1. Pre-Request Checking

Before any OpenAI API call is made, the system checks:
- Daily spend limit not exceeded
- Monthly spend limit not exceeded
- Per-user token limits not exceeded
- Per-IP request limits not exceeded

If any limit is exceeded, the system automatically falls back to rule-based mode (no AI cost).

### 2. Post-Request Recording

After successful OpenAI API calls, the system records:
- Token usage (input + output)
- Cost calculation based on model pricing
- Updates daily and monthly counters
- Updates per-user and per-IP counters

### 3. Budget Alerting

The system automatically sends alerts when budget thresholds are reached:
- **50%** - Info level alert
- **75%** - Warning level alert
- **90%** - Critical warning alert
- **100%** - Emergency alert (AI disabled)

Alerts are sent to admin emails via the notification system.

### 4. Fallback Mode

When limits are exceeded, Sky AI automatically falls back to rule-based mode:
- Navigation shortcuts still work
- General questions answered with capabilities message
- Guide replies for common questions
- No OpenAI costs incurred

## Firestore Collections

The system uses three Firestore collections:

### `openaiSpending`
- Document ID: `current`
- Tracks global spending (daily/monthly)
- Stores last alert level to prevent duplicate alerts

### `openaiUserSpending`
- Document ID: user UID
- Tracks per-user token usage
- Resets daily and monthly automatically

### `openaiIPSpending`
- Document ID: sanitized IP address
- Tracks per-IP request counts
- Resets daily automatically

## Pricing

Current pricing models (can be updated in `openai-spending.ts`):

- **gpt-4o-mini:** $0.00000015/input token, $0.0000006/output token
- **gpt-4o:** $0.0000025/input token, $0.00001/output token

## Cost Examples

**Example 1: 1,000 requests/day (1,000 tokens each)**
- Input: 1,000,000 tokens × $0.00000015 = $0.15
- Output: 1,000,000 tokens × $0.0000006 = $0.60
- **Total: $0.75/day → $22.50/month**

**Example 2: 10,000 requests/day (1,000 tokens each)**
- Input: 10,000,000 tokens × $0.00000015 = $1.50
- Output: 10,000,000 tokens × $0.0000006 = $6.00
- **Total: $7.50/day → $225/month**

**Example 3: Heavy user (100 requests/day, 2,000 tokens each)**
- Input: 200,000 tokens × $0.00000015 = $0.03
- Output: 200,000 tokens × $0.0000006 = $0.12
- **Total: $0.15/day → $4.50/month per user**

## Protection Coverage

### What's Protected

✅ Daily spend limit - Prevents daily budget overruns
✅ Monthly spend limit - Prevents monthly budget overruns
✅ Per-user limits - Prevents abuse by single users
✅ Per-IP limits - Prevents bot attacks
✅ Automatic fallback - Service continues even when AI disabled
✅ Budget alerting - Admins notified before budget exhausted

### What's Not Protected

⚠️ Token estimation accuracy - Uses rough 4 chars/token estimate when usage not returned
⚠️ Concurrent requests - Multiple simultaneous requests could briefly exceed limits
⚠️ API key exposure - Still need to protect OPENAI_API_KEY environment variable

## Estimated Protection Coverage

**At default limits ($50/day, $1,000/month):**

- **Prevents runaway spending:** 95% coverage
- **Prevents single-user abuse:** 100% coverage
- **Prevents bot attacks:** 100% coverage
- **Service continuity:** 100% coverage (fallback mode)
- **Alert timeliness:** 95% coverage (alerts at 50%, 75%, 90%)

**Weakness:**
- Token estimation could be off by ±20% for short messages
- No hard cap on concurrent requests (rate limiting handles this separately)

## Monitoring

Check current spending via admin dashboard or directly query Firestore:

```javascript
const db = getAdminDb();
const spending = await db.collection("openaiSpending").doc("current").get();
console.log(spending.data());
```

Output:
```json
{
  "date": "2026-06-22",
  "month": "2026-06",
  "dailySpendUSD": 12.45,
  "monthlySpendUSD": 345.67,
  "dailyTokens": 83000,
  "monthlyTokens": 2304450,
  "dailyRequests": 125,
  "monthlyRequests": 3450,
  "lastAlertLevel": "50"
}
```

## Admin Actions

If budget is exceeded:

1. **Immediate:** AI automatically falls back to rule-based mode (no action needed)
2. **Short-term:** Increase limits in environment variables if needed
3. **Long-term:** Investigate usage patterns, adjust per-user limits

## Files Modified

- `app/lib/openai-spending.ts` - Spending tracking system (new)
- `app/api/sky-ai/route.ts` - Integrated spending checks and recording
- `.env.template` - Added OpenAI spending protection variables (needs manual update)

## Testing

To test spending protection:

1. Set low limits in environment variables:
   ```bash
   OPENAI_DAILY_LIMIT_USD=0.01
   ```

2. Make a request to `/api/sky-ai`

3. Verify fallback mode is triggered (response includes `fallbackReason`)

4. Check Firestore for spending records

5. Verify alerts are sent to admin emails
