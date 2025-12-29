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

### Authentication Flow
- Registration collects user preferences during onboarding (multi-step form)
- Session stored in PostgreSQL, cookie-based authentication
- Protected routes redirect to onboarding if no user session exists
- Join links (`/join/:code`) handle group invites with auth redirect

### Key Design Patterns
- **Shared Types**: Schema definitions in `shared/` directory used by both client and server
- **API Client**: Centralized `api.ts` module wraps fetch calls with credentials and error handling
- **Context Provider**: `AppProvider` manages user, groups, and sessions state with API synchronization
- **Path Aliases**: `@/` for client source, `@shared/` for shared code

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