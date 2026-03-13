# LinkUpGo Implementation Plan / Backlog

## Status Legend
- [ ] Not started
- [x] Completed
- [~] In progress

---

## Production Deployment (Full Plan: `docs/PRODUCTION-DEPLOYMENT.md`)

### Phase 1: Database — Neon Setup
- [x] Create Neon setup/push/seed scripts (`scripts/neon-setup.ts`, `neon-push.ts`, `neon-seed.ts`)
- [x] Add npm scripts: `db:neon:setup`, `db:neon:push:dev`, `db:neon:push:prod`, `db:neon:seed:dev`
- [x] Update `.env.example` with `NEON_DATABASE_URL` pattern
- [x] Create Neon account and project
- [x] Add `NEON_DATABASE_URL` to `.env`
- [x] Run `npm run db:neon:setup` (creates `dev` + `prod` schemas)
- [x] Run `npm run db:neon:push:dev` (push 14 tables to dev schema)
- [x] Run `npm run db:neon:seed:dev` (seed dev with test data)
- [x] Run `npm run db:neon:push:prod` (push 14 tables to prod schema)
- [x] Fix `shared/schema.ts` constants import for drizzle-kit CJS compatibility
- [x] Set production `DATABASE_URL` with search_path=prod (at deploy time)

### Phase 2: Server Changes for Production
- [x] Install `cors` + `@types/cors`
- [x] Add CORS middleware to `server/index.ts` (env-driven `ALLOWED_ORIGINS`)
- [x] Add `sameSite` and `domain` to session cookie config in `server/index.ts`
- [x] Update `client/src/lib/api.ts` — use `VITE_API_URL` env var for API base
- [x] Update `client/src/lib/context.tsx` — derive WebSocket URL from API URL

### Phase 3: Dockerize
- [x] Create `Dockerfile` (multi-stage Node 20 Alpine build)
- [x] Create `.dockerignore`
- [x] Verify `npm run build` produces working `dist/index.cjs` + `dist/public/`
- [x] Verify Docker container serves both API and React app on port 8080

### Phase 4: Google Cloud Run Deployment
- [x] Install Google Cloud CLI
- [x] Create GCP project (`linkupgo`)
- [x] Enable Cloud Run + Artifact Registry + Cloud Build APIs
- [x] Deploy with `gcloud run deploy` → `https://linkupgo-733928439758.us-central1.run.app`
- [x] Set production environment variables / secrets
- [x] Map custom domain: `linkupgoapp.com` (single service serves both app + API)
- [x] Fix `DB_SCHEMA=prod` for Neon pooled connections (pool.on('connect') SET search_path)

### Phase 5: iOS App Store Deployment
- [ ] Apple Developer Account setup
- [ ] Configure `mobile/eas.json` with production `EXPO_PUBLIC_API_URL`
- [ ] Update `mobile/app.json` — remove `NSAllowsArbitraryLoads`
- [ ] Build for App Store: `eas build --platform ios --profile production`
- [ ] Submit: `eas submit --platform ios`
- [ ] App Store Connect listing (screenshots, description, privacy policy)

### Phase 6: DNS Configuration
- [x] Verify domain ownership via Google Search Console
- [x] Map `linkupgoapp.com` → Cloud Run (`gcloud beta run domain-mappings`)
- [x] Add A records (4x) in GoDaddy
- [x] SSL/TLS certificate provisioned (Google-managed)

---

## Bug Fixes (from docs/buglist.md)

### Bug 1 — No-Results Crash
- [x] Add empty-suggestions UI with "Widen Search Area" + "Adjust Filters" buttons
- [x] Add `isRetrying` state and error handling in `session.tsx`

### Bug 4 — Active Plans Card Layout
- [x] Swap so session/plan name is bold primary text, group name is secondary

### Bug 5 — Details Button Opens Google Maps
- [x] Replace `detailUrl` link with Google Maps search URL using `suggestion.name + suggestion.city`
- [x] Remove `ticketUrl` and `eventUrl` link buttons

### Bug 6 — Remove Ticketmaster API
- [x] Remove `fetchTicketmasterEvents()` function from `suggestions.ts`
- [x] Remove `categoryToTicketmaster` mapping and `getTimeAwareTicketmasterClasses()`
- [x] Remove event fetching from `getSuggestions()` and `getOrchestratedSuggestions()`
- [x] Remove Ticketmaster from `orchestrator.ts` prompts and brief interface
- [x] Remove `fetchLiveEvents()` from `planner.ts`
- [x] Remove Ticketmaster references from `routes.ts`
- [x] Remove `TICKETMASTER_API_KEY` from `.env.example` and `CLAUDE.md`

### Bug 3 — Transportation Mode per User
- [x] Add `transportationMode` column to `users` table in `schema.ts`
- [x] Generate Drizzle migration
- [x] Add transportation mode selector UI in `profile.tsx` (Car, Walk, Public Transit)
- [x] Add `TRANSPORT_MAX_DISTANCE` map and `getMaxDistanceMiles()` to `suggestions.ts`
- [x] Apply transport distance filter in both `getSuggestions()` and `getOrchestratedSuggestions()`
- [x] Pass `transportationModes` from routes when generating suggestions
- [ ] Run `npm run db:push` to apply schema change

### Bug 2 — Real-Time Update on Member Join
- [x] Add WebSocket broadcasts in group join handler (`POST /api/groups/join/:inviteCode`)
- [x] Add WebSocket broadcasts in session join handler (`POST /api/sessions/join/:inviteCode`)
- [x] Extract `regenerateSuggestionsForSession()` helper function
- [x] Trigger suggestion regeneration on join via invite code
- [x] Deduplicate regeneration code in `POST /api/sessions/:id/participants`

### Bug 7 — Auto-Widen Search on New Member Join
- [x] Add `maxWidenAttempts` parameter to `regenerateSuggestionsForSession()`
- [x] Progressive widening: upgrade walk→transit, then remove transport filter entirely
- [x] Pass `maxWidenAttempts: 4` from join handlers
- [x] Fall back to Bug 1 error state if still empty after max attempts

### Session Refresh Error Fix
- [x] Wrap `/session/:id` and `/session/:id/complete` routes in `<PrivateRoute>` in `App.tsx`
- [x] Fix React hooks order violation in `session.tsx` — move `useEffect` before early return

### Test Suite Setup
- [x] Install Vitest, @testing-library/react, @testing-library/jest-dom, jsdom, supertest
- [x] Create `vitest.config.ts` with path aliases
- [x] Add `npm run test` and `npm run test:watch` scripts
- [x] Shared tests: `ranking.test.ts` (15 tests), `api-schemas.test.ts` (37 tests), `constants.test.ts` (5 tests)
- [x] Server tests: `cache.test.ts` (11 tests), `error-handler.test.ts` (12 tests), `auth-middleware.test.ts` (15 tests)
- [x] All 95 tests passing

### Google Ads Integration
- [x] Create web ads utility (`client/src/lib/ads.ts`) — AdSense interstitial with frequency cap (5 min)
- [x] Initialize ads on app boot (`client/src/main.tsx`)
- [x] Web: Interstitial during plan creation loading (`new-plan.tsx`) — runs in parallel with session creation
- [x] Web: Interstitial after feedback submission (`session-complete.tsx`)
- [x] Mobile: Rewrite ads library (`mobile/src/lib/ads.ts`) with `react-native-google-mobile-ads`
- [x] Mobile: Interstitial after feedback submission (`session-complete/[id].tsx`)
- [x] Mobile: ATT permission request + AdMob initialization in `_layout.tsx`
- [x] Mobile: Add `react-native-google-mobile-ads` plugin to `app.json`
- [x] Add `VITE_ADSENSE_CLIENT` and `VITE_ADSENSE_INTERSTITIAL_SLOT` to `.env.example`
- [ ] Replace placeholder ad unit IDs with real ones from AdSense/AdMob dashboards
- [ ] Test ads with test IDs in development
- [ ] Verify frequency cap works across screens

### Verification
- [x] Cloud Run URL `/api/auth/me` returns 401
- [x] Cloud Run URL `/` loads React app
- [x] `https://linkupgoapp.com/api/auth/me` returns 401
- [x] `https://linkupgoapp.com` loads React app
- [ ] Web login works (prod schema has no users yet — seed or register)
- [ ] iOS app connects to production API
- [ ] WebSocket `wss://linkupgoapp.com/ws` connects
- [ ] App Store review passes
