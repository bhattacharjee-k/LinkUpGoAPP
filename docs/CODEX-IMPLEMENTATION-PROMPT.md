# Codex Implementation Prompt — Suggestions Rebuild (Phase 1+)

> **You are Codex, implementing a backend-first rebuild of LinkUpGo's suggestion system.**
> Work **one chunk at a time, in order.** For each chunk: implement → run `npm run check` and
> `npm test` → write/extend unit tests → make both pass → STOP and report. Do **not** start the next
> chunk until the current one is green. Do **NOT** do integration testing or end-to-end manual testing —
> that is handled separately by the human + a reviewing agent after you finish.

## Required reading before you start

Read these in the repo for full design rationale (do not re-derive decisions — they're settled):
- `docs/PROJECT-CONTEXT.md` — why the rebuild, live-system constraints.
- `docs/SQUAD-LEARNING-DESIGN.md` — squad model, per-member constraints, soft/hard rules, anonymity.
- `docs/ENERGY-LEVELS.md` — the Night Intensity Index (NII), bands, calibration.
- `CLAUDE.md` — build/test commands, architecture, conventions.
- Existing pipeline: `server/suggestions.ts`, `server/orchestrator.ts`, `server/orchestrator/` (v2),
  `server/geo.ts`, `shared/schema.ts`, `shared/api-schemas.ts`.

## Global guardrails (apply to EVERY chunk)

1. **Tests are mandatory.** After each chunk, `npm run check` (tsc) **and** `npm test` (Vitest) must pass.
   Put tests in `tests/shared/`, `tests/server/`, `tests/client/` matching existing layout.
2. **Additive & flag-gated.** Do not change the suggestion API **response shapes** — web (session cookies)
   and mobile (JWT, on TestFlight) both consume them. New request fields must be **optional** (backward compatible).
   Route behavior changes through the existing `SUGGESTIONS_PIPELINE` flag or a new clearly-named flag.
3. **NII is internal-only.** Never expose the raw NII number in any user-facing response or UI string.
   UI speaks in band names ("Chill/Vibey/Going out/Full send") and plain descriptions.
4. **DB safety.** Schema changes use Drizzle + a generated migration applied to **dev only**
   (`db:neon:push:dev` or local Docker on port 5434). **NEVER** run `db:neon:push:prod` or any prod script.
5. **Don't commit or push** unless explicitly asked. Leave changes in the working tree.
6. **Match conventions.** TypeScript, path aliases `@/*` and `@shared/*`, existing error classes
   (`server/middleware/error-handler.ts`), `devLog` for logging. No new linter; no new heavy deps without need.
7. **Per chunk, report:** files changed, what each does, test names added, `check`/`test` output summary,
   and anything you had to assume. Then STOP.

## Phasing overview

| Phase | Chunks | Risk | Notes |
|---|---|---|---|
| **1 — Backend foundations** | 1.1 energy · 1.2 venue features · 1.3 travel | Low (additive, in-memory, mocked APIs) | Pure modules + unit tests, no DB, no UI |
| **2 — Pipeline & aggregation** | 2.1 wire into v2 · 2.2 group aggregation · 2.3 schema | Medium | Behind `=v2` flag; optional DB fields |
| **3 — Learning** | 3.1 squad-history signal | Medium | Planner-reads-history (no ML) |
| **4 — Frontend** | 4.1 per-member capture · 4.2 squad-first entry · 4.3 anonymized reconciliation | Higher | Touches live UI — smallest, last |

---

# PHASE 1 — Backend foundations

## Chunk 1.1 — Energy / NII single source of truth

**Goal:** one canonical module for energy levels + the Night Intensity Index, replacing the scattered
`isHighEnergy` logic and fixing the broken energy-averaging in `routes.ts`.

**Files:** new `shared/energy.ts`; refactor call-sites in `server/suggestions.ts`,
`server/orchestrator.ts`, `server/orchestrator/grounded_synthesis.ts`, `server/planner.ts`,
`server/orchestrator/judges/vibe.ts`, `server/group-preferences.ts`, `server/routes.ts`.

**Implement (`shared/energy.ts`):**
- `export type EnergyLevel = 'Chill' | 'Vibey' | 'Going out' | 'Full send'` (keep order canonical).
- `ENERGY_BANDS`: each level → `{ rank, niiLo, niiHi, anchor }` with cutoffs **0–25 / 25–50 / 50–78 / 78–100**
  and the anchor copy from `ENERGY-LEVELS.md`.
- `NII_WEIGHTS = { spend: 0.20, lateness: 0.30, intensity: 0.30, crowd: 0.20 }`.
- `nii(features: {spend:number; lateness:number; intensity:number; crowd:number}): number` — each input
  normalized 0–1, returns 0–100.
- `bandForNii(nii: number): EnergyLevel`.
- `niiRangeForLevel(level: EnergyLevel): {lo:number; hi:number}` and `niiCenterForLevel`.
- `aggregateEnergy(levels: EnergyLevel[]): { target: EnergyLevel; spread: [EnergyLevel, EnergyLevel] }`
  — **ordinal median** (NOT a numeric average), plus min/max for the spread.
- Keep a thin `isHighEnergy(level)` helper (`rank >= 3`) so existing call-sites can swap to it for parity.

**Refactor:** replace local `isHighEnergy`/energy strings in the listed server files to import from
`@shared/energy`. In `server/routes.ts` (the group-energy averaging around line 87), **delete the broken
`['Chill','Vibey','Hype']` scale** and use `aggregateEnergy` on the canonical 4-level scale.

**Unit tests (`tests/shared/energy.test.ts`):** band boundary cases (0, 25, 50, 78, 100), `nii()` math for
known feature vectors, `bandForNii` mapping, `aggregateEnergy` median + spread (incl. ties), and a
regression test proving `'Full send'`/`'Going out'` no longer map to index −1 (the old bug).

**Done when:** module exists, all listed files import from it, `check` + `test` green, no response-shape change.

## Chunk 1.2 — Venue feature vector + NII(venue)

**Goal:** compute reusable per-venue features and the venue's NII, cached in memory (mirror the existing
`Map` cache pattern in `suggestions.ts`). Cheap features fully; expensive ones via a clean upgradeable interface.

**Files:** new `server/venue-features.ts`. (No DB this chunk — in-memory cache keyed by `placeId`.)

**Implement:**
- `interface VenueFeatures { spend:number; lateness:number; intensity:number; crowd:number; distinctiveness?:number }`
  (all 0–1).
- `spend` from Google `priceLevel` ($=.0, $$=.33, $$$=.66, $$$$=1).
- `lateness` from opening-hours text: parse closing time → normalize (closes ≤10pm = 0 … open ≥3am = 1).
  Handle "Open 24 hours", past-midnight ("until 2:00 AM"), and missing hours (default mid).
- `intensity` and `crowd`: **heuristic stubs now** with a documented interface to upgrade to NLP later —
  `crowd` from `userRatingCount` (normalized, log-scaled), `intensity` from venue type + `editorialSummary`
  keywords (club/lounge/dance → high; cafe/wine bar/bookstore → low). Mark with `// TODO: upgrade to review-NLP`.
- `computeVenueFeatures(place): VenueFeatures` + `venueNii(features)` using `@shared/energy`.
- In-memory cache `Map<placeId, {features, ts}>` with TTL; `getVenueFeatures(place)` checks cache first.

**Unit tests (`tests/server/venue-features.test.ts`):** lateness parser across formats (incl. 24h,
past-midnight, missing), spend mapping, full `venueNii` for a dive-bar-like vs megaclub-like input
(assert the megaclub scores ≫ the dive bar), cache hit returns same object.

**Done when:** module + tests green. Not yet wired into the pipeline (that's 2.1).

## Chunk 1.3 — Proximity / travel module

**Goal:** per-member travel **tolerance + strain** reachability using travel **time**, with the external
routing call **mocked/injected** (no network in tests), an in-memory cache, and a Haversine fallback.
Replaces the `getMaxDistanceMiles` "most-restrictive single cap" approach.

**Files:** new `server/travel.ts` (reuse `server/geo.ts` for neighborhood centroids + Haversine).

**Implement:**
- Types: `Mode = 'walk'|'transit'|'car'`; `Member = { origin: LatLng | neighborhood; mode: Mode; toleranceMin: number }`.
- Default tolerances per mode (e.g., walk 20, transit 30, car 45) — overridable.
- `resolveOrigin(member, city)` → `LatLng` (centroid if neighborhood).
- `prefilterRadiusMiles(member)` — convert tolerance-minutes to a rough per-mode distance for the cheap cut.
- **Routing via an injected interface** `RouteMatrixProvider` so it's testable:
  `getEtas(origins, mode, destinations, departBucket): Promise<number[][]>` (seconds).
  Provide a real `GoogleRoutesProvider` (calls Routes API `computeRouteMatrix`; transit may need per-leg
  `computeRoutes` or the Distance Matrix API — gate on `GOOGLE_*` key; **do not** hit network if key absent)
  and a `HaversineFallbackProvider` (distance ÷ per-mode speed). Auto-fallback on error/no-key.
- `strain(etaSec, toleranceMin)` = `etaSec / (toleranceMin*60)`.
- `travelScore(members, venue)` → `{ score, perMember: [{name, etaMin, strain}], maxStrain }`,
  where `score = 1 - maxStrain` (plus a small balance bonus); reachability **outer** gate only when
  `maxStrain` exceeds a hard physical bound (e.g., 2.0). Soft otherwise.
- In-memory cache keyed by `(originKey, mode, departBucket, placeId)`.

**Unit tests (`tests/server/travel.test.ts`):** strain math, `travelScore` picks lower-max-strain venue
over lower-average-eta venue (fairness), Haversine fallback when provider throws, tolerance→radius,
cache hit. Use a **fake `RouteMatrixProvider`** — never call Google in tests.

**Done when:** module + tests green; nothing wired into the live pipeline yet.

---

# PHASE 2 — Pipeline & aggregation

## Chunk 2.1 — Wire NII + travel + soft-budget into v2 ranking

**Goal:** make the **v2** pipeline (`SUGGESTIONS_PIPELINE=v2` only) use venue features, NII-match,
travel strain, and **soft** budget as scoring terms. v1/default path unchanged.

**Files:** `server/orchestrator/v2.ts`, `server/orchestrator/preprocess.ts`,
`server/orchestrator/diversity.ts`, possibly a new `server/orchestrator/score.ts`.

**Implement:**
- In preprocess, attach `VenueFeatures` + `venueNii` to each candidate (via Chunk 1.2).
- Add soft scoring terms to ranking: **NII-match** (penalty ∝ distance from group target NII band),
  **travelScore** (Chunk 1.3, soft), **soft-budget** (penalty for exceeding the group's comfort tier,
  *offset by venue quality/distinctiveness* — NOT a hard filter). Reachability hard gate only at the outer bound.
- Keep everything behind the `=v2` flag. **No response-shape change.**

**Unit tests:** scoring-term functions in isolation (NII-match penalty, soft-budget penalty offset by quality,
travel term). Mock candidates; do not call external APIs.

**Done when:** v2 ranking uses the new terms, tests green, v1 untouched.

## Chunk 2.2 — Group aggregation: anonymity, ordinal energy, soft budget, travel strain

**Goal:** combine per-member inputs into the group's targets per the agreed rules.

**Files:** `server/group-preferences.ts` (+ wherever group prefs are assembled for the pipeline).

**Implement:**
- **Energy:** `aggregateEnergy` (ordinal median + spread) from Chunk 1.1. Never average.
- **Budget:** soft comfort center (e.g., the modal/lower comfort tier) — **not** a hard floor; expose it as a
  target + tolerance, not a cap.
- **Travel:** group is satisfied when each member's strain ≤ 1 (soft); surface `maxStrain` + who.
- **Anonymity:** the returned group summary must be **non-attributed** for budget/energy
  (counts/ranges only, never "userX picked Y"). Travel logistics MAY be per-member (it's logistics, not preference).
- Add a typed `GroupAggregate` returned for the pipeline + (later) UI.

**Unit tests:** median energy + spread, soft-budget comfort selection, anonymity (assert no user IDs/names in
the budget/energy summary), travel strain rollup.

## Chunk 2.3 — Schema additions (dev migration only)

**Goal:** persist the new per-member + squad fields. **Additive, optional, dev-only migration.**

**Files:** `shared/schema.ts`, `shared/api-schemas.ts`, generated Drizzle migration.

**Implement:**
- Session participant: add optional `startingPoint` (text), `transportMode` (enum), `travelToleranceMin` (int).
- (Optional, for Phase 3) squad/group: a JSON `learnedTaste` blob column (nullable).
- `api-schemas.ts`: add the above as **optional** fields to the relevant request schemas (backward compatible).
- Generate the migration; document the `db:neon:push:dev` command in the chunk report. **Do not** push prod.

**Unit tests:** schema/zod parse tests proving old payloads (without new fields) still validate.

---

# PHASE 3 — Learning

## Chunk 3.1 — Squad-history signal (Planner-reads-history, no ML)

**Goal:** feed the squad's plan history into context synthesis + populate the v2 `userCategoryHistogram`
hook — the no-ML first version of squad learning.

**Files:** `server/orchestrator.ts` (`synthesizeContext`), `server/orchestrator/grounded_synthesis.ts`,
`server/orchestrator/v2.ts`, a new `server/squad-history.ts` (read + summarize a group's past plans,
outcomes, downvote reasons, feedback into a compact text + a category histogram).

**Implement:**
- `summarizeSquadHistory(groupId)` → `{ text: string; categoryHistogram: Record<string,number> }`
  using existing `votes.downvoteReasons`, `event_feedback`, `winningOptionId`, session history.
- Inject `text` into the synthesis/grounding prompts (bounded length); pass `categoryHistogram` into
  the v2 diversity calibration (`userCategoryHistogram`, currently stubbed).
- Trust order per `SQUAD-LEARNING-DESIGN.md` (committed+rated > upvote > downvote-reason > seen).

**Unit tests:** history summarizer with fixture data (assert histogram counts, downvote reasons surfaced,
bounded text length). Mock storage; no DB/network.

---

# PHASE 4 — Frontend (smallest, last; expect human review)

> These touch live React UI. Keep each minimal and behind the new squad flow where possible. NII never shown.

## Chunk 4.1 — Per-member capture controls
Energy as an **NII slider** (band name + anchor only, no number), and a mode-aware **travel-tolerance**
control, in the plan/session flow. Mirror the prototype `prototypes/squad-experience.html`. Component tests
(jsdom) for the slider band mapping and tolerance control.

## Chunk 4.2 — Squad-first entry
"Add members / or solo" entry → create squad → plan inside it. Reuse existing groups; invert default entry.
Component tests for routing/guards.

## Chunk 4.3 — Anonymized reconciliation
Group reconciliation view: anonymous budget/energy aggregates, per-member travel **strain** (logistics shown),
soft-budget "worth a small stretch" flagging. Component tests for the anonymity rule (no member attribution on
budget/energy).

---

## Per-chunk definition of done (checklist)

- [ ] Implements only the current chunk's scope.
- [ ] `npm run check` passes. `npm test` passes (new tests included).
- [ ] No suggestion API response-shape change; new request fields optional.
- [ ] NII number never user-facing.
- [ ] No prod DB scripts run; no commit/push.
- [ ] Short report produced; STOP for review.

## Explicitly OUT OF SCOPE for you (Codex)

- Integration / end-to-end testing (human + reviewing agent will do this).
- Tuning NII weights/band cutoffs or travel thresholds against real data (ships as documented defaults).
- Real Google Routes API billing/keys setup, or replacing the intensity heuristic with production NLP.
- Ripping out `lucide-react` for `griddy-icons`, or any broad UI refactor not listed above.
- Running `db:neon:push:prod` or anything touching production data.
