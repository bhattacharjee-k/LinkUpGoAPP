# VibeCheck - Social Event Planner

## Overview

VibeCheck is an AI-driven social planning application for young professionals in NYC and Chicago. It enables users to create groups ("squads"), plan social events collaboratively, vote on suggestions, and lock in plans. The app features user onboarding with preference collection, group management with invite codes, and session-based event planning with voting mechanics.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript, using Vite as the build tool
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: React Context API (`AppProvider`) for global state, TanStack React Query for server state
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS v4 with custom theme variables for dark mode social app aesthetic
- **Animations**: Framer Motion for page transitions and micro-interactions

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **API Design**: RESTful JSON API under `/api` prefix
- **Session Management**: Express-session with PostgreSQL session store (connect-pg-simple)
- **Authentication**: Custom username/password auth with bcryptjs for password hashing, session-based auth stored in cookies
- **Build System**: esbuild for server bundling, Vite for client bundling

### Data Storage
- **Database**: PostgreSQL with Drizzle ORM
- **Schema Location**: `shared/schema.ts` contains all table definitions
- **Key Entities**:
  - `users`: User profiles with preferences (city, budget, energy level, categories, hard nos)
  - `groups`: Social groups with invite codes and admin ownership
  - `groupMembers`: Junction table for group membership
  - `sessions`: Planning sessions tied to groups with status tracking
  - `sessionParticipants`: Users participating in sessions with status
  - `suggestions`: Event suggestions with voting data
  - `messages`: Chat messages within sessions
  - `votes`: Individual votes on suggestions
  - `notifications`: In-app notifications with type, title, body, url, isRead
  - `notification_prefs`: Per-user email notification preferences
  - `proposedTimes`: Alternative time proposals for sessions with voting support
  - `eventFeedback`: Post-event ratings (1-5 stars), reviews, tags, and recommendations

### Authentication Flow
- Registration collects user preferences during onboarding (multi-step form)
- Session stored in PostgreSQL, cookie-based authentication
- Protected routes redirect to onboarding if no user session exists
- Join links (`/join/:code`) handle group invites with auth redirect

### Notifications System
- **In-App Notifications**: Bell icon with unread badge, Updates page (`/updates`) for viewing all notifications
- **Notification Types**: INVITE, AVAILABILITY_NUDGE, VOTE_OPEN, PLAN_LOCKED, PLAN_UPDATED
- **Email Support**: Optional email notifications via Resend API (requires RESEND_API_KEY, FROM_EMAIL, APP_BASE_URL)
- **Triggers**: Join session, lock plan, voting open, availability nudge (with 12-hour cooldown)
- **Preferences**: Per-user email toggle stored in notification_prefs table
- **Helper Module**: `server/notifications.ts` handles creation and email sending
- **Calendar Invites**: When a plan is locked with a confirmed date, .ics calendar files are generated and attached to emails

### Post-Event Feedback System
- **Feedback Collection**: Users can rate events 1-5 stars after plans are locked
- **Feedback Data**: Rating, optional review text, tags (great_vibes, good_food, crowded, etc.), recommendation boolean
- **Single Submission**: Users can only submit feedback once per session
- **Venue Learning**: `getVenueAverageRating` aggregates feedback by venue name for algorithm learning
- **API Endpoints**: GET/POST `/api/sessions/:sessionId/feedback`, GET `/api/feedback/venue/:name`
- **UI Location**: Feedback CTA banner appears on locked session pages

### Key Design Patterns
- **Shared Types**: Schema definitions in `shared/` directory used by both client and server
- **API Client**: Centralized `api.ts` module wraps fetch calls with credentials and error handling
- **Context Provider**: `AppProvider` manages user, groups, and sessions state with API synchronization
- **Path Aliases**: `@/` for client source, `@shared/` for shared code

### AI Planner with Function Calling
- **OpenAI Function Calling**: The planner uses OpenAI's function calling to modify suggestions in real-time
- **Available Tools**:
  - `regenerate_suggestions`: Regenerate venue/event suggestions with new filters (categories, budget, neighborhood)
  - `add_suggestion`: Add a specific venue or event to the current suggestion list
  - `remove_suggestion`: Remove a specific suggestion by name
- **Context Updates**: Tool handlers update the in-memory context for subsequent calls in the same request
- **SSE Response**: Planner route sends `suggestionsUpdated` flag when suggestions change, with `newSuggestions` array

### API Integrations
- **Google Places API (New)**: Real venue suggestions with location data, ratings, price levels
- **Ticketmaster Discovery API**: Live event/concert information with ticket URLs
- **Caching**: LRU cache with stale-while-revalidate (10m suggestions, 15m Places, 5m events)
- **City Filtering**: Haversine distance with 35mi (NYC) / 30mi (Chicago) radius boundaries

### Multi-Bucket Suggestion Generation (Diversity-First)
- **SAFE bucket**: 2 options with high rating (≥4.4), higher review count (≥50), preferred radius
- **EXPLORE bucket**: 2 options with lower review count (<200), expanded radius (+25%), novelty-weighted
- **WILDCARD bucket**: 1 option with relaxed constraints, random selection for surprise
- **Deduplication**: By placeId/eventId/name before bucket selection
- **Downvote Learning**: "Too far" tightens radius, "Too expensive" tightens budget filtering
- **Quota Redistribution**: Fills from remaining candidates if buckets are empty
- **Internal Tagging**: generationType field for debugging (not shown in UI)

### Discovery Preferences (Curated Suggestions)
- **Discovery Style**: User preference collected in onboarding step 6
  - `hidden_gems`: Favors EXPLORE bucket (3 explore, 1 safe, 1 wildcard), lower review thresholds
  - `popular`: Favors SAFE bucket (3 safe, 1 explore, 1 wildcard), higher review thresholds
  - `mixed`: Balanced approach (2 safe, 2 explore, 1 wildcard)
- **Crowd Preference**: `quiet`, `buzzing`, or `no_preference`
  - Estimates venue crowd level from review count and venue types
  - Boosts matching venues (+5 points), slight penalty for mismatches (-2 points)
- **Favorite Neighborhoods**: User-selected neighborhoods in their city
  - Soft boost (+3 for safe, +20 for explore) for venues in preferred neighborhoods
- **Integration**: Preferences are automatically merged from user profile in /api/suggest route

### Reference Venues (Style Anchoring)
- **Optional Input**: Users can select 1-3 favorite places during plan creation
- **Google Places Autocomplete**: Search for venues with city bias
- **Reference Profile Extraction**: Fetches venue details (price, rating, types, hours) to derive:
  - `preferredPriceTier`: Average price level ± tolerance
  - `preferredTypes`: Weighted venue types from references
  - `qualityFloor`: Rating bias for SAFE bucket
  - `energyBias`: Day/night/mixed based on opening hours
  - `hasConflicts`: Detects conflicting styles to widen EXPLORE bucket
- **Soft Biases Only**: Never discards candidates, only influences ranking and bucket filtering
- **Stored on Session**: `referenceVenues` field in sessions table

### Production Quality Infrastructure
- **API Validation**: Zod schemas in `shared/api-schemas.ts` for all request/response types
- **Permission Middleware**: `server/middleware/auth.ts` with requireAuth, requireGroupAdmin, requireGroupMember, requireSessionParticipant
- **Error Handling**: Centralized error handler in `server/middleware/error-handler.ts` with custom error classes
- **Logging**: Structured logging with correlation IDs in `server/logger.ts`
- **Caching Layer**: LRU cache implementation in `server/cache.ts`
- **UAT Checklist**: `docs/UAT-CHECKLIST.md` with golden paths and edge cases
- **Load Testing**: `scripts/load-test.cjs` using autocannon for p95 latency and error rate testing

## External Dependencies

### Database
- **PostgreSQL**: Primary database, connection via `DATABASE_URL` environment variable
- **Drizzle ORM**: Type-safe database queries and schema management
- **connect-pg-simple**: Session storage in PostgreSQL

### UI Libraries
- **Radix UI**: Headless UI primitives (dialogs, dropdowns, tabs, etc.)
- **shadcn/ui**: Pre-styled component collection
- **Lucide React**: Icon library
- **Framer Motion**: Animation library
- **date-fns**: Date formatting utilities

### Build Tools
- **Vite**: Frontend dev server and bundler
- **esbuild**: Server code bundling for production
- **Tailwind CSS v4**: Utility-first CSS framework

### Replit-Specific
- **@replit/vite-plugin-runtime-error-modal**: Development error overlay
- **@replit/vite-plugin-cartographer**: Development tooling
- **@replit/vite-plugin-dev-banner**: Development environment indicator