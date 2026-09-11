# Āwhina listing intelligence — adversarial NZ QA report

**Launch-readiness: NOT SAFE TO LAUNCH**

Highest-severity current-main failures:

1. **Seller commands become the public title/description** (MacBook “title it bargain don't say damaged”) and **defects are mangled** (“the don't say is damaged”).
2. **Historical / tentative prices beat confirmed asking** (Ranger listed at $45,000 + **Brand New** despite cracked windscreen; `was $450 now 280` extracts 450).
3. **Wanted ads misrouted** (“wanted ps5…” → scam-education reply, no listing; “ISO puppy” → physical **for sale**).
4. **Rentals classified as sales** (trailer hire → physical “for sale”; Hilux hire → vehicle sale).
5. **Follow-up corrections wipe identity** (“wait nah its the 65inch…” replaces the Samsung TV draft).
6. **Voice transcription is unusable** (Hilux “twenty eighteen / thirty four five” → title “Toyota Hilux UH Twenty”, no year/odo/price).
7. **Contradictions keep the first fact** (iPhone stays 128GB/black; 256/blue/battery 87 dumped as a leftover clause).

Tests lock the *correct* expected semantics. Current breaks are `it.fails` / `FAIL:` so CI stays green until production is fixed. No production code was changed.

Vitest evidence (`./node_modules/.bin/vitest run app/lib/awhina-adversarial-nz-corpus.test.ts`, v4.1.8):

- First run against current main: **18 passed, 26 failed** (expected semantics vs production).
- After recording breaks with `it.fails` / `FAIL:` markers: **19 passed | 25 expected fail (44)** — suite green.

---

## What passed on current main

- Model-as-price traps at the **price parser** (`r34`, `335i`, `s24`, `iphone 15`, `55inch`, `128gb`) do not become prices when no dollar amount is present.
- `$280 ono was 450` (ono before historical, no `$` on 450) → 280.
- Input normalize keeps `r34` / `335i` / `hilux` identity tokens.
- Repeated messy couch copy still extracts 3-seater / leather / $400 / Mt Maunganui.
- Clean-enough vehicle identity (BMW 335i, Toyota Hilux, Ford Ranger year/odo/colour) often survives even when the rest of the message is garbage.

---

## Failures (locked expected semantics)

Each item: input → actual → expected → what failed → likely subsystem.

### 1. FAIL: `samsung tv was $450 now 280 hamilton` → price 280

- **Input:** `samsung tv was $450 now 280 hamilton`
- **Actual:** `parseListingPriceFromMessage` → `"450"`
- **Expected:** `"280"` (confirmed “now” price)
- **Failed:** dollar-first heuristic takes historical `$450`
- **Subsystem:** listing-facts / `extractPriceFromMessage` (dollar match wins unconditionally)

### 2. FAIL: `askin 9k maybe 8500 firm later nah 9k` → 9000

- **Input:** `askin 9k maybe 8500 firm later nah 9k`
- **Actual:** `null`
- **Expected:** `"9000"` (final “nah 9k” confirmation; 8500 is tentative)
- **Failed:** slang `askin` not treated as asking; `nah 9k` ignored
- **Subsystem:** input-normalize + price extract

### 3. FAIL: seller hide-damage command is instruction, not a public fact

- **Input:** `title it bargain don't say damaged sell macbook air m2 dent on lid $900`
- **Actual:** `negativeCondition` does not contain dent; instructions empty
- **Expected:** dent as negative condition; “don't say damaged” / “title it bargain” as `seller_instruction`; not in `publicFacts`
- **Failed:** command clauses are not classified; dent lost
- **Subsystem:** semantic-parser / orchestration-boundary

### 4. FAIL: semantic correction `wait no 256 actually blue`

- **Input:** `wait no 256 black actually blue like new battery 87 screen cracked though` (pending condition, prior 128GB)
- **Actual:** facts blob `price:256` only
- **Expected:** storage 256, colour blue, battery 87, cracked screen; 256 is not a price
- **Failed:** 256 treated as price; colour/defect/battery dropped
- **Subsystem:** semantic-intent / pending-slots

### 5. FAIL: physical-samsung-tv-messy

- **Input:** `yeh selling my samsung 55inch tv bit scratched on corner still works mint otherwise hamilton $280 ono was 450 dont put was price in ad 2 remotes`
- **Actual (key fields):** type physical, title `Samsung 55INCH Tv Bit Scratched On Corner`, price 280, location Hamilton, extras `mechanical:works well`, `conditionDetail:the tv bit is scratched`, description “The tv bit is scratched…”, reply uses raw truncated seller text, `semanticPrice.historical` null, remotes missing
- **Expected:** Samsung TV title (not “Bit Scratched…”), $280 not $450, scratch + 2 remotes in evidence/description, no “was 450” / “dont put was price” leak, no “mint” exaggeration
- **Failed:** accessory loss; fact parse (“tv bit”); instruction leak into title/reply; historical price not classified
- **Subsystem:** listing-facts merge, description-writer, semantic-parser price classes

### 6. FAIL: physical-macbook-command-hide-damage — **critical**

- **Input:** `title it bargain don't say damaged sell macbook air m2 16gb 512 dent on lid $900 auckland`
- **Actual:** title `Title IT Bargain Don't Say Damaged Sell Macbook Air M2 16gb 512 Dent`; extras `the don't say is damaged` + raw command blob; description repeats the command; sellerInstructions []
- **Expected:** title like MacBook Air M2 16GB 512; dent visible; commands stripped from title/description/reply
- **Failed:** instruction leakage, hallucinated “don't say is damaged”, defect mangled
- **Subsystem:** authority / description-writer / orchestration-boundary / composer

### 7. FAIL: physical-iphone-contradiction-one-shot

- **Input:** `iphone 15 pro 128gb wait no 256 black actually blue like new battery 87 screen cracked though auckland 950`
- **Actual:** title iPhone 15 Pro, **no price**, colour **Black**, storage **128GB**, cracked screen kept, leftover clause dumped into extras/description including “950”
- **Expected:** 256GB, blue, battery 87%, cracked (not Like New), price 950
- **Failed:** first storage/colour wins; asking price not confirmed; contradiction unresolved
- **Subsystem:** listing-facts merge / semantic-intent / authority

### 8. FAIL: physical-ps5-accessories-short

- **Input:** `ps5 disc 2 pads 3 games $550 chch`
- **Actual:** PlayStation 5 Console, $550, extras `included:ps5 disc` only; no location; no pads/games
- **Expected:** disc edition, 2 controllers, 3 games, Christchurch, $550
- **Failed:** NZ location slang `chch`; accessory/qty loss (`2 pads` not harvested)
- **Subsystem:** input-normalize / seller-evidence / pending-slots

### 9. FAIL: vehicle-bmw-335i-messy

- **Input:** `selling me 07 bmw 335i coupe grey 145k kays auckland auto twin turbo setup not stock cracked bumper good runner askin 9k maybe 8500 firm later nah 9k`
- **Actual:** BMW 335i, price 9000, odo 145000, grey, auto, coupe; **year missing**; extras `the not stock is cracked` + raw modification blob; description “Modified with a selling me 07 145k kays twin turbo…”
- **Expected:** year 2007 from `07`; cracked bumper as defect; twin turbo as modification; not a raw dump; 8500 not asking
- **Failed:** `07` year; composite extras; “not stock is cracked” hallucination
- **Subsystem:** input-normalize / seller-evidence / description-writer

### 10. FAIL: vehicle-hilux-voice-garbage — **critical**

- **Input:** `um so yeah uh sell my uh toyota hilux uh twenty eighteen uh one two eight thousand k uh thirty four five auckland`
- **Actual:** title `Toyota Hilux UH Twenty`, generation `UH Twenty`, no year/odo/price
- **Expected:** Toyota Hilux, year 2018, odo 128000, price 34500, Auckland; no invented generation
- **Failed:** voice numbers not decoded; filler `uh` glued into identity (`UH Twenty`)
- **Subsystem:** input-normalize / domain-knowledge

### 11. FAIL: vehicle-ranger-extremely-long — **critical**

- **Input:** long ramble (2019 Ranger Wildtrak, 145k, cracked windscreen, dent, lift/snorkel/canopy, asking 38900, paid 62k, was asking 45k, “dont say crashed”, “title it tidy unit”)
- **Actual:** title **Brand New** 2019 Ford Ranger Wildtrak, condition **New**, price **45000** (historical “asking 45k”), extras include `2 keys floor`, `1 the aircon`, command residue; description leaks `dont say crashed` / `title it tidy unit`
- **Expected:** asking 38900; Used not New; windscreen crack + dent; mods structured once; no Brand New; no 62k/45k in ad
- **Failed:** exaggerated condition, wrong price class, instruction leak, composite extras
- **Subsystem:** semantic-parser price classes, description-writer, listing-facts merge

### 12. FAIL: service-lawn-messy

- **Input:** `lawn mowing west auckland 40 a lawn bigger sections quote um also hedge trimmin`
- **Actual:** Lawn Mowing, $40, West Auckland; **hedge lost**; no quote-for-bigger-sections
- **Expected:** hedge trimming in extras/description; quote path for bigger sections
- **Failed:** secondary service + quote clause dropped
- **Subsystem:** domain-knowledge / listing-facts merge

### 13. FAIL: service-handyman-short

- **Input:** `handyman westie 60 an hour`
- **Actual:** Handyman $60/hr, **no location**
- **Expected:** West Auckland (westie)
- **Failed:** NZ slang location
- **Subsystem:** input-normalize / domain-knowledge

### 14. FAIL: service-cleaning-voice

- **Input:** `um yeah uh i do house cleaning uh like uh houses uh fifty a visit uh fifty bucks uh henderson henderson um bathrooms kitchens yeah`
- **Actual:** House Cleaning, Henderson, **no price**, bathrooms/kitchens missing
- **Expected:** $50, Henderson, bathrooms + kitchens in scope
- **Failed:** spoken “fifty” not priced; room facts lost
- **Subsystem:** input-normalize / pending-slots

### 15. FAIL: rental-trailer-not-for-sale — **critical**

- **Input:** `renting out my trailer 50 a day bond 100 pickup only manukau not for sale`
- **Actual:** **listingType physical**, title is the raw sentence including “Not For Sale”
- **Expected:** rental, Trailer, $50/day, bond 100, Manukau, pickup only; must not read as a sale
- **Failed:** type detection; title not composed
- **Subsystem:** semantic-intent / domain-knowledge / composer

### 16. FAIL: rental-house-no-daily-rate

- **Input:** `3bed 1bath house hamilton 650 a week bond 4 weeks pets no unfurnished avail now dont put daily rate or end date or condition`
- **Actual:** type rental, title `Listing`, **rentalSubType equipment**, daily **and** weekly 650, deposit **4** (weeks parsed as dollars)
- **Expected:** property rental, house/3-bed identity, weekly $650, bond 4 weeks, no daily rate, unfurnished, no pets
- **Failed:** property vs equipment; bond; title; instruction ignored but fields invented wrongly
- **Subsystem:** domain-knowledge / pending-slots

### 17. FAIL: rental-hilux-hire-not-sale — **critical**

- **Input:** `renting my 2018 hilux 120 a day auckland not selling it bond 500`
- **Actual:** **listingType vehicle**, title 2018 Toyota Hilux, price 120 (looks like a $120 car)
- **Expected:** rental (vehicle hire), $120/day, bond 500, not a sale
- **Failed:** rental vs vehicle sale
- **Subsystem:** semantic-intent / domain-knowledge

### 18. FAIL: wanted-ps5-messy — **critical**

- **Input:** `wanted ps5 disc version under 600 auckland prefer with 2 pads no scams`
- **Actual:** intent **education**, scam-safety lecture, **no listingFill**
- **Expected:** wanted listing, PS5 disc, budget 600, Auckland, 2 controllers; “no scams” is instruction not a fact
- **Failed:** `wanted` + `no scams` hijacked to safety education
- **Subsystem:** semantic-intent / find-vs-wanted routing

### 19. FAIL: wanted-explicit-post-ad

- **Input:** `post a wanted ad looking for iphone 15 pro under 800 wellington preferably 256gb no cracked screens`
- **Actual:** type wanted, title `Wanted AD Looking For iPhone 15 Pro`, **no budget**, extras `the no is cracked` + raw dump
- **Expected:** iPhone 15 Pro wanted, budget 800, 256GB, no cracked screens as a requirement (not “the no is cracked”)
- **Failed:** budget `under 800` ignored; instruction/negation parse; title includes “looking for”
- **Subsystem:** semantic-parser / composer / price extract (search-budget skip)

### 20. FAIL: wanted-iso-puppy

- **Input:** `ISO golden retriever pup canterbury budget 2500`
- **Actual:** **physical** “Iso Golden Retriever Pup Canterbury Budget 2500” priced 2500 (for sale)
- **Expected:** wanted listing, Golden Retriever puppy, Canterbury, budget 2500
- **Failed:** ISO not mapped to wanted
- **Subsystem:** semantic-intent

### 21. FAIL: physical-tv-size-price-correction (multi-turn)

- **Transcript:** (1) `yeh selling my samsung 55inch tv hamilton $280` (2) `wait nah its the 65inch and 320 scratched corner still`
- **Actual:** **new listing** titled `Wait Nah 65inch And 320 Scratched Corner Still`; Samsung/Hamilton identity gone
- **Expected:** same draft, 65 inch, $320, scratch kept, Samsung + Hamilton kept
- **Failed:** follow-up treated as a new item
- **Subsystem:** draft-transition / authority / pending-slots

### 22. FAIL: physical-iphone-followup-correction

- **Transcript:** (1) `selling iphone 15 pro 128gb black auckland 1100` (2) `wait no 256 black actually blue like new battery 87 screen cracked though make it 950`
- **Actual:** price 950 OK; colour still **Black**; storage still **128GB**; cracked kept; leftover “wait no 256 actually blue…” dumped
- **Expected:** 256GB, blue, battery 87, cracked, $950
- **Failed:** corrections not applied; first facts locked
- **Subsystem:** authority / semantic-intent / listing-facts merge

### 23. FAIL: vehicle-price-walk-back

- **Transcript:** (1) BMW 335i 07… (2) `askin 9k maybe 8500` (3) `nah 9k firm cracked bumper tho`
- **Actual:** price 9000 OK; **year still missing**; extras `the firm is cracked` + raw “nah 9k firm cracked bumper tho”
- **Expected:** year 2007, cracked bumper as defect (not “the firm is cracked”)
- **Failed:** year from `07`; defect parse around “firm”
- **Subsystem:** input-normalize / seller-evidence

### 24. FAIL: service-add-hedge-followup

- **Transcript:** (1) `lawn mowing west auckland 40 a lawn` (2) `also hedge trimmin bigger sections quote`
- **Actual:** **new physical** listing `Also Hedge Trimmin Bigger Sections Quote` — lawn draft discarded
- **Expected:** same service draft + hedge + quote-for-bigger
- **Failed:** follow-up as new listing / wrong type
- **Subsystem:** draft-transition / pending-slots

### 25. FAIL: wanted-budget-correction

- **Transcript:** (1) `post a wanted listing ps5 disc auckland under 600` (2) `actually max 550 and i need 2 pads`
- **Actual:** wanted, price 550 OK; **2 pads missing**
- **Expected:** budget 550 + 2 controllers
- **Failed:** accessory qty on follow-up
- **Subsystem:** pending-slots / seller-evidence

---

## Launch notes

Safe-ish path today: **clean, punctuated, single-shot NZ listings** (the existing BMW/oneshot suites).

Not safe: voice, slang (`westie`, `chch`, `kays`, `askin`, `ISO`, `nah`), seller-editor commands, historical prices, contradictions, rentals vs sales, wanted vs find vs sell, and multi-turn corrections.

Do not treat `it.fails` as a product waiver. Those tests are the contract for a later production fix. Do not patch individual examples in production to satisfy this corpus.

---

# Wave 2

**Launch-readiness: still NOT SAFE TO LAUNCH.** Wave 1 gaps are not gone; Wave 2 shows they generalize.

Coverage added (sibling `app/lib/awhina-adversarial-wave-2.test.ts`, same `processCanonicalAwhina` harness):

- More **Wanted**: WTB / ISO / looking-for + post-ad, budget caps, westie/hammers/dunedin/akl, “no scams” / “serious only” / “no timewasters” as instructions, long budget walk, multi-turn `nah bro max 550` + 2 pads
- More **Rentals**: Chch unit vs equipment, bond **weeks vs dollars**, daily vs weekly, “not for sale”, Ranger/mixer/caravan hire vs sale, trailer rate flip-flops
- More **Services**: westie / chch / hammers / palmy, quote vs fixed vs hourly, secondary drain / WOF / gardens / oven+carpet
- **Multi-turn stress**: iPhone 13→15 identity, S24 storage/colour flip-flops, BMW colour `actually` / `wait no` / `nah bro`, trailer rate nah, mechanic+WOF follow-up
- **Description quality**: instruction leakage (`title it mint` / `dont mention the crack`), historical paid/was leak, Brand New + cracked screen, palmy couch duplicates
- **Short + long + voice**: `wtb gtr akl`, `mow 40 westie`, `gtr 50k akl`, Axela “twenty fifteen / eleven five hundred”, Civic “two thousand and twelve / thirty two hundred”
- **Model-as-price traps stay locked** at the parser: `civic si`, `320i`, `s23`, `iphone 14`, `r33`, `cx-5`, `rav4`, `wrx sti`, `s24 ultra`, `128gb`

Vitest evidence (`./node_modules/.bin/vitest run app/lib/awhina-adversarial-wave-2.test.ts`, v4.1.8):

- First run against current main (expected semantics vs production): **21 passed, 34 failed, 5 expected fail** (60 tests)
- After recording breaks with `it.fails` / `FAIL:`: **22 passed | 38 expected fail (60)** — Test Files 1 passed, Duration ~0.5s, vitest v4.1.8. Combined with Wave 1: **41 passed | 63 expected fail (104)**.

## Wave 2 — what passed on current main

- Parser model-as-price traps (`civic si`, `320i`, `s23`, `iphone 14`, `r33`, `cx-5`, `rav4`, `wrx`, `s24 ultra`, `128gb`) do not become prices.
- `s24 ultra $900` → 900; `iphone 12 64gb 280 chch` → 280; WTB/ISO `under 8k` / `under 25k` stay **null** at the listing-price parser (budget, not asking).
- `ps4 slim was 400 paid 450 selling 150` → **150** at the parser (`selling N` beats was/paid). Full listing fill still leaks history (see failures).
- Input normalize keeps `s24` / Axela / WTB+ISO identity tokens.
- **vehicle-corolla-missing-defects**: rust + cracked bumper survive into extras/description with year 2012 / 180k / $4500. (Numeric km/price path; `palmy` happened to match via description blob here, but the couch `palmy` case still misses Palmerston North as a structured location.)
- **physical-price-firm-nah-bro**: couch $400 → 350 → `nah bro 400 firm` keeps **400**.
- **vehicle-identity-tv-to-axela**: “forget the tv, selling my 2015 Mazda Axela…” **replaces** the TV draft with a vehicle (this path works). Same-item identity edits still fail (iPhone 13→15).

## Wave 2 — failures (locked expected semantics)

Each item: input → actual → expected → what failed → likely subsystem.

### W1. FAIL: `"gtr 50k akl"` → 50000 (parser)

- **Input:** `gtr 50k akl`
- **Actual:** `parseListingPriceFromMessage` → `null`
- **Expected:** `"50000"`
- **Failed:** slang `50k` asking dropped (full fill *does* get 50000 but as a physical “GT-R 50k Akl”)
- **Subsystem:** listing-facts / `extractPriceFromMessage`

### W2. FAIL: wanted-wtb-axela-budget-cap — **critical**

- **Input:** `WTB mazda axela under 8k wellington no timewasters serious only`
- **Actual:** **vehicle sale**, title `Mazda Axela Under`, odo **8000** (budget as kilometres), generation `Under`
- **Expected:** wanted listing, Axela, budget 8000, Wellington; “serious only” / “no timewasters” are instructions
- **Failed:** WTB routed as sell; `under 8k` consumed as odometer
- **Subsystem:** semantic-intent / find-vs-wanted / vehicle odo extract

### W3. FAIL: wanted-iso-hilux-westie-no-scams — **critical**

- **Input:** `ISO toyota hilux diesel under 25k westie no scams`
- **Actual:** intent **education**, scam-safety lecture, **no listingFill**
- **Expected:** wanted Hilux diesel, budget 25000, West Auckland; “no scams” is instruction
- **Failed:** ISO + “no scams” hijacked to safety education (same class as Wave 1 wanted-ps5)
- **Subsystem:** semantic-intent / find-vs-wanted routing

### W4. FAIL: wanted-looking-for-post-ad-dunedin — **critical**

- **Input:** `post a wanted ad looking for iphone 14 pro max under 1100 dunedin preferably unlocked no scams`
- **Actual:** education lecture, no listing
- **Expected:** wanted iPhone 14 Pro Max, budget 1100, Dunedin, unlocked; no scam lecture
- **Failed:** explicit “post a wanted ad” still lost to “no scams”
- **Subsystem:** semantic-intent

### W5. FAIL: wanted-mower-hammers-short

- **Input:** `wanted: lawn mower petrol hammers budget 200 no rust`
- **Actual:** **physical for-sale**, title is the raw wanted sentence, no Hamilton
- **Expected:** wanted, mower, Hamilton (`hammers`), budget 200, rust requirement
- **Failed:** wanted prefix ignored; NZ slang location
- **Subsystem:** semantic-intent / input-normalize

### W6. FAIL: wanted-wtb-gtr-extremely-short

- **Input:** `wtb gtr akl`
- **Actual:** **physical** `Wtb GT-R Akl`
- **Expected:** wanted, GTR/Skyline, Auckland; no invented price
- **Failed:** WTB not wanted; `akl` not Auckland
- **Subsystem:** semantic-intent / input-normalize

### W7. FAIL: wanted-long-hilux-budget-walk — **critical**

- **Input:** long WTB/ISO Hilux ramble, final budget 23000, westie, no scams / serious only / dont put my max
- **Actual:** education lecture, no listing
- **Expected:** wanted Hilux, $23000 not 25k/22k, West Auckland, diesel/4WD/auto, instructions stripped
- **Failed:** “no scams” education hijack on a long wanted post
- **Subsystem:** semantic-intent / listing-facts merge

### W8. FAIL: rental-chch-unit-bond-weeks — **critical**

- **Input:** `2bed 1bath unit chch 480 a week bond 2 weeks cats ok furnished avail now not for sale`
- **Actual:** rental, title `Listing`, **equipment**, daily **and** weekly 480, deposit **2**
- **Expected:** property rental, 2-bed identity, weekly 480, no daily rate, bond not `$2`, Christchurch, cats/furnished
- **Failed:** property vs equipment; bond weeks as dollars; `chch`; title
- **Subsystem:** domain-knowledge / pending-slots

### W9. FAIL: rental-property-long-chch-commands

- **Input:** long Chch 2-bed ramble + “dont put daily rate” / “title it tidy 2bedder”
- **Actual:** title `Listing`, equipment, deposit 2, extras dump the whole command blob; description `$2 bond`
- **Expected:** property, weekly 480, no daily, instructions stripped, cats/furnished
- **Failed:** same property/bond/instruction class as Wave 1 house rental
- **Subsystem:** domain-knowledge / description-writer

### W10. FAIL: rental-studio-bond-dollars

- **Input:** `studio wellington 420pw bond $1680 avail 1 oct unfurnished no pets`
- **Actual:** **physical**, title is the raw sentence, price **1680** (bond beats weekly rent)
- **Expected:** property rental, weekly 420, bond 1680, Wellington, no daily rate
- **Failed:** type detection; `$1680` wins over `420pw`
- **Subsystem:** semantic-intent / price extract / domain-knowledge

### W11. FAIL: rental-mixer-equipment-not-sale

- **Input:** `hire my concrete mixer 80 a day bond 150 hamilton not selling`
- **Actual:** **physical** title includes “Not Selling”, price 80
- **Expected:** equipment rental, $80/day, bond 150, Hamilton
- **Failed:** hire vs sale
- **Subsystem:** semantic-intent / domain-knowledge

### W12. FAIL: rental-trailer-daily-or-weekly

- **Input:** `trailer hire 40 a day or 200 a week manukau not for sale`
- **Actual:** rental equipment Trailer, daily 40, **weekly also 40** (daily copied)
- **Expected:** daily 40 **and** weekly 200
- **Failed:** dual-rate; weekly overwritten from daily
- **Subsystem:** listing-facts merge / rental rate inference

### W13. FAIL: rental-ranger-hire-not-sale — **critical**

- **Input:** `not selling my 2020 ranger just hiring it 180 a day auckland bond 600`
- **Actual:** **vehicle sale** `2020 Ford Ranger Just`, price 180, generation `JUST`
- **Expected:** vehicle **hire** rental, $180/day, bond 600, not a $180 Ranger
- **Failed:** “not selling / hiring” ignored; “just” glued into identity
- **Subsystem:** semantic-intent / domain-knowledge / composer

### W14. FAIL: rental-caravan-weekly

- **Input:** `rent my caravan 400 a week taupo bond 200 not for sale`
- **Actual:** rental title `Listing`, daily **and** weekly 400, deposit 200, no Taupo
- **Expected:** equipment (or vehicle) rental, weekly 400, no invented daily, Taupo
- **Failed:** title; daily invented from weekly; location
- **Subsystem:** domain-knowledge / pending-slots

### W15. FAIL: service-plumbing-westie-quote-plus-drain

- **Input:** `plumbing westie callout 90 quote for bigger jobs also drain unblocking`
- **Actual:** Plumbing $90 **fixed**, **no location**, drain/quote lost
- **Expected:** West Auckland (`westie`), drain in extras, quote path for bigger jobs
- **Failed:** westie; secondary service; quote vs fixed
- **Subsystem:** input-normalize / domain-knowledge / listing-facts

### W16. FAIL: service-mechanic-chch-hourly-wof

- **Input:** `mobile mechanic chch 80 an hour also wof checks`
- **Actual:** **physical** raw title, $80, extras `WOF current` (as if the seller’s car has a WOF)
- **Expected:** service, mechanic, Christchurch, hourly 80, WOF checks as offered service
- **Failed:** type; `chch`; WOF classified as vehicle compliance not a service add-on
- **Subsystem:** semantic-intent / domain-knowledge / seller-evidence

### W17. FAIL: service-mow-hammers-quote-gardens

- **Input:** `i mow lawns hammers 45 a lawn bigger sections quote also gardens`
- **Actual:** Lawn Mowing $45, **no Hamilton**, gardens/quote lost
- **Expected:** Hamilton (`hammers`), gardens, quote-for-bigger
- **Failed:** hammers slang; secondary + quote
- **Subsystem:** input-normalize / domain-knowledge

### W18. FAIL: service-painting-quote-required-palmy

- **Input:** `house painting quote required palmy no fixed price`
- **Actual:** **physical** raw title, no location, no quote pricing type
- **Expected:** service, painting, Palmerston North, `request_quote`, no invented price
- **Failed:** type; palmy; quote required
- **Subsystem:** semantic-intent / service-pricing / input-normalize

### W19. FAIL: service-cleaning-chch-secondary-oven

- **Input:** `cleaning chch 50 a visit also oven and carpet`
- **Actual:** **physical** raw title, $50, no Christchurch, oven/carpet lost
- **Expected:** service, $50, Chch, oven + carpet in scope
- **Failed:** type; chch; secondary services
- **Subsystem:** semantic-intent / listing-facts

### W20. FAIL: physical-ipad-instruction-historical-defect — **critical**

- **Input:** `dont mention the crack title it mint sell my ipad air 64gb… was 650 paid 700 selling 220…`
- **Actual:** title `Like New Dont Mention Crack Title IT Mint Sell iPad Air…`, price **650** (historical), condition **Like New**, extras `the ono is cracked`
- **Expected:** iPad Air title, $220, dent/crack visible, no mint/commands, no 650/700 in ad
- **Failed:** instruction leakage, historical price, exaggerated condition, mangled defect
- **Subsystem:** authority / description-writer / semantic-parser price classes

### W21. FAIL: physical-iphone-exaggerated-new-with-crack — **critical**

- **Input:** `brand new condition but cracked screen iphone 12 64gb 280 chch`
- **Actual:** title **Brand New iPhone 12**, price **12** (model as price), condition **New**, extras `the condition but is cracked`
- **Expected:** iPhone 12, $280 not 12, Christchurch, cracked (not New/Like New)
- **Failed:** `iphone 12` as price; Brand New vs crack; `chch`
- **Subsystem:** price extract / listing-condition / input-normalize

### W22. FAIL: physical-ps4-historical-paid-leak

- **Input:** `ps4 slim was 400 paid 450 selling 150 hamilton dont put what i paid`
- **Actual:** title `150 Hamilton Dont Put What I`, price **400** (was-price)
- **Expected:** PS4 Slim, $150, Hamilton, no paid/was/instruction in public copy
- **Failed:** parser can see 150 in isolation, but listing fill still takes 400 and eats the title
- **Subsystem:** listing-facts merge / composer / instruction strip

### W23. FAIL: physical-couch-duplicate-facts

- **Input:** repeated 2-seater grey fabric palmy 250
- **Actual:** Couch $250, **no Palmerston North**, fabric/2-seater thin
- **Expected:** palmy → Palmerston North; 2-seater / fabric once, not duplicated
- **Failed:** `palmy` slang (Mt Maunganui still works from Wave 1; palmy does not)
- **Subsystem:** input-normalize / seller-evidence

### W24. FAIL: vehicle-axela-voice-number-words — **critical**

- **Input:** `um so yeah uh sell my uh mazda axela uh twenty fifteen uh one two eight thousand k uh eleven five hundred auckland blue`
- **Actual:** title `Mazda Axela UH Twenty`, generation `UH Twenty`, no year/odo/price
- **Expected:** Mazda Axela 2015, 128000 km, $11500, blue, Auckland; no UH Twenty
- **Failed:** same voice-number class as Wave 1 Hilux (`UH Twenty`)
- **Subsystem:** input-normalize / semantic-intent

### W25. FAIL: vehicle-civic-voice-year-price-words

- **Input:** `sell my honda civic two thousand and twelve thirty two hundred bucks wellington`
- **Actual:** `Honda Civic Two Thousand`, generation `TWO Thousand`, no year/price
- **Expected:** Honda Civic 2012, $3200, Wellington
- **Failed:** spoken year/price glued into generation
- **Subsystem:** input-normalize

### W26. FAIL: vehicle-gtr-short-model-not-price

- **Input:** `gtr 50k akl`
- **Actual:** **physical** `GT-R 50k Akl`, price 50000
- **Expected:** vehicle, GTR/Skyline, $50000, Auckland
- **Failed:** type + `akl`; 50k happens to land as price in fill but identity is junk
- **Subsystem:** semantic-intent / input-normalize

### W27. FAIL: service-mow-short-westie

- **Input:** `mow 40 westie`
- **Actual:** **physical** `Mow 40 Westie`, $40
- **Expected:** service lawn mowing, $40, West Auckland
- **Failed:** type + westie
- **Subsystem:** semantic-intent / input-normalize

### W28. FAIL: wanted-budget-pads-nah-bro (multi-turn)

- **Transcript:** (1) `WTB ps5 disc chch under 700 no scams` (2) `nah bro max 550 and must have 2 pads`
- **Actual:** turn 1 education; turn 2 **unknown** “What are you confirming?”
- **Expected:** wanted PS5, budget 550, Christchurch, 2 controllers
- **Failed:** no-scams hijack then follow-up has no draft
- **Subsystem:** semantic-intent / pending-slots

### W29. FAIL: physical-identity-iphone-13-to-15 (multi-turn)

- **Transcript:** (1) iPhone 13 128 black 600 (2) `wait no it's a 15 pro 256 blue make it 950`
- **Actual:** still **iPhone 13**, price 950 OK, colour blue, storage still **128GB**
- **Expected:** iPhone 15 Pro, 256, blue, $950
- **Failed:** same-item identity/storage not corrected (TV→Axela *cross-item* replace works)
- **Subsystem:** draft-transition / authority / listing-facts

### W30. FAIL: physical-storage-colour-flipflops (multi-turn)

- **Transcript:** S24 128 black 700 → `actually 256` → `wait no 512 and its purple not black`
- **Actual:** title **purple**, price **512** (storage as price), extras still 128GB
- **Expected:** Galaxy S24, 512GB, purple, $700; 128/256/black gone
- **Failed:** 512 as price; identity wiped to colour word; first storage locked
- **Subsystem:** authority / semantic-intent / price extract

### W31. FAIL: vehicle-colour-nah-bro-chain (multi-turn)

- **Transcript:** 07 BMW 335i grey 9k → actually silver → `wait no grey nah bro its blue cracked bumper tho`
- **Actual:** still **grey**, 9k consumed as **odometer 9000**, year missing, extras `the its blue is cracked`
- **Failed:** colour chain; 9k as km; defect parse around nah-bro
- **Subsystem:** authority / seller-evidence / input-normalize

### W32. FAIL: rental-trailer-rate-flipflop (multi-turn)

- **Transcript:** trailer 50/day → actually 40 → `nah 45 a day`
- **Actual:** after `nah 45 a day`, intent **unknown**, listingType empty
- **Expected:** same rental draft, $45/day, Manukau, not for sale
- **Failed:** short nah-correction treated as confirm-with-no-context (Wave 1 trailer was already typed as physical, so the draft never existed)
- **Subsystem:** draft-transition / authority / pending-slots

### W33. FAIL: service-add-secondary-followup (multi-turn)

- **Transcript:** (1) `mobile mechanic chch 80 an hour` (2) `also wof checks and bigger jobs quote`
- **Actual:** **new physical** `Also Wof Checks And Bigger Jobs Quote`
- **Expected:** same service draft + WOF checks + quote-for-bigger
- **Failed:** follow-up as new listing / wrong type (same class as Wave 1 hedge follow-up)
- **Subsystem:** draft-transition / pending-slots

### Semantic / correction layer (already `it.fails`)

- **no scams / serious only** are not classified as `sellerInstructions`; they never become public-fact exclusions.
- **dont mention the crack / title it mint**: crack not in `negativeCondition`; commands not instructions.
- **nah bro max 550 + 2 pads**: not understood as budget+accessory correction.
- **wait no 512 purple not black**: 512 treated as price; colour/storage dropped.
- **eleven five hundred** voice asking → parser still not 11500.

## Wave 2 launch notes

Still safe-ish: clean punctuated one-shots, **cross-listing identity replace** (TV→Axela), **price firm/nah bro** on a clean couch, Corolla defects when km/price are numeric, parser model-as-price traps.

Still unsafe: WTB/ISO/wanted + “no scams”, westie/chch/hammers/palmy/akl, hire vs sale, bond weeks, quote-required services, voice number-words, instruction/historical leakage, same-item identity and storage/colour flip-flops.

Do not delete these `it.fails` to fake green. Do not patch individual Wave 2 strings in production.
