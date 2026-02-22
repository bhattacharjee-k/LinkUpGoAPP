# Plan: Full Production Deployment

## Context
Deploy LinkUpGo to production with:
- **linkupgoapp.com** — React web app (frontend)
- **api.linkupgoapp.com** — Express API (backend + WebSocket)
- **Neon** — PostgreSQL (free tier)
- **Google Cloud Run** — hosting both services (free tier)
- **iOS App Store** — Expo mobile app pointing to same API

Both the web app and iOS app call the same API at `api.linkupgoapp.com`.

## Architecture

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────┐
│  linkupgoapp.com│     │ api.linkupgoapp.com   │     │   Neon DB    │
│  (Cloud Run)    │────▶│ (Cloud Run)           │────▶│  (Free tier) │
│  Static React   │     │ Express + WebSocket   │     │  PostgreSQL  │
└─────────────────┘     └──────────────────────┘     └─────────────┘
                              ▲
                              │
                        ┌─────┴─────┐
                        │  iOS App   │
                        │ (App Store)│
                        └───────────┘
```

## Changes

### Phase 1: Database — Neon Setup

1. **Create Neon account** at [neon.tech](https://neon.tech)
2. Create a new project → get the connection string
3. Run migrations: `DATABASE_URL=<neon-url> npm run db:push`
4. Optionally seed: `DATABASE_URL=<neon-url> npm run db:seed`

No code changes needed — just swap the `DATABASE_URL`.

---

### Phase 2: Server Changes for Production

#### 2a. Add CORS middleware
**File: `server/index.ts`**
- Install: `npm install cors` + `npm install -D @types/cors`
- Add CORS middleware before routes:
  ```typescript
  import cors from 'cors';
  app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://linkupgoapp.com'],
    credentials: true,
  }));
  ```
- Needed because web app on `linkupgoapp.com` calls API on `api.linkupgoapp.com`

#### 2b. Fix session cookie for cross-subdomain
**File: `server/index.ts`**
- Add `domain` and `sameSite` to cookie config:
  ```typescript
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    sameSite: 'lax',
    domain: process.env.COOKIE_DOMAIN || undefined,
  }
  ```
- In production, set `COOKIE_DOMAIN=.linkupgoapp.com` so cookies work across subdomains

#### 2c. Update web client API calls
**File: `client/src/lib/api.ts`** (or wherever fetch calls are made)
- Currently uses relative URLs (`/api/...`) which assume same origin
- Need to prefix with `VITE_API_URL` env var for cross-domain:
  ```typescript
  const API_BASE = import.meta.env.VITE_API_URL || '';
  ```
- Set `VITE_API_URL=https://api.linkupgoapp.com` at build time

#### 2d. Update web client WebSocket URL
**File: `client/src/lib/context.tsx`**
- WebSocket currently connects to same host via `window.location`
- Need to derive from API URL: `wss://api.linkupgoapp.com/ws`

---

### Phase 3: Dockerize

#### 3a. API Dockerfile
**New file: `Dockerfile`**
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
ENV NODE_ENV=production
EXPOSE 8080
CMD ["node", "dist/index.cjs"]
```

Note: Cloud Run expects port 8080 by default. Set `PORT=8080` env var.

The `dist/index.cjs` includes the bundled server. The `dist/public/` contains the built frontend — but for the split architecture, the API service won't serve static files.

#### 3b. Separate web app serving
For `linkupgoapp.com`, two options:

**Option A (Recommended): Serve from same Cloud Run service**
- The API service already serves `dist/public/` as static files in production
- Map `linkupgoapp.com` → same Cloud Run service
- Map `api.linkupgoapp.com` → same Cloud Run service
- Both domains hit the same container; Express serves static files for non-API routes
- Cheapest: single service, single container

**Option B: Separate static hosting**
- Use Cloud Run or Firebase Hosting for static files
- More complex, but cleaner separation

**Recommendation: Option A** — single Cloud Run service handles both. The server already serves static files via `dist/public/` for non-API routes. This halves the cost.

#### 3c. .dockerignore
**New file: `.dockerignore`**
```
node_modules
mobile
.git
.env
*.md
```

---

### Phase 4: Google Cloud Run Deployment

#### 4a. Prerequisites
1. Install [Google Cloud CLI](https://cloud.google.com/sdk/docs/install)
2. Create a GCP project: `gcloud projects create linkupgo`
3. Enable Cloud Run API: `gcloud services enable run.googleapis.com`
4. Enable Artifact Registry: `gcloud services enable artifactregistry.googleapis.com`

#### 4b. Build and deploy
```bash
# Authenticate
gcloud auth login
gcloud config set project linkupgo

# Deploy from source (Cloud Build builds the Docker image)
gcloud run deploy linkupgo \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 2 \
  --set-env-vars "NODE_ENV=production"
```

#### 4c. Set environment variables (secrets)
```bash
# Create secrets
gcloud run services update linkupgo --region us-central1 \
  --set-env-vars "\
DATABASE_URL=postgresql://...(neon connection string),\
SESSION_SECRET=<random-secret>,\
JWT_SECRET=<random-secret>,\
AI_INTEGRATIONS_OPENAI_API_KEY=<gemini-key>,\
AI_INTEGRATIONS_OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/,\
GOOGLE_PLACES_API_KEY=<key>,\
COOKIE_DOMAIN=.linkupgoapp.com,\
ALLOWED_ORIGINS=https://linkupgoapp.com,\
PORT=8080"
```

#### 4d. Map custom domains
```bash
# Map both domains to the same service
gcloud run domain-mappings create --service linkupgo --domain linkupgoapp.com --region us-central1
gcloud run domain-mappings create --service linkupgo --domain api.linkupgoapp.com --region us-central1
```

Then add the DNS records (CNAME) shown by Cloud Run to your domain registrar.

---

### Phase 5: iOS App Store Deployment

#### 5a. Prerequisites
- Apple Developer Account ($99/year) at [developer.apple.com](https://developer.apple.com/programs)
- EAS CLI: `npm install -g eas-cli && eas login`

#### 5b. Configure production API URL
**File: `mobile/eas.json`** — add env to production profile:
```json
{
  "build": {
    "production": {
      "env": {
        "EXPO_PUBLIC_API_URL": "https://api.linkupgoapp.com"
      }
    }
  }
}
```

#### 5c. Update app.json for production
**File: `mobile/app.json`**
- Remove `NSAllowsArbitraryLoads: true` (not allowed in App Store)
- Keep `NSAllowsLocalNetworking: true` only in dev builds
- Increment version number

#### 5d. Build for App Store
```bash
cd mobile
eas build --platform ios --profile production
```

#### 5e. Submit to App Store
```bash
eas submit --platform ios
```

#### 5f. App Store Connect setup
1. Create app listing at [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. Required assets:
   - App name, subtitle, description, keywords
   - Screenshots: 6.7" (iPhone 15 Pro Max) and 6.1" (iPhone 15 Pro)
   - App icon (1024x1024)
   - Privacy policy URL (required)
   - Support URL
3. Select category: "Social Networking" or "Lifestyle"
4. Submit for review (1-3 days typically)

---

### Phase 6: DNS Configuration

At your domain registrar for `linkupgoapp.com`:

| Type | Name | Value |
|------|------|-------|
| CNAME | @ | ghs.googlehosted.com (from Cloud Run) |
| CNAME | api | ghs.googlehosted.com (from Cloud Run) |

Cloud Run provides the exact DNS records after domain mapping.

---

## New Environment Variables (Production)

| Variable | Value | Where |
|----------|-------|-------|
| `COOKIE_DOMAIN` | `.linkupgoapp.com` | Cloud Run env |
| `ALLOWED_ORIGINS` | `https://linkupgoapp.com` | Cloud Run env |
| `VITE_API_URL` | `https://api.linkupgoapp.com` | Build-time (Vite) |
| `PORT` | `8080` | Cloud Run env |
| `EXPO_PUBLIC_API_URL` | `https://api.linkupgoapp.com` | EAS build env |

## Files to Create/Modify
- `Dockerfile` (new)
- `.dockerignore` (new)
- `server/index.ts` (add CORS, fix cookie config)
- `client/src/lib/api.ts` (add API_BASE from env)
- `client/src/lib/context.tsx` (fix WebSocket URL for cross-domain)
- `mobile/eas.json` (add production API URL)
- `mobile/app.json` (remove dev-only NSAllowsArbitraryLoads)

## Cost Summary

| Item | Monthly | Annual |
|------|---------|--------|
| Neon PostgreSQL (free tier) | $0 | $0 |
| Cloud Run (free tier) | $0 | $0 |
| Apple Developer Program | — | $99 |
| Domain (linkupgoapp.com) | ~$1 | ~$12 |
| **Total** | **~$1** | **~$111** |

## Verification
1. Deploy to Cloud Run → verify `https://api.linkupgoapp.com/api/auth/me` returns 401
2. Verify `https://linkupgoapp.com` loads the React app
3. Register/login on web → verify cookies work across subdomains
4. Build iOS app with production URL → verify login + planner work
5. Test WebSocket: `wss://api.linkupgoapp.com/ws` connects
6. Submit iOS app → pass App Store review
