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
- **Referring Providers**: 3,765 referring providers (deduplicated) imported from Excel with credentials, NPI, practice info, paginated (50/page) with sortable columns. UI labels use "Referring Providers" (database/API still uses `physicians` internally).
- **Referrals**: 6,041 real cases imported with full case details, 5,842 linked to providers by NPI, 199 self-referrals/walk-ins unlinked. Referral table includes referring_provider_name and referring_provider_npi columns.
- **Interactions**: Log visits, calls, emails, events with provider timeline
- **Tasks**: Follow-up work queue with completion tracking
- **Dashboard**: Charts for referral trends, top referrers, at-risk providers, activity feed
- **Revenue Intelligence Dashboards**: Three BI dashboards under /dashboards/* route:
  - **Executive Dashboard** (/dashboards/executive): Top 20 referral sources, KPI cards (referrals, revenue, concentration risk, volatility index), growth rate chart, monthly volume chart. Month filter.
  - **Territory Dashboard** (/dashboards/territory): Territory selector with per-territory KPIs (referrals, visits, revenue, revenue/rep, visits/rep). Empty state when no territories configured.
  - **Location Dashboard** (/dashboards/location): Location selector with per-location KPIs (referrals, visits, revenue, dependency ratio, risk score), monthly trends chart, location-specific top referral sources table.
- **Nightly ETL**: node-cron job at 2 AM computing physician_monthly_summary (1,737 records), location_monthly_summary (49 records), weighted physician tiering (A/B/C/D). Manual trigger: POST /api/etl/run. Server file: server/etl.ts.
- **Weighted Tiering**: Configurable weights (revenue 0.4, trend 0.2, conversion 0.2, payer mix 0.2) with tier thresholds (A>=0.8, B>=0.5, C>=0.2, D<0.2). Config: GET/PATCH /api/tiering-weights.
- **Activity Feed**: Dashboard widget showing recent interactions, completed tasks, and new referrals combined and sorted by timestamp. API: GET /api/activity-feed
- **Referral Source Attribution**: Track how provider relationships originated (Website, Conference, Cold Call, Referral, Marketing, Existing, Lunch & Learn, Other). Field on provider edit form and detail view.
- **Map View**: Leaflet map at /map showing referring providers plotted on East Tennessee map with colored markers by relationship stage. Sidebar provider list with filters. City-based geocoding for 8 clinic territories.
- **Duplicate Detection**: Admin page at /admin/duplicates detecting potential duplicate providers via NPI match or name+city match. Side-by-side comparison with merge capability. API: GET /api/physicians/duplicates, POST /api/physicians/merge
- **User Activity Reports**: Admin page at /admin/reports showing per-user interaction counts (visits, calls, emails, lunches), task completion metrics, and on-time rates. Date range filters and stacked bar chart. API: GET /api/reports/user-activity
- **Calendar**: Office/practice-centric event scheduling. Events linked to Office/Practice Name (not individual physicians) via searchable dropdown. Shows all physicians at selected office. Practice filter in toolbar. Outlook sync capability. API: GET /api/physicians/practice-names, GET /api/physicians/by-practice?name=X
- **Import**: Excel (.xlsx) import for physicians and referrals with auto column mapping, preview, deduplication/upsert, and progress tracking. Supports Referring Provider List and Created Cases Report formats. Available at /import route. OWNER/DIRECTOR role required.
- **SharePoint Sync**: Sync all app data (physicians, referrals, interactions, tasks, locations) to SharePoint Lists via Microsoft Graph API. Uses batch operations (20 per request) with clear-and-reload approach. Async sync with status polling. Admin page at /admin/sharepoint. OWNER/DIRECTOR role required. DB tables: sharepoint_sync_status (tracks per-entity sync state), app_settings (stores site config).
- **Provider Notes/Comments**: Internal notes system on each provider's detail page (Notes tab). Team members can add, edit, and view notes. Owners/Directors can delete any note. API: GET/POST /api/physicians/:id/comments, PATCH/DELETE /api/physicians/:id/comments/:commentId. DB: physician_comments.
- **Bulk Actions**: Select multiple providers on the list page. Bulk set status (Active/Inactive/Prospect) and bulk assign marketer via dropdown. API: POST /api/physicians/bulk-status, POST /api/physicians/bulk-assign. OWNER/DIRECTOR role required.
- **API Integrations**: Admin page at /admin/integrations with three tabs:
  - **Connections**: GoHighLevel (two-way sync: push physician contacts, pull leads) and Custom API (connect to external software via REST). Test connection, manual sync. DB: integration_configs, integration_sync_logs.
  - **API Keys**: Create/revoke API keys with granular scopes (physicians:read, referrals:read, etc.) for external software to access Tristar data via public API. SHA-256 hashed, shown once. DB: api_keys. OWNER role required.
  - **Microsoft**: Setup instructions for Outlook and SharePoint connections via Replit integrations panel.
  - **Public API**: GET /api/public/physicians, /referrals, /locations, /interactions. POST /api/public/webhook. Auth via X-TRISTAR-API-KEY header.

- **HIPAA Technical Safeguards**: Comprehensive security features:
  - **Audit Logging**: All data access, login/logout, account lockout events logged with IP address, user agent, timestamp, and action details. Enhanced audit_logs table with ipAddress, userAgent columns and performance indexes. Audit log page at /admin/audit-log with entity/action filters and IP tooltip.
  - **Session Timeout**: 15-minute auto-expiration with 2-minute warning dialog (IdleTimeout component in App.tsx). Detects mouse, keyboard, scroll, touch activity. Rolling session cookie resets on activity.
  - **Account Lockout**: 5 failed login attempts triggers 15-minute lockout. Login shows remaining attempts, lockout duration, and lock icon. Users table tracks failedLoginAttempts, lockedUntil fields.
  - **Password Policy**: Minimum 8 chars with uppercase, lowercase, number, and special character. Enforced on both frontend (validatePassword in admin-users.tsx) and backend (passwordSchema in schema.ts). Bcrypt hash rounds: 12.
  - **Security Headers**: X-Frame-Options (DENY), X-Content-Type-Options (nosniff), Referrer-Policy (strict-origin-when-cross-origin), X-XSS-Protection, Permissions-Policy, Cache-Control (no-store for API). Applied in server/routes.ts middleware.
  - **Settings Page**: Admin settings at /admin/settings shows all security safeguards with active status badges and links to audit log.

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
