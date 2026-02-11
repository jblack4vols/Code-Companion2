# Tristar 360° - Physician Relationship Management (PRM)

## Overview
A web application for an outpatient physical therapy business with 8 clinic locations. Helps the team track and grow physician referral relationships, log outreach/visits, and measure referrals with dashboards.

## Tech Stack
- **Frontend**: React + Vite + TypeScript, Tailwind CSS, shadcn/ui
- **Backend**: Express.js, Drizzle ORM
- **Database**: PostgreSQL (Neon-backed)
- **Auth**: Session-based with express-session, connect-pg-simple store

## Project Structure
```
client/src/
  App.tsx - Main app with routing, auth, sidebar layout
  lib/auth.tsx - Auth context, login/logout, RBAC helpers
  lib/queryClient.ts - TanStack Query setup
  components/app-sidebar.tsx - Main navigation sidebar
  components/theme-provider.tsx - Light/dark theme
  pages/
    login.tsx - Login page
    dashboard.tsx - Dashboard with charts
    physicians.tsx - Physician list with filters
    physician-detail.tsx - Physician detail with tabs
    interactions.tsx - Interactions log
    referrals.tsx - Referral tracking
    tasks.tsx - Task work queue
    admin-users.tsx - User management
    admin-settings.tsx - Settings + HIPAA notice
server/
  index.ts - Express server entry
  db.ts - Drizzle database connection
  storage.ts - IStorage interface + DatabaseStorage class
  routes.ts - All API routes with RBAC middleware
  seed.ts - Database seeding (8 locations, 5 users, 10 physicians, etc.)
shared/
  schema.ts - Drizzle schema + Zod schemas + TypeScript types
```

## Key Features
- **Authentication**: Session-based, email/password login
- **RBAC**: OWNER (full access), DIRECTOR, MARKETER, FRONT_DESK (referrals only), ANALYST (read-only)
- **Physicians**: List, detail, create, edit with status/stage/priority tracking
- **Interactions**: Log visits, calls, emails, events with physician timeline
- **Referrals**: Track anonymized referrals (no PHI), CSV export
- **Tasks**: Follow-up work queue with completion tracking
- **Dashboard**: Charts for referral trends, top referrers, at-risk physicians

## Default Credentials
- Email: admin@tristar360.com
- Password: admin123

## Database
- Uses PostgreSQL via DATABASE_URL environment variable
- Schema managed with Drizzle ORM, push with `npm run db:push`
- Auto-seeds on first start

## User Preferences
- Healthcare professional aesthetic
- Data-dense, efficient UI
- Dark mode support
