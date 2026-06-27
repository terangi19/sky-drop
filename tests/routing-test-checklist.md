# Listing Routing Test Checklist

This checklist ensures all listing types route correctly from all locations.

## Listing Types to Test
- Physical listings
- Digital listings
- Services listings
- Rentals
- Vehicles
- Wanted posts
- Events
- Jobs

## Locations to Test From
- Home page (`/`)
- Search page (`/search`)
- Services page (`/services`)
- Digital page (`/digital`)
- Rentals page (`/rentals`)
- Wanted page (`/wanted`)
- Events page (`/events`)
- Jobs page (`/jobs`)
- User profiles (`/seller/[username]`)
- Watchlist (`/watchlist`)
- Messages page (listing context cards)
- Admin/Manage listings view

## Expected Behavior
**ALL listing types should navigate to:** `/post/listing/[id]`

## Test Steps

### 1. Home Page
1. Navigate to `/`
2. Find a listing of each type (Physical, Digital, Service, Rental, Vehicle, Wanted)
3. Click on each listing card
4. **Expected:** Each should navigate to `/post/listing/[id]` with the correct listing details
5. Verify back button works
6. Refresh the detail page - should still load correctly

### 2. Search Page
1. Navigate to `/search`
2. Search for each listing type
3. Click on search results
4. **Expected:** Each should navigate to `/post/listing/[id]`

### 3. Category Pages
1. Navigate to `/services` - click service listings
2. Navigate to `/digital` - click digital listings
3. Navigate to `/rentals` - click rental listings
4. Navigate to `/wanted` - click wanted listings
5. Navigate to `/events` - click event listings
6. Navigate to `/jobs` - click job listings
7. **Expected:** All should navigate to `/post/listing/[id]`

### 4. User Profiles
1. Navigate to any seller profile (`/seller/[username]`)
2. Click on pinned listings
3. Click on active listings
4. **Expected:** All should navigate to `/post/listing/[id]`

### 5. Watchlist
1. Navigate to `/watchlist`
2. Click on saved items
3. **Expected:** All should navigate to `/post/listing/[id]`

### 6. Messages Page
1. Navigate to `/messages`
2. Open a conversation with a listing context card
3. Click "View Listing" button
4. **Expected:** Should navigate to `/post/listing/[id]`

### 7. Admin/Manage Views
1. Navigate to `/manage/listings`
2. Click "View" button on any listing
3. **Expected:** Should open `/post/listing/[id]` in new tab

## Regression Tests
Run this checklist after any changes to:
- Listing card components
- Routing logic
- Page components that display listings
- Link components or router.push calls

## Common Issues to Watch For
- Services redirecting to `/services` instead of `/post/listing/[id]`
- Wrong listing ID being passed
- 404 errors on detail pages
- Back button not working
- Deep links not working after refresh
