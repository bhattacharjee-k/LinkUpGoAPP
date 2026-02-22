# LinkUpGo Implementation Plan / Backlog

## Status Legend
- [ ] Not started
- [x] Completed
- [~] In progress

---

## Production Deployment (Full Plan: `docs/PRODUCTION-DEPLOYMENT.md`)

### Phase 1: Database — Neon Setup
- [ ] Create Neon account and project
- [ ] Get connection string
- [ ] Run migrations against Neon: `DATABASE_URL=<neon-url> npm run db:push`
- [ ] Optionally seed production data

### Phase 2: Server Changes for Production
- [ ] Install `cors` + `@types/cors`
- [ ] Add CORS middleware to `server/index.ts` (env-driven `ALLOWED_ORIGINS`)
- [ ] Add `sameSite` and `domain` to session cookie config in `server/index.ts`
- [ ] Update `client/src/lib/api.ts` — use `VITE_API_URL` env var for API base
- [ ] Update `client/src/lib/context.tsx` — derive WebSocket URL from API URL

### Phase 3: Dockerize
- [ ] Create `Dockerfile` (multi-stage Node 20 Alpine build)
- [ ] Create `.dockerignore`
- [ ] Verify `npm run build` produces working `dist/index.cjs` + `dist/public/`

### Phase 4: Google Cloud Run Deployment
- [ ] Install Google Cloud CLI
- [ ] Create GCP project (`linkupgo`)
- [ ] Enable Cloud Run + Artifact Registry APIs
- [ ] Deploy with `gcloud run deploy`
- [ ] Set production environment variables / secrets
- [ ] Map custom domains: `linkupgoapp.com` + `api.linkupgoapp.com`

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
