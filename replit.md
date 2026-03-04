# Tristar 360° - Physician Relationship Management (PRM)

## Overview
Tristar 360° is a web application designed for outpatient physical therapy businesses with multiple clinic locations. Its primary purpose is to empower teams to effectively track and cultivate physician referral relationships, log outreach activities, and measure referral performance through intuitive dashboards. The project aims to enhance relationship management with referring providers, ultimately driving business growth and optimizing patient acquisition.

## User Preferences
- Healthcare professional aesthetic
- Data-dense, efficient UI
- Dark mode support
- Pagination on large datasets (50 items per page)

## System Architecture
The application is built with a modern web stack: **React + Vite + TypeScript** for the frontend, styled with **Tailwind CSS** and **shadcn/ui**. The backend uses **Express.js** with **Drizzle ORM** connecting to a **PostgreSQL database (Neon-backed)**. User authentication is handled via **session-based security** with `express-session` and `connect-pg-simple`.

**Key architectural decisions and features include:**
- **Role-Based Access Control (RBAC)**: Supports roles like OWNER, DIRECTOR, MARKETER, FRONT_DESK, and ANALYST, each with specific permissions.
- **Data Management**: Manages referring providers (deduplicated, paginated with search and filters), patient referrals (linked to providers, with unlinked self-referrals), interactions (visits, calls, emails), and tasks.
- **Reporting & Analytics**: Features a comprehensive dashboard with charts for referral trends, top referrers, and at-risk providers. It also includes Executive, Territory, and Location-specific BI dashboards with KPIs and monthly trends.
- **Automated Processes**: Implements a nightly ETL (Extract, Transform, Load) job for data aggregation, weighted physician tiering, automated provider stage transitions (NEW→ACTIVE→AT_RISK→INACTIVE), and provider activity alerts (declining high-value providers, reactivated providers). Alerts are sent inline during ETL before stage updates to avoid race conditions. An activity feed provides real-time updates.
- **Workflow Tools**: Includes a calendar for event scheduling (with completion status toggling — completed events turn green), a task management system with email notifications, quick-add interaction logging, and a Daily Hit List (`/hit-list`) aggregating calendar events, tasks due, and follow-up interactions by day for the current week. Hit List supports quick-complete: toggle tasks done/open and events completed/incomplete directly inline.
- **Referrals**: Server-side sortable columns (referralDate, patientFullName, status, referringProviderName) with clickable table headers and sort direction indicators.
- **Provider Map**: Uses real lat/lng coordinates from the database (2,790+ geocoded providers). Supports city filter dropdown, stage/status filters, and name/practice/city search.
- **Interaction Management**: Interactions support soft delete and restore (reopen), inline editing (PATCH), and server-side pagination with filtering. Users can toggle "Show Deleted" to view and restore previously removed interactions.
- **Data Quality**: Features duplicate detection for providers and referrals with merge capabilities, and robust data import/export functionalities (Excel/CSV).
- **User Registration & Approval**: Self-registration flow where employees sign up and remain in PENDING status until a super admin (OWNER) approves them. Admins can assign roles during approval or reject registrations. Managed via Admin > Users page.
- **Forgot Password**: Token-based password reset flow. Users request a reset link via email (sent through Outlook integration). Tokens expire in 1 hour. Reset page at `/reset-password?token=...`.
- **Security & Compliance (HIPAA)**: Incorporates extensive HIPAA technical safeguards including audit logging (enhanced with IP/user agent), session timeout, account lockout, strong password policy, and security headers (CSRF, Rate Limiting).
- **Scalability**: Employs database indexing for performance (GIN/pg_trgm indexes on search columns, B-tree indexes on sort columns, partial indexes for token lookups), incremental ETL processing, and standardized error handling. Bulk imports use batch pre-fetch pattern to avoid N+1 queries.
- **Maintainability**: Utilizes soft deletes for data recovery, shared authentication middleware, environment validation, shared hooks (useDebounce), and React.lazy code splitting for route-based loading.
- **Performance**: Frontend uses useMemo for chart data transformations, React.lazy/Suspense for code splitting (~30 routes lazy-loaded), and shared utility hooks to reduce duplication.

The UI is designed to be mobile-friendly, adapting layout for smaller screens (e.g., card-based provider lists).

## External Dependencies
- **PostgreSQL**: Primary database, backed by Neon.
- **Microsoft Graph API**: Used for Outlook email notifications (task assignments, reports) and SharePoint Lists synchronization (batch operations for app data).
- **GoHighLevel**: Integrated for two-way sync to push physician contacts and pull leads.
- **Custom API**: Provides a flexible integration point for connecting to other external software via REST.
- **Microsoft SharePoint**: Used for syncing all application data to SharePoint Lists.
- **node-cron**: For scheduling nightly ETL jobs and other automated tasks.
- **ExcelJS**: Utilized for Excel (.xlsx) import functionality.

## ClaudeKit Engineer Integration
The project includes ClaudeKit Engineer tooling for AI-assisted development:

### Testing
- **Vitest** unit and integration tests in `tests/unit/` and `tests/integration/`
- Existing tests in `server/__tests__/`
- Run: `npx vitest run` (266 tests across 15 files)
- Watch mode: `npx vitest`
- Coverage: `npx vitest run --coverage`

### Kanban Project Board
- Plans-kanban dashboard for task visualization
- Plans directory: `plans/` with active improvement backlog
- Start: `node .opencode/skills/plans-kanban/scripts/server.cjs --dir ./plans`
- Usage guide: `docs/kanban-usage.md`

### Documentation Site (Mintlify)
- Mintlify docs in `documentation/` directory
- Config: `documentation/docs.json`
- Pages: introduction, architecture, data-model, permissions, workflows, local-dev

### Design System
- Design system documented in `docs/design-system.md`
- Colors, typography, components, layout patterns, dark mode, interaction system

### Architecture Diagrams
- Mermaid diagrams in `docs/diagrams/system-architecture.md`
- System architecture, request flow, ER diagram, ETL flow, auth flow

### Code Review Workflows
- Review process: `docs/code-review.md`
- AI agent checklist: `.claude/rules/code-review-checklist.md`
- HIPAA-specific review items included