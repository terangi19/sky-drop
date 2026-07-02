# Sky Drop Closed Beta Tester Checklist

**Instructions:** Complete each scenario by following the steps. Record expected vs actual behavior. Mark Pass/Fail and severity if it fails.

---

## Buyer Journey

### Sign Up
**Steps:**
1. Navigate to signup page
2. Enter email address
3. Enter password
4. Accept terms
5. Complete Turnstile verification (if shown)
6. Click "Create Account"
7. Check email for verification link
8. Click verification link
9. Confirm email verified

**Expected Behavior:**
- Form validates email format and password strength
- Turnstile appears if configured
- Success message shown after signup
- Verification email arrives within 30 seconds
- Verification link redirects to app
- User is logged in after verification

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

### Search
**Steps:**
1. Navigate to homepage
2. Enter search term in search bar
3. Press Enter or click search button
4. View search results
5. Filter by category
6. Sort results

**Expected Behavior:**
- Search suggestions appear as you type (debounced)
- Search results load within 2 seconds
- Category filter works correctly
- Sort options work (newest, price, etc.)
- No duplicate listings shown

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

### View Listing
**Steps:**
1. Click on a listing from search results
2. View listing details
3. View seller information
4. View trust summary
5. Scroll through images

**Expected Behavior:**
- Listing page loads within 2 seconds
- All images display correctly
- Seller info shows (verified status, reviews, member since)
- Trust summary visible but doesn't overpower purchase button
- Images can be scrolled/swiped

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

### Contact Seller
**Steps:**
1. Click "Contact Seller" or "Message"
2. Type message
3. Send message

**Expected Behavior:**
- Message input appears
- Message sends successfully
- Message appears in conversation
- Notification sent to seller
- No rate limit errors for normal usage

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

### Make an Offer
**Steps:**
1. On a listing with offers enabled
2. Click "Make Offer"
3. Enter offer amount
4. Add message (optional)
5. Submit offer

**Expected Behavior:**
- Offer form appears
- Amount validates (must be reasonable)
- Offer submits successfully
- Notification sent to seller
- Offer status shows in conversation

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

### Purchase
**Steps:**
1. On a listing with fixed price
2. Click "Buy Now" or "Continue to Purchase"
3. Enter shipping details (if applicable)
4. Select payment method
5. Complete Stripe payment
6. Confirm purchase

**Expected Behavior:**
- Purchase flow initiates
- Shipping form validates correctly
- Stripe checkout loads
- Payment processes successfully
- Purchase record created
- Conversation created with seller
- Notifications sent to both parties

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

### Complete Transaction
**Steps:**
1. As buyer, arrange payment with seller
2. As seller, confirm payment received
3. As buyer, mark item received
4. As seller, mark transaction complete
5. Leave review

**Expected Behavior:**
- Payment arrangement messages work
- Seller can confirm payment
- Buyer can mark received
- Seller can mark complete
- Review form appears
- Review saves successfully
- Both parties notified

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

### Leave Review
**Steps:**
1. After transaction complete
2. Click "Leave Review"
3. Select star rating
4. Write review text
5. Submit review

**Expected Behavior:**
- Review form appears
- Stars can be selected
- Text validates (not empty, not too long)
- Review submits successfully
- Review appears on seller profile

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

## Seller Journey

### Create Physical Listing
**Steps:**
1. Navigate to "Create Listing"
2. Select "Physical" type
3. Enter title
4. Enter description
5. Set price
6. Select category
7. Upload images
8. Set location
9. Publish listing

**Expected Behavior:**
- Form validates all fields
- Images upload and compress
- Thumbnail generated
- Listing publishes successfully
- Listing appears in search
- Analytics event fires (listing_published)

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

### Create Service Listing
**Steps:**
1. Navigate to "Create Listing"
2. Select "Service" type
3. Enter title
4. Enter description
5. Set price or hourly rate
6. Select service category
7. Upload images
8. Set location
9. Publish listing

**Expected Behavior:**
- Service-specific fields appear
- Pricing options work (fixed/hourly/quote)
- Listing publishes successfully
- Service-specific search filters work

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

### Create Rental Listing
**Steps:**
1. Navigate to "Create Listing"
2. Select "Rental" type
3. Enter title
4. Enter description
5. Set rental rates (daily/weekly/monthly)
6. Select property/equipment type
7. Upload images
8. Set location
9. Set availability dates
10. Publish listing

**Expected Behavior:**
- Rental-specific fields appear
- Rate options work correctly
- Availability calendar appears
- Listing publishes successfully
- Rental-specific search filters work

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

### Create Wanted Listing
**Steps:**
1. Navigate to "Create Listing"
2. Select "Wanted" type
3. Enter title
4. Enter description
5. Set budget
6. Select category
7. Publish listing

**Expected Behavior:**
- Wanted-specific fields appear
- Duplicate detection works
- Listing publishes successfully
- Appears in wanted section

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

### Upload Images
**Steps:**
1. During listing creation
2. Select multiple images
3. Upload
4. Reorder images
5. Set cover image

**Expected Behavior:**
- Multiple images can be selected
- Upload progress shown
- Images compress to WebP
- Thumbnails generated
- Reordering works
- Cover image can be set
- No file size errors for normal images

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

### Receive Offers
**Steps:**
1. As seller, receive an offer
2. View offer in conversation
3. Review offer details
4. Accept or reject offer

**Expected Behavior:**
- Offer notification received
- Offer details visible
- Accept/reject buttons work
- Notification sent to buyer
- Offer status updates

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

### Accept/Reject Offers
**Steps:**
1. Accept an offer
2. Or reject an offer with reason

**Expected Behavior:**
- Accept: Creates purchase record, sets payment deadline
- Reject: Sends notification to buyer with reason
- Offer status updates correctly

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

### Complete Sale
**Steps:**
1. Receive payment
2. Confirm payment received
3. Mark item as shipped/delivered
4. Mark transaction complete

**Expected Behavior:**
- Payment confirmation works
- Shipped/delivered status updates
- Transaction complete button works
- Both parties notified at each step

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

### View Analytics
**Steps:**
1. Navigate to profile or dashboard
2. View listing views
3. View offers received
4. View sales completed

**Expected Behavior:**
- Analytics dashboard loads
- Views count is accurate
- Offers count is accurate
- Sales count is accurate
- Data updates in real-time

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

### Receive Notifications
**Steps:**
1. Receive an offer
2. Receive a message
3. Receive a purchase
4. Receive a review

**Expected Behavior:**
- Notification badge updates
- Notification appears in list
- Clicking notification navigates to relevant page
- Notification can be marked as read
- Push notification received (if enabled)

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

## Auction Journey

### Create Auction
**Steps:**
1. Navigate to "Create Listing"
2. Select "Auction" type
3. Enter title
4. Enter description
5. Set starting bid
6. Set reserve price (optional)
7. Set auction end date/time
8. Upload images
9. Publish auction

**Expected Behavior:**
- Auction-specific fields appear
- Date/time picker works
- Starting bid validates
- Reserve price works
- Auction publishes with countdown
- Appears in auction section

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

### Bid
**Steps:**
1. View active auction
2. Enter bid amount
3. Place bid
4. Confirm bid

**Expected Behavior:**
- Bid form appears
- Bid amount validates (must exceed current bid)
- Bid places successfully
- Current bid updates
- Countdown continues
- Outbid notification sent to previous bidder

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

### Auto-Bid
**Steps:**
1. Set maximum auto-bid amount
2. Enable auto-bid
3. Let auction progress

**Expected Behavior:**
- Auto-bid form appears
- Maximum bid validates
- Auto-bid places bids automatically
- Stops at maximum
- Notifications sent when outbid

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

### Win Auction
**Steps:**
1. Be highest bidder when auction ends
2. Receive winning notification
3. View purchase created
4. Complete payment

**Expected Behavior:**
- Winning notification received
- Purchase record created automatically
- 24-hour payment deadline set
- Conversation created with seller
- Can complete payment via Stripe

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

### Complete Purchase
**Steps:**
1. As auction winner, complete payment
2. As seller, confirm payment
3. Complete transaction

**Expected Behavior:**
- Payment flow works
- Seller confirmation works
- Transaction complete works
- Both notified

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

## Failure Scenarios

### Lost Internet
**Steps:**
1. Start a flow (signup, purchase, etc.)
2. Disconnect internet
3. Reconnect internet
4. Try to continue

**Expected Behavior:**
- App shows loading state
- Error message appears when internet lost
- Can retry after reconnecting
- No data corruption
- No duplicate actions

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

### Refresh During Purchase
**Steps:**
1. Start purchase flow
2. Refresh page mid-flow
3. Try to continue

**Expected Behavior:**
- State preserved where possible
- Or clear error message
- Can restart flow
- No duplicate charges
- No corrupted data

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

### Duplicate Button Clicks
**Steps:**
1. Click a button multiple times rapidly
2. Submit form multiple times

**Expected Behavior:**
- Button disabled after first click
- Loading state shown
- Only one action executed
- No duplicate submissions
- No duplicate charges

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

### Expired Sessions
**Steps:**
1. Stay logged in for extended period
2. Try to perform action
3. Session expires

**Expected Behavior:**
- Session expiry detected
- Redirected to login
- Clear error message
- Can log in again
- Action not lost if possible

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

### Browser Back Button
**Steps:**
1. Navigate through multi-step flow
2. Press browser back button
3. Try to continue

**Expected Behavior:**
- Back button works correctly
- State preserved where possible
- Or clear error message
- Can continue flow
- No broken states

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

### Mobile Devices
**Steps:**
1. Test on mobile phone
2. Test on tablet
3. Test responsive design

**Expected Behavior:**
- Layout adapts to screen size
- Touch targets large enough (44px min)
- Text is readable
- Buttons work with touch
- No horizontal scroll
- No overlapping elements

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

### Different Screen Sizes
**Steps:**
1. Test on small mobile (320px)
2. Test on large desktop (1920px+)
3. Test on tablet (768px-1024px)

**Expected Behavior:**
- Layout works at all sizes
- No horizontal scroll
- Images scale correctly
- Text remains readable
- Navigation works

**Actual Behavior:** ________________________________

**Pass / Fail:** _______

**Severity if Fails:** _______

---

## Additional Notes

**Browser Used:** _______
**Device Used:** _______
**Screen Resolution:** _______
**OS:** _______
**Tester Name:** _______
**Date:** _______

**Overall Experience Rating (1-10):** _______

**Most Confusing Part:** ________________________________

**Best Part:** ________________________________

**Suggested Improvements:** ________________________________

---

**Tester Signature:** ________________________________
