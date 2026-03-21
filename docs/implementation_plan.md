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

### Mobile UX Fixes
- [x] Fix feedback form disabled on iOS (check `hasSubmitted` from API response)
- [x] Fix login loading screen with `dataReady` flag
- [x] Fix budget text contrast (selected chip uses `primaryForeground`)
- [x] Fix server vote delete endpoint (actually execute DB delete)
- [x] Fix regenerate button styling (contained/green with loading animation)
- [x] Fix send icon color (`primaryForeground` instead of white)
- [x] Fix keyboard dismiss after sending chat message
- [x] Fix login loading screen race condition (useEffect instead of fire-and-forget)
- [x] Fix pull-to-refresh stuck spinner (add try/finally)
- [x] Fix New Plan stale state (useFocusEffect reset)
- [x] Fix session empty suggestions (initialLoading state with spinner)

### Verification
- [x] Cloud Run URL `/api/auth/me` returns 401
- [x] Cloud Run URL `/` loads React app
- [x] `https://linkupgoapp.com/api/auth/me` returns 401
- [x] `https://linkupgoapp.com` loads React app
- [ ] Web login works (prod schema has no users yet — seed or register)
- [ ] iOS app connects to production API
- [ ] WebSocket `wss://linkupgoapp.com/ws` connects
- [ ] App Store review passes

---

## Feature: Push Notifications

### Where Push Notifications Add Value

**High Priority — Core User Engagement:**
| Trigger | When | Push Message Example | Why It Matters |
|---------|------|---------------------|----------------|
| Plan Created | New session started in your group | "New plan started: Weekend drinks!" | Alerts group members to participate |
| Suggestions Ready | Suggestions generated/regenerated | "Fresh suggestions just dropped!" | Prompts immediate engagement |
| Voting Open | Session moves to voting phase | "Voting is open! Cast your votes" | Clear call-to-action |
| Someone Voted | A participant casts a vote | "Sofia voted for The Rooftop Bar" | Creates momentum/FOMO |
| Plan Locked | Admin locks the winning option | "It's decided! The Rooftop at 8pm" | Final confirmation + calendar |
| Plan Approaching | 24h and 4h before the event | "Your plan is in 4 hours!" | Reduces no-shows |

**Medium Priority — Group Awareness:**
| Trigger | When | Push Message Example |
|---------|------|---------------------|
| Member Joined | Someone joins your group | "Alice joined Weekend Warriors!" |
| Participant Status | Someone can't make it | "Marcus can't make it — updated plan" |
| Availability Nudge | User hasn't voted in 12h | "Your group is waiting on your vote!" |
| Feedback Request | After event date passes | "How was The Rooftop? Rate it!" |

### Existing Infrastructure
- `notifications` table in DB (id, userId, type, title, body, url, isRead, createdAt)
- `notificationPrefs` table (userId, emailEnabled)
- `server/notifications.ts` — service with `notifyPlanJoined()`, `notifyVotingOpen()`, `notifyPlanLocked()`, `notifyAvailabilityNudge()`
- API: `GET /api/notifications`, `GET /api/notifications/unread-count`, `POST /api/notifications/read`
- Email notifications via Resend already working
- WebSocket real-time events already in place

### Phase 1: Infrastructure (Server + Mobile)
- [ ] Install `expo-notifications` and `expo-device` in mobile app
- [ ] Add `pushToken` column to `users` table in `shared/schema.ts`
- [ ] Create `POST /api/users/push-token` endpoint to register device tokens
- [ ] Set up Firebase Cloud Messaging (FCM) — create Firebase project, download config
- [ ] Set up Apple Push Notification service (APNs) — upload key to EAS/Firebase
- [ ] Install `firebase-admin` on server for sending push notifications
- [ ] Create `server/push.ts` — push notification sender (wraps FCM/APNs via firebase-admin)
- [ ] Run `npm run db:push` for schema migration

### Phase 2: Mobile Registration
- [ ] Request notification permissions on app launch (`expo-notifications` API)
- [ ] Get Expo push token (`Notifications.getExpoPushTokenAsync()`)
- [ ] Send token to server on login/register (`POST /api/users/push-token`)
- [ ] Re-register token on app foreground (tokens can rotate)
- [ ] Handle token cleanup on logout

### Phase 3: Core Notification Triggers (Server)
- [ ] Extend `server/notifications.ts` — add `sendPush()` that calls firebase-admin
- [ ] Modify `createNotification()` to also send push when user has a push token
- [ ] Add push to existing triggers:
  - `notifyPlanJoined()` — push to admin when someone joins
  - `notifyPlanLocked()` — push to all participants
  - `notifyVotingOpen()` — push to all participants
- [ ] Add NEW triggers in `server/routes.ts`:
  - Session created → push to group members
  - Vote cast → push to other participants
  - Suggestions regenerated → push to participants

### Phase 4: Mobile Notification Handling
- [ ] Configure notification handler in `_layout.tsx` (foreground display behavior)
- [ ] Handle notification tap → deep link to relevant screen using `url` field
- [ ] Add notification badge to Home tab (unread count from `/api/notifications/unread-count`)
- [ ] Create notifications list screen (accessible from Home)
- [ ] Mark notifications as read when viewed

### Phase 5: Notification Preferences
- [ ] Extend `notificationPrefs` table: add `pushEnabled`, per-type toggles
- [ ] Add notification settings UI in profile screen
- [ ] Server respects per-type preferences before sending push
- [ ] Add quiet hours support (optional)

### Phase 6: Scheduled Notifications
- [ ] Set up Cloud Scheduler or cron job for time-based notifications
- [ ] Availability nudge: check every 6h for users who haven't voted
- [ ] Plan approaching: 24h and 4h reminders for locked plans
- [ ] Feedback request: 2h after event time

---

## Feature: Social Login (Facebook)

### Important Note on Instagram
Instagram does NOT have its own OAuth login. Instagram accounts are managed through Meta/Facebook's identity system. "Login with Facebook" covers users with Facebook-linked Instagram accounts. There is no separate "Login with Instagram" — Meta deprecated the Instagram standalone auth API.

**Recommendation:** Implement "Continue with Facebook" only, which covers Meta's entire user base (Facebook + Instagram-linked accounts).

### Current Auth System
- Username/password with bcrypt hashing
- Web: express-session with cookie auth
- Mobile: JWT (15min access + 30-day refresh tokens)
- Users table requires `username` and `password` (both NOT NULL)

### Phase 1: Schema & Server Setup
- [ ] Add columns to `users` table:
  - `authProvider` text default `'password'` — values: `'password'` | `'facebook'`
  - `facebookId` text unique nullable — Facebook user ID
  - `avatarUrl` text nullable — profile photo from Facebook
- [ ] Make `password` column nullable (not required for social login)
- [ ] Install `expo-auth-session` and `expo-web-browser` in mobile
- [ ] Create Meta Developer App at developers.facebook.com
  - Configure OAuth redirect URIs
  - Get App ID and App Secret
  - Enable "Facebook Login" product
  - Add iOS bundle ID and Android package name
- [ ] Add `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET` to server env vars
- [ ] Run `npm run db:push` for schema migration

### Phase 2: Server Endpoints
- [ ] Create `POST /api/auth/mobile/facebook` endpoint:
  1. Receive Facebook access token from mobile client
  2. Verify token with Facebook Graph API (`GET https://graph.facebook.com/me?fields=id,name,email,picture`)
  3. Look up user by `facebookId`
  4. If found → issue JWT tokens (same as password login)
  5. If not found → create new user with `authProvider: 'facebook'`, `facebookId`, `name`, `avatarUrl`
  6. Return JWT tokens + user object + `isNewUser` flag
- [ ] Handle account linking: if email matches existing password user, offer to link accounts
- [ ] Add Facebook token validation utility (`server/middleware/facebook-auth.ts`)

### Phase 3: Mobile UI — Login Screen
- [ ] Add "Continue with Facebook" button to onboarding login view
  - Blue Facebook-branded button below existing username/password form
  - Use `expo-auth-session` for OAuth flow:
    ```
    AuthSession.makeRedirectUri() → open Facebook auth URL → receive token
    ```
- [ ] On success with `isNewUser: false` → navigate to home (same as password login)
- [ ] On success with `isNewUser: true` → navigate to profile setup (step 2: city selection)
  - Skip step 1 (username/password) — name comes from Facebook
  - Auto-generate username from Facebook name (e.g., "john_smith_123")

### Phase 4: Mobile UI — Registration Flow
- [ ] Add "Continue with Facebook" button to onboarding step 1
- [ ] After Facebook auth, pre-fill name from Facebook profile
- [ ] Skip to step 2 (city) with remaining preference steps (budget, energy, categories, etc.)
- [ ] Auto-generate username (show in UI, allow user to change)

### Phase 5: Profile & Settings
- [ ] Show auth provider in profile (e.g., "Connected with Facebook")
- [ ] If Facebook user: hide password change option
- [ ] Add option to link Facebook to existing password account
- [ ] Add option to set a password (so Facebook users can also log in with username/password)
- [ ] Show Facebook avatar in profile if `avatarUrl` is set

### Phase 6: Web Client (Optional — Lower Priority)
- [ ] Add Facebook Login button to web login page
- [ ] Use Facebook JavaScript SDK or server-side OAuth flow
- [ ] Same server endpoint handles both web and mobile tokens

---

## Implementation Order

| Priority | Feature | Effort | Dependencies |
|----------|---------|--------|-------------|
| 1 | Push Notifications Phase 1-2 (Infrastructure + Registration) | 2-3 days | Firebase project, APNs key |
| 2 | Push Notifications Phase 3 (Core Triggers) | 1-2 days | Phase 1-2 |
| 3 | Facebook Login Phase 1-2 (Schema + Server) | 1-2 days | Meta Developer App |
| 4 | Facebook Login Phase 3-4 (Mobile UI) | 1-2 days | Phase 1-2 |
| 5 | Push Notifications Phase 4 (Mobile Handling) | 1-2 days | Phase 1-3 |
| 6 | Push Notifications Phase 5-6 (Preferences + Scheduled) | 2-3 days | Phase 1-4 |
| 7 | Facebook Login Phase 5 (Profile) | 1 day | Phase 3-4 |
| 8 | Facebook Login Phase 6 (Web) | 1-2 days | Phase 1-2 |

**External Setup Required Before Coding:**
- Firebase project + FCM configuration
- Apple Push Notification key uploaded to EAS
- Meta Developer App with Facebook Login enabled
- Environment variables: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, Firebase service account key
