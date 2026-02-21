# LinkUpGo

AI-driven social event planning for groups. React frontend, Express backend, PostgreSQL via Drizzle ORM, real-time WebSockets.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (for local PostgreSQL)
- Node.js 20+
- npm

## Local Setup

```bash
# 1. Clone and install
git clone <repo-url> && cd LinkUpGo
npm install

# 2. Start PostgreSQL (port 5434)
docker compose up -d

# 3. Set up environment
cp .env.example .env
# Edit .env to add API keys (OpenAI, Google Places, etc.)

# 4. Run database migrations
npm run db:generate   # Generate migration files from schema
npm run db:migrate    # Apply migrations

# 5. Seed test data (optional)
npm run db:seed

# 6. Start dev server (port 5003)
npm run dev
```

Open http://localhost:5003. Test accounts after seeding: `alice`, `bob`, `carla`, `dave` (password: `password123`).

## npm Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Express + Vite dev server on port 5003 |
| `npm run dev:client` | Start Vite client only on port 5003 |
| `npm run build` | Production build (outputs to `dist/`) |
| `npm run start` | Run production build |
| `npm run check` | TypeScript type-check |
| `npm run db:push` | Push schema directly (quick dev iteration) |
| `npm run db:generate` | Generate SQL migration files |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Seed database with test data |

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Express session secret |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | For AI features | OpenAI API key |
| `GOOGLE_PLACES_API_KEY` | For venue data | Google Places API key |
| `TICKETMASTER_API_KEY` | No | Ticketmaster API key (live events) |
| `PERPLEXITY_API_KEY` | No | Perplexity API key (web search) |
| `RESEND_API_KEY` | No | Resend API key (email notifications) |

## Port Assignments

- **5003** — App (Express + Vite dev server)
- **5434** — PostgreSQL (Docker)
