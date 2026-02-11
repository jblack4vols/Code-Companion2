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
    physicians.tsx - Physician list with filters + pagination
    physician-detail.tsx - Physician detail with tabs
    interactions.tsx - Interactions log
    referrals.tsx - Referral/cases tracking with detail dialog
    tasks.tsx - Task work queue
    calendar.tsx - Calendar with event management
    admin-users.tsx - User management
    admin-settings.tsx - Settings + HIPAA notice
    sharepoint-sync.tsx - SharePoint Lists sync admin page
server/
  index.ts - Express server entry
  db.ts - Drizzle database connection
  storage.ts - IStorage interface + DatabaseStorage class
  routes.ts - All API routes with RBAC middleware
  sharepoint.ts - SharePoint Lists sync via Microsoft Graph API (batch operations)
  seed.ts - Database seeding (users only, real data imported)
shared/
  schema.ts - Drizzle schema + Zod schemas + TypeScript types
scripts/
  import-providers.ts - Import referring providers from Excel
  import-referrals.ts - Import cases/referrals from Excel
```

## Key Features
- **Authentication**: Session-based, email/password login
- **RBAC**: OWNER (full access), DIRECTOR, MARKETER, FRONT_DESK (referrals only), ANALYST (read-only)
- **Physicians**: 3,765 referring providers (deduplicated) imported from Excel with credentials, NPI, practice info, paginated (50/page) with sortable columns
- **Referrals**: 6,041 real cases imported with full case details, 5,842 linked to physicians by NPI, 199 self-referrals/walk-ins unlinked. Referral table includes referring_provider_name and referring_provider_npi columns.
- **Interactions**: Log visits, calls, emails, events with physician timeline
- **Tasks**: Follow-up work queue with completion tracking
- **Dashboard**: Charts for referral trends, top referrers, at-risk physicians
- **Calendar**: Event management with Outlook sync capability
- **Import**: Excel (.xlsx) import for physicians and referrals with auto column mapping, preview, deduplication/upsert, and progress tracking. Supports Referring Provider List and Created Cases Report formats. Available at /import route. OWNER/DIRECTOR role required.
- **SharePoint Sync**: Sync all app data (physicians, referrals, interactions, tasks, locations) to SharePoint Lists via Microsoft Graph API. Uses batch operations (20 per request) with clear-and-reload approach. Async sync with status polling. Admin page at /admin/sharepoint. OWNER/DIRECTOR role required. DB tables: sharepoint_sync_status (tracks per-entity sync state), app_settings (stores site config).

## Real Data
- **Locations**: 8 Tristar PT clinics (Johnson City, Morristown, Newport, Rogersville, Maryville, Jefferson City, New Tazewell, Bean Station)
- **Physicians**: 3,765 referring providers (deduplicated) imported from Referring Provider List Excel
- **Referrals**: 6,041 cases from Created Cases Report (Jan 2025 - Jan 2026), 5,842 linked to physicians, 199 unlinked (self-referrals/walk-ins/no doctor info)

## Default Credentials
- Email: admin@tristar360.com
- Password: admin123

## Database
- Uses PostgreSQL via DATABASE_URL environment variable
- Schema managed with Drizzle ORM
- Real data imported via scripts in /scripts directory

## User Preferences
- Healthcare professional aesthetic
- Data-dense, efficient UI
- Dark mode support
- Pagination on large datasets (50 items per page)
