# Suggestions Rebuild — Follow-ups

> **Status as of 2026-06-02:** the rebuild is built, tested (~210 tests), and merged to `main`.
> Everything below is *optional* — none of it gates "done." It's the punch-list of config to enable,
> tuning that needs real data, deferred architecture, and known limitations.
>
> Context: the whole rebuild lives behind `SUGGESTIONS_PIPELINE=v2` (v1 is still the default). See
> `docs/SQUAD-LEARNING-DESIGN.md`, `docs/ENERGY-LEVELS.md`, `docs/CODEX-IMPLEMENTATION-PROMPT.md`,
> and `server/orchestrator/README.md`.

## A. Config / infra to enable live v2

| Item | Why | Where |
|---|---|---|
| **Flip `SUGGESTIONS_PIPELINE=v2`** | v1 is still the default; nothing the rebuild added is live until this flips. Do a shadow/eval pass first, then ramp. | env / `server/suggestions.ts` dispatch |
| **Enable the Google Distance Matrix API** | The travel provider uses it for real (incl. transit) ETAs; it's a *separate* API toggle from Places. Without it → 403 → silent Haversine fallback. | Google Cloud project for the existing key |
| **Add `chicago-cas.geojson`** | NYC neighborhoods resolve offline; Chicago's file never downloaded (the city's Socrata export was returning empty 200s). Grab it via the [portal Export button](https://data.cityofchicago.org/Facilities-Geographic-Boundaries/Boundaries-Community-Areas-current-/cauq-8yn6) → drop in `server/geo/polygons/`. Loader already handles its keys. | `server/geo/polygons/` |
| **Anthropic rate-limit tier** | The live `=v2` run hit 429s on the pairwise PRP re-rank (org on the 50 req/min tier). Either raise the tier or throttle pairwise concurrency. | `server/orchestrator/pairwise.ts` / Anthropic billing |
| `GEMINI_API_KEY` | Already added — grounded synthesis + the neighborhood/budget judges use the direct Gemini API. | `.env` (done) |
| `MAPBOX_API_KEY` | **Not needed** — neighborhoods run offline via open-data polygons; the `mapbox.ts` reverse-geocode stub is unused. Only relevant for cities beyond NYC/Chicago. | — |

## B. Tuning (needs real usage data — there is none yet)

- **NII weights `{spend .20, lateness .30, intensity .30, crowd .20}` and band cutoffs `0/25/50/78/100`** are sensible placeholders. Validate against real venues + behavior (inter-rater reliability + revealed behavior) before trusting them. See `docs/ENERGY-LEVELS.md` → Tunable Parameters.
- **Travel:** default tolerances (walk 20 / transit 30 / car 45), the strain weights (`w_max`/`w_avg`), and the hard-unreachable bound (strain > 2.0).
- **Energy aggregation tie-break:** `aggregateEnergy` uses the *lower* median for even groups (don't-over-shoot). Confirm that's the desired product behavior.
- **Soft-budget curve** (`softBudgetScore`) — how much stretch a standout earns; the over-comfort decay.

## C. Deferred architecture (intentionally not built yet)

- **Graduate squad-learning** from "Planner reads history" (LLM text injected into the synthesis prompt) to a **structured learned squad profile**. Per the design, do this once there's enough data; don't fine-tune a custom judge before ~10K labeled pairs.
- **Per-event, per-member capture of energy/budget.** Today the `GroupAggregate` (reconciliation + summary) uses each member's *baseline* profile. The squad-first model wants per-event per-member answers; the contract is unchanged when that lands. (`server/group-aggregate.ts` notes this.)
- **Bandit exploration slot** — deferred in the v2 README; the research endorsed it. Start as epsilon-greedy formalizing the legacy WILDCARD bucket (and it can also learn which "why" explanation resonates).
- **Embeddings for MMR cosine similarity** — `diversity.ts` stub returns 0; wire in once pgvector lands. Structured-feature similarity carries diversity until then.
- **Reference-venue style anchoring** — still v1-only; not yet fed into the v2 judges (`v2.ts` takes `referenceVenues` for signature parity but ignores it).
- **PinnerSage user facets / Llama distillation** — concept-only; need labeled data first.
- **Venue feature enrichment:** `intensity` and `crowd` are heuristics today (type/keyword + review-count log). Upgrade to review-NLP and/or a foot-traffic source (see D).

## D. Data-provider opportunities (from the lightweight research)

- **Foursquare "tastes"** — NLP venue-character tags with affinity scores; best match for the `intensity`/hidden-gem signal. The `tastes` endpoint is free (Pro free tier shrank to ~500/mo in 2026). Worth a pilot for venue character.
- **BestTime.app** — cheap (~$4.99+) real "how busy by hour" foot-traffic → feeds the `crowd` (and time-aware `intensity`) NII features, the gap Google doesn't fill.
- **Yelp = skip** — has perfect `ambience`/`noise_level` attributes but its 24h-cache / no-external-storage ToS conflicts with our persistent `venue_features` store.
- **Mapbox Isochrone** — could give true reachable-area zones for travel, but no transit support (so limited for NYC); not worth it over the fixed Distance Matrix path.

## E. Known limitations / code TODOs

- **Invalid Places types from the brief** — synthesis sometimes returns `lounge`/`speakeasy`, which aren't valid Google Places API types → those type-searches 400 and are wasted. Validate/map `brief.googlePlacesTypes` to the supported set (map `speakeasy`/`lounge` → `bar`). *(Quick win — surfaced in the live run.)*
- **Distance Matrix is a "legacy" Google API** — fully supported but Google nudges toward the Routes API. Revisit if it's ever sunset. (Routes `computeRouteMatrix` doesn't do transit; `computeRoutes` does, per-leg.)
- **`travelScore` calls the provider per-candidate sequentially**, not as one batched matrix — perf only; the cache mitigates. Batch if it matters.
- **Squad-summary text phrasing** is slightly clunky (mixes feedback-sentiment tags like "great_vibe" with descriptive categories in the "leans …" sentence). The histogram (what drives calibration) is clean; refine the text later if desired.
- **Migration tooling traps** (already in memory): `db:push` wants to drop the unmanaged `session` table; `neon-push.ts` only ever applies migration `0000`. Apply additive migrations via direct SQL, or fix the tooling if Neon becomes the migration path.
- Minor: a `(user?.energy as Energy)` cast in `new-plan.tsx`; a couple of pre-existing unused-index lint hints in `session.tsx`.

## F. UX polish

- **Entry-flow framing** — lead the app with "add members / solo → plan inside a squad" (the literal squad-first entry). Mostly cosmetic: groups are already first-class, Home lists them, and plans already belong to groups, so this is navigation framing, not new capability.
- **Icons** — the energy slider / travel control / reconciliation use plain text or lucide icons; `griddy-icons` is installed for a consistent set when you want it.
- **Slider thumb** styling (energy slider uses the default browser thumb on a gradient track).

## How to verify the rebuild works (no real users yet)

There's a seeded squad in local dev (`npm run db:seed` → "NYC Friday Crew" with 4 completed plans + votes + feedback). The eval harness (`server/eval/`) is built but its golden set needs real `votes`/`event_feedback` to be meaningful — until there's usage, rely on the seed + label-free metrics (ILD/Gini/tail-coverage) + a live `=v2` run.
