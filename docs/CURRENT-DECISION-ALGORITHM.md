# LinkUpGo — Current Decision-Making Algorithm

> Snapshot of how the suggestion pipeline picks venues today, written before the planned rebuild. All claims cite `file:line` so you can jump to source. See [`PROJECT-CONTEXT.md`](PROJECT-CONTEXT.md) for *why* this is being rebuilt.

## Contents
1. [Entry points & request flow](#1-entry-points--request-flow)
2. [Phase 1 — Context synthesis (orchestrator)](#2-phase-1--context-synthesis)
3. [Phase 2 — Candidate sourcing](#3-phase-2--candidate-sourcing)
4. [Phase 3 — AI validation & ranking](#4-phase-3--ai-validation--ranking)
5. [Legacy bucket system (`getSuggestions()` fallback)](#5-legacy-bucket-system)
6. [Geography & neighborhood logic](#6-geography--neighborhood-logic)
7. [Caching layer](#7-caching-layer)
8. [Schema & database](#8-schema--database)
9. [Planner AI (function-calling chat)](#9-planner-ai)
10. [Failure & fallback decision tree](#10-failure--fallback-decision-tree)
11. [Why the owner says it's broken — pinpointed](#11-why-its-broken-pinpointed)
12. [Doc-vs-code drift](#12-doc-vs-code-drift)

---

## 1. Entry points & request flow

### HTTP endpoint
**`POST /api/suggest`** (`server/routes.ts:477`):
1. Parses request via `SuggestRequestSchema` (`shared/api-schemas.ts:30`)
2. Enriches with the authenticated user's profile prefs (`discoveryStyle`, `crowdPreference`, `favoriteNeighborhoods`, `transportationMode`)
3. Builds a single-user `GroupPreferenceSummary`
4. Calls `getOrchestratedSuggestions()` (`server/suggestions.ts:1254`)
5. Maps results to response (with `whyExplanation` per suggestion)

A second endpoint, `POST /api/suggestions` (`server/routes.ts:1279`), exists — appears to be a legacy/alternative entry point (verify before relying on either being the only path).

### Session-level regeneration
When a session is created or participants join, **`regenerateSuggestionsForSession()`** (`server/routes.ts:67`):
1. Fetches active participants + their user profiles
2. Aggregates group prefs (common categories, median budget/energy, merged favorites/neighborhoods) via `aggregateGroupPreferences()`
3. Deletes existing session suggestions
4. Calls `getOrchestratedSuggestions()` with aggregated group prefs
5. Persists results and broadcasts via WebSocket

### Planner integration
The chat planner (`server/planner.ts`) calls **the same primary path** (`getOrchestratedSuggestions`) via its `regenerate_suggestions` tool — there is no separate "lighter" suggestion path for chat-driven regeneration (`server/planner.ts:335`).

### `SuggestRequestSchema` fields (`shared/api-schemas.ts:30-49`)

| Field | Type | Purpose |
|---|---|---|
| `city` | `'NYC'` \| `'Chicago'` | Required |
| `neighborhood` | string? | Starting neighborhood |
| `userLat`, `userLng` | number? | User's current coords |
| `categories` | string[] | E.g. `Drinks`, `Dinner`, `Club` |
| `budget` | `'$'` \| `'$$'` \| `'$$$'` \| `'$$$$'`? | |
| `energy` | `Chill` \| `Vibey` \| `Going out` \| `Full send`? | |
| `timeWindow`, `specificDate`, `specificTime` | string? | When |
| `referenceVenues` | `ReferenceVenue[]?` | Style anchors (1–3) |
| `vibeDescription` | string?, ≤500 chars | Free-text user intent |
| `locationMode` | `near_me` \| `explore_anywhere` \| `meet_in_the_middle` | |
| `midpointLat`, `midpointLng` | number? | Pre-computed group midpoint |
| `discoveryStyle` | `hidden_gems` \| `popular` \| `mixed`? | |
| `crowdPreference` | `quiet` \| `buzzing` \| `no_preference`? | |
| `favoriteNeighborhoods` | string[]? | |

---

## 2. Phase 1 — Context synthesis

### Function
`synthesizeContext()` in `server/orchestrator.ts:44`. **LLM-driven intent analysis** — turns the request into a structured brief that drives Phase 2 API calls.

### Inputs
- `SuggestRequest` — full request
- `GroupPreferenceSummary` — aggregated group prefs
- `DownvoteReasonAggregates?` — historical negative-feedback counts (`tooFar`, `tooExpensive`, `notMyVibe`, `tooCrowded`, `other`)
- `feedbackHistory?` — past venue ratings with tags + review text

### Model & call config (`server/orchestrator.ts:124-130`)
- **Model:** `gemini-2.5-flash-lite` (called via the OpenAI SDK with `AI_INTEGRATIONS_OPENAI_BASE_URL` pointing at Gemini)
- **Temperature:** `0.3` (low randomness)
- **Max tokens:** `800`
- **Response format:** raw JSON in message content (no JSON mode, no function calling — output is parsed by stripping ```json fences and `JSON.parse`)

### System prompt rules (key excerpts, `server/orchestrator.ts:115-122`)
> - For late-night plans (after 9PM) or high-energy vibes ("Going out", "Full send"), AGGRESSIVELY exclude restaurant types. Bars that primarily serve food should be excluded too.
> - For daytime/chill plans, restaurants and cafes are totally fine.
> - If past feedback shows 1-2★ ratings for venues, note what to avoid. If 4-5★, note what to replicate.
> - If downvotes show "tooFar", tighten the radius. If "tooExpensive", lower the budget.
> - The perplexityQuery should be a question a local friend would ask, not a robotic search query.

### Output: `OrchestratorBrief` (`server/orchestrator.ts:16-27`)

```typescript
interface OrchestratorBrief {
  naturalLanguageIntent: string;          // 2-3 sentence description of what the group actually wants
  perplexityQuery: string;                // Web search query for Perplexity
  googlePlacesTypes: string[];            // E.g. ["night_club", "bar"]
  googlePlacesTextQueries: string[];      // E.g. ["speakeasy bars Chicago"]
  excludeTypes: string[];                 // Aggressive exclusions
  vibeKeywords: string[];                 // 3-5 descriptors for validation
  mustBeOpenAt: string | null;            // HH:MM
  maxBudgetLevel: number;                 // 1-4
  preferredNeighborhoods: string[];
  radiusBias: "tight" | "normal" | "wide";
}
```

### Fallback (`buildFallbackBrief`, `server/orchestrator.ts:155`)
Triggered on LLM error or empty response. Maps categories → place types via a static dictionary (`Dinner` → `[restaurant]`, `Cocktails` → `[bar]`, etc.), auto-excludes restaurants for late-night / high-energy, returns no Perplexity query and no text searches. **Quality drop is significant** — Phase 2 Perplexity branch goes silent.

---

## 3. Phase 2 — Candidate sourcing

### Parallel fan-out (`server/suggestions.ts:1301`)
```typescript
const [placesResults, textSearchResults, trendingVenueNames] = await Promise.all([
  fetchGooglePlaces(center, maxRadiusMeters, brief.googlePlacesTypes.slice(0, 5), req.city),
  brief.googlePlacesTextQueries.length > 0 ? fetchGooglePlacesTextSearch(...) : Promise.resolve([]),
  PERPLEXITY_API_KEY ? discoverVenuesFromQuery(brief.perplexityQuery) : Promise.resolve([]),
]);
```

Three sources, run concurrently. Any source can return `[]` without breaking the others.

### A. Google Places — Nearby Search (`fetchGooglePlaces`, `server/suggestions.ts:864`)
- **Endpoint:** `POST https://places.googleapis.com/v1/places:searchNearby`
- **Auth:** `X-Goog-Api-Key` header
- **Field mask:** `places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.websiteUri,places.googleMapsUri,places.primaryType,places.editorialSummary,places.currentOpeningHours`
- **Body:**
  - `includedTypes`: from brief, **sliced to first 5** (quota concern)
  - `locationRestriction.circle`: center + radius (3000m baseline scaled by `radiusBias`)
  - `maxResultCount`: 10

Result construction (`server/suggestions.ts:901-931`): computes Haversine distance from center, parses price level via `priceLevelMap` (`PRICE_LEVEL_INEXPENSIVE` → `$`, etc.), tags with `primaryType` + `includedType`.

### B. Google Places — Text Search (`fetchGooglePlacesTextSearch`, `server/suggestions.ts:1051`)
- **Endpoint:** `POST https://places.googleapis.com/v1/places:searchText`
- **Body:** `textQuery: <query from brief>` + `locationBias.circle`
- **maxResultCount:** 5 per query
- **Filter:** drops invalid types (hotels, schools, hospitals, parking, etc.) at `server/suggestions.ts:1087`

### C. Perplexity (`server/perplexity.ts:42`)
- **Model:** `sonar`
- **Temperature:** `0.2`
- **Max tokens:** `500`
- **Cache:** 5-min LRU
- Workflow: query Perplexity → regex-extract venue names from response (`extractVenueNames`, `server/perplexity.ts:215`) → resolve each name back through Google Places Text Search via `fetchGooglePlacesByName` (`server/suggestions.ts:979`)

So **Perplexity does not directly produce candidates** — it produces names that are then re-fetched via Google Places to get full data.

### Merge → dedupe → filter (`server/suggestions.ts:1324-1360`, `server/orchestrator.ts:201-212`)

1. **Dedupe** by `placeId` OR `title.toLowerCase().trim()` — *no distance check*, so two real venues sharing a name across neighborhoods collapse into one (see §11).
2. **City boundary**: `isWithinCity()` (`server/geo.ts:108`) — Haversine ≤ 35mi (NYC) / 30mi (Chicago) from city center. Strict cutoff.
3. **Transport-mode distance cap** (`getMaxDistanceMiles`, `server/suggestions.ts:64`):
   - `walk` → 1mi, `transit` → 5mi, `car` → 15mi
   - **Most restrictive participant mode wins** for groups
4. **Late-night / high-energy restaurant filter** (`server/suggestions.ts:651-659`) using `looksLikeRestaurant()` (`server/suggestions.ts:205`) — checks tags, title and description for restaurant signals.
5. **Pre-filter on excluded types** (`server/orchestrator.ts:201-212`):
   ```typescript
   const primaryTag = c.tags[0]?.toLowerCase().replace(/ /g, '_') || '';
   return !excludeSet.has(primaryTag);
   ```
   **Only checks the first tag.** A venue tagged `["restaurant", "cocktail_bar"]` is excluded for nightlife requests even if it's primarily a cocktail bar — see §11.

---

## 4. Phase 3 — AI validation & ranking

### Function
`validateAndRankSuggestions()` (`server/orchestrator.ts:194`). Second LLM call — scores and re-orders candidates.

### Model & call config (`server/orchestrator.ts:274-280`)
- **Model:** `gemini-2.5-flash-lite`
- **Temperature:** `0.4`
- **Max tokens:** `1200`

### Prompt structure
Inputs to the LLM: `naturalLanguageIntent`, `vibeKeywords`, `mustBeOpenAt`, `maxBudgetLevel`, `excludeTypes`, `preferredNeighborhoods`, group size, plus a numbered list of candidate summaries (title, tags, rating, review count, price, distance, address, source, opt. description, today's hours).

The LLM is told to (`server/orchestrator.ts:249-271`):
1. Decide INCLUDE / EXCLUDE per candidate (exclude on type mismatch, closed-at-time, vibe mismatch)
2. Rate vibe match 1–10
3. Write a short, casual "why" explanation
4. Select **exactly 5** (or fewer)
5. Prioritize **diversity** (mix well-known + hidden gems, different neighborhoods if possible)

### Output schema
```json
[
  {
    "index": 1,
    "include": true,
    "vibeScore": 9,
    "whyExplanation": "Killer rooftop with DJ sets every Saturday — exactly the vibe you're after"
  }
]
```

### Post-processing (`server/orchestrator.ts:296-311`)
- Filter to `include: true`, sort by `vibeScore` desc, take top 5
- Map back to `SuggestionOption`, set `score = vibeScore * 10`
- **`generationType` assignment:**
  - `vibeScore >= 8` → `"safe"`
  - `vibeScore >= 5` → `"explore"`
  - else → `"wildcard"`
- Note: this `generationType` label is **derived from the LLM's vibe score**, not from candidate sourcing — it's purely a UI/categorization tag

### Fallback if LLM ranking fails (`fallbackRank`, `server/orchestrator.ts:332-349`)

```typescript
const sorted = (filtered.length > 0 ? filtered : candidates)
  .sort((a, b) => parseFloat(b.rating || "0") - parseFloat(a.rating || "0"))
  .slice(0, 5);
```

**Just sorts by rating, returns top 5.** This is one of the loudest sources of "popular bias" when Phase 3 fails — see §11.

---

## 5. Legacy bucket system

When `getOrchestratedSuggestions` decides to use the legacy path (or Phase 3 falls all the way through), **`getSuggestions()`** (`server/suggestions.ts:533`) provides bucket-based selection.

### Bucket parameters (`server/suggestions.ts:244-266`)

| Bucket | minRating | minReviewCount | radiusMultiplier | allowAdjacentCategories | base count |
|---|---|---|---|---|---|
| **SAFE** | 4.4 | 50 | 1.0 | false | 2 |
| **EXPLORE** | 3.8 | 0 | 1.25 | true | 2 |
| **WILDCARD** | 3.5 | 0 | 1.3 | true | 1 |

### Discovery-style adjustments (`server/suggestions.ts:269-282`)

| `discoveryStyle` | safe | explore | wildcard |
|---|---|---|---|
| `hidden_gems` | 1 | 3 | 1 |
| `popular` | 3 | 1 | 1 |
| `mixed` (default) | 2 | 2 | 1 |

### Review-count thresholds (`server/suggestions.ts:285-297`)

| `discoveryStyle` | `safeMin` | `exploreMax` |
|---|---|---|
| `hidden_gems` | 20 | 150 |
| `popular` | 100 | 500 |
| `mixed` | 50 | 200 |

### SAFE bucket scoring (`server/suggestions.ts:694-717`)

```
baseScore = (rating * 10) + min(10, reviewCount / 50)

bonuses:
  +5  if matches reference profile type
  +3  if address contains a favorite neighborhood (case-insensitive substring)
  +matchesCrowdPreference()         (-2 to +5)
  +scoreTimeAppropriateness()       (up to +20, can be negative)
```

### EXPLORE bucket scoring (`server/suggestions.ts:750-764`)

```
noveltyScore = 100 - min(100, reviewCount / 2)   // strongly favors low-review venues

bonuses:
  +20 if address contains a favorite neighborhood
  +matchesCrowdPreference()
  +scoreTimeAppropriateness()
```

### WILDCARD (`server/suggestions.ts:789-790`)
Random shuffle of qualifying candidates — explicit variety injection.

### Crowd preference (`matchesCrowdPreference`, `server/suggestions.ts:324-332`)

```typescript
estimateCrowdLevel(opt):
  reviewCount > 500 || tagsLikeClubBarRooftop  → 'buzzing'
  reviewCount < 100 || tagsLikeCafeMuseumPark → 'quiet'
  else → 'unknown'

return level === pref ? +5 : (level === 'unknown' ? 0 : -2)
```

### Time-appropriateness (`scoreTimeAppropriateness`)
For late-night / high-energy plans:
- `+20` if `night_club`
- `+12` if `bar` (and not restaurant-like)
- `+10` if Perplexity-tagged ("trending")
- `-25` if restaurant-like AND late-night
- `-10` if both bar AND restaurant-like AND late-night

### Downvote learning (`getAdjustedBucketParams`, `server/suggestions.ts:361`)

```typescript
if (downvoteReasons.tooFar >= 2 && bucketType !== 'safe') {
  adjusted.radiusMultiplier = Math.max(1.0, adjusted.radiusMultiplier - 0.15);
}
if (downvoteReasons.tooExpensive >= 2) {
  adjusted.minRating = Math.min(4.5, adjusted.minRating + 0.2);   // weirdly tightens *rating*, not budget
}
```

Also affects `matchesBudget()` (`server/suggestions.ts:390`) — when 2+ "tooExpensive" downvotes, it stops allowing upgrades from requested tier.

### Reference-venue style anchoring
When `referenceVenues` are provided:
1. **Fetch venue details** (`fetchVenueDetails`, `server/suggestions.ts:425`)
2. **Extract profile** (`extractReferenceProfile`, `server/suggestions.ts:471`):
   - `preferredPriceTier` — average price level
   - `priceTolerance` — spread
   - `preferredTypes` — top types by frequency
   - `qualityFloor` — `avgRating - 0.5`
   - `energyBias` — `day` / `night` / `mixed` from opening hours
   - `hasConflicts` — true if big price/type spread

3. SAFE bucket then uses `minRating = max(safeParams.minRating, refProfile.qualityFloor)` and gives a +5 bonus for `preferredTypes` matches.

### Location-mode effects
- `near_me`: `getSearchCenter(city, neighborhood, userLat, userLng)` (`server/geo.ts:93`)
- `explore_anywhere`: center = city center, `radiusBiasMultiplier = 2.0` (`server/orchestrator.ts:1287-1288` area)
- `meet_in_the_middle`: center = pre-computed midpoint (`computeMidpoint`, `server/geo.ts:132`, 3D-Cartesian average)

### Final composite score (`scoreAndRank`, `server/suggestions.ts:940`)

```
score = 30                                    // baseline
      + max(0, 20 - distance*4)               // proximity
      + max(0, 15 - budgetDiff*5)             // budget match
      + rating * 3                            // rating
      + min(10, reviewCount / 100)            // review confidence
      + scoreTimeAppropriateness()            // time/energy fit
```

---

## 6. Geography & neighborhood logic

### Constants (`server/geo.ts`)

**City centers (line 6-9):**
- NYC: `(40.7580, -73.9855)`
- Chicago: `(41.8781, -87.6298)`

**Neighborhoods (lines 11-73):**
- **NYC: 27** entries (Manhattan, Midtown, UES, UWS, Chelsea, West Village, East Village, Greenwich Village, SoHo, Tribeca, LES, FiDi, Harlem, Brooklyn Heights, Williamsburg, Bushwick, Greenpoint, DUMBO, Park Slope, Cobble Hill, Carroll Gardens, Prospect Heights, Crown Heights, Fort Greene, Astoria, LIC, Flushing)
- **Chicago: 31** entries (The Loop, River North, Gold Coast, Old Town, Lincoln Park, Lakeview, Boystown, Wrigleyville, Wicker Park, Bucktown, Logan Square, Ukrainian Village, West Loop, Fulton Market, Streeterville, Magnificent Mile, South Loop, Pilsen, Hyde Park, Bronzeville, Chinatown, Bridgeport, Rogers Park, Uptown, Andersonville, Ravenswood, Albany Park, Irving Park, Humboldt Park, Garfield Park, Near North Side)

### Lookup (`getNeighborhoodCenter`, `server/geo.ts:75-87`)
Strict lowercase exact-match against the table. **No fuzzy matching, no normalization, no reverse geocoding.** A user's `favoriteNeighborhoods` value of `"East Village, NYC"` or `"east village"` works (lowercased), but `"E Village"` or `"NoLita"` (not in list) returns `null` — silently falls back to city center.

### Search center priority (`getSearchCenter`, `server/geo.ts:93-106`)
`userLat/userLng` → `neighborhood` lookup → city center.

### City boundary (`isWithinCity`, `server/geo.ts:108-114`)
Haversine ≤ 35mi NYC / 30mi Chicago. Hard cutoff.

### Distance (`haversineDistance`, `server/geo.ts:116-126`)
Standard great-circle, R = 3959 miles.

### Midpoint (`computeMidpoint`, `server/geo.ts:132+`)
Per-point lat/lng → 3D Cartesian (x,y,z) → average → back to lat/lng. Correctly handles non-trivial groupings on a sphere (better than naive lat/lng mean).

---

## 7. Caching layer

### Implementation (`server/cache.ts:18-110`)
LRU + stale-while-revalidate. An entry is "stale" once `Date.now() > expiresAt - (ttlMs * 0.2)` (last 20% of TTL). Stale data is returned immediately while a background revalidation fires.

### Cache instances

| Cache | TTL | Max size | SWR |
|---|---|---|---|
| `suggestionsCache` (`server/cache.ts:126`) | 10 min | 200 | yes |
| `placesCache` (`server/cache.ts:132`) | 15 min | 300 | yes |
| `eventsCache` (`server/cache.ts:138`) | 5 min | 100 | yes |
| `perplexityCache` (`server/perplexity.ts:8`) | 5 min | 50 | n/a |

### Suggestion cache key
Built from: `city`, `neighborhood`, `categories`, `budget`, `energy`, `timeWindow`, `specificDate`, `discoveryStyle`, `crowdPreference`, `favoriteNeighborhoods`. Keys are normalized (`normalizeKey`, `server/cache.ts:112`) so order doesn't matter.

**Important:** `userLat/userLng` is **not in the cache key** — two users in different parts of the city sharing all other params will share a cached response.

---

## 8. Schema & database

### Tables that drive suggestion logic

**`users` (`shared/schema.ts:11`)** — preference inputs:
- `discoveryStyle`, `crowdPreference`, `favoriteNeighborhoods`, `transportationMode`, `budget`, `energyLevel`, `categories`, `hardNos`

**`suggestions` (`shared/schema.ts:113`)** — pipeline output:
- Stored per session: `name`, `city`, `source`, `kind`, `rating`, `distance`, `budget`, `description`, `tags`, `whyExplanation`, plus URL fields

**`votes` (`shared/schema.ts:142`)** — feedback signal IN:
- `voteType` (`up` / `down`)
- `reasons` (text[]): `tooFar`, `notMyVibe`, `tooExpensive`, `tooCrowded`, `other`
- `note` — free-text (currently not used by the algorithm)

**`event_feedback` (`shared/schema.ts:218`)** — post-event signal IN:
- `rating` (1–5), `tags`, `wouldRecommend`
- Aggregated by venue name via `getVenueAverageRating()`

**`session_participants` (`shared/schema.ts:99`)** — group context:
- `startingNeighborhood` — for `meet_in_the_middle` midpoint computation

### Data flow into the orchestrator
- `votes` → `DownvoteReasonAggregates` → `synthesizeContext` (Phase 1 prompt)
- `event_feedback` → `feedbackHistory` → `synthesizeContext` (Phase 1 prompt)
- Both are **only read into the LLM prompt as text** — they don't programmatically alter scoring in the orchestrator path. (They do alter bucket params in the legacy path via `getAdjustedBucketParams`.)

---

## 9. Planner AI

`server/planner.ts` — the in-app chat agent that responds when users `@Planner` in session chat.

### Tools (`server/planner.ts:18-102`)

| Tool | Args | Effect |
|---|---|---|
| `regenerate_suggestions` | `categories?`, `budget?`, `neighborhood?`, `locationMode?` | Deletes existing session suggestions, calls `getOrchestratedSuggestions()` with new filters, persists up to **8** results (`server/planner.ts:356`) |
| `add_suggestion` | `name`, `description`, `kind`, `budget?`, `tags?` | Creates one manual suggestion in the session |
| `remove_suggestion` | `suggestionName` | Substring-match delete |

### Model & flow
- **Model:** `gemini-2.5-flash-lite`
- **Tool choice:** `auto`
- **Max tokens:** 500 (initial) / 150 (post-tool stream)
- Two API calls when a tool fires: first decides whether to call a tool, second streams a brief confirmation back to the user
- Conversation history: last 10 non-system messages

### System prompt highlights (`server/planner.ts:200-252`)
- Builds per-participant summary including `discoveryStyle`, `crowdPreference`, `favoriteNeighborhoods`
- Aggregates group prefs via `aggregateGroupPreferences()` for "consensus" `discoveryStyle` / `crowdPreference`
- Includes user's **past feedback history** (with tags + reviews) and an explicit "MEMORY INSIGHTS" block — but again this is only LLM context, not algorithmic input
- Hard rule: when asked to refresh suggestions, **must** call the tool, never list venues in chat text

### One inconsistency to flag
The planner cap is **8 results** (`server/planner.ts:356`), but the orchestrator returns at most **5** (`server/orchestrator.ts:299`). So the `slice(0, 8)` is a no-op today — a leftover from when the orchestrator returned more.

---

## 10. Failure & fallback decision tree

```
POST /api/suggest  (or session regeneration)
        │
        ▼
getOrchestratedSuggestions()                              [server/suggestions.ts:1254]
        │
        ▼
Phase 1: synthesizeContext()  [Gemini]
        ├─ ✅  →  OrchestratorBrief
        └─ ❌  →  buildFallbackBrief()  (no Perplexity, no text searches, generic types)
        │
        ▼
Phase 2: Promise.all([
    fetchGooglePlaces,                ← any single source can return [] safely
    fetchGooglePlacesTextSearch,
    discoverVenuesFromQuery (Perplexity)
  ])
        │
        ▼
Pre-filter:
    • dedupe (placeId or lowercased title) ← LOSSY
    • isWithinCity (35mi NYC / 30mi Chicago)
    • transport-mode distance cap (1 / 5 / 15 mi)
    • late-night restaurant filter
    • exclude primary tag ← ONLY TAG[0]
        │
        ▼
Phase 3: validateAndRankSuggestions()  [Gemini]
        ├─ ✅  →  top-5 ranked, scored, generationType assigned
        └─ ❌  →  fallbackRank()  (sort by rating desc, top 5)
        │
        ▼
Response (≤ 5 SuggestionOption)
```

The legacy bucket system (`getSuggestions`) is reachable from session-creation paths and from places where `getOrchestratedSuggestions` is not used. Within the orchestrator path itself, the deepest fallback is the by-rating sort in Phase 3 — not the bucket system.

---

## 11. Why it's broken — pinpointed

The four pain points the owner named, mapped to specific lines.

### "Over-favors popular places"

1. **SAFE bucket dominance + thresholds** (`server/suggestions.ts:244-266`) — default `mixed` style returns 2 SAFE + 2 EXPLORE + 1 WILDCARD; SAFE requires `rating ≥ 4.4` *and* `reviewCount ≥ 50`. New venues (any rating) are structurally absent from SAFE.

2. **Review-count weighting in scoring** (`server/suggestions.ts:695`):
   ```
   baseScore = (rating * 10) + min(10, reviewCount / 50)
   ```
   A venue with 500+ reviews gets a flat +10. A 4.6★ place with 75 reviews gets ~+1.5. Even with identical ratings, the well-trodden place wins by ~8 points.

3. **Final composite also rewards reviews** (`scoreAndRank`, `server/suggestions.ts:940` area):
   ```
   ... + min(10, reviewCount / 100)
   ```
   Another up-to-+10 for review count, on top of the bucket base score.

4. **Phase 3 LLM fallback is pure rating sort** (`server/orchestrator.ts:340-345`) — when the LLM ranking fails, popularity is the *only* signal that survives.

5. **EXPLORE bucket review cap is restrictive** — even `hidden_gems` caps at 150 reviews (`server/suggestions.ts:289`). Solid mid-tier spots (200–500 reviews) often fall through both buckets.

### "Skips a lot of venues"

1. **Pre-filter only checks `tags[0]`** (`server/orchestrator.ts:204-207`):
   ```typescript
   const primaryTag = c.tags[0]?.toLowerCase().replace(/ /g, '_') || '';
   return !excludeSet.has(primaryTag);
   ```
   A cocktail-bar tagged `["restaurant", "cocktail_bar"]` (because Google's `primaryType` is `restaurant`) gets dropped for nightlife requests despite being a perfect match.

2. **Late-night restaurant filter** (`server/suggestions.ts:651-659`) is whole-venue rejection, not a soft penalty. Upscale cocktail lounges that happen to serve food disappear entirely.

3. **Dedupe by title alone** (`server/orchestrator.ts:1362-1368`) — two distinct venues with the same name in different boroughs collapse into one. No coordinate or address check.

4. **Transport-mode caps are aggressive** for `walk` (1mi) and `transit` (5mi) (`server/suggestions.ts:64`). Most-restrictive participant wins for groups, so one transit-only member shrinks results for everyone.

5. **Hard city-radius cutoff** (`server/geo.ts:108-114`). A venue 35.1mi from NYC center is excluded with no graceful degradation.

6. **`includedTypes` capped at 5** (`server/suggestions.ts:864` area) for Google Places nearby search to manage quota. The brief can request 6+ types; the tail is dropped.

### "Neighborhood mapping is weak"

1. **Static hardcoded lookup** — 27 NYC + 31 Chicago neighborhoods (`server/geo.ts:11-73`). Notable misses: NoLita, Battery Park City, Murray Hill, Hell's Kitchen (NYC); Edgewater, Jefferson Park, Lincoln Square (Chicago). Anything missing → silently returns `null` → falls through to city center.

2. **No fuzzy matching** (`getNeighborhoodCenter`, `server/geo.ts:75-87`) — strict lowercase equality. `"E Village"`, `"East Village, NY"`, `"Williamsburg Brooklyn"` all fail.

3. **No reverse geocoding** — `userLat/userLng` is used as a search center but never resolved to a *neighborhood name*. The system can't say "you're in Bushwick" without it being typed.

4. **Favorite-neighborhood "boost" is a fragile substring match** (`server/suggestions.ts:707`, `:754`) against the venue's `address` string. `address = "119 Avenue A, New York, NY"` does *not* contain `"East Village"`, so a venue that's literally in East Village gets no boost.

5. **No neighborhood similarity / semantic affinity** — loving SoHo doesn't lift Nolita or Tribeca. Each neighborhood is a string, not a concept.

6. **`preferredNeighborhoods` from the brief is just echoed input** (`server/orchestrator.ts:189`):
   ```typescript
   preferredNeighborhoods: req.favoriteNeighborhoods || [],
   ```
   The LLM is told to "prioritize" them but doesn't reason about *why* or about adjacent areas.

### "Feels generic"

1. **`whyExplanation` is post-hoc, not predictive** — the LLM writes the "why" in Phase 3 *after* selection (or `generateWhyExplanation` builds it from tags in the legacy path, `server/suggestions.ts:1139` area). Personalization is text-layer only; the *picks* aren't personalized.

2. **No diversity enforcement, only diversity *advice*** — Phase 3's prompt says "prioritize DIVERSITY" (`server/orchestrator.ts:269`), but the post-processing just sorts by `vibeScore` and slices the top 5 (`server/orchestrator.ts:298`). If the LLM gives 5 high scores to 5 bars in River North, that's what ships.

3. **Reference venues drive *filters*, not similarity** (`extractReferenceProfile`, `server/suggestions.ts:471`) — output is a price tier + type set + quality floor + energy bias. Nothing infers "user likes downtown / artsy / walkable" or recommends similar *neighborhoods*.

4. **Time-appropriateness is binary-ish** — a cocktail bar opening at 5pm scores the same as a 2am club for a "going out at 9pm" request unless it gets explicitly pruned. Gradient missing.

5. **`event_feedback` rarely shapes scoring** — the orchestrator pipes `feedbackHistory` into the prompt as text, leaving it to the LLM to interpret. The legacy path uses `getVenueAverageRating()` only at the venue-name level, never to similar-venue inference. There's no real preference model being learned.

6. **Cache key omits user identity** (`server/cache.ts:126` area) — within a 10-minute window, two users in the same city / category / budget / mode get the same cached suggestions even if their feedback histories differ.

---

## 12. Doc-vs-code drift

Notes for anyone trusting `replit.md` or `CLAUDE.md` over the code:

- **`replit.md`** says crowd preference gives "+5 points" with "slight penalty for mismatches (-2 points)" — code matches this (`server/suggestions.ts:330-331`), but doesn't distinguish quiet from buzzing magnitude.
- **`replit.md`** says favorite neighborhoods give "+3 SAFE / +20 EXPLORE" — code matches (`server/suggestions.ts:707, :754`), but only when the neighborhood name appears as a substring in the venue address (often it doesn't — see §11).
- **`replit.md`** describes the orchestrator as the "primary path" — true in `getOrchestratedSuggestions`, but session creation and some routes still go through `getSuggestions()` (legacy bucket). Not all paths are LLM-driven.
- The **planner's `slice(0, 8)`** result cap (`server/planner.ts:356`) suggests it once received >5 results from the orchestrator, but today the orchestrator hard-caps at 5 (`server/orchestrator.ts:299`). The 8 is dead code.
- `proposed_times` table exists in schema but **the proposed-times feature was removed from UI**; users coordinate via chat (per `replit.md`). Don't build on it without confirming.

---

## Quick navigation

- Start of orchestrator path: `server/suggestions.ts:1254`
- Phase 1 prompt: `server/orchestrator.ts:82-122`
- Phase 3 prompt: `server/orchestrator.ts:234-272`
- Phase 3 fallback (popularity sort): `server/orchestrator.ts:332-349`
- Bucket params: `server/suggestions.ts:244-266`
- Discovery counts: `server/suggestions.ts:269-282`
- Crowd preference scoring: `server/suggestions.ts:324-332`
- Downvote learning: `server/suggestions.ts:361`
- Reference-venue profiling: `server/suggestions.ts:471`
- Final scoring: `server/suggestions.ts:940`
- Neighborhoods table: `server/geo.ts:11-73`
- Planner tools: `server/planner.ts:18-102`
- Cache TTLs: `server/cache.ts:126-138`
