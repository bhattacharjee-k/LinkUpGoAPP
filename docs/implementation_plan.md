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
- [ ] Set production `DATABASE_URL` with search_path=prod (at deploy time)

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
- [ ] Install Google Cloud CLI
- [ ] Create GCP project (`linkupgo`)
- [ ] Enable Cloud Run + Artifact Registry APIs
- [ ] Deploy with `gcloud run deploy`
- [ ] Set production environment variables / secrets
- [ ] Map custom domain: `linkupgoapp.com` (single service serves both app + API)

### Phase 5: iOS App Store Deployment
- [ ] Apple Developer Account setup
- [ ] Configure `mobile/eas.json` with production `EXPO_PUBLIC_API_URL`
- [ ] Update `mobile/app.json` — remove `NSAllowsArbitraryLoads`
- [ ] Build for App Store: `eas build --platform ios --profile production`
- [ ] Submit: `eas submit --platform ios`
- [ ] App Store Connect listing (screenshots, description, privacy policy)

### Phase 6: DNS Configuration
- [ ] Add CNAME records for `linkupgoapp.com` → Cloud Run
- [ ] Add CNAME records for `api.linkupgoapp.com` → Cloud Run
- [ ] Verify SSL/TLS provisioning

### Verification
- [ ] `https://api.linkupgoapp.com/api/auth/me` returns 401
- [ ] `https://linkupgoapp.com` loads React app
- [ ] Web login works with cross-subdomain cookies
- [ ] iOS app connects to production API
- [ ] WebSocket `wss://api.linkupgoapp.com/ws` connects
- [ ] App Store review passes
