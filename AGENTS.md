# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Context

For project status, ownership, and current priorities (the suggestions-algorithm rebuild), read `docs/PROJECT-CONTEXT.md` first.

## Build & Dev Commands

```bash
npm run dev              # Start server (Express + Vite dev middleware) on port 5003
npm run dev:client       # Start Vite client only on port 5003
npm run build            # Production build (runs script/build.ts → dist/)
npm run start            # Run production build (node dist/index.cjs)
npm run check            # TypeScript type-check (tsc --noEmit)
npm run test             # Run all tests (vitest)
npm run test:watch       # Run tests in watch mode
npm run db:push          # Push Drizzle schema changes to PostgreSQL
```

### Testing

Tests use **Vitest** with config in `vitest.config.ts`. Test files are in `tests/` directory:
- `tests/shared/` — Shared module tests (ranking, API schemas, constants)
- `tests/server/` — Server tests (cache, error handler, auth middleware)
- `tests/client/` — Client component tests (uses jsdom environment)

No linter is configured.

## Architecture

**Full-stack TypeScript app** — AI-driven social event planning for groups. React 19 frontend, Express backend, PostgreSQL via Drizzle ORM, real-time WebSockets.

### Directory Layout

- `client/src/` — React frontend (Vite, Wouter routing, TanStack Query, shadcn/ui + Tailwind v4, Framer Motion)
- `server/` — Express backend (session auth, REST API, WebSocket server, AI integration)
- `shared/` — Code shared between client and server (Drizzle schema, Zod API schemas, neighborhood data)

### Path Aliases (tsconfig)

- `@/*` → `client/src/*`
- `@shared/*` → `shared/*`

### Key Server Files

- `server/routes.ts` — All API route handlers (~1400 lines)
- `server/storage.ts` — Database access layer (Drizzle ORM interface)
- `server/suggestions.ts` — Suggestion generation pipeline with orchestrator + legacy bucket fallback (~1500 lines)
- `server/planner.ts` — OpenAI function-calling planner (tools: regenerate_suggestions, add_suggestion, remove_suggestion)
- `server/orchestrator.ts` — AI-driven context synthesis, smart querying, and ranking
- `server/middleware/auth.ts` — Auth middleware (requireAuth, requireGroupAdmin, requireGroupMember, requireSessionParticipant)

### Key Client Files

- `client/src/App.tsx` — Router with auth guards
- `client/src/lib/context.tsx` — AppProvider with global state and WebSocket connection
- `client/src/lib/api.ts` — Centralized API client
- `client/src/pages/session.tsx` — Main session page with voting/chat (~2000 lines)

### Data Flow

1. **Auth**: Session-based (express-session + connect-pg-simple), cookie auth, bcrypt passwords
2. **State**: React Context for global state, TanStack Query for server state, WebSocket for real-time updates
3. **Sessions lifecycle**: draft → voting → locked
4. **AI pipeline**: User messages mentioning @Planner trigger OpenAI function calling → tool calls modify suggestions → SSE streams updates to client
5. **Suggestion orchestration**: Context synthesis → parallel API queries (Google Places, Perplexity) → AI validation & ranking with personalized "why" explanations

### Database

Schema defined in `shared/schema.ts` using Drizzle ORM. Core tables: users, groups, groupMembers, sessions, suggestions, votes, messages, notifications, eventFeedback.

### External APIs

- **OpenAI** (via `AI_INTEGRATIONS_OPENAI_*` env vars) — planner and orchestrator
- **Google Places** (`GOOGLE_PLACES_API_KEY`) — venue data
- **Perplexity** (`PERPLEXITY_API_KEY`) — web search for trending spots
- **Resend** (`RESEND_API_KEY`) — optional email notifications

### Caching

LRU cache with stale-while-revalidate in `server/cache.ts`. TTLs: suggestions 10min, places 15min, events 5min.

### Error Handling

Custom error classes in `server/middleware/error-handler.ts` (AppError, ValidationError, NotFoundError, etc.) with centralized error handler middleware. Zod validation errors are auto-formatted.

## Conventions

- UI components use shadcn/ui (in `client/src/components/ui/`). Add new ones via the shadcn CLI pattern.
- Validation schemas live in `shared/api-schemas.ts` (Zod) and are shared between client and server.
- WebSocket events: `join`, `leave`, `new_message`, `vote_update`, `session_update`.
- Location modes: `near_me`, `explore_anywhere`, `meet_in_the_middle`.
- Originally deployed on Replit — some Replit-specific plugins in devDependencies and `server/replit_integrations/`.
