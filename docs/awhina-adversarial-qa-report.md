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
