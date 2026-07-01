# Sky Drop Go-Live Testing Checklist

## 🔐 Authentication & Security

### User Registration
- [ ] Sign up with email
- [ ] Email verification works
- [ ] Password strength validation
- [ ] Duplicate email prevention
- [ ] Social login (if available)

### Login/Logout
- [ ] Login with correct credentials
- [ ] Login with wrong credentials shows error
- [ ] Password reset flow
- [ ] Logout works
- [ ] Session persistence
- [ ] Auto-logout on token expiry

### Security
- [ ] HTTPS enforced
- [ ] CSRF protection
- [ ] Rate limiting on sensitive endpoints
- [ ] Admin role verification
- [ ] Profile privacy settings

## 👤 Profile Management

### Profile Creation
- [ ] Create username
- [ ] Add bio
- [ ] Set region
- [ ] Upload profile photo
- [ ] Upload banner
- [ ] Add social links (Instagram, TikTok, Discord, Website)

### Profile Editing
- [ ] Edit all profile fields
- [ ] Save changes persist
- [ ] Profile visibility settings
- [ ] Online status toggle
- [ ] Notification preferences

### Verification
- [ ] Email verification
- [ ] Phone verification
- [ ] KYC submission
- [ ] Trusted seller badge
- [ ] Profile completion tracking

## 📝 Listing Creation

### Physical Items
- [ ] Create physical listing
- [ ] Upload photos (max limit enforced)
- [ ] Set price
- [ ] Select category
- [ ] Add description
- [ ] Set condition
- [ ] Set location/region
- [ ] Publish listing
- [ ] Edit published listing
- [ ] Delete listing

### Digital Products
- [ ] Create digital listing
- [ ] Upload downloadable file
- [ ] Set fixed price
- [ ] Quote required option
- [ ] Hide/show buy button based on quote setting
- [ ] Download after purchase

### Services
- [ ] Create service listing
- [ ] Set hourly rate
- [ ] Set fixed price
- [ ] Quote required option
- [ ] Service category selection
- [ ] Location/remote toggle

### Rentals
- [ ] Create rental listing
- [ ] Property rental (weekly rent, bond, bedrooms, bathrooms)
- [ ] Equipment rental (daily/weekly/monthly rates)
- [ ] Vehicle rental (daily/weekly/monthly rates)
- [ ] Available from date
- [ ] Minimum tenancy

### Vehicles
- [ ] Create vehicle listing
- [ ] Auto-detect vehicle type
- [ ] Fill make, model, year
- [ ] Odometer (km)
- [ ] Colour
- [ ] Transmission
- [ ] Fuel type
- [ ] Vehicle category

## 🎙️ Voice Input & Navigation

### Voice Commands
- [ ] Microphone toggle works
- [ ] Voice input recognized
- [ ] Navigation commands work ("take me to services", "open my messages")
- [ ] Continuous listening (keepAlive)
- [ ] Resume after voice command
- [ ] Error handling for permission denied
- [ ] Browser compatibility (Chrome, Edge, Brave)

### Navigation
- [ ] Profile → Payments page navigation
- [ ] All guide destinations work
- [ ] Hash fragment scrolling
- [ ] "Already on page" detection
- [ ] Navigation delay is acceptable

## 💳 Payments

### Stripe Checkout
- [ ] Create listing with Stripe
- [ ] Payment flow completes
- [ ] Order confirmation
- [ ] Webhook handling
- [ ] Refund process

### Bank Transfer (Arrange Purchase)
- [ ] Set up bank details
- [ ] Bank account validation
- [ ] Arrange purchase flow
- [ ] Payment confirmation
- [ ] Release payment
- [ ] Dispute handling

### Payouts
- [ ] Connect Stripe account
- [ ] Bank account for payouts
- [ ] Payout processing
- [ ] Payout history

## 💬 Messaging

### Chat
- [ ] Send message to seller
- [ ] Receive message
- [ ] Message history
- [ ] Real-time updates
- [ ] Message notifications
- [ ] Block user
- [ ] Report user

### Offers
- [ ] Make offer
- [ ] Accept offer
- [ ] Decline offer
- [ ] Counter offer
- [ ] Offer expiration

## 🔍 Search & Browse

### Search
- [ ] Text search works
- [ ] Category filtering
- [ ] Price range filter
- [ ] Location filter
- [ ] Condition filter
- [ ] Sort by relevance/price/newest

### Browse
- [ ] Marketplace home loads
- [ ] Category pages work
- [ ] Vehicle listings
- [ ] Service listings
- [ ] Digital products
- [ ] Rental listings
- [ ] Watchlist functionality

## 🤖 Awhina AI

### Chat Panel
- [ ] AI responds to queries
- [ ] Navigation commands work
- [ ] Listing creation from photos
- [ ] Profile auto-fill
- [ ] Price suggestions
- [ ] Description generation
- [ ] Quick prompts work
- [ ] Error handling

### Voice Navigation
- [ ] Voice commands recognized
- [ ] Navigation to pages
- [ ] Multiple voice commands in session
- [ ] Resume after command

## 📱 Mobile Responsiveness

### Layout
- [ ] Homepage responsive
- [ ] Profile page responsive
- [ ] Listing creation responsive
- [ ] Chat panel responsive
- [ ] Navigation menu responsive
- [ ] Forms usable on mobile

### Touch
- [ ] Buttons tap targets adequate
- [ ] Swipe gestures work
- [ ] Keyboard doesn't cover inputs
- [ ] Mobile voice input works

## ⚡ Performance

### Load Times
- [ ] Homepage loads < 3s
- [ ] Profile page loads < 2s
- [ ] Listing creation loads < 2s
- [ ] Search results < 2s
- [ ] Image uploads fast

### Reliability
- [ ] No console errors
- [ ] No memory leaks
- [ ] Voice input doesn't crash after multiple uses
- [ ] Session management stable

## 🔧 Admin Features

### Admin Panel
- [ ] Admin login works
- [ ] View all users
- [ ] View all listings
- [ ] Manage reports
- [ ] Handle disputes
- [ ] Ban users
- [ ] Verify sellers

### Monitoring
- [ ] Error logging works
- [ ] Security event logging
- [ ] Rate limit monitoring
- [ ] Performance metrics

## 🧪 Edge Cases

### Error Handling
- [ ] Network failure handling
- [ ] API timeout handling
- [ ] Invalid input validation
- [ ] File upload failures
- [ ] Payment failures
- [ ] Concurrent requests

### Boundary Conditions
- [ ] Max file size enforced
- [ ] Max image count enforced
- [ ] Text length limits
- [ ] Price range validation
- [ ] Date validation

## 🌐 Browser Compatibility

### Desktop
- [ ] Chrome (latest)
- [ ] Edge (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)

### Mobile
- [ ] iOS Safari
- [ ] Android Chrome
- [ ] Mobile Edge

### Special
- [ ] Brave browser (voice input)
- [ ] Private browsing mode
- [ ] Incognito mode

## 📋 Pre-Launch Checklist

### Configuration
- [ ] Environment variables set
- [ ] Firebase config correct
- [ ] Stripe keys configured
- [ ] Rate limits configured
- [ ] Admin emails set
- [ ] CORS settings correct

### Content
- [ ] FAQ page complete
- [ ] Terms of service complete
- [ ] Privacy policy complete
- [ ] Seller guidelines complete
- [ ] About page complete
- [ ] Contact page complete

### Monitoring
- [ ] Error tracking setup (Sentry)
- [ ] Analytics setup
- [ ] Performance monitoring
- [ ] Uptime monitoring
- [ ] Backup strategy

### Security
- [ ] Security audit complete
- [ ] Penetration testing
- [ ] Dependency vulnerabilities fixed
- [ ] API rate limits tested
- [ ] DDoS protection enabled

## 🚀 Launch Day

### Final Checks
- [ ] Database backups current
- [ ] SSL certificate valid
- [ ] CDN configured
- [ ] Cache cleared
- [ ] Feature flags set
- [ ] Support team ready
- [ ] Announcement prepared

### Post-Launch
- [ ] Monitor error rates
- [ ] Monitor performance
- [ ] Check user feedback
- [ ] Verify payments processing
- [ ] Monitor voice input stability
- [ ] Check AI response quality

---

## Priority Items (Must Pass Before Launch)

1. **Authentication** - Signup, login, logout must work flawlessly
2. **Listing Creation** - All listing types must create and publish correctly
3. **Payments** - Both Stripe and bank transfer must work end-to-end
4. **Messaging** - Buyers and sellers must be able to communicate
5. **Voice Input** - Must work reliably without crashing after multiple uses
6. **Awhina AI** - Navigation and listing creation must work
7. **Mobile** - Core features must work on mobile devices
8. **Security** - No critical vulnerabilities, rate limiting active

## Known Issues to Monitor

- Voice input stability after extended use (check console logs)
- Brave browser microphone permissions
- Payment webhook delivery timing
- Large file upload timeouts
- Concurrent listing creation conflicts

## Testing Instructions

1. **Test in order**: Start with authentication, then profile, then listings
2. **Test each listing type**: Physical, digital, services, rentals, vehicles
3. **Test voice input extensively**: Use it 10+ times in a row
4. **Test on mobile**: Use actual mobile devices, not just responsive mode
5. **Test payments**: Use test mode for Stripe, small amounts for bank transfer
6. **Test edge cases**: Try invalid inputs, network failures, concurrent actions
7. **Document everything**: Note any issues, even minor ones
8. **Console monitoring**: Keep browser console open during testing

## Sign-off

- [ ] All priority items passed
- [ ] All critical bugs fixed
- [ ] Performance acceptable
- [ ] Security review complete
- [ ] Team approval received
- [ ] Launch window confirmed

**Ready for launch**: [ ] YES / [ ] NO

**Launch date**: _______________

**Launched by**: _______________
