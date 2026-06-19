# Listing Type Rules Documentation

This document explains the rules, requirements, and behavior for each listing type in Sky Drop.

## Listing Types Overview

Sky Drop supports 5 listing types, each with specific rules for:
- Payment types available
- Pricing models
- Delivery methods
- Verification requirements
- Buyer/seller flows

**Listing Types:**
1. **Physical Items** - Real items including vehicles that can be picked up or shipped
2. **Digital Products** - Digital files and online services delivered remotely
3. **Services** - Local services performed in person
4. **Rentals** - Equipment or vehicles available for temporary hire
5. **Wanted** - Post what you're looking for and sellers will contact you

## Physical Items

### Description
Real items that can be picked up or shipped, including vehicles (phones, furniture, tools, clothing, cars, collectibles).

### Available Payment Types
- **Arrange Purchase** (contact): Default - bank transfer, cash, or pickup
- **Stripe Checkout**: Card payment with escrow

### Sale Types
- **Buy Now**: Fixed price listing
- **Auction**: Bidding system with end time

### Pricing
- **Buy Now**: Fixed price required
- **Auction**: Starting bid required
- **Reserve Price**: Optional (for auctions only)

### Delivery Methods
- **Pickup Available**: Optional
- **Shipping Available**: Optional
- **Requirement**: At least one delivery method must be selected

### Condition
- Required: New, Used - Like New, Used - Good, or Used - Fair

### Offers
- **Accept Offers**: Optional - allows buyers to make offers below asking price

### Verification
- **KYC Required**: Yes - seller must be verified to list physical items
- **Phone Verification**: Required - one phone number per account for security

### Categories
- Tech, Cars, Gaming, Fashion, Home, Sports, Other

### Special Rules
- Free shipping option available (if shipping selected)
- Shipping fee can be set (if not free)
- Vehicle details available when "Cars" category is selected (make, model, year, odometer, body type, fuel type, transmission)

---

## Digital Products

### Description
Digital products and online services delivered remotely (software, templates, e-books, web design, graphic design, SEO, digital marketing).

### Available Payment Types
- **Arrange Purchase** (contact): Default
- **Stripe Checkout**: Card payment with escrow

### Sale Types
- **Buy Now** only (no auctions)

### Pricing Models
- **Fixed Price**: Buyers see exact price and purchase immediately
- **Quote Required**: Buyers contact seller for custom pricing

### Pricing
- **Fixed Price**: Price required
- **Quote Required**: No price field shown

### Delivery Methods
- **Pickup**: Not available
- **Shipping**: Not available
- **Delivery**: Digital file URL or download link required

### Condition
- Not applicable

### Offers
- **Accept Offers**: Not available

### Verification
- **KYC Required**: Yes - seller must be verified

### Categories
- Templates & Assets, E-books & Guides, Art & Photography, Software & Audio, Gaming & 3D, Web & App Development, Graphic Design, SEO & Digital Marketing, Other Digital Services

### Special Rules
- Digital file URL required for fixed price listings
- No physical delivery options

---

## Services

### Description
Local services performed in person (lawn mowing, cleaning, tutoring, photography, trades, handyman work, personal training).

### Available Payment Types
- **Arrange Purchase** (contact): Default
- **Stripe Checkout**: Available

### Sale Types
- **Buy Now** only (no auctions)

### Pricing Models
- **Fixed Price**: Set fixed price for your service
- **Request Quote**: Buyers contact for custom quote

### Pricing
- **Fixed Price**: Required if pricing type is fixed
- **Quote Required**: No price field shown

### Delivery Methods
- **Pickup**: Required (service location)
- **Shipping**: Not available

### Condition
- Not applicable

### Offers
- **Accept Offers**: Optional (default: enabled)
- **Exception**: Disabled for "request_quote" pricing type

### Verification
- **KYC Required**: Yes - seller must be verified

### Categories
- Trades & Repairs, Cleaning & Maintenance, Tutoring & Lessons, Photography, Personal Training, Events & Catering, Other Services

### Special Rules
- Estimated turnaround time can be specified
- Location required for service
- Accept offers disabled for quote-based services

---

## Rentals

### Description
Equipment or vehicles available for temporary hire (equipment, vehicles, party gear).

### Available Payment Types
- **Arrange Purchase** (contact): Default
- **Stripe Checkout**: Available

### Sale Types
- **Buy Now** only (no auctions)

### Pricing
- **Daily Rate**: Required
- **Weekly Rate**: Auto-calculated from daily (7x), can be manually overridden
- **Monthly Rate**: Auto-calculated from weekly (4x), can be manually overridden
- **Refundable Deposit**: Optional

### Sub-Types
- **Equipment**: Party gear, tools, machinery
- **Vehicle**: Cars, trucks, boats

### Delivery Methods
- **Pickup Location**: Required
- **Shipping**: Not available

### Condition
- Required: New, Used - Like New, Used - Good, or Used - Fair

### Offers
- **Accept Offers**: Not available

### Verification
- **KYC Required**: Yes - seller must be verified
- **Phone Verification**: Required - one phone number per account for security

### Categories
- Vehicles, Equipment, Other

### Special Rules
- Location/address required
- Condition required for equipment and vehicles
- Vehicle details (make, model, year, transmission, seats) for vehicle rentals

---

## Wanted

### Description
Post what you're looking for and let sellers come to you (buyer creates listing, sellers respond).

### Available Payment Types
- **Arrange Purchase** (contact): Only option
- **Stripe Checkout**: Not available

### Sale Types
- **Buy Now** only (no auctions)

### Pricing
- **Budget**: Required (what buyer is willing to pay)

### Delivery Methods
- **Pickup**: Not applicable
- **Shipping**: Not applicable

### Condition
- Not applicable

### Offers
- **Accept Offers**: Not applicable

### Verification
- **KYC Required**: No - buyers don't need verification to post wanted listings

### Categories
- Items, Services, Rentals, Vehicles

### Special Rules
- Reverse flow: Buyer creates listing, sellers contact them
- No payment processing (arranged between parties)
- No shipping/pickup options
- Simplified form (just title, description, budget, category)

---

## Common Rules Across All Types

### Verification Requirements
- **KYC Required**: All seller listings except "Wanted" type
- **Email Verification**: Required for all users
- **Phone Verification**: Required - one phone number per account for security and account recovery

### Listing Expiration
- **7 days**: Default
- **14 days**: Option
- **30 days**: Option
- Expired listings are automatically hidden from marketplace

### Content Rules
- NSFW detection on images
- Scam detection on descriptions
- Content sanitization (HTML tags removed)
- Decision engine validation

### Rate Limiting
- Per-user rate limits on listing creation
- Captcha verification required
- Anti-spam measures

### Pricing Rules
- Price alerts for unusually low prices
- Minimum price validation
- Currency: NZD only

### Image Requirements
- At least one image required (except for some digital services)
- NSFW image detection
- File size limits
- Supported formats: JPG, PNG, GIF, WebP

---

## Payment Type Rules

### Arrange Purchase (Contact)
- **Default**: Enabled by default for most listing types
- **Flow**: Buyer and seller arrange payment privately in Messages
- **Protection**: Keep communication on Sky Drop for dispute resolution
- **Bank Details**: Sellers should add bank details in Profile → Payment settings
- **No Fees**: No platform fees (buyer and seller arrange payment directly)

### Stripe Checkout
- **Requires**: Stripe Connect account linked in Profile
- **Flow**: Buyer pays via card, funds held in escrow
- **Protection**: Full buyer protection through escrow
- **Fees**: Platform fees apply
- **Release**: Funds released to seller after buyer confirms receipt
- **Disputes**: Can be raised if issues arise

---

## Buyer Protection by Payment Type

### Arrange Purchase
- **Protection**: Limited - keep evidence in Messages
- **Disputes**: Manual review of message evidence
- **Refunds**: Arranged between buyer and seller
- **Risk**: Higher - buyer must trust seller

### Stripe Checkout
- **Protection**: Full - funds held in escrow
- **Disputes**: Formal dispute process with evidence
- **Refunds**: Automatic if dispute resolved in buyer's favor
- **Risk**: Lower - platform holds funds until confirmed

---

## Common Mistakes to Avoid

1. **Wrong Listing Type**: Choose the type that best matches what you're selling (5 types: Physical, Digital, Service, Rental, Wanted)
2. **Missing Delivery Method**: Physical items require at least pickup or shipping
3. **Incorrect Pricing**: Auctions need starting bid; buy-now needs fixed price
4. **Missing KYC**: Most listing types require seller verification
5. **Wrong Payment Type**: Stripe requires Stripe Connect setup
6. **Incomplete Details**: Vehicles need make/model/year when using Cars category
7. **Unrealistic Pricing**: Low prices trigger alerts and may attract scammers
8. **Missing Phone Verification**: Required for account security - verify your phone number
