---
name: testing-awhina-listing-fill
description: Test the Āwhina (Sky AI) listing fill flow on /post/ai. Use when verifying AI-driven form filling for vehicle, physical, digital, service, or rental listings.
---

# Testing Āwhina AI Listing Fill

## Overview

Āwhina (Sky AI) is the AI assistant on Sky Drop that auto-fills the listing form on `/post/ai`. When a user describes what they want to sell in the chat, the AI returns structured JSON that populates the form fields (title, description, price, category, vehicle details, etc.).

## Devin Secrets Needed

- `SKY_DROP_ENV_LOCAL` — Full `.env.local` contents including `OPENAI_API_KEY`, Firebase service account, Stripe keys, SMTP config, and test credentials. Without this, the dev server cannot start or call the OpenAI API.

## Environment Setup

1. Ensure you're on the correct branch (e.g., the PR branch with the latest changes)
2. Create `.env.local` at the repo root with all required env vars (see `.env.template` for the list)
3. Key env vars for Āwhina testing:
   - `OPENAI_API_KEY` — required for AI responses
   - `NEXT_PUBLIC_TEST_EMAIL` / `NEXT_PUBLIC_TEST_PASSWORD` — test login credentials
   - `ENABLE_TEST_LOGIN=true` — enables the "Test Login" button on `/login`
   - Firebase service account JSON — required for Firestore access
4. Run `npm install && npm run dev` to start the dev server on `localhost:3000`
5. Navigate to `/login` and click the "Test Login" button to authenticate
6. Dismiss any notification permission popups

## Test Flow

1. Navigate to `http://localhost:3000/post/ai`
2. Click "Open Sky AI" to open the inline chat panel
3. Verify precondition: form fields are empty (title, description, price all blank)
4. Type a test prompt in the chat, e.g.:
   - Vehicle: `sell my 2007 BMW 335i, 150k km, loud exhaust, $18k`
   - Physical item: `sell my iPhone 15 Pro, 256GB, mint condition, $1200`
   - Digital: `sell my Lightroom preset pack, 50 presets, $25`
5. Click "Send" and wait for the AI response (~5-10 seconds)
6. Verify form fields populated (scroll down to see all fields)

## What to Verify

### Form Fields
- **Title** — should contain the item name (e.g., "2007 BMW 335i")
- **Description** — should contain relevant details from the prompt
- **Price** — should match the stated price
- **Category** — should match the item type (e.g., "Cars" for vehicles)
- **Condition** — should be set appropriately (e.g., "Used - Good")
- **Listing Type** — should match (e.g., Vehicle for cars, Physical for items)

### Vehicle-Specific Fields (when listing type is Vehicle)
- Make, Model, Year, Odometer, Body Type, Fuel Type, Transmission

### AI Response Text
- Should say "pre-filled" or "filled your listing form"
- Should NOT say "listed", "published", "live", or "your listing is now live"
- No raw JSON or `[[LISTING_FILL]]` tags should be visible in the chat

### Toast Notification
- Should show "Sky AI filled your listing — add photos and publish" (or similar)

## Architecture Notes

The listing fill flow:
1. User types in `SkyAiChatPanel` → API call to `/api/sky-ai`
2. API calls OpenAI → gets raw response → `extractSkyAiReply()` parses server-side
3. `extractListingFill()` has 3-layer parsing:
   - Primary: `[[LISTING_FILL]]...[[/LISTING_FILL]]` machine tags
   - Fallback: Markdown ` ```json {...} ``` ` code blocks
   - Prose extraction: "Title: ..." and "Description: ..." from response text
4. API sends `listingFill` in SSE "done" event back to client
5. `SkyAiChatPanel` calls `dispatchListingFill()` → CustomEvent
6. `page.tsx` listens for event → `applySkyAiListingFill()` sets form state
7. Toast notification + scroll to title field

### Key Files
- `app/post/ai/page.tsx` — Form page with fill event listener
- `app/components/SkyAiChatPanel.tsx` — Chat panel component
- `app/api/sky-ai/route.ts` — API route calling OpenAI
- `app/lib/sky-ai-listing-fill.ts` — Extraction and normalization logic
- `app/lib/sky-ai-prompt.ts` — System prompt for the AI

## Common Issues

- **AI outputs markdown JSON instead of machine tags** — The fallback parser in `extractListingFill()` handles this, but if it stops working, check the regex pattern in `sky-ai-listing-fill.ts`
- **Title/description missing from JSON but present in prose** — The `extractProseFields()` function merges them, but may need regex updates if AI changes formatting
- **AI claims listing is "live" or "published"** — Check the system prompt in `sky-ai-prompt.ts` for the NEVER rules
- **Token budget too low** — If the `[[LISTING_FILL]]` block gets truncated, check `max_tokens` in `route.ts` (currently 2000)
- **Form not filling despite correct JSON** — Check browser console for errors in the event dispatch chain
