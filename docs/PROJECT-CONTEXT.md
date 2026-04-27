# LinkUpGo — Project Context

> Read this first. Architecture details (server/client/mobile layouts, schema, WebSocket events, env vars) live in `../CLAUDE.md` and `../replit.md` — this file covers product status, ownership, and active priorities only.

## TL;DR for Claude

LinkUpGo is an AI-driven social event planner for young professionals in NYC and Chicago, **inherited by the current owner from the original author** (`kishorecydext`). The web app is **usable / kind-of-live**, and the iOS app is **on TestFlight with external beta testers** — treat any change to schema, auth, or API shape as user-impacting. The active piece of work is **rebuilding the suggestions algorithm and architecture**: today it over-favors popular places, skips too many venues, has weak neighborhood mapping, and feels generic. The user wants to keep AI central but redesign the orchestration and add learning from past user behavior (votes, downvote reasons, post-event feedback). Be ambitious about the rebuild; be cautious about anything that ships to mobile.

## Ownership & history

- **Origin remote:** `bhattacharjee-k/LinkUpGo` (the current owner's fork)
- **Upstream remote:** `kishorecydext/LinkUpGo` (original author)
- **Status of the handoff:** the current owner has taken over independently. They are now the product owner and primary developer.
- **Provenance:** originally built on Replit, hence `.replit`, `replit.nix`, `@replit/vite-plugin-*` in devDependencies, and `server/replit_integrations/`. Treat Replit-specific code as legacy — it works but it's not load-bearing for new development.

## Current state of the app

| Surface | Status | Implication |
|---|---|---|
| **Web** | Usable / kind-of-live | Regressions are user-visible. Test the golden path before shipping. |
| **iOS (mobile/)** | On TestFlight (external testers) | Schema, auth, or API-shape changes can break installed builds. Coordinate before shipping. |
| **Backend** | Express + Drizzle + Postgres | Dual auth: session cookies (web) + JWT (mobile) — same endpoints serve both. |
| **Prod database** | Neon (`db:neon:*` scripts, `NEON_DATABASE_URL`) | Local dev uses Docker Postgres on port 5434 (`docker compose up -d`). |

## Active focus: rebuilding the suggestions algorithm

### What's wrong with today's pipeline (owner's diagnosis)

- Too biased toward popular places — high review count wins too often
- Skips a lot of venues — filtering is too aggressive somewhere in the pipeline
- Neighborhood mapping is weak
- Not personalized enough — output feels generic across users / sessions

### Direction the owner wants (open, not locked)

- Keep AI in the loop — **double down** on intelligent orchestration, don't retreat from it
- Add **learning from past user behavior** (post-event feedback, downvote reasons, vote history)
- Open to bigger redesigns — this is not an incremental tweak

### Deep dive on today's pipeline

Read [`CURRENT-DECISION-ALGORITHM.md`](CURRENT-DECISION-ALGORITHM.md) before designing changes — it's a citation-rich snapshot of the current algorithm with §11 pinpointing where each pain point ("popular bias", "skips venues", "weak neighborhoods", "generic") originates in code.

### Code paths that matter for this work

| File | Why it matters |
|---|---|
| `server/orchestrator.ts` | Primary AI pipeline: context synthesis → API queries → validation/ranking |
| `server/suggestions.ts` (~1500 lines) | `getOrchestratedSuggestions()` (primary) and `getSuggestions()` (legacy SAFE/EXPLORE/WILDCARD bucket fallback) |
| `server/planner.ts` | Function-calling chat planner (`regenerate_suggestions`, `add_suggestion`, `remove_suggestion`) |
| `server/perplexity.ts` | Web-search candidate source |
| `server/geo.ts` | Neighborhood geocoding, midpoint computation, city radius — "neighborhood mapping is weak" lives here |
| `shared/schema.ts` | `suggestions`, `votes` (with `downvoteReasons`), `event_feedback`, `session_participants` (`startingNeighborhood`) |
| `shared/api-schemas.ts` | `SuggestRequestSchema`, `CreateSessionRequestSchema` (filters, `locationMode`, `referenceVenues`) |
| `server/cache.ts` | TTLs (suggestions 10m, places 15m, events 5m, perplexity 5m) — relevant when changing call patterns |

### Signals available for a "learn from behavior" rebuild

- **`event_feedback` table** — post-event 1–5 stars, tags, `wouldRecommend`. `getVenueAverageRating` already aggregates by venue name.
- **`votes` table** — up/down + `downvoteReasons[]` (too far / too expensive / not my vibe / too crowded).
- **User onboarding prefs** — `discoveryStyle` (`hidden_gems` / `popular` / `mixed`), `crowdPreference`, `favoriteNeighborhoods`, `categories`, `hardNos`, `budget`, `energyLevel`.
- **`referenceVenues` per session** — style anchoring (1–3 favorite places, drives `preferredPriceTier`, `preferredTypes`, `qualityFloor`, `energyBias`).

### Be aware before changing

- Web (session-cookie auth) and mobile (JWT) **both call the same suggestion endpoints**. Don't change the response shape without checking `mobile/src/` and the JWT path. Mobile builds on TestFlight cannot pick up server changes that break their assumptions.
- The orchestrator path is the **primary**; the bucket system (SAFE/EXPLORE/WILDCARD) is the **fallback**. Decide explicitly whether the rebuild keeps a fallback path or removes it.
- `db:neon:push:dev` and `db:neon:push:prod` distinguish dev and prod schemas on the same Neon database. **Don't run the prod scripts casually** — they touch production data.
- City filtering uses Haversine with ~35 mi (NYC) / ~30 mi (Chicago) radii in `server/geo.ts`. If venues are being "skipped," this is one place to look.

## Target users

Young professionals in NYC and Chicago (per `replit.md`). The suggestions pipeline currently hard-codes radii and city boundaries to those two metros — multi-city expansion is not in scope today.

## Conventions for Claude working in this repo

- **Web is live, mobile has external testers.** Confirm before destructive operations, schema migrations, or anything that changes API response shapes.
- **Default reading order:** `CLAUDE.md` → this file → `replit.md` (for product depth). Then jump into code.
- **For suggestion-pipeline work:** start from `server/suggestions.ts` and `server/orchestrator.ts`, then trace outward.
- **Communication style** (per `replit.md` "User Preferences"): simple, everyday language. No jargon walls.
- **Don't duplicate** what's already in `CLAUDE.md` or `replit.md`. Link to those, don't re-state them.
