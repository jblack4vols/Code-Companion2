# CLAUDE.md — crm.tristarpt.com
# Tristar Physical Therapy — Internal Operations CRM
# Owner: Jordan Black | GitHub: jblack4vols
# Last updated: 2026-04-16

---

## Project Overview

**Name:** Code Companion (TriStar PT Physician Referral CRM)
**Type:** Full-stack TypeScript web application
**Purpose:** Physician referral management CRM for an 8-location physical therapy practice. Tracks referring physicians, referral volumes, interactions, revenue recovery, unit economics, and territory management.

## Tech Stack

| Layer | Technology |
|---|---|
| Client | React 18, Vite 7, wouter (routing), TanStack Query v5 |
| UI | shadcn/ui (Radix primitives), Tailwind CSS 3, Lucide icons, Framer Motion |
| Server | Express 5 (Node.js), TypeScript, `tsx` runtime |
| ORM | Drizzle ORM 0.39 + `pg` driver |
| Database | PostgreSQL 16 (Neon in prod, local/Neon in dev) |
| Auth | Session-based (cookie), bcryptjs, connect-pg-simple |
| Email | Nodemailer (SMTP) with MS Graph fallback |
| Build | Vite (client) + esbuild (server bundle) |
| Testing | Vitest (server unit tests) |

## Directory Structure

```
client/                  React SPA (Vite root)
  src/
    App.tsx              Root component — providers, routing, layout
    pages/               ~45 wouter route components (lazy-loaded)
    components/          App-level components (sidebar, search, idle-timeout)
    components/ui/       shadcn/ui primitives (~45 components)
    hooks/               use-debounce, use-mobile, use-toast
    lib/                 queryClient (CSRF + fetch), auth context, utils
server/
  index.ts              Express bootstrap, startup sequencing, health check
  routes.ts             Middleware chain + route module registration
  routes/               24 route modules (auth, physicians, referrals, etc.)
  middleware/            auth, csrf, envValidation, errorHandler, rateLimiter
  db.ts                 pg Pool + Drizzle instance + search indexes
  storage.ts            Data access layer (IStorage interface, ~100k lines)
  storage-*.ts          Modular storage files (appeals, billing-lag, unit-economics, etc.)
  etl.ts                Cron jobs (nightly ETL, digests, reports)
  outlook.ts            Email sending (SMTP + Graph)
  sharepoint.ts         SharePoint sync via Graph API
  seed.ts               Idempotent sample data seeding
  __tests__/            11 Vitest test files
shared/
  schema.ts             Drizzle table/enum definitions (shared types for client+server)
scripts/                Data import/export utilities (providers, referrals)
script/
  build.ts              Production build script (Vite + esbuild)
docs/                   Project documentation
plans/                  Implementation plans and reports
```

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start dev server (port 5000, Vite HMR) |
| `npm run build` | Production build (Vite client + esbuild server) |
| `npm run start` | Run production build |
| `npm run check` | TypeScript type checking (`tsc --noEmit`) |
| `npm run db:push` | Push Drizzle schema to PostgreSQL |
| `npx vitest run` | Run all tests |
| `npx vitest run server/__tests__/<file>` | Run specific test file |

## Environment Variables

Required (see `.env.example`):
- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — Random string, min 16 chars

Optional:
- `SEED_OWNER_PASSWORD` / `SEED_USER_PASSWORD` — Override default seed passwords
- `PORT` — Server port (default 5000)
- `SMTP_USER`, `SMTP_HOST`, `SMTP_PORT` — Email configuration
- `REPL_ID` — Replit detection (enables Replit-specific plugins)

## Architecture

### Path Aliases

```
@/*       → client/src/*
@shared/* → shared/*
@assets   → attached_assets/
```

### API Pipeline

```
Client fetch → Express middleware chain:
  cookieParser → security headers → express-session (PgStore)
  → rate limiter (120 req/min) → CSRF double-submit cookie
  → route handler → storage layer (Drizzle) → PostgreSQL
```

### Authentication & Authorization

- Session-based with cookie, 15 min rolling timeout
- 5 roles: OWNER > DIRECTOR > MARKETER > FRONT_DESK > ANALYST
- OWNER bypasses all role checks
- Ownership enforcement on mutations (interactions, tasks, calendar, referrals, physicians)
- Location scoping via `user_location_access` junction table
- CSRF protection via double-submit cookie pattern

### Data Layer

- Schema defined in `shared/schema.ts` (Drizzle ORM)
- Storage interface pattern: `IStorage` in `server/storage.ts`
- Modular storage files for domain-specific logic (`storage-*.ts`)
- Soft deletes on: physicians, referrals, interactions
- All PKs are `varchar(36)` UUIDs via `gen_random_uuid()`
- Migrations: `drizzle-kit push` (no migration files — direct schema push)

### Client Patterns

- All pages lazy-loaded via `React.lazy()` + `Suspense`
- Routing: `wouter` (lightweight alternative to React Router)
- Data fetching: TanStack Query v5 with `staleTime: Infinity`, manual invalidation
- CSRF tokens auto-attached to mutating requests via `apiRequest()` helper
- Auth context via `useAuth()` hook — reads `/api/auth/me`

### Scheduled Jobs (ETL)

| Schedule | Job | Description |
|---|---|---|
| Daily 2:00 AM | `runETL()` | Monthly summaries, physician stage updates, provider alerts |
| Weekdays 7:00 AM | `sendOverdueDigests()` | Email overdue task digest to assigned users |
| Daily 6:30 AM | `processScheduledReports()` | CSV report generation + email delivery |
| Monday 8:00 AM | `checkUserInactivity()` | Alert admins about users inactive 7+ days |

## Role & Responsibilities

`crm.tristarpt.com` is Tristar Physical Therapy's internal operations platform — a full-stack
Next.js app deployed on Railway. It consolidates referral intelligence, financial analytics,
provider management, scheduling ops, and marketing automation into a single owner-facing
dashboard. It is NOT a patient-facing product.

**Long-term goal:** Productize this stack as a licensable SaaS layer for other PT practice owners.
Every architectural decision should be made with multi-tenant extensibility in mind.

---

## 2. Tech Stack

## Key Conventions

### File Naming
- kebab-case for all files (e.g., `storage-billing-lag.ts`, `revenue-appeals.tsx`)
- Descriptive names — LLM-friendly for Grep/Glob discovery

### Code Quality
- TypeScript strict mode enabled
- Zod for runtime validation (API inputs, env vars)
- drizzle-zod for schema-derived validators
- Error handling via global error handler middleware
- Security headers set on all responses (CSP, HSTS, X-Frame-Options)

### Testing
- Tests in `server/__tests__/` using Vitest
- Tests cover: authorization, ownership, business logic, calculations, import parsing
- Run `npx vitest run` before committing

### Modularization
- Code files should stay under 200 lines
- Storage logic split into `storage-*.ts` modules
- Route modules in `server/routes/` (one per domain)
- UI components in `client/src/components/ui/` (shadcn/ui)

## Hook Response Protocol

**Azure AD credentials (SSO):**
- App ID: `debda2f0-a35b-44c9-8e0b-9d1d306c49a8`
- Tenant ID: `668d2c67-481c-4c6c-8904-b08dfd68308c`

---

## 3. Brand & Design Tokens

Always use these exact values. Never substitute with generic Tailwind colors.

**IMPORTANT:** Always ask the user via `AskUserQuestion` first. Never try to work around the privacy block without explicit user approval.

---

## 4. Supabase Projects

**IMPORTANT:** When scripts of skills failed, don't stop, try to fix them directly.

## Documentation

All project docs live in `./docs/`:

| File | Content |
|---|---|
| `system-architecture.md` | Stack, directory layout, request flow, middleware chain, startup sequence |
| `data-model.md` | All tables, enums, relationships, indexes, soft delete patterns |
| `permissions.md` | Role-permission matrix, ownership enforcement, location scoping |
| `local-dev.md` | Setup steps (npm install, .env, db:push, dev server) |
| `workflows.md` | At-risk referral source detection and staff workflow |
| `improvement-backlog.md` | Prioritized backlog with status tracking |

**IMPORTANT:** *MUST READ* and *MUST COMPLY* all *INSTRUCTIONS* in project `./CLAUDE.md`, especially *WORKFLOWS* section is *CRITICALLY IMPORTANT*, this rule is *MANDATORY. NON-NEGOTIABLE. NO EXCEPTIONS. MUST REMEMBER AT ALL TIMES!!!*
