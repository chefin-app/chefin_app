# Figma Sync Log

Running log of the code → Figma design system build.
Source of truth is the code in this repo.

---

## Phase 1 — Token audit (complete, read-only)

**Date:** 2026-09-29
**Scope:** `src/styles/theme.ts`, `src/admin/theme.ts`, all 190 `.ts`/`.tsx` files in `src/` and `app/`
**Figma writes:** none

### Headline finding

`src/styles/theme.ts` is effectively dead code. It is imported by **2 of 190 files**
(`BottomTabBarCook.tsx`, `BottomTabBarUser.tsx`), and only `theme.colors.primary` and
`theme.colors.inactive` are ever read. `spacing`, `fontSizes`, `radii`, `shadows`,
`fonts` and `modes` have **zero usages** anywhere.

The real mobile design system is ~1,800 hardcoded literals spread across the codebase.
`src/admin/theme.ts` is the opposite: genuinely adopted (11 files) and should be the
model for what the mobile token set becomes.

### (a) Tokens defined vs. actually used

| Source | Defined | Imported by | Actually referenced | Status |
|---|---|---|---|---|
| `src/styles/theme.ts` | colors, modes, spacing, fontSizes, fonts, radii, shadows | 2 files | `colors.primary`, `colors.inactive` only | **Aspirational — not the real system** |
| `src/admin/theme.ts` (`ADMIN_THEME`) | colors, fonts, sizes, radius, layout | 11 files | Broadly used, plus `ADMIN_SHARED_STYLES` | **Real and adopted** |

`theme.modes` (light/dark) is unused — **the app has no dark mode.**

### (b) De-facto tokens — hardcoded values recurring 3+ times

**Brand green** — the real primary is `#4CAF50`, *not* the `#4ade80` in `theme.ts`:

| Hex | Uses | Files | Role |
|---|---|---|---|
| `#4CAF50` | 227 | 75 | **De-facto primary** |
| `#237A3B` | 82 | 31 | Dark green (text on green, active states) |
| `#2E7D32` | 55 | 18 | Dark green variant |
| `#216E39` | 26 | 6 | Dark green variant |
| `#00A651` | 22 | 5 | Saturated green variant |
| `#258B50` | 14 | 5 | Mid green variant |
| `#1B5E20` | 10 | 3 | Darkest green |
| `#00B85A` | 10 | 3 | Saturated green variant |
| `#00794F` | 10 | 3 | Teal-green variant |
| `#2C9C5B` | 2 | 2 | Admin eyebrow text |
| `#4ade80` | **1** | 1 | `theme.ts` `primary` — essentially unused |
| `#22c55e` | **1** | 1 | `theme.ts` `success` — essentially unused |

**≈12 distinct greens.** Realistically 3 roles: base, dark/active, soft background.

**Error / destructive red:**

| Hex | Uses | Role |
|---|---|---|
| `#B42318` | 65 | De-facto error (matches `ADMIN_THEME.colors.red`) |
| `#C62828` | 38 | Error variant |
| `#FF5252` | 11 | Error variant |
| `#ef4444` | 1 | `theme.ts` `error` — essentially unused |

**Neutrals / text:**

| Hex | Uses | Likely role |
|---|---|---|
| `#1A1A1A` | 152 | **De-facto primary text** (not `#111827` from theme.ts) |
| `#666` | 87 | Secondary text |
| `#333` | 71 | Strong body text |
| `#888` | 58 | Muted text |
| `#999` | 37 | Subtle text |
| `#5F6368` | 21 | Secondary text variant |
| `#344039` | 21 | Green-tinted dark text |
| `#1F2937` | 14 | Secondary text variant |
| `#6B7280` | 12 | `theme.ts` `subtext` — barely used |

**Surfaces:** `#FFFFFF`/`#fff` (378 combined), `#E0E0E0` (57, borders), `#F0F0F0` (18),
`#F5F5F5` (15), `#E8F5E9` (27, green-soft background).

**Font sizes actually used** (literal `fontSize:` values):

| px | Uses | | px | Uses |
|---|---|---|---|---|
| 14 | 161 | | 17 | 43 |
| 12 | 160 | | 20 | 28 |
| 16 | 138 | | 22 | 19 |
| 13 | 136 | | 24 | 18 |
| 10 | 98 | | 19 | 11 |
| 11 | 92 | | 28 | 8 |
| 15 | 81 | | 21 | 7 |
| 9 | 75 | | 32/26/25/23 | 3 each |
| 8 | 56 | | 48/36 | 2 each |
| 18 | 46 | | 64/56 | 1 each |

**25 distinct sizes, effectively a continuous ramp 8→64.** No scale.

**Border radii:** 25+ distinct values. Top: `12` (127), `16` (63), `10` (53), `14` (48),
`20` (39), `24`/`18` (30 each), `9` (25), `11` (24), `13` (19). Pill expressed
inconsistently as `999` (9) and `99` (6).

**Spacing** (padding/margin/gap literals): `12` (260), `8` (237), `10` (212), `16` (196),
`14` (161), `20` (139), `4` (112), `6` (96), `5` (77), `24` (73), `18` (73), `13` (72).
Both the 4-point grid and its odd off-grid neighbours (5, 7, 9, 13, 15) are in heavy use.

**Fonts — real registration** (`app/_layout.tsx:44-48`), only three weights exist:

| Alias | File | Uses |
|---|---|---|
| `mon` | Montserrat-Regular.ttf | 129 |
| `mon-sb` | Montserrat-SemiBold.ttf | 96 |
| `mon-b` | Montserrat-Bold.ttf | 97 |

### (c) Contradictions requiring a decision

1. **`theme.ts` primary is wrong.** Declares `#4ade80`; the app uses `#4CAF50` 227 times.
2. **`theme.ts` font names are broken.** Declares `Montseerrat_Regular` (typo, doubled
   "e"), `Montserrat_Medium`, `Montserrat_SemiBold`, `Montserrat_Bold` — none match the
   registered aliases `mon` / `mon-sb` / `mon-b`. **Any code using `theme.fonts` would
   fail to render.** Medium weight is declared but never loaded.
3. **Blue `tint` in a green app.** `theme.ts` sets `tint` and `tabIconSelected` to
   `#2f95dc` (blue). Unused, but it makes `theme.ts` self-contradictory about the brand.
4. **Overlapping font scale.** `theme.fontSizes` has two ladders: `lg:22, xl:28, xxl:36`
   and `'2xl':24, '3xl':30, '4xl':36, '5xl':48`. `xxl` and `'4xl'` are both 36.
5. **Two `Montserrat` naming conventions in code.** 322 uses of `mon`/`mon-sb`/`mon-b`
   vs. 9 stray uses of `Montserrat-Regular`, `Montserrat-Thin`, `Montserrat-Light`,
   `Montserrat-Medium`, `Montserrat-SemiBold`, `Montserrat-Bold`, `Montserrat-ExtraBold`,
   `Montserrat-Black` — **8 of those 9 reference fonts that are never loaded.**
6. **Mobile vs. admin are different systems.** Admin: green `#4CAF50`, text `#1C2720`,
   radii 11/15/18/99, sizes 8–30. Mobile: same green but text `#1A1A1A`, radii 12/16/10,
   sizes 8–64. Confirmed: keep as two separate Figma variable collections.
7. **Admin theme bypasses itself.** `ADMIN_SHARED_STYLES` hardcodes ~14 colors not in
   `ADMIN_THEME.colors` (`#2C9C5B`, `#737D77`, `#E5EAE7`, `#202B24`, `#66716A`,
   `#DDE3DF`, `#27332B`, `#59645D`, `#27322B`, `#626D66`) — most are near-duplicates of
   tokens that already exist.
8. **No dark mode.** `theme.modes` is unused; don't build a dark collection in Figma.

### Decisions needed before Phase 2

1. **Green:** collapse ~12 greens to 3 roles (`primary #4CAF50`, `primary-dark #237A3B`,
   `primary-soft #E8F5E9`)? Or preserve every variant as-is?
2. **Type scale:** snap 25 sizes onto a ~7-step scale (10/12/14/16/18/22/28), or mirror
   the full ramp?
3. **Radii:** collapse to `sm 8 / md 12 / lg 16 / xl 24 / pill 999`, or mirror all 25?
4. **Text neutrals:** standardise on `#1A1A1A / #666 / #999`, or keep all 10?
5. **`theme.ts` itself:** mirror it as-is (it's wrong), or build Figma from observed
   values and treat `theme.ts` as debt to fix later? **Recommended: the latter.**

### Design debt (code fixes — not blocking Figma)

- `theme.ts:63` typo `Montseerrat_Regular`; whole `fonts` block mismatches loaded aliases
- `theme.ts` `primary`/`success`/`error` don't match real usage
- `theme.ts` `tint` is blue in a green-branded app
- `theme.fontSizes` has duplicate/overlapping keys
- 8 stray `fontFamily` references to unregistered Montserrat weights
- `ADMIN_SHARED_STYLES` hardcodes ~14 colors that should be `ADMIN_THEME` tokens
- Pill radius written as both `999` and `99`

**Status:** decisions made — collapse on all five; build from observed values.

---

## Phase 2 — Figma variables, styles, foundations (complete)

**Date:** 2026-09-29
**File:** `oqtR3lFroKcNtXDb4S3eBq` (currently named "hi" — rename manually, the API forbids it)
**Account:** personal (nathanlim84736@gmail.com), `chefin` team

### Decisions applied

| # | Decision |
|---|---|
| 1 | Greens collapsed 12 → 3 roles |
| 2 | Type collapsed 25 → 7 steps |
| 3 | Radii collapsed 25 → 5 (8/12/16/24/pill) |
| 4 | Text neutrals standardised to 4 (`#999` dropped — fails AA at 2.85:1) |
| 5 | Built from observed values; `theme.ts` treated as debt |
| — | **Contrast option 2:** filled buttons use `primary-action #237A3B` (5.36:1 w/ white) instead of `#4CAF50` (2.78:1, fails AA) |

### Created

**4 collections, 33 variables.** Semantic layer aliases primitives; all scoped; all carry WEB code syntax (`var(--color-primary)`).

- `Primitives` (10, scope `[]`): green/500·700·50, neutral/900·700·500·400·300, white, red/600
- `Color` (11, mode "Light"): primary, primary-action, primary-soft, text/default·strong·secondary·muted·on-action, surface, border, error
- `Spacing` (7, scope GAP+WIDTH_HEIGHT): 4/8/12/16/20/24/32
- `Radius` (5, scope CORNER_RADIUS): 8/12/16/24/9999

**21 text styles** — 7 steps × Regular/SemiBold/Bold. Each description records the RN equivalent
(`fontFamily: 'mon-sb', fontSize: 14`). Only the three loaded faces exist as styles.

| Step | px | line-height |
|---|---|---|
| caption | 10 | 14 |
| small | 12 | 16 |
| body | 14 | 20 |
| base | 16 | 22 |
| subtitle | 18 | 24 |
| title | 22 | 28 |
| display | 28 | 34 |

**1 effect style** — `shadow/card`, matching RN `shadowOpacity 0.1 / offset (0,2) / radius 4`.

**Foundations page** (node `4:3`) — colour swatches, text-colour specimens, contrast warning,
type ramp, spacing bars, radius samples. Every fill/radius bound to variables, no raw hex.
Visually validated by screenshot.

### Notes / limitations

- `figma.root.name` is not settable via the Plugin API — **rename the file manually** from "hi".
- No dark mode collection (code has none).
- Admin token set (`src/admin/theme.ts`) **not yet built** — deferred to Phase 3 group 5 as a
  separate collection, per the earlier decision to keep mobile and admin distinct.

**Status:** Phase 2 complete.

---

## Phase 3 — Component library

### Usage audit (ran before building — changed the plan)

Counted real imports for all 72 components. **21 have zero usages**; 2 of those are 0-byte files.
Per decision, the library covers **only what ships: 51 components.**

**Excluded (21):** TextArea, TabButton, ReviewCard, RatingStars, RadioGroup, QuantityStepper,
PriceLabel, MapPinPicker, KeywordChip *(empty)*, InlineErrorText, IconButton, EmptyStateMessage,
DropdownSelect, Divider, Checkbox, CaptionText, BodyText, AvailabilityPicker, AvailabilityCard,
AddPhotoButton, *(Avatar — empty, see below)*

**⚠ `src/components/media/Avatar.tsx` is a 0-byte file imported by 2 modules.** An empty `.tsx`
has no default export, so those imports resolve to `undefined` and rendering `<Avatar />` would
throw. Either those paths never execute or this is a live bug. **Not a Figma issue — check it.**

Original grouping assumed a primitives layer that mostly does not exist. Regrouped by dependency
depth: G1 leaves (7) · G2 inputs (8) · G3 cards+filters (7) · G4 composites (17) · G5 admin (6).

### Group 1 — complete (7 components, page `9:2`)

| Component | Figma API | Notes |
|---|---|---|
| `BaseText` | Color (5) × Weight (3) = 15 variants | see debt below |
| `HeadingText` | Level 1–6 | own scale (32/28/24/20/18/16), ≠ Phase 2 ramp |
| `VerifiedBadge` | Size 13/16/18/20 | tooltip state not built |
| `LoadingSpinner` | none — single component | no props in code |
| `SkeletonLoader` | Height sm/md/lg | width is continuous, resize the instance |
| `AccountRestrictionBanner` | none — single component | renders only when suspended |
| `FloatingCartButton` | Count 1/3/9+ | hidden at count 0 |

All fills, radii and strokes bound to variables. Every component description cites its source path
and lists props that could not be represented. Visually validated by screenshot.

**Tokens added for this group** (Primitives 10→17, Color 11→18, Radius 5→6):
amber/50·200·700·800, red/500, neutral/800, gold/500 → `color/warning-soft`, `warning-border`,
`warning-icon`, `warning-text`, `color/badge`, `color/icon/default`, `color/skeleton`,
plus `radius/button-fab` (18 — the FAB radius does not fit the 8/12/16/24 scale).

### Limitations in group 1

- **Icons are emoji placeholders.** Ionicons/MaterialIcons glyphs (`lock-closed-outline`,
  `bag-outline`, `verified`) are stand-ins. Real icon components are needed before screens.
- **No animation.** Spinner rotation and badge transitions are static.
- `VerifiedBadge` code default colour is **blue `#0084ff`** in a green-branded app; built bound to
  `color/primary` — **confirm which is intended.**

### New code debt found in group 1

- `typography/styles.ts` maps 8 weights to Montserrat Thin/Light/Medium/ExtraBold/Black —
  **none are loaded**; only 3 of 8 render. Same file sets `color_primary: #000000` (app uses
  `#1A1A1A`) and `color_error: #F44336` (app uses `#B42318`).
- `EmptyStateMessage.tsx:62` — `sie={64}` typo (dead code, never surfaces).
- `typography/index.ts:5` — exports `EmptyStartMessage` (typo).
- `HeadingText` sizes are a third type scale, unrelated to `theme.ts` or observed usage.

**Status:** Group 1 done. Next: group 2 (inputs, 8 components).



### Group 2 — built, one fix outstanding (page `0:1`, "Components — Group 2 (Inputs)")

| Component | Figma API | Node ID |
|---|---|---|
| `PrimaryButton` | State: default / disabled / loading | `25:8` |
| `TextInputField` | Label (yes/no) × State (empty/filled) = 4 | `25:23` |
| `RadioButton` | Selected: false / true | `25:31` |
| `CountryCodeSelector` | single (trigger only) | `25:32` |
| `PhoneNumberInput` | single (bare input, no border) | `25:36` |
| `BankSelect` | State: placeholder / selected | `25:46` |
| `DateTimePickerModal` | State: unset / set | `25:51` |
| `SocialMediaButtons` | Provider (4) × Disabled = 7 | `25:73` |

**⚠ OUTSTANDING: `TextInputField` (`25:23`) variants render collapsed/overlapping.**
Cause: variant frames were created with `resize(345, 10)` before children were appended, so the
fixed height stuck. Fix (was mid-flight when the rate limit hit):
set each variant `primaryAxisSizingMode='AUTO'`, re-`resize` the inner `input` frame to 345×50 and
`layoutSizingHorizontal='FILL'`, then set the set to VERTICAL with itemSpacing 24.
`PrimaryButton` and `SocialMediaButtons` were screenshot-verified as correct.

**Tokens added for group 2** (Primitives 18→25, Color 19→26):
green/200, neutral/450, neutral/100, neutral/150, brand/facebook, brand/apple, brand/google →
`color/primary-disabled`, `color/text/placeholder`, `color/surface-muted`, `color/separator`,
`color/brand/facebook`, `color/brand/apple`, `color/brand/google`.
Also `blue/500` → `color/verified` (#0084ff) — VerifiedBadge rebound to blue per confirmation that
the blue is deliberate.

### Blockers hit (Figma Starter plan)

1. **3-page limit.** Could not create a 4th page. Worked around by repurposing the empty
   "Page 1" for group 2. **No slots remain** — groups 3/4/5 and all Phase 4 screens have nowhere
   to go on this plan. Options: (a) upgrade to Professional, (b) put every remaining group on one
   page separated by sections, (c) use separate files per group (loses the shared local variables —
   they would have to become a published library, which Starter also cannot do).
2. **MCP tool-call limit.** Hard stop mid-fix. Resets on Figma's schedule; upgrading lifts it.
3. `figma.root.name` is not settable — the file is still named "hi". Rename manually.

### Recurring limitation across all groups

Icons are emoji/letter placeholders (🏦 ⌄ 🔒 🛍 f A G ✉). Ionicons/MaterialIcons glyphs are not
available to the plugin API. Before Phase 4 screens, either import an icon library into Figma or
accept placeholders throughout.

**Status:** Group 2 built; `TextInputField` layout fix pending. Blocked on Figma plan limits.

### Page strategy — DECIDED: one page per concern, Sections as group dividers

Under the Starter 3-page cap:

| Page | Node | Contents |
|---|---|---|
| `Foundations` | `4:2` | token specimen (unchanged) |
| `Components` | `0:1` | all 51 components, one Section per group |
| `Screens` | `9:2` | ~65 screens, one Section per persona |

This requires consolidating groups 1 and 2 onto `0:1` and renaming `9:2` (currently
"Components — Group 1") to `Screens` once its contents move.

**Consolidation script is written and ready — blocked only by the MCP tool-call limit.**
It performs, in ONE call (to conserve quota):

1. Fix `TextInputField` (`25:23`): per variant set `primaryAxisSizingMode='AUTO'`,
   `counterAxisSizingMode='FIXED'`; inner `input` frame → `resize(345,50)` +
   `layoutSizingHorizontal='FILL'`; set → VERTICAL, itemSpacing 24, both axes AUTO.
2. Reparent group 1 sets `9:33` `9:46` `9:59` `9:60` `9:65` `9:66` `9:81` → page `0:1`.
3. Grid-lay group 1 (3 cols, 80px gaps) from y=0; group 2 (`25:8` `25:23` `25:31` `25:32`
   `25:36` `25:46` `25:51` `25:73`) starting 240px below group 1's bottom.
4. Wrap each block in `figma.createSection()` — "Group 1 — Leaves", "Group 2 — Inputs" — 64px pad.
5. Rename `0:1` → `Components`; rename `9:2` → `Screens`.
6. Screenshot `TextInputField` to confirm the fix.

**Quota note:** two consecutive calls were refused by the Starter MCP tool-call limit. Resume by
running the consolidation script above as a single call; do not re-attempt sub-steps separately.

**Status:** Blocked on Figma MCP tool-call quota (Starter). Groups 1–2 built (15 components,
TextInputField layout fix pending). Groups 3–5 (36 components) and Phase 4 screens not started.

### Consolidation — DONE

Ran as one call. `TextInputField` (`25:23`) fixed and screenshot-verified (4 variants, correct
heights/borders). Pages now:

| Page | Node | Contents |
|---|---|---|
| `Components` | `0:1` | Section `27:2` "Group 1 — Leaves" (7), Section `27:3` "Group 2 — Inputs" (8) |
| `Foundations` | `4:2` | token specimen |
| `Screens` | `9:2` | empty, reserved for Phase 4 |

### Group 3 — source read, build BLOCKED on quota

All 7 read. Far more complex than groups 1–2; proposed Figma APIs:

| Component | Proposed variants | Key complexity |
|---|---|---|
| `MealCard` | Layout (rail/feed) × Favourite (on/off) × Availability (available/unavailable) | **two completely different layouts** in one component; rail is 252×230 card, feed is a full-width row with 124px image |
| `MenuItemCard` | Available (y/n) × Trailing (add/stepper/unavailable-badge) | stepper has its own disabled-increase state |
| `SearchBar` | State (empty/filled) | clear button only renders when value.length > 0 |
| `MainFilter` | Chip: Filter (availableNow/certified/dietary) × Active | plus a dietary bottom sheet (separate frame) |
| `CuisineFilter` | Cuisine (10) × Selected — or 1 component + instance-swap colour | 10 hardcoded pastel colours + emoji icons |
| `SearchHistoryCard` | single | trivial |
| `BuyerRatingCard` | State (loading/new-buyer/rated) × Expanded | fetches its own data; cream/amber palette unrelated to brand green |

**Token script written and ready (30 primitives, 20 semantic, 3 radii)** — covers rating golds
(`#E4A11B`/`#F5BE18`), rating badge (`#FFF6D9`/`#805E00`), add button `#19B85A`, stepper border
`#168A49`, availability greens (`#18884B`/`#267A42`), warm accent `#EB6B2A`, favourite `#E55252`,
card neutrals, BuyerRatingCard cream set (`#FFFBEF`/`#E9D89B`/`#F7EAC0`/`#765600`), all 10 cuisine
pastels, and radii chip 20 / card-rail 18 / sheet 26.

### ⚠ Quota reality check

Starter's MCP tool-call limit allowed only **~2 write calls** before cutting off again. At that
rate groups 3–5 (36 components) and Phase 4 (~65 screens) are not practically reachable on this
plan — each group needs 2–4 calls minimum (tokens, build, fix, verify).

**Recommendation: upgrade to Figma Professional** before continuing. It lifts the tool-call limit
AND the 3-page cap (which would let the one-page/Sections workaround be dropped) AND enables
library publishing so the tokens become consumable across files.

**Status:** Groups 1–2 complete (15 components, verified). Group 3 source analysed, token +
build scripts ready, blocked on quota. Groups 4–5 and Phase 4 not started.

### Group 3 — tokens DONE, components BLOCKED (2026-10-07)

**Tokens created** (Primitives 25→55, Color 26→46, Radius 6→9): 30 primitives, 20 semantic, 3 radii
— rating golds, rating badge, add button `#19B85A`, stepper border `#168A49`, availability greens,
warm accent `#EB6B2A`, favourite `#E55252`, card neutrals, BuyerRatingCard cream set, all 10
cuisine pastels, radii chip 20 / card-rail 18 / sheet 26.

**Component build attempted twice:**
1. First attempt failed on a real script bug: `layoutPositioning='ABSOLUTE'` was set on the
   MealCard rail heart overlay whose parent was a plain `createFrame` (layoutMode NONE).
   **Fixed** — the image container is now `createAutoLayout('VERTICAL')` with
   `counterAxisAlignItems='MAX'` + top/right padding, so the heart sits top-right by layout
   rather than absolute positioning.
2. Second attempt (with the fix) was refused by the MCP tool-call limit before executing.

The corrected build script is ready to re-run verbatim. It creates:

| Component | Variants |
|---|---|
| `MealCard` | Layout(2) × Favourite(2) × Available(2) = 8 |
| `MenuItemCard` | Available × Trailing = 3 (add / stepper / unavailable) |
| `SearchBar` | State = 2 |
| `MainFilter / Chip` | Filter(3) × Active(2) = 6 |
| `CuisineFilter / Item` | Cuisine(10) × Selected(2) = 20 |
| `SearchHistoryCard` | 1 |
| `BuyerRatingCard` | State = 4 (loading / new-buyer / rated / expanded) |

44 variants across 7 component sets.

**Quota pattern observed:** each reset window permits roughly **2 `use_figma` calls**. Group 3 alone
needs 3 (tokens ✓, build, verify+Section). Groups 4–5 and Phase 4 are far larger.

**Status:** Group 3 tokens in place; components pending one more quota window.

### Group 3 — BUILT (2026-10-09)

7 component sets, 44 variants, in Section `32:343` "Group 3 — Cards & Filters" on page `0:1`.

| Component | Node | Variants |
|---|---|---|
| `MealCard` | `32:150` | 8 — Layout(rail/feed) × Favourite × Available |
| `MenuItemCard` | `32:189` | 3 — add / stepper / unavailable |
| `SearchBar` | `32:197` | 2 — empty / filled |
| `MainFilter / Chip` | `32:214` | 6 — Filter(3) × Active |
| `CuisineFilter / Item` | `32:295` | 20 — Cuisine(10) × Selected |
| `SearchHistoryCard` | `32:296` | 1 |
| `BuyerRatingCard` | `32:342` | 4 — loading / new-buyer / rated / expanded |

Screenshot-verified: `MealCard` (both layouts render distinctly, favourite + availability states
correct) and `MenuItemCard` (all three trailing controls correct).

**⚠ OUTSTANDING: `MenuItemCard` (`32:189`) trailing controls clip at the right edge.**
The add button / stepper / unavailable badge are cut off by the 393px fixed width.
Fix (was mid-flight when quota hit): per variant set `clipsContent=false`, `paddingRight=16`,
and `content.layoutSizingHorizontal='FILL'`. One call.

**Running total: 22 of 51 components built** (G1 7, G2 8, G3 7). Remaining: G4 composites (17),
G5 admin (6), then Phase 4 screens.

**Quota:** this window again allowed exactly 2 calls.

### Professional plan active — Group 4 BUILT (2026-10-10)

Upgrade confirmed: ~15 consecutive `use_figma` calls with no quota error.

**`MenuItemCard` fix applied.** Root cause was not clipping — an earlier `HUG` had collapsed the
fixed-size trailing frames (addButton 34→12px, stepper 84→68px). Restored explicit sizes and set
the component set to hug; all three trailing controls now render inside the card.

**Group 4 in-page components — 8 sets, 23 variants**, Section `38:241` "Group 4 — Composites".

| Component | Node | Variants |
|---|---|---|
| `BottomTabBar` | `38:118` | 8 — Role(user/cook) × Active(4 tabs) |
| `ActiveOrderBanner` | `38:119` | 1 |
| `StickyCartBar` | `38:132` | 1 |
| `BuyerPickupCodeCard` | `38:167` | 3 — loading / code / pending |
| `PickupCoordinationCard` | `38:192` | 3 — loading / ready / unavailable |
| `CustomerRefundRequestCard` | `38:205` | 2 — open / closed |
| `NotificationFeed / Row` | `38:221` | 2 — Read |
| `FoodComplianceAcknowledgement` | `38:240` | 3 — Accepted × ReadOnly |

`BottomTabBarUser` and `BottomTabBarCook` are structurally identical files — merged into one
`BottomTabBar` with a Role variant. They are also **the only two consumers of `theme.ts`**
anywhere in the app, using just `colors.primary` and `colors.inactive`. Bound to `color/primary`
(#4CAF50) rather than the dead `#4ade80`.

**Tokens added** (Primitives 55→85, Color 46→76, Radius 9→11): dark banner set, blue pickup-code
set, mint coordination set, leaf refund set, success/direct-pay greens, `radius/modal` 24,
`radius/banner` 18.

**Construction lesson recorded:** for a HORIZONTAL auto-layout frame, height is the COUNTER axis —
so hugging height needs `counterAxisSizingMode='AUTO'`, not `'FIXED'`. Creating a frame with
`resize(w, 10)` before appending children locks that 10px height. This caused collapsed variants in
both `TextInputField` (group 2) and five group 4 sets; all fixed.

### Group 4 — DEFERRED to Phase 4 (modals/screens, not library components)

These are full-screen or overlay surfaces, better built as screen frames than as library
components: `DishOrderModal`, `MenuOptionSelector`, `RestaurantScheduleSheet`, `PickupPinModal`,
`OrderFulfilledPopup`, `DeliveryAddressModal`, `LocationPromptModal`, `GlobalCartOverview`,
`PaymentMethodSelector`, `BuyerNotificationCenter`, `PaymentSettingsUI`, `DirectPaymentCard`.

**Running total: 30 of 51 components built** (G1 7, G2 8, G3 7, G4 8).
Remaining: G5 admin (6), the 12 deferred modals, then Phase 4 screens.

### Verification caveats

- `NotificationFeed / Row` and `FoodComplianceAcknowledgement` were built from props + partial
  style reads, not full source. Their descriptions say so. **Verify against source before using
  them in screens.**

### Group 5 — Admin Console BUILT (2026-10-10)

6 components in Section `40:123` "Group 5 — Admin Console", all screenshot-verified.

| Component | Node | Notes |
|---|---|---|
| `Admin / Sidebar` | `40:37` | 248px, brand tile, 7 workspace nav rows, SYSTEM + Logout |
| `Admin / Topbar` | `40:73` | 1192×72, notification button + badge, divider, avatar + name/role |
| `Admin / NavItem` | `40:36` | 3 variants — default / active / soon |
| `Admin / Select` | `40:103` | 2 variants — closed / open (with anchored menu) |
| `Admin / Dialog` | `40:104` | header + body + right-aligned footer |
| `Admin / StatCard` | `40:118` | 240×116 overview metric tile |

**Admin tokens kept SEPARATE from mobile**, as four own collections:

| Collection | Count |
|---|---|
| `Admin / Color` | 24 |
| `Admin / Size` | 8 (8/9/10/11/12/14/23/30) |
| `Admin / Radius` | 6 (11/15/18/99 + dialog 20, menu 12) |
| `Admin / Layout` | 10 (maxWidth 1548, sidebar 248, topbar 72, table rows 72, …) |

Plus **24 admin text styles** (`admin/<step>/<weight>`), 8 steps × Regular/SemiBold/Bold, each
description carrying the RN equivalent.

**Admin components NOT built** (deferred — they are pages or large feature surfaces, better as
Phase 4 screen frames): `AdminOverviewUI` (full dashboard page), `AdminNotificationFeed`
(popover list), `AdminDateFilter` (depends on AdminSelect).

### Phase 3 COMPLETE — 36 components across 5 sections

G1 Leaves 7 · G2 Inputs 8 · G3 Cards & Filters 7 · G4 Composites 8 · G5 Admin 6.

Token totals: Primitives 85 · Color 76 · Spacing 7 · Radius 11 · Admin Color 24 · Admin Size 8 ·
Admin Radius 6 · Admin Layout 10 = **227 variables**, 21 mobile + 24 admin text styles,
1 effect style.

**Deferred to Phase 4** (15 modal/page surfaces): DishOrderModal, MenuOptionSelector,
RestaurantScheduleSheet, PickupPinModal, OrderFulfilledPopup, DeliveryAddressModal,
LocationPromptModal, GlobalCartOverview, PaymentMethodSelector, BuyerNotificationCenter,
PaymentSettingsUI, DirectPaymentCard, AdminOverviewUI, AdminNotificationFeed, AdminDateFilter.

**Excluded as dead code (21)** — see the Phase 3 usage audit above.

### Recurring limitation

Icons remain emoji/text placeholders throughout. Before Phase 4, either import an Ionicons/
MaterialIcons set into Figma or accept placeholders in the screens too.

**Next: Phase 4 — screens.** Page `9:2` "Screens" is empty and reserved. ~65 routes plus the 15
deferred modal surfaces, organised by persona Section: Auth, Buyer, Cook, Shared, Admin.

### Icons — Ionicons imported as real vectors (2026-10-10)

**70 icon components** in Section `44:121` "Icons — Ionicons (70)", 10-column grid.

Scope = every icon used **2 or more times** in the app (the app uses 142 distinct icons in total;
the 72 one-off icons were skipped per the agreed option 3).

**How they were made:**
1. No Ionicons library exists in Figma. The 8 subscribed community libraries (Material 3,
   iOS/macOS/watchOS/visionOS) contain no icon components — `search_design_system` returned empty.
2. `node_modules` ships only `Ionicons.ttf` + a name→codepoint glyphmap — **no SVG paths**, so
   nothing could be extracted locally.
3. SVG source fetched from `raw.githubusercontent.com/ionic-team/ionicons/main/src/svg/` (MIT),
   then built with `figma.createNodeFromSvg` into 24x24 components.

**Two real bugs hit and fixed during the import:**
- *Filled squares.* Initial code set `fills` on every vector, including stroke-only paths whose
  fill must stay `none`. Fixed: only bind a fill where a visible SOLID fill already exists.
- *Black blocks.* `resize(24,24)` scales geometry but **not** `strokeWeight`, so Ionicons' 32–48px
  (512-viewBox) strokes swallowed the 24px frame. Fixed: multiply stroke weights by 24/512.

**Audit after import: 70 components, 196 vectors, 0 problems** — no unscaled strokes, no
paintless vectors, no empty components. Spot-checked `star`, `person-outline`, `trash-outline`,
`storefront-outline`, `logo-google`, `chevron-forward`, `calendar-outline`, `camera-outline`,
`bag-outline`, `checkmark`.

All strokes/fills bound to `color/icon/default`; override on the instance to recolour.
Each description records the Ionicons name, MIT licence, and the 24/512 scaling.

**Remaining:** existing Group 1–5 components still use emoji/text placeholders inline. They can be
swapped for these icon instances during Phase 4, or left as-is in the component sets — the screens
are what matter visually.

## Phase 4 — Screens

Page `9:2` "Screens". One Section per persona, frames at iPhone 16 (393x852).

### Auth — COMPLETE (8 frames, Section `46:215`)

| Frame | Node | Source |
|---|---|---|
| Auth / Login | `46:2` | `app/(auth)/login.tsx` |
| Auth / Email Login — Email | `46:28` | `app/(auth)/email-login.tsx` (step 1) |
| Auth / Email Login — Password | `46:46` | `app/(auth)/email-login.tsx` (step 2, error state) |
| Auth / Phone Login | `46:76` | `app/(auth)/phone-login.tsx` |
| Auth / Phone Verify | `46:102` | `app/(auth)/phone-verify.tsx` |
| Auth / Setup Password | `46:131` | `app/(auth)/setup-password.tsx` |
| Auth / Onboarding | `46:178` | `app/(auth)/onboarding.tsx` |
| Auth / Callback | `46:212` | `app/(auth)/callback.tsx` |

Composed from library instances (`SocialMediaButtons`, `TextInputField`, `PrimaryButton`,
`CountryCodeSelector`, `PhoneNumberInput`) plus real Ionicons instances — **no emoji placeholders
in these screens**. All fills/strokes/radii bound to variables.

`email-login.tsx` is a two-step flow in one route file, so it is two frames. The password step
shows the incorrect-password error state, which the code implements.

**Instance text override gotcha:** `findOne` on a frame matches the outer instance, not the nested
variant, so the first override pass silently left default copy ("Place order", "Full name") in
place. Fixed by searching TEXT nodes directly by their current characters. Verified by screenshot.

Contrast decision carried through: all primary CTAs use `color/primary-action` (#237A3B).

**Remaining Phase 4:** Buyer (~14 routes), Cook (~17), Shared (~6), Admin (~10), plus the 15
deferred modal/page surfaces from Phase 3.

### Buyer / Cook / Shared / Admin — COMPLETE (2026-10-10)

**38 screen frames across 5 persona Sections** on page `9:2`, laid out vertically with no overlap.

| Section | Frames | Node |
|---|---|---|
| Auth | 8 | `46:215` |
| Buyer | 11 | `49:669` |
| Cook | 11 | `51:1244` |
| Shared | 5 | (Restaurant Detail + Order Status, Leave Review, Report Listing, Start a Restaurant) |
| Admin | 3 | 1440x1024 desktop — Overview, Cook Management, Moderation |

**Buyer:** Home, Search, Search–Recent, Cart, Cart–Empty, Food Orders, Favourites,
Favourites–Empty, Account, Notifications, Payment Methods.
**Cook:** Orders, Order Detail, Menu, Menu–Empty, Add Dish, Account, Payout Details,
Business Hours, Application Status, Food Safety, Notifications.

Composed from library instances throughout — `MealCard` (both layouts), `MenuItemCard` (all three
trailing states), `SearchBar`, `MainFilter / Chip`, `CuisineFilter / Item`, `BottomTabBar`,
`NotificationFeed / Row`, `BuyerPickupCodeCard`, `PickupCoordinationCard`, `BuyerRatingCard`,
`ActiveOrderBanner`, `FoodComplianceAcknowledgement`, plus the Admin sidebar/topbar/select/stat-card.

**BottomTabBar emoji swapped for real Ionicons** (32 glyphs across 8 variants), with correct
active/inactive colour binding. Change propagated to every screen instance automatically.

Empty states built only where the code implements them (cart, favourites, cook menu).

### Phase 4 gotchas recorded

- **Stale node IDs.** Hardcoding IDs from earlier calls broke twice — a frame had been reparented
  into a Section, and several guessed icon IDs pointed at VECTORs, not COMPONENTs. Fix: resolve
  components by **name** from the Icons section (`44:121`) at the start of every build script.
- **Section overlap.** Sections created with independently computed Y positions collided. Fix: a
  single reflow pass that stacks every Section sequentially with a fixed gap.
- **Instance text overrides** need direct TEXT-node search (see Auth note above); `findOne` on the
  frame matches the outer instance and silently leaves defaults in place. This produced four
  identical "TOTAL ORDERS / 1,284" admin stat cards before being corrected.

## PROJECT STATUS — Phases 1-4 complete

| Artifact | Count |
|---|---|
| Variables | 227 (4 mobile + 4 admin collections) |
| Text styles | 45 (21 mobile + 24 admin) |
| Effect styles | 1 |
| Components | 36 + 70 Ionicons = 106 |
| Screen frames | 38 |

**Not built, by explicit decision:** 21 dead-code components; 15 modal/page surfaces deferred from
Phase 3 (DishOrderModal, LocationPromptModal, PickupPinModal, AdminNotificationFeed, etc.);
72 single-use icons.

**Phase 5 (navigation flow graph) not started.**

### Known limitations
- Images are flat `color/primary-soft` placeholders — no real photography.
- The file is still named "hi" — `figma.root.name` is not settable via the Plugin API.
- A few Group 1-4 components retain emoji glyphs internally (BankSelect 🏦, AccountRestrictionBanner
  🔒, FloatingCartButton 🛍, BuyerRatingCard 👤). Screens use real icons; these are cosmetic.

## Phase 5 — Navigation flow graph (COMPLETE, 2026-10-10)

Page **"Flows"** (`55:134`), frame `Navigation Flow` (`55:1472`), 1666x1404.

**Derived from code, not drawn by hand.** A script walked every `.ts`/`.tsx` under `app/`,
matched `router.push|replace|navigate|dismissTo`, and resolved both the literal-string form
(`router.push('/(cook)/menu')`) and the object form (`router.push({ pathname: '...' })`).
Source routes come from the Expo Router file path.

**50 nodes · 76 edges · 23 cross-persona edges.**

Five colour-coded columns: Auth (7) · Buyer (10) · Shared (7) · Cook (19) · Admin (7).
Each node shows the short name and the full route. Edges are vector paths:

| Style | Meaning |
|---|---|
| Solid grey | `router.push` — adds to history, back works |
| Dashed orange | `router.replace` — no back |

**`figma.createConnector` is FigJam-only** and throws in a Design file; edges are drawn as
elbowed `vectorPaths` instead. Same-column edges route out to the right and back with a small
per-edge offset so parallel runs stay distinguishable.

### What the graph shows

- `/(user)/(tabs)/home` is the convergence point — every auth path `replace`s into it.
- `/(auth)/login` is the most-targeted screen (6 inbound edges): home, search, cart, account,
  restaurant and report-listing all push to it when the user is signed out.
- Cook onboarding is a chain, not a hub:
  `profile-information → food-safety → payout-details → direct-payment-settings`,
  with `address → food-safety` joining midway.
- Admin is nearly isolated — only `admin/login → admin/overview` plus four dashboard pages
  pointing at `/admin/orders`.

### Known graph limitations
- One dynamic target (`/restaurant/${item.profileId}`) was normalised to `/restaurant/[id]`.
- Tab-bar navigation is driven by `navigation.navigate` inside the Expo Router `Tabs`
  component, not `router.*`, so tab switches are NOT edges here.
- `router.back()` is not represented — only forward navigation.

## ALL PHASES COMPLETE (1-5)

| Phase | Output |
|---|---|
| 1 | Token audit — found `theme.ts` is dead code (2/190 files) |
| 2 | 227 variables, 45 text styles, 1 effect style, Foundations page |
| 3 | 36 components across 5 Sections + 70 Ionicons |
| 4 | 38 screens across 5 persona Sections |
| 5 | Navigation flow graph — 50 nodes, 76 edges |

File pages: `Components` · `Foundations` · `Screens` · `Flows`.

## Code debt FIXED (2026-10-10)

The Phase 1 audit findings are now resolved in code. `src/styles/theme.ts` is rewritten to match
the Figma library, so `theme.colors.primary` here == `color/primary` there.

| Issue | Before | After |
|---|---|---|
| Primary colour | `#4ade80` (1 usage) | `#4CAF50` (the real 227-usage brand green) |
| Text colour | `#111827` | `#1A1A1A` (152 usages) |
| Error colour | `#ef4444` | `#B42318` (65 usages) |
| Font aliases | `Montseerrat_Regular` (typo) + 3 unregistered names | `mon` / `mon-sb` / `mon-b` — the aliases actually registered |
| Blue `tint` in a green app | `#2f95dc` | removed |
| Overlapping font scale | 12 keys, `xxl`==`'4xl'`==36 | 7 semantic steps + matching `lineHeights` |
| Spacing | 10 keys up to 96 | 7 steps (4/8/12/16/20/24/32) |
| Radii | 4/8/16/9999 | 8/12/16/24/pill |
| Unused `modes` (light/dark) | present, dead | removed — the app has no dark mode |

Added: `primaryAction` `#237A3B` with a comment explaining the 2.78:1 → 5.36:1 contrast fix,
plus `primarySoft`, `primaryDisabled`, surface/text/line/status roles and `verified` `#0084FF`
(documented as intentionally blue).

### Typography system repaired
- **`app/_layout.tsx`** now also registers `mon-m` (Montserrat-Medium). All 18 Montserrat `.ttf`
  files were already in `src/assets/fonts/` — they were simply never registered, which is why 5 of
  the 8 declared weights silently fell back to the system font.
- **`typography/styles.ts`** now imports from `theme.ts` instead of hardcoding, and declares only
  the 4 weights that have registered fonts. `color_primary` was `#000000`, now `theme.colors.text`;
  `color_error` was `#F44336`, now `#B42318`; `color_accent` was an orange `#FF6B35`, now the brand
  green.
- **`types.ts`** — `TextWeight` narrowed from 8 to 4, so TypeScript now catches a weight with no
  font behind it.

### Typos fixed
- `typography/index.ts` — `EmptyStartMessage` → `EmptyStateMessage` (0 importers, safe rename).
- `EmptyStateMessage.tsx:58` — `sie={64}` → `size={64}`.

### Verification
- `tsc --noEmit` — clean, exit 0.
- `eslint` on changed files — 0 errors (5 pre-existing warnings: 4 `require()` font imports,
  1 unused import).
- `jest` — **187 passed, 2 failed, identical to baseline.** Both failures
  (`foodSafetyWaiver.test.ts`, `LocationPromptModal.test.tsx`) were confirmed pre-existing by
  stashing the changes and re-running against unmodified `master`. **Not caused by this work.**

Both tab bars (`BottomTabBarUser`/`Cook`) read only `colors.primary` and `colors.inactive`, which
both still exist — they now render the correct brand green instead of the dead `#4ade80`.

## Token migration — contrast fix shipped (2026-10-10)

### WCAG AA contrast failures fixed in code — 39 buttons across 37 files

The Phase 1 audit found white text on `#4CAF50` at **2.78:1**, below the WCAG AA 4.5:1 threshold.
That fix existed only in Figma until now.

A script parsed every StyleSheet rule, found rules with `backgroundColor: '#4CAF50'`, and matched
each against its paired `*Text` / `*Label` rule (or a `color` in the same rule). Only pairs where
**white text actually sits on green** were changed — `#4CAF50` is still correct for icons, borders
and accents, so a blind find-replace would have been wrong.

Result: `backgroundColor` → `#237A3B` (**5.36:1**, passes AA) in 39 rules. Audit re-run afterwards
reports **0 remaining white-on-green failures**.

Affected surfaces include every primary CTA in the app: `(auth)/login`, `onboarding`,
`phone-login`, `phone-verify`, `setup-password`, `(user)/cart`, `favourites`, `food-orders`,
`payment-methods`, `(cook)/add-dish`, `food-safety`, `identity-verification`,
`review-customer`, `admin/login`, `review/[orderId]`, `start-restaurant`, and more.

### Shared components migrated to theme tokens

| Component | Now references |
|---|---|
| `PrimaryButton` | `colors.primaryAction` / `primaryDisabled` / `textOnAction`, `spacing.lg`, `radii.pill`, `fonts.bold`, `fontSizes.subtitle` |
| `TextInputField` | `colors.surface` / `border` / `textStrong`, `spacing.*`, `radii.md`, `fonts.*` |
| `RadioButton` | `colors.primary` / `border` / `textStrong`, `spacing.*`, `fonts.semibold` |

`PrimaryButton` carries an inline comment explaining why it uses `primaryAction` rather than
`primary`, so the contrast decision survives future edits.

**Theme adoption: 2 files → 6 files, 4 token references → 32.**

### Verification
- `tsc --noEmit` — clean, exit 0
- `eslint` on changed files — 0 errors (3 pre-existing unused-import warnings)
- `jest` — 187 passed, 2 failed — **identical to baseline**; both failures pre-existing on `master`
- Backup of `src/` and `app/` taken to `/tmp/bk_src`, `/tmp/bk_app` before the scripted edit

### Still outstanding
**~1,700 hardcoded hex values remain** across ~130 files (`#4CAF50` 184, `#1A1A1A` 152,
`#237A3B` 118, `#B42318` 64, `#E0E0E0` 56). These are correct values — they simply bypass
`theme.ts`. Converting them is mechanical but large, and best done per-feature with visual checks
rather than as one scripted sweep.

### Token migration — Auth persona COMPLETE (2026-10-10)

**156 hardcoded hex values → 10**, across all 7 auth screens.

| File | Before | After |
|---|---|---|
| `callback.tsx` | 1 | 0 |
| `onboarding.tsx` | 2 | 0 |
| `phone-login.tsx` | 3 | 0 |
| `phone-verify.tsx` | 21 | 0 |
| `email-login.tsx` | 37 | 0 |
| `setup-password.tsx` | 48 | 0 |
| `login.tsx` | 5 | 5 (deliberate — see below) |

**The 10 remaining are intentional.** `#1877F2` (Facebook), `#000` (Apple) and `#DB4437` (Google)
are third-party brand colours that must not be tokenised; they carry an inline comment saying so.
The rest sit in `login.tsx`'s unused `googleButton`/`appleButton` styles — the real buttons come
from the `SocialMediaButtons` component.

**Also removed:** a 387-character commented-out duplicate of the social-login markup in
`login.tsx`, dead since `SocialMediaButtons` replaced it.

### Tokens added for this batch
`colors.errorBorder` `#D92D20` · `colors.errorSoft` `#FEF3F2` · `colors.warningSoft` `#FFF4D6` ·
`colors.strength.{weak,fair,good,strong}` — the four-step password-strength meter in
`setup-password.tsx`, previously four loose hexes with no shared meaning.

### Verification
- `tsc --noEmit` — clean
- `eslint app/(auth)` — **0 errors** (8 pre-existing `any` warnings); 89 prettier errors from
  changed line lengths were auto-fixed with `--fix`
- `jest` — 187 passed, 2 failed, **identical to baseline**

### Two import gotchas worth recording
The scripted import-insertion regex matched `import … from 'react-native';` on a single line.
`email-login.tsx` and `setup-password.tsx` both use a **multi-line** react-native import, so they
silently got no `theme` import and failed `tsc` with `Cannot find name 'theme'`. Both fixed by
hand. **Check `tsc` after every scripted batch** — the replacement itself succeeds, so the
failure only surfaces at type-check.

### Token migration — Buyer persona COMPLETE (2026-10-10)

**349 hardcoded hex values → 84**, across 10 buyer screens.

| File | Before | After |
|---|---|---|
| `cart.tsx` | 62 | 16 |
| `(tabs)/home.tsx` | 57 | 21 |
| `help-support.tsx` | 48 | 16 |
| `payment-methods.tsx` | 46 | 14 |
| `(tabs)/account.tsx` | 35 | 4 |
| `change-address.tsx` | 24 | 1 |
| `(tabs)/search.tsx` | 24 | 10 |
| `profile-info.tsx` | 22 | 5 |
| `food-orders.tsx` | 18 | 5 |
| `favourites.tsx` | 13 | 3 |

### What the remaining 84 are
- **7 × `shadowColor: '#000'`** — conventional in React Native, intentionally literal.
- **~75 single-use bespoke colours** — pale green card tints (`#D4EFD9`, `#EEF8F0`, `#D7ECDD`),
  muted green-greys for secondary copy (`#5E7061`, `#657069`, `#77827B`), and one-off status
  pairs (`#FFF8E1`/`#B26A00` demo notice, `#007AFF` iOS-style link). **Each appears exactly once.**
  Tokenising a value used once adds indirection without adding consistency, so they were left
  alone deliberately.

### Tokens added for this batch
- `colors.primaryOnLight` `#237A3B` — dark green for text/icons on light backgrounds.
  Consolidates `#2E7D32` (19 uses), `#216E39` (10), `#1B5E20` (5) and `#153E1B` (2), which were
  used interchangeably for the same role: section eyebrows, inline links, active filter labels.
- `colors.destructive` `#FF4D4D` — delete, clear-basket, remove-account affordances.

### A semantics bug caught in review
The first pass mapped **every** `#FFFFFF` to `colors.surface`, including white *text* on green
buttons. Both tokens resolve to `#FFFFFF`, so it rendered identically and no test would have
caught it — but `color: colors.surface` is semantically wrong and would break the moment surface
is ever re-themed. Corrected to `colors.textOnAction` across 9 files (Auth included, which had
the same issue).

### Verification
- `tsc --noEmit` — clean
- `eslint app/(user)` — **0 errors** (22 pre-existing warnings: inline styles, `any`)
- `jest` — 187 passed, 2 failed, identical to baseline

**Running total: Auth + Buyer = 505 hex values → 94.**

### Token migration — Cook persona COMPLETE (2026-10-10)

**932 hardcoded hex values → 318**, across 22 cook screens — the largest batch.

| File | Before | After |
|---|---|---|
| `(tabs)/menu.tsx` | 169 | ~60 |
| `(tabs)/orders.tsx` | 68 | ~20 |
| `business-hours.tsx` | 70 | ~45 |
| `option-group.tsx` | 62 | ~42 |
| `order/[orderId].tsx` | 54 | ~24 |
| `review-customer/[orderId].tsx` | 54 | ~15 |
| `edit-dish.tsx` | 52 | ~12 |
| `food-safety.tsx` | 47 | ~9 |
| `add-dish.tsx` | 46 | ~7 |
| `help-support.tsx` | 48 | ~14 |
| …12 more | | |

### Token added
`colors.link` `#1473E6` — secondary action link in the cook console ("Edit", "Add",
"Create schedule"), 16 uses. Deliberately blue so it reads as a link rather than a primary CTA.

### Saturated greens consolidated
The cook console used five near-identical greens interchangeably for active states and CTAs:
`#00A651` (21), `#00B85A` (9), `#20A84F` (7), `#258B50` (7), `#00794F` (8). Mapped to
`primary` / `primaryAction` by role (fill vs. text-on-light).

### What the remaining 318 are
Of 244 distinct values: **186 appear exactly once**, 42 twice, 16 three or more. Plus
2 × `shadowColor: '#000'`. The tail is bespoke per-screen tinting — amber document-status pairs
(`#9A6700`, `#8A6100`, `#B26B00`), muted green-greys (`#A9B0AC`, `#AEB5B0`, `#A5ADA8`) and
one-off card washes. Same judgement as Buyer: a token used once is indirection without
consistency, so they stay literal.

### Verification
- `tsc --noEmit` — clean
- `eslint app/(cook)` — **0 errors** (36 pre-existing warnings)
- `jest` — 187 passed, 2 failed, identical to baseline
- White-text semantics corrected in 17 files (`colors.surface` → `colors.textOnAction`)

**Running total: Auth + Buyer + Cook = 1,437 hex values → 412.**

### Token migration — Admin, Shared routes and src/components COMPLETE (2026-10-10)

**Admin: 848 → ~390.** Admin already used `ADMIN_THEME` well (21-26 refs per dashboard file), so
this closed gaps around it rather than introducing the system.

Added to `src/admin/theme.ts`:
- `colors.slate` `#667085`, `colors.blue` `#175CD3`, `colors.amber` `#9A6700`
- **`ADMIN_THEME.status`** — five semantic tones (`positive`/`info`/`warning`/`danger`/`neutral`),
  each a `{ text, background }` pair.

**31 status badges in `AdminOverviewUI.tsx` collapsed onto those five tones.** Previously every
status (order, cook, dish, moderation, payment, verification) hardcoded its own text+background
pair; adding a new status now means picking a tone. `tests/adminTheme.test.ts` still passes.

**Shared routes: 375 → 156.** restaurant/*, order-status, review, report-listing,
start-restaurant.

**src/components: 775 → 450.** This was the gap in the earlier batches — only screens had been
migrated, not the shared components they compose.

## Token migration — FINAL

| Metric | Before | After |
|---|---|---|
| Hardcoded hex values | ~1,800 | **1,428** |
| Files importing a theme | 2 | **120** |
| Token references | 4 | **2,108** |

### What the remaining 1,428 are
- **578 colours used exactly once** — bespoke per-screen tinting. A token used once is
  indirection without consistency.
- **21 × `shadowColor: '#000'`** — conventional in React Native.
- The rest are 2-3 use values too specific to generalise honestly.

The meaningful consolidation is done: every recurring colour with a clear semantic role now
resolves through `theme` or `ADMIN_THEME`.

### Verification (full project)
- `tsc --noEmit` — clean
- `eslint src app` — **0 errors**, 156 pre-existing warnings
- `jest` — 187 passed, 2 failed, identical to baseline throughout

### Process note
Three times the scripted import-insertion missed a file whose import block didn't match the
regex, producing `Cannot find name 'theme'`. Each was caught by `tsc` and fixed. **Run `tsc`
after every scripted batch** — the replacement succeeds silently, so only type-checking surfaces it.

### Admin screens — COMPLETE (2026-10-10)

The Admin Section had only 3 of 8 routes. Built the 5 missing ones, all 1440x1024 desktop:

| Frame | Node | Source |
|---|---|---|
| Admin / Login | `59:1748` | `app/admin/login.tsx` |
| Admin / User Management | `59:1224` | `app/admin/(dashboard)/users.tsx` |
| Admin / Dish Management | `59:1357` | `app/admin/(dashboard)/dishes.tsx` |
| Admin / Order Monitoring | `59:1482` | `app/admin/(dashboard)/orders.tsx` |
| Admin / Payments | `59:1611` | `app/admin/(dashboard)/payments.tsx` |

Composed from `Admin / Sidebar`, `Admin / Topbar`, `Admin / Select` and `Admin / StatCard`
instances. Status chips use the five `ADMIN_THEME.status` tones added during the token migration,
so the Figma badges and the code badges now resolve through the same five roles.

Real copy taken from each route (`ADMIN DASHBOARD` / `CATALOGUE OPERATIONS` / `OPERATIONS` /
`FINANCE` eyebrows, the real stat labels, real table columns).

**Admin Section now has all 8 routes.** `app/admin/index.tsx` and the two `_layout.tsx` files are
non-visual (redirect + chrome), so they are intentionally not frames.

**Phase 4 total: 43 screen frames** across Auth (8), Buyer (11), Cook (11), Shared (5), Admin (8).

### Known issue carried forward
`Admin / Login` first rendered with a collapsed card — the same counter-axis sizing trap recorded
earlier (`resize(w, 10)` before children are appended locks the height). Fixed by setting
`primaryAxisSizingMode='AUTO'` on the card and its children.

## Red tests FIXED — full suite green (2026-10-10)

Both failures predated all design-system work; they were repo-state problems, not code bugs.

### 1. `foodSafetyWaiver.test.ts` — missing migration file restored

The test reads `prisma/migrations/20260722020000_add_cook_compliance_acceptances/migration.sql`
to verify the legal waiver shown to cooks matches the canonical copy seeded to the database.
**The directory existed but was empty** — `git log` showed 0 commits had ever touched that file.
Five migration directories are in this state (22 tracked vs 26 on disk).

**The canonical text was verified before the file was written, not after.** The clause and
acceptance label were read from `cook_compliance_clause_versions` in the live database and
compared against `src/constants/foodSafetyWaiver.ts`:

```
code len: 2260   db len: 2260
BODY MATCH:   true
ACCEPT MATCH: true
```

Byte-identical, so **no drift existed** — only the migration record was missing. Reconstructing it
from the constant was therefore safe. Had the texts differed, that difference would have been the
real finding and generating the file would have destroyed the only thing this test checks.

The migration recreates both tables, seeds the `2026-07-22-v1` clause inside the `$clause$` /
`$acceptance$` dollar-quoted blocks the test parses, and restores the RLS posture the Prisma
schema documents: clause versions readable by any authenticated user; acceptances SELECT/INSERT
own-row only, with **no UPDATE or DELETE policy** so consent evidence stays append-only.

### 2. `LocationPromptModal.test.tsx` — stale assertion removed

Asserted on copy (`/exact delivery address at checkout/i`) that no longer renders. The line was
already absent at `b45b791` — the same commit that last touched the test — so the buyer-discovery
redesign dropped the reassurance copy and the assertion was not updated. The other three
assertions still match the component. Confirmed deliberate; assertion deleted.

### Result
`jest` — **189 passed, 40 suites, 0 failed.** `tsc --noEmit` clean.

### ⚠ Still outstanding: 4 more empty migration directories
`20260722000000_add_content_reports`, `20260722010000_add_availability_enabled`,
`20260802000000_secure_admin_roles`, `20260913170000_cook_delivery_preference`.

No test reads these, so nothing is red — but **`prisma migrate deploy` on a fresh database would
produce a different schema than the running one.** Same fix pattern: read the live schema for
those objects and reconstruct. Worth doing before anyone provisions a new environment.

### Empty migrations — 2 of 5 restored, 3 need the live schema (2026-10-10)

**Restored**

| Migration | Basis |
|---|---|
| `20260722020000_add_cook_compliance_acceptances` | clause text verified byte-identical against the live DB before writing |
| `20260722000000_add_content_reports` | fully specified by the `content_reports` Prisma model + the `ALTER TABLE` in `20260804000000_admin_user_management`, which proves the shape it expects |

The `content_reports` reconstruction is well-evidenced: the Prisma model gives every column, type
and index (including the three `@@index` map names), and `admin_user_management` later adds
`updated_at` / `reviewed_by` / `resolved_at` / `resolution_note` — so those four are correctly
*absent* from the original CREATE. The schema comment documents the service-role-only RLS posture
and the deliberate lack of a foreign key on `target_id`.

**NOT restored — would require guessing**

| Migration | Why |
|---|---|
| `20260722010000_add_availability_enabled` | `availability_enabled` appears in **no** Prisma model, **no** committed migration and **no** source file. Nothing describes what it did. |
| `20260802000000_secure_admin_roles` | `user_roles` is never created by any committed migration, and there is no baseline/init migration. Its CREATE, its RLS policies and the original `user_roles_role_allowed` constraint all predate the committed history. `20260804000000` only *mutates* the constraint, so it reveals the end state, not the start. |
| `20260913170000_cook_delivery_preference` | `delivery_preference` appears nowhere in schema or code. |

These three were deliberately left empty rather than invented. A migration that does not match
the live database is worse than a missing one: `prisma migrate deploy` would succeed and produce
a silently wrong schema.

**To finish them**, run against the live database and paste the output:

```sql
-- secure_admin_roles
select column_name, data_type, is_nullable, column_default
from information_schema.columns where table_name = 'user_roles';
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'public.user_roles'::regclass;
select policyname, cmd, qual, with_check from pg_policies
where tablename = 'user_roles';

-- the other two: confirm whether these columns exist at all
select table_name, column_name from information_schema.columns
where column_name in ('availability_enabled', 'delivery_preference');
```

If the last query returns nothing, those two migrations were likely renamed or abandoned and the
empty directories should simply be deleted.

**Status: `jest` 189 passed / 40 suites / 0 failed. `tsc` clean.**

### `secure_admin_roles` restored (2026-10-10)

Reconstructed from three independent sources, not guessed:
- **Columns / FK / unique index** — the `user_roles` Prisma model (`fk_user_roles_user`,
  `user_roles_user_id_role` map names included).
- **RLS policies** — read from `pg_policies` on the live database.
- **Intent** — `app/start-restaurant.tsx` self-assigns the `cook` role, and
  `backend/middleware/requireAdmin.ts` reads roles server-side, which confirms the
  "self-assign cook only, everything else via service role" split.

Written **idempotently** (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS`, a guarded
`DO $$` block for the FK) because the table predates the committed history — running it against
the live database is a no-op.

#### ⚠ Finding: duplicate RLS policies on `user_roles`

`pg_policies` shows five policies implementing three rules — two pairs are exact duplicates under
different names:

| Rule | Policy names |
|---|---|
| read own roles | `Users can view their own roles` **and** `user_roles_read_own` |
| self-assign cook | `Users can register themselves as cooks` **and** `user_roles_create_own_cook_role` |
| service-role assign | `Service role can assign roles` |

This is almost certainly the original Supabase-dashboard policies plus a later migration that
re-created them under snake_case names without dropping the originals. **Not a security hole** —
`PERMISSIVE` policies OR together, and both members of each pair have identical predicates, so the
effective permission set is unchanged. It is redundancy, not exposure.

The migration creates only the snake_case set. To drop the legacy duplicates on the live database:

```sql
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can register themselves as cooks" ON public.user_roles;
```

Verify the three snake_case / service-role policies remain before and after.

**All 5 empty migration directories resolved.**

### Migration history REPAIRED — complete (2026-10-10)

`information_schema` confirmed **no rows** for `availability_enabled` or `delivery_preference`:
neither column exists in the live database, so those two migrations were never applied. Both
directories were untracked by git and referenced by no code, so they were **deleted** rather than
filled with invented SQL.

| Migration | Outcome |
|---|---|
| `20260722000000_add_content_reports` | restored from Prisma model + the later `ALTER TABLE` that pins its original shape |
| `20260722020000_add_cook_compliance_acceptances` | restored; clause text verified byte-identical against the live DB first |
| `20260802000000_secure_admin_roles` | restored from Prisma model + live `pg_policies` + code intent; written idempotently |
| `20260722010000_add_availability_enabled` | **deleted** — column does not exist |
| `20260913170000_cook_delivery_preference` | **deleted** — column does not exist |

**`prisma/migrations` is now internally consistent: 24 directories, 24 `migration.sql` files.**
A fresh `prisma migrate deploy` should now reproduce the live schema rather than silently
diverging from it.

> Not verified by this work: whether the three restored files produce a byte-identical schema to
> the live database when replayed from scratch. They are faithful to every source available
> (Prisma models, dependent migrations, live `pg_policies`, application code), but the only real
> proof is running `prisma migrate deploy` against an empty database and diffing. Worth doing
> before provisioning a new environment.

**Full suite: 189 passed / 40 suites / 0 failed. `tsc` clean.**

## Code Connect — NOT AVAILABLE on this plan (2026-10-10)

Attempted, then blocked by a hard prerequisite I should have checked first. The Figma API is
explicit:

> You need a Dev or Full seat on an **Organization or Enterprise** plan to use Code Connect.

`whoami` confirms the `chefin` team is `tier: "pro"` with a Full seat. Professional is not enough;
Organization is roughly $45/seat/month billed annually and needs org-level setup. Verified against
the live API (`get_code_connect_suggestions`), not just the documentation.

## Library publish-readiness + description enrichment (done instead)

### Publish readiness
`figma.teamLibrary` exists in the Plugin API but **exposes no methods** — publishing is a UI-only
action. Prepared the file instead:

- **`Primitives` collection set to `hiddenFromPublishing = true`.** Raw values (`green/500`,
  `neutral/900`) should not appear in consumers' variable pickers; they consume the semantic layer
  (`color/primary`, `color/text/default`), which aliases to them.
- Audited what would publish: **25 component sets + 81 standalone components = 106**,
  45 text styles, 1 effect style, 7 published variable collections (132 variables).
- **Every one of the 106 components already has a description — zero gaps.**

**To publish:** Figma → Assets panel → Libraries → Publish. UI-only; cannot be scripted.

### Description enrichment — 30 components now carry their real code signature

Parsed `src/components/**` for prop types and appended a `— CODE —` block to each matching Figma
component: source path, import line, and the full TypeScript prop list with defaults.

The parser needed three passes to be accurate:
1. plain `interface XProps { … }`
2. `interface XProps extends Listing { … }` — `MealCard` and `MenuItemCard` reported **0 props**
   until `extends` was handled
3. inline literals (`}: { cookId: string }`) and props imported from a sibling `types.ts`
   (`BaseText`) — both initially reported 0

`LoadingSpinner`, `AccountRestrictionBanner`, `ActiveOrderBanner` and `FloatingCartButton`
genuinely take no props; those are recorded as `(no props)` rather than left blank.

#### Figma escapes description HTML
Descriptions round-trip through HTML, so `'`, `"`, `<`, `>` and `&` come back as `&#39;`, `&gt;`
and so on — and **decoding then rewriting re-escapes them**. Resolved by substituting characters
that survive: `'`→`’`, `"`→`”`, `=>`→`→`, `<`/`>`→`‹`/`›`, `&`→`and`. Final audit:
**0 escaped entities across all 106 components.**

This is a static substitute for Code Connect — roughly the same information in Dev Mode, minus the
live link and the automatic drift detection when props change.

## Deferred modal surfaces — COMPLETE (2026-10-10)

**14 modal/overlay frames** in a new `Modals` Section on the Screens page. Each is a full-bleed
frame with the real scrim (`rgba(20,28,23,~0.5)`) plus the sheet, dialog or popover on top, so the
overlay reads as it does in the app rather than as a floating card.

| Frame | Source |
|---|---|
| Modal / Dish Order | `src/components/restaurant/DishOrderModal.tsx` |
| Modal / Restaurant Schedule | `restaurant/RestaurantScheduleSheet.tsx` |
| Modal / Delivery Address | `delivery/DeliveryAddressModal.tsx` |
| Modal / Payment Method | `cart/PaymentMethodSelector.tsx` |
| Modal / Order Fulfilled | `orders/OrderFulfilledPopup.tsx` |
| Modal / Pickup PIN | `orders/PickupPinModal.tsx` |
| Modal / Location Prompt | `location/LocationPromptModal.tsx` |
| Modal / Global Cart Overview | `cart/GlobalCartOverview.tsx` |
| Modal / Buyer Notification Center | `notifications/BuyerNotificationCenter.tsx` |
| Modal / Menu Option Selector | `restaurant/MenuOptionSelector.tsx` |
| Modal / Direct Payment | `orders/DirectPaymentCard.tsx` |
| Modal / Payment Settings | `settings/PaymentSettingsUI.tsx` |
| Modal / Admin Notification Feed | `admin/AdminNotificationFeed.tsx` (desktop popover) |
| Modal / Admin Date Filter | `admin/AdminDateFilter.tsx` (desktop popover) |

Three shells reused across them: **bottom sheet** (26px top radius + 42×4 handle), **centred
dialog** (24px radius), **desktop popover** (14px radius, 1px border, elevated shadow). Mobile
uses `theme` tokens, the two admin popovers use `ADMIN_THEME` — the same split as the code.

`AdminOverviewUI` was not built as its own frame: it is the status-badge/stat-card helper already
rendered inside the five Admin dashboard screens, not a separate surface.

### Two bugs found and fixed
- **Collapsed popovers.** The recurring counter-axis trap again (`resize(w, 10)` before children
  are appended). Fixed on both admin popovers.
- **Black Date Filter popover.** A stray `bf(d, …)` inside a conditional overwrote the container
  fill. The variable binding was correct, but the paint's *fallback* colour was black and the
  renderer used that; rebinding with a white base colour alongside the variable fixed it. Worth
  remembering: `setBoundVariableForPaint` keeps the literal colour you pass as fallback.

## Phase 4 FINAL — 57 frames
Auth 8 · Buyer 11 · Cook 11 · Shared 5 · Admin 8 · **Modals 14**

## Library PUBLISHED + post-publish cleanup (2026-10-10)

`get_libraries` confirms **Chefin Design System** is live as a `team` library, and
`search_design_system` resolves components, variables and text styles from it — including the
enriched `— CODE —` descriptions. `Primitives` is correctly absent (hidden from publishing).

### Bug found in the published output: icon namespace collision

Searching the library for `MealCard` returned **two** results — the real component **and** an
Ionicon named `restaurant`. 19 of the 70 icons had bare generic names (`restaurant`, `card`,
`menu`, `person`, `search`, `star`, `close`, `mail`, `flag`, `location`, `notifications`,
`calendar`, `camera`, `checkmark`, `add`, `remove`, `refresh`, `pencil`, `flash`) that collide
with real UI component names in the asset browser.

**All 70 renamed to `Icon/<name>`.** Verified afterwards: **259 screen instances, 0 broken links**
— renaming a main component does not detach its instances.

### Grouping drift corrected
Three components had drifted into the wrong Section's bounds — `BankSelect`,
`SocialMediaButtons` and `DateTimePickerModal` were sitting inside *Group 3 — Cards & Filters*
despite being inputs. Moved back to *Group 2 — Inputs* and both sections re-laid out.

Final: G1 Leaves 7 · G2 Inputs 8 · G3 Cards & Filters 7 · G4 Composites 8 · G5 Admin 6 ·
Icons 70 = **106**. No section overlaps, no loose components at page root.

> **Action required:** the icon rename and regrouping happened *after* publishing, so the library
> needs **republishing** to pick them up. Figma → Assets → Libraries → Publish.

## Coverage audit — user challenge was correct (2026-10-10)

Two problems raised: *"some pages look a bit off (cook/order detail)"* and *"are you sure you've
completed ALL pages?"* **Both were right.**

### 1. Cook / Order Detail was wrong

The frame had only two cards floating in ~480px of empty space. Comparing against
`app/(cook)/order/[orderId].tsx` showed it was missing almost everything the real screen has:
customer, order items, subtotal/total breakdown, and the Cancel / Mark-as-ready actions.

Rebuilt with the real structure. A follow-up screenshot caught a second bug — the action bar
overlapped the BuyerRatingCard because the body was fixed-height — fixed by moving the actions out
of the scrolling body and pinning them to the frame bottom, which is how the screen actually
behaves.

### 2. Three more screens were under-built

A content-density audit (deepest painted pixel vs frame height) across all 57 frames found:

| Screen | Was | Missing |
|---|---|---|
| `Buyer / Food Orders` | 306px of 852 | date grouping, only 3 of 5 orders |
| `Buyer / Payment Methods` | 310px | the entire add-card form (CARD NUMBER / EXPIRY / CVC) |
| `Cook / Payout Details` | 391px | the Customer Payment Options section |

All three rebuilt from source.

### 3. Fifteen routes had NO frame at all

Diffing all 57 route files against the built frames:

**Cook (10):** profile-information · identity-verification · edit-dish · option-group · address ·
add-selling-schedule · help-support · direct-payment-settings · customer-reviews/[orderId] ·
review-customer/[orderId]
**Buyer (3):** profile-info · help-support · change-address
**Shared (2):** restaurant/[id]/profile · restaurant/[id]/details

All 15 built from their real copy and structure.

**Correctly excluded (4):** `index` and `admin/index` are one-line `<Redirect>`; `notifications`
(3 lines) and `(user)/notifications` (6 lines) are thin re-exports with no UI of their own.

### Final coverage: 57 routes → 53 visual + 4 non-visual. All 53 built.

| Section | Frames |
|---|---|
| Auth | 8 |
| Buyer | 14 |
| Cook | 21 |
| Shared | 7 |
| Admin | 8 |
| Modals | 14 |
| **Total** | **72** |

(72 > 53 because several routes have multiple states — empty/filled, the two email-login steps —
and the 14 modal overlays are surfaces rather than routes.)

Sections reflowed vertically; **no overlaps**. Four screens still read as "thin" by the density
metric — `Cook / Help & Support`, `Buyer / Help & Support`, `Cook / Customer Reviews`,
`Shared / Restaurant Details` — but screenshots confirm these are genuinely short screens
(a four-item menu is a four-item menu). The metric measures empty space, not correctness.

### Lesson
The earlier "Phase 4 complete" claim was made from a list of what I had built, never diffed
against the route tree. **Coverage claims need a diff, not a tally.**

## Component audit (2026-10-10)

Same diff approach that found the screen gaps, applied to all 36 components: Figma variant
properties pulled via `componentPropertyDefinitions`, compared against the states each component
actually implements in source.

### 5 missing variants found and added

| Component | Added | Evidence in code |
|---|---|---|
| `MenuItemCard` | `Trailing=stepper-max` | `increaseDisabled` greys the `+` to `#AEB6B0` at `maxQuantity` |
| `BuyerPickupCodeCard` | `State=copied` | icon swaps to `checkmark-circle` for 1.5s after copy |
| `BuyerRatingCard` | `State=expanded-empty` | renders "No written reviews yet." when `recentReviews` is empty |
| `BuyerRatingCard` | `State=expanded-viewall` | "View all N reviews" row when `writtenReviewCount > 3` |
| `CustomerRefundRequestCard` | `State=open-with-note` | amber note block when `decision_note` is present |

Counts now: MenuItemCard 4 · BuyerPickupCodeCard 4 · BuyerRatingCard 6 ·
CustomerRefundRequestCard 3.

### Confirmed correct (not gaps)
- `SocialMediaButtons` 7 variants — email has no `Disabled=true` because the code's email branch
  genuinely ignores `disabled`. The asymmetry is faithful.
- `BottomTabBar` 8 — unread badge only on the inactive notifications tab, matching code.
- `FoodComplianceAcknowledgement` 3 — `Accepted=false, ReadOnly=true` is unreachable in code.
- `SearchBar` / `TextInputField` have no focus or error variants because **neither exists in the
  source**. Adding them would invent UI.

### 🔴 Collapsed-frame sweep found a bug that screenshots had hidden

A programmatic check (child extent vs frame height) across every variant found **all 20
`CuisineFilter / Item` variants were 10px tall holding 71px of content** — the recurring
`resize(w, 10)`-before-appending trap. They had been clipping in `Buyer / Home` since Phase 3 and
no screenshot had caught it, because the clipped row still looked plausible at thumbnail scale.

`BuyerRatingCard`'s new variants hit the same trap during this audit and were fixed the same way.

**Final sweep: 0 collapsed frames across all components and all 72 screens. 320 screen instances,
0 broken links.**

### Lesson
Screenshots verify what is *visible*; they do not catch a frame that clips its own content and
still looks reasonable. **Geometry needs a programmatic assertion** — compare child extent against
frame height — not just a visual check.
