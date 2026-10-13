# System Architecture

## Stack Overview

| Layer | Technology |
|---|---|
| Client | React 18, Vite 7, wouter (routing), TanStack Query v5 |
| UI | shadcn/ui (Radix primitives), Tailwind CSS 3, Lucide icons, Framer Motion |
| Server | Express 5 (Node.js), TypeScript, `tsx` runtime |
| ORM | Drizzle ORM 0.39 + `pg` driver |
| Database | PostgreSQL 16 (Neon in prod, local or Neon in dev) |
| Auth | Session-based (cookie), bcryptjs, connect-pg-simple |
| Email | Nodemailer (SMTP) with MS Graph fallback |

## Directory Layout

```
client/                  React SPA (Vite root)
  src/
    pages/               wouter route components
    components/ui/       shadcn/ui primitives
    lib/                 queryClient, auth context, utils
server/
  index.ts              Express bootstrap + startup sequencing
  routes.ts             Middleware chain + route registration
  db.ts                 pg Pool + Drizzle instance + search indexes
  storage.ts            Data access layer (IStorage interface)
  vite.ts               Dev: Vite middleware mode
  static.ts             Prod: static file serving
  etl.ts                Cron jobs (nightly ETL, digests, reports)
  outlook.ts            Email sending (SMTP + Graph)
  sharepoint.ts         SharePoint sync via Graph API
  middleware/            auth, csrf, envValidation, errorHandler, rateLimiter
  routes/               36 route modules (auth, physicians, referrals, revenue-recovery, etc.)
  storage-*.ts          19 domain storage modules (revenue-recovery, bcbs-audit, billing-lag, etc.)
shared/
  schema.ts             Drizzle table/enum definitions (shared types for client+server)
script/
  build.ts              Production build (vite + esbuild bundle)
```

## Request Flow

### Development

Vite runs in middleware mode on the same Express `httpServer`. HMR WebSocket at `/vite-hmr`. No separate proxy — same port 5000 for API + assets.

### Production

`npm run build` outputs `dist/public` (Vite) + `dist/index.cjs` (esbuild bundle).
`npm run start` → `node dist/index.cjs` serves static files from `dist/public` with SPA catch-all.

### API Pipeline

```
Client fetch
  → Express middleware chain:
      cookieParser → security headers → express-session (PgStore)
      → rate limiter (120 req/min) → CSRF double-submit cookie
      → route handler
        → storage layer (Drizzle) → pg Pool → PostgreSQL
  ← res.json(data)
```

## Middleware Chain (registered in `server/routes.ts`)

1. `cookie-parser` — required for CSRF cookie reads
2. Security headers — X-Content-Type-Options, X-Frame-Options, CSP, HSTS (prod)
3. `express-session` — PgStore-backed, 15 min rolling, httpOnly, secure in prod, sameSite=lax
4. `apiLimiter` on `/api` — 120 req per 1 min window
5. CSRF (custom double-submit cookie) — skipped for API-key requests and `/api/public/*`
6. Route handlers (18 modules)
7. Global error handler

## Startup Sequence (`server/index.ts`)

1. `import "dotenv/config"` → load `.env`
2. `validateEnv()` → zod check on `DATABASE_URL`, `SESSION_SECRET`
3. Express created, `trust proxy 1` set
4. `/health` registered immediately (pre-middleware, always 200)
5. JSON + URL-encoded body parsers
6. Request logger (logs `/api` paths with duration + response body)
7. 503 gate — blocks non-health requests until `appReady = true`
8. Listen on port → async init:
   - `registerRoutes()` — middleware + all routes
   - Dev: `setupVite()` / Prod: `serveStatic()`
   - `appReady = true`
   - `ensureSearchIndexes()` — pg_trgm + 25 B-tree/GIN indexes
   - `seed()` — idempotent sample data
   - `scheduleETL()` — 4 cron jobs

## External Integrations

| Service | Transport | Purpose |
|---|---|---|
| Microsoft Outlook | SMTP (primary), Graph API (fallback) | Transactional email |
| Microsoft SharePoint | Graph API via Replit Connectors | Two-way data sync (physicians, referrals, etc.) |
| Replit Connectors | REST (internal) | OAuth token broker for Outlook/SharePoint |

## Hosting

Originally built for **Replit** (`.replit` config present, Replit vite plugins, Replit Connectors for OAuth).

Replit-specific env vars: `REPL_ID`, `REPLIT_CONNECTORS_HOSTNAME`, `REPL_IDENTITY`, `REPLIT_DEV_DOMAIN`.

Portable: runs locally with `dotenv` + Neon DB. Replit plugins only activate when `REPL_ID` is defined. SharePoint/Outlook integrations gracefully degrade without connector env vars.

## Scheduled Jobs (ETL)

| Schedule | Job | Description |
|---|---|---|
| Daily 2:00 AM | `runETL()` | Monthly summaries, physician stage updates, provider alerts |
| Weekdays 7:00 AM | `sendOverdueDigests()` | Email overdue task digest to assigned users |
| Daily 6:30 AM | `processScheduledReports()` | CSV report generation + email delivery |
| Monday 8:00 AM | `checkUserInactivity()` | Alert admins about users inactive 7+ days |

Schedules configurable via `app_settings` table.
