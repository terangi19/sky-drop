# Sky Drop Comprehensive UX/UI Audit

**Date**: July 5, 2026  
**Auditor**: Senior Product Designer  
**Objective**: Make every screen feel intentional and professionally designed, ensuring users can immediately understand what to do on each page while maintaining the Sky Drop brand.

---

## Executive Summary

This audit identifies UX/UI issues across Sky Drop's key pages and components. The focus is on improving visual hierarchy, layout, spacing, consistency, and overall perceived quality to create a premium, trustworthy marketplace experience.

**Overall Assessment**: The application has a solid foundation with good functionality, but needs refinement in visual polish, consistency, and user guidance to feel premium and trustworthy.

---

## 1. Homepage (app/page.tsx)

### Issue 1.1: Weak Value Proposition Above the Fold
**Impact**: High - Users don't immediately understand what Sky Drop offers  
**Current State**: Generic "Welcome to Sky Drop" hero with "Buy & Sell in New Zealand" tagline  
**Why It Matters**: First-time visitors need to immediately understand the value and trust the platform  
**Proposed Improvement**:
- Add a more compelling value proposition: "New Zealand's Fastest Growing Marketplace" or "Buy & Sell Anything in NZ"
- Include trust indicators above the fold: "10,000+ listings", "Trusted by Kiwis nationwide"
- Add a brief description of key benefits: "Instant payments • Buyer protection • NZ-wide delivery"
**Priority**: High

### Issue 1.2: Hero Section Lacks Visual Focus
**Impact**: Medium - No clear focal point draws attention  
**Current State**: Hero section is a gradient card with centered text and search  
**Why It Matters**: Users need a clear visual anchor to understand where to look first  
**Proposed Improvement**:
- Add a subtle hero image or illustration on the right side (desktop) to create visual interest
- Make the search bar more prominent with a larger size and stronger shadow
- Consider adding a featured listing carousel or category icons in the hero area
**Priority**: Medium

### Issue 1.3: Category Pills Inconsistent Spacing
**Impact**: Low - Minor visual inconsistency  
**Current State**: Category pills have gap-2 spacing but could be more balanced  
**Why It Matters**: Consistent spacing creates a more polished feel  
**Proposed Improvement**:
- Standardize spacing to gap-3 for better visual rhythm
- Add hover states that are more pronounced (scale up slightly)
- Consider reordering categories by popularity
**Priority**: Low

### Issue 1.4: Trust Strip Below the Fold
**Impact**: Medium - Important trust signals are not immediately visible  
**Current State**: Trust strip with 4 items appears below the hero and search  
**Why It Matters**: Trust signals should be visible without scrolling for first-time visitors  
**Proposed Improvement**:
- Move trust strip to be part of the hero section, visible above the fold
- Make the icons larger and more prominent
- Add a brief description for each trust signal on hover
**Priority**: Medium

### Issue 1.5: Empty State Design
**Impact**: Medium - Empty states could be more encouraging  
**Current State**: Basic empty state with icon and text  
**Why It Matters**: Empty states are opportunities to guide users to take action  
**Proposed Improvement**:
- Add a more engaging illustration or graphic
- Include a clear, primary call-to-action that stands out
- Add social proof: "Join 5,000+ other Kiwis already selling on Sky Drop"
**Priority**: Medium

---

## 2. Navigation (app/components/Navbar.tsx)

### Issue 2.1: Mobile Navigation Hidden Behind Hamburger
**Impact**: High - Key navigation is not immediately accessible on mobile  
**Current State**: Mobile menu hidden behind hamburger menu  
**Why It Matters**: Users expect easy access to main navigation on mobile  
**Proposed Improvement**:
- Consider a bottom navigation bar for mobile (common in marketplace apps)
- Or ensure hamburger menu is easily discoverable with a clear label
- Add a "Browse" button that's always visible on mobile
**Priority**: High

### Issue 2.2: Active State Not Clearly Visible
**Impact**: Low - Users may not know which page they're on  
**Current State**: Active state determined by pathname but visual feedback may be subtle  
**Why It Matters**: Clear active states help users understand where they are  
**Proposed Improvement**:
- Add a more prominent active state indicator (underline, background color, or icon highlight)
- Ensure the contrast between active and inactive states is sufficient
**Priority**: Low

### Issue 2.3: Navigation Items Could Be More Descriptive
**Impact**: Low - Labels are functional but could be clearer  
**Current State**: "Browse", "Purchases", "Sell", "Messages"  
**Why It Matters**: Clear labels reduce cognitive load  
**Proposed Improvement**:
- Consider more descriptive labels: "Browse Listings", "My Purchases", "Sell Items", "Messages"
- Add tooltips or descriptions on hover
**Priority**: Low

---

## 3. Listing Cards (app/components/MarketplaceListingCard.tsx)

### Issue 3.1: Too Many Elements Competing for Attention
**Impact**: High - Cards feel cluttered and lack clear visual hierarchy  
**Current State**: Multiple badges, metadata, buttons, seller info all visible  
**Why It Matters**: Users should immediately see the most important information: image, title, price, primary action  
**Proposed Improvement**:
- Simplify badge display - show only the most important badge (e.g., "New" or "Promoted")
- Move secondary metadata (location, time ago, shipping) to be less prominent
- Reduce the number of buttons - focus on the primary action (Buy Now / Message)
- Make the seller section more subtle
**Priority**: High

### Issue 3.2: Price Not Prominent Enough
**Impact**: Medium - Price should be the most prominent element after the image  
**Current State**: Price is text-2xl but could be more emphasized  
**Why It Matters**: Price is a key decision factor for buyers  
**Proposed Improvement**:
- Increase price size to text-3xl or larger
- Add a subtle background or border to make it stand out
- Consider using a different color (e.g., a more vibrant accent) for the price
**Priority**: Medium

### Issue 3.3: Image Aspect Ratio Not Optimized
**Impact**: Low - 4:3 aspect ratio may not be ideal for all item types  
**Current State**: Fixed 4:3 aspect ratio for all images  
**Why It Matters**: Different item types may benefit from different aspect ratios  
**Proposed Improvement**:
- Consider using a square (1:1) aspect ratio for more flexibility
- Or use object-cover with a minimum height to accommodate various image shapes
**Priority**: Low

### Issue 3.4: Seller Section Takes Up Too Much Space
**Impact**: Medium - Seller info is large relative to other card elements  
**Current State**: Seller section includes avatar, name, badges, join date, listing count, rating  
**Why It Matters**: The card should focus on the item, not the seller  
**Proposed Improvement**:
- Simplify seller section to just name and rating
- Make it smaller and more subtle
- Move seller info to be visible only on hover or card click
**Priority**: Medium

### Issue 3.5: Button Actions Confusing
**Impact**: High - Multiple buttons with similar visual weight  
**Current State**: Buy Now, Make Offer, Bid Now, Message all visible  
**Why It Matters**: Users should know the primary action without thinking  
**Proposed Improvement**:
- Show only the primary action button (Buy Now or Message)
- Make secondary actions (Make Offer, Bid) accessible via a "More options" button
- Or use a single "View Details" button that takes users to the listing page
**Priority**: High

---

## 4. Listing Detail Page (app/post/listing/[id]/page.tsx)

### Issue 4.1: Excessive Whitespace on Desktop
**Impact**: High - Page looks sparse and lacks visual density  
**Current State**: Grid layout with wide spacing between columns  
**Why It Matters**: Proper use of screen width makes the page feel more substantial and premium  
**Proposed Improvement**:
- Reduce gap between left (image/details) and right (purchase card) columns
- Make better use of desktop width by expanding content areas
- Consider a 2/3 + 1/3 split instead of current layout
- Add related listings or seller's other items in the right column
**Priority**: High

### Issue 4.2: Image Gallery Could Be More Prominent
**Impact**: Medium - Product images are the most important visual element  
**Current State**: Standard image gallery with thumbnails  
**Why It Matters**: High-quality images sell products  
**Proposed Improvement**:
- Make the main image larger on desktop
- Add lightbox functionality with zoom
- Improve thumbnail visibility and interaction
- Add image indicators more prominently
**Priority**: Medium

### Issue 4.3: Purchase Action Section Cluttered
**Impact**: High - Multiple buttons and sections compete for attention  
**Current State**: Trust summary, payment helper, buy button, secondary buttons, secure payment info  
**Why It Matters**: Users should know the primary action without thinking  
**Proposed Improvement**:
- Simplify to: Price + Primary Buy Button + Secondary Actions (collapsed)
- Move trust summary to seller section
- Make the buy button the most prominent element
- Collapse secondary actions into a "More options" dropdown
**Priority**: High

### Issue 4.4: Description Section Could Be More Engaging
**Impact**: Low - Standard description presentation  
**Current State**: Plain text in a card  
**Why It Matters**: Well-formatted descriptions are easier to read  
**Proposed Improvement**:
- Add formatting support (bold, lists, paragraphs)
- Add expand/collapse for long descriptions
- Highlight key specifications
- Consider adding a "Key Features" summary
**Priority**: Low

### Issue 4.5: Seller Section Below the Fold
**Impact**: Medium - Trust information not immediately visible  
**Current State**: Seller info at bottom of right column  
**Why It Matters**: Trust signals should be visible to encourage purchase  
**Proposed Improvement**:
- Move seller trust summary near the top of the purchase card
- Make seller rating and verification more prominent
- Add "More listings from this seller" preview
**Priority**: Medium

---

## 5. Dashboard Page (app/dashboard/page.tsx)

### Issue 5.1: Stats Cards Could Be More Visual
**Impact**: Low - Basic stat cards with numbers  
**Current State**: Simple cards with label, value, hint  
**Why It Matters**: Visual data representation is more engaging  
**Proposed Improvement**:
- Add sparklines or trend indicators
- Use icons for each stat type
- Add progress indicators for goals
- Consider a more visual dashboard layout
**Priority**: Low

### Issue 5.2: Insights Section Could Be More Actionable
**Impact**: Medium - Insights displayed but not clearly actionable  
**Current State**: List of insights with impact badges  
**Why It Matters**: Insights should drive user action  
**Proposed Improvement**:
- Add direct action buttons to each insight (e.g., "Edit listing", "Adjust price")
- Make the most critical insights more prominent
- Add a "Dismiss" or "Mark as done" action
- Show insight history or trends
**Priority**: Medium

### Issue 5.3: Empty State Could Be More Encouraging
**Impact**: Medium - Basic empty state with icon  
**Current State**: Icon + text + "Create your first listing" button  
**Why It Matters**: Empty states should motivate users  
**Proposed Improvement**:
- Add a more engaging illustration
- Include quick-start guide or tips
- Add social proof: "Join thousands of sellers on Sky Drop"
- Show example listings for inspiration
**Priority**: Medium

---

## 6. Messages Page (app/messages/page.tsx)

### Issue 6.1: Conversation List Could Be More Informative
**Impact**: Medium - Basic conversation preview  
**Current State**: Name, last message, timestamp  
**Why It Matters**: Users need context to quickly identify conversations  
**Proposed Improvement**:
- Show listing thumbnail if conversation is about a specific item
- Show unread count more prominently
- Add quick action buttons (archive, mark unread)
- Add conversation labels or categories
**Priority**: Medium

### Issue 6.2: Chat Interface Could Be More Polished
**Impact**: Medium - Standard chat interface  
**Current State**: Message list + input field  
**Why It Matters**: Chat is the primary communication channel  
**Proposed Improvement**:
- Add message reactions
- Add message editing/deletion
- Improve message grouping by date
- Add typing indicators
- Add read receipts
**Priority**: Medium

### Issue 6.3: Safety Warnings Could Be Less Intrusive
**Impact**: Low - Modal warnings for scam detection  
**Current State**: Modal that interrupts the flow  
**Why It Matters**: Too many interruptions annoy users  
**Proposed Improvement**:
- Use inline warnings instead of modals
- Allow users to dismiss warnings permanently
- Make warnings more contextual and specific
- Reduce frequency of repeated warnings
**Priority**: Low

---

## 7. Profile Pages

### Issue 7.1: Profile Page Could Be More Engaging
**Impact**: Medium - Basic profile layout  
**Current State**: Avatar, name, bio, listings  
**Why It Matters**: Profile pages build trust and credibility  
**Proposed Improvement**:
- Add a cover image
- Show seller stats more prominently (ratings, response time, sales)
- Add a "About Me" section with personality
- Show seller badges and achievements
- Add a "Verified" badge more prominently
**Priority**: Medium

### Issue 7.2: Seller's Listings Could Be Better Organized
**Impact**: Low - Grid of listings  
**Current State**: Basic listing grid  
**Why It Matters**: Well-organized listings help buyers browse  
**Proposed Improvement**:
- Add filtering/sorting for seller's listings
- Group by category or listing type
- Show sold listings separately
- Add a "View all" link with proper pagination
**Priority**: Low

---

## 8. Forms (Listing Creation, Login, Signup)

### Issue 8.1: AI Listing Creation Flow Could Be More Guided
**Impact**: High - Users may not know what to input  
**Current State**: Text input + AI generation  
**Why It Matters**: Better guidance improves listing quality  
**Proposed Improvement**:
- Add example prompts or templates
- Show tips for better results
- Add a step-by-step wizard for first-time users
- Provide preview before publishing
- Add suggested categories and pricing
**Priority**: High

### Issue 8.2: Manual Listing Form Could Be Simplified
**Impact**: High - Many fields can be overwhelming  
**Current State**: Comprehensive form with many fields  
**Why It Matters**: Simpler forms increase completion rates  
**Proposed Improvement**:
- Use progressive disclosure (show fields as needed)
- Group related fields into sections
- Add field-level help text
- Use smart defaults
- Add a "Quick listing" mode for common items
**Priority**: High

### Issue 8.3: Login/Signup Forms Could Be More Reassuring
**Impact**: Medium - Standard authentication forms  
**Current State**: Email + password fields  
**Why It Matters**: Trust is important for account creation  
**Proposed Improvement**:
- Add trust indicators (secure, privacy)
- Show social proof (e.g., "Join 10,000+ Kiwis")
- Add password strength indicator
- Show clear benefits of signing up
- Add "Continue with Google" if implemented
**Priority**: Medium

---

## 9. Visual Hierarchy & Layout

### Issue 9.1: Inconsistent Spacing Across Pages
**Impact**: Medium - Inconsistent spacing creates a disjointed feel  
**Current State**: Different pages use different spacing values (py-2, py-3, py-4, etc.)  
**Why It Matters**: Consistent spacing creates a cohesive, professional feel  
**Proposed Improvement**:
- Define a spacing scale (e.g., 4, 8, 12, 16, 24, 32, 48, 64px)
- Use consistent spacing for similar elements across all pages
- Standardize padding for cards, sections, and containers
**Priority**: Medium

### Issue 9.2: Typography Scale Not Standardized
**Impact**: Medium - Inconsistent font sizes and weights  
**Current State**: Mix of text-xs, text-sm, text-base, text-lg, text-xl without clear system  
**Why It Matters**: Consistent typography creates a more polished feel  
**Proposed Improvement**:
- Define a type scale (e.g., 12, 14, 16, 18, 24, 32, 48px)
- Standardize font weights for headings, body text, labels
- Ensure line heights are consistent for each font size
**Priority**: Medium

### Issue 9.3: Border Radius Inconsistency
**Impact**: Low - Mix of rounded-xl, rounded-2xl, rounded-3xl  
**Current State**: Different components use different border radii  
**Why It Matters**: Consistent border radius creates a more cohesive design  
**Proposed Improvement**:
- Define a border radius scale (e.g., 4, 8, 12, 16, 24px)
- Use consistent border radius for similar elements
- Standardize: buttons (8px), cards (12px), modals (16px), hero (24px)
**Priority**: Low

---

## 10. Color & Contrast

### Issue 10.1: Muted Text May Have Insufficient Contrast
**Impact**: High - Accessibility concern  
**Current State**: Text using --muted variable may not meet WCAG AA standards  
**Why It Matters**: Low contrast makes content difficult to read for some users  
**Proposed Improvement**:
- Audit all text colors for WCAG AA compliance (4.5:1 for normal text, 3:1 for large text)
- Increase contrast for --muted text if needed
- Ensure all interactive elements have sufficient contrast
**Priority**: High

### Issue 10.2: Accent Color Overuse
**Impact**: Low - Sky blue accent used extensively  
**Current State**: Sky blue (#38bdf8) used for many elements  
**Why It Matters**: Overuse of accent color can reduce its impact  
**Proposed Improvement**:
- Reserve accent color for primary actions and key highlights
- Use neutral colors for secondary elements
- Consider a secondary accent color for variety
**Priority**: Low

---

## 11. Marketplace-First Experience

### Issue 11.1: Non-Marketplace Features Prominent
**Impact**: Medium - Gamification elements compete with marketplace focus  
**Current State**: XP, levels, challenges visible on dashboard  
**Why It Matters**: The primary focus should be buying and selling  
**Proposed Improvement**:
- Move gamification elements to a dedicated section or make them more subtle
- Ensure marketplace actions (browse, search, buy, sell) are always most prominent
- Consider hiding gamification for first-time visitors until they're more engaged
**Priority**: Medium

### Issue 11.2: Search Could Be More Prominent
**Impact**: High - Search is the primary way users find items  
**Current State**: Search is in the hero section but could be more prominent  
**Why It Matters**: Users expect search to be easily accessible  
**Proposed Improvement**:
- Make search bar larger and more visually prominent
- Consider adding search to the navbar for persistent access
- Add search suggestions and recent searches
- Ensure search is the first thing users see on the homepage
**Priority**: High

---

## 12. Forms

### Issue 12.1: Form Validation Feedback Could Be Clearer
**Impact**: Medium - Users may not understand form errors  
**Current State**: Standard form validation messages  
**Why It Matters**: Clear validation reduces user frustration  
**Proposed Improvement**:
- Add inline validation with specific error messages
- Use red color and clear icons for error states
- Add success states with green checkmarks
- Provide helpful hints for complex fields
**Priority**: Medium

### Issue 12.2: Form Labels Could Be More Descriptive
**Impact**: Low - Some labels are functional but could be clearer  
**Current State**: Standard labels like "Email", "Password", "Title"  
**Why It Matters**: Clear labels reduce user errors  
**Proposed Improvement**:
- Add helper text below complex fields
- Use examples in placeholders (e.g., "e.g., iPhone 13, 128GB, Excellent condition")
- Group related fields with clear section headers
**Priority**: Low

---

## 13. Accessibility

### Issue 13.1: Focus States Not Consistent
**Impact**: High - Keyboard navigation may be difficult  
**Current State**: Focus states vary across components  
**Why It Matters**: Consistent focus states are essential for keyboard users  
**Proposed Improvement**:
- Define a consistent focus state (e.g., 2px solid sky blue with 4px offset)
- Ensure all interactive elements have visible focus states
- Test keyboard navigation across all pages
**Priority**: High

### Issue 13.2: Touch Targets May Be Too Small
**Impact**: Medium - Mobile users may have difficulty tapping small elements  
**Current State**: Some buttons and icons are small (e.g., h-8 w-8)  
**Why It Matters**: Touch targets should be at least 44x44px for mobile  
**Proposed Improvement**:
- Ensure all touch targets meet 44x44px minimum
- Increase padding around small buttons and icons
- Test on actual mobile devices
**Priority**: Medium

### Issue 13.3: Screen Reader Support Unknown
**Impact**: High - Accessibility for screen readers not verified  
**Current State**: ARIA labels may be incomplete  
**Why It Matters**: Screen reader users need proper semantic markup  
**Proposed Improvement**:
- Audit all pages with a screen reader
- Ensure all images have alt text
- Add ARIA labels for interactive elements without text
- Use semantic HTML elements (nav, main, section, etc.)
**Priority**: High

---

## 14. Micro-interactions

### Issue 14.1: Hover Effects Inconsistent
**Impact**: Low - Some elements lack hover states or have inconsistent effects  
**Current State**: Hover states vary across components  
**Why It Matters**: Consistent hover effects provide clear feedback  
**Proposed Improvement**:
- Define standard hover effects (e.g., brightness 110%, scale 1.02, or color shift)
- Ensure all interactive elements have hover states
- Use consistent transition durations (150-200ms)
**Priority**: Low

### Issue 14.2: Loading States Could Be More Polished
**Impact**: Medium - Skeleton loaders are basic  
**Current State**: Simple shimmer skeleton loaders  
**Why It Matters**: Polished loading states improve perceived performance  
**Proposed Improvement**:
- Add more detailed skeleton loaders that match actual content structure
- Consider adding loading progress indicators for long operations
- Add error states with retry buttons
**Priority**: Medium

---

## 15. Overall Recommendations

### 15.1: Design System Creation
**Priority**: Critical  
**Recommendation**: Create a comprehensive design system including:
- Color palette with semantic naming
- Typography scale with usage guidelines
- Spacing scale with usage guidelines
- Border radius scale with usage guidelines
- Component library with consistent styling
- Accessibility guidelines

### 15.2: Homepage Redesign
**Priority**: High  
**Recommendation**: Redesign homepage with:
- Stronger value proposition
- Trust signals above the fold
- More prominent search
- Featured listings or categories
- Clear call-to-actions

### 15.3: Listing Card Simplification
**Priority**: High  
**Recommendation**: Simplify listing cards with:
- Clear visual hierarchy
- Prominent price
- Primary action only
- Simplified seller section
- Fewer badges

### 15.4: Listing Detail Page Layout Optimization
**Priority**: High  
**Recommendation**: Optimize listing detail page with:
- Better use of desktop width
- Reduced whitespace
- Simplified purchase action section
- More prominent seller trust signals
- Improved image gallery

### 15.5: Accessibility Audit and Fixes
**Priority**: Critical  
**Recommendation**: Conduct full accessibility audit with:
- WCAG AA compliance check
- Screen reader testing
- Keyboard navigation testing
- Color contrast audit
- Touch target audit

### 15.6: Form Simplification
**Priority**: High  
**Recommendation**: Simplify forms with:
- Progressive disclosure
- Better validation feedback
- Clearer labels and help text
- Guided AI listing creation
- Smart defaults

### 15.7: Mobile Navigation Improvements
**Priority**: High  
**Recommendation**: Improve mobile navigation with:
- Bottom navigation bar consideration
- Clearer active states
- More accessible menu
- Persistent search access

---

## 16. Implementation Priority

### Critical (Immediate - This Week)
1. **Accessibility Audit and Fixes** - WCAG AA compliance, screen reader support, keyboard navigation, color contrast, touch targets
2. **Design System Foundation** - Create spacing, typography, border radius scales for consistency

### High (This Week - Next Week)
3. **Homepage Redesign** - Stronger value proposition, trust signals above the fold, prominent search
4. **Listing Card Simplification** - Clear visual hierarchy, prominent price, primary action only
5. **Listing Detail Page Layout** - Better desktop width usage, reduced whitespace, simplified purchase section
6. **Form Simplification** - Progressive disclosure, better validation, clearer labels
7. **Mobile Navigation** - Bottom navigation bar consideration, clearer active states

### Medium (Next Week - Two Weeks)
8. **Spacing and Typography Standardization** - Apply design system scales across all pages
9. **Dashboard Improvements** - More visual stats, actionable insights, encouraging empty state
10. **Messages Page Enhancements** - More informative conversation list, polished chat interface
11. **Profile Page Enhancements** - More engaging profile layout, better seller stats
12. **Loading State Polish** - More detailed skeleton loaders, error states with retry

### Low (Future Iterations)
13. **Micro-interaction Polish** - Consistent hover effects, transition durations
14. **Border Radius Standardization** - Apply consistent border radius scale
15. **Label Refinements** - More descriptive labels across all forms
16. **Accent Color Refinement** - Reduce overuse, reserve for primary actions
17. **Category Pills Spacing** - Standardize spacing and hover states
18. **Description Formatting** - Add formatting support for listing descriptions
19. **Seller's Listings Organization** - Add filtering and grouping
20. **Safety Warning Optimization** - Less intrusive warnings, dismissible

---

## 17. Next Steps

1. **Review this audit with stakeholders** - Get approval on priorities and approach
2. **Begin with Critical priority items** - Accessibility audit and design system foundation
3. **Implement High priority improvements** - Homepage, listing cards, listing detail page, forms, mobile navigation
4. **Test improvements with users** - Gather feedback on implemented changes
5. **Iterate based on feedback** - Refine and polish based on user testing
6. **Continue with Medium priority items** - Standardization and enhancements
7. **Address Low priority items** - Polish and refinement in future iterations
