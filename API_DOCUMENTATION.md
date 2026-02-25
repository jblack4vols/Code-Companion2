# Tristar 360° API Documentation

**Version:** 1.0  
**Base URL:** `https://<your-domain>`  
**Content-Type:** `application/json`

---

## Table of Contents

1. [Authentication](#authentication)
2. [CSRF Protection](#csrf-protection)
3. [Role-Based Access Control](#role-based-access-control)
4. [Public API (API Key Authentication)](#public-api-api-key-authentication)
5. [Endpoints](#endpoints)
   - [Auth](#auth)
   - [Users](#users)
   - [Physicians (Providers)](#physicians-providers)
   - [Referrals](#referrals)
   - [Interactions](#interactions)
   - [Locations](#locations)
   - [Territories](#territories)
   - [Tasks](#tasks)
   - [Calendar Events](#calendar-events)
   - [Dashboard & Analytics](#dashboard--analytics)
   - [Import](#import)
   - [Export](#export)
   - [Search & Favorites](#search--favorites)
   - [Goals](#goals)
   - [Interaction Templates](#interaction-templates)
   - [Scorecards & Features](#scorecards--features)
   - [Integrations](#integrations)
   - [SharePoint](#sharepoint)
   - [Admin & Audit](#admin--audit)
   - [Scheduled Reports](#scheduled-reports)
   - [API Keys Management](#api-keys-management)
   - [Public API Endpoints](#public-api-endpoints)
6. [Data Models](#data-models)
7. [Error Handling](#error-handling)

---

## Authentication

All internal API endpoints (except public API) use **session-based authentication**. Sessions are managed via HTTP-only cookies.

### Login

```
POST /api/auth/login
```

**Body:**
```json
{
  "email": "user@example.com",
  "password": "yourPassword"
}
```

**Response (200):**
```json
{
  "id": "uuid",
  "name": "John Doe",
  "email": "user@example.com",
  "role": "OWNER",
  "approvalStatus": "APPROVED",
  "forcePasswordChange": false
}
```

**Error Responses:**
- `401` — Invalid credentials (includes remaining attempts count)
- `403` — Account pending approval or rejected
- `423` — Account locked after too many failed attempts

### Session Check

```
GET /api/auth/me
```

Returns the current authenticated user or `401` if not authenticated.

### Logout

```
POST /api/auth/logout
```

### Session Timeout

```
GET /api/auth/session-timeout
```

Returns session timeout configuration (15 minutes).

---

## CSRF Protection

All mutating requests (POST, PATCH, PUT, DELETE) require a CSRF token.

### Get CSRF Token

```
GET /api/csrf-token
```

**Response:**
```json
{
  "csrfToken": "token-string"
}
```

Include the token in subsequent requests as:
- Header: `x-csrf-token: <token>` or `csrf-token: <token>`
- Body field: `_csrf`

---

## Role-Based Access Control

| Role | Description |
|------|-------------|
| `OWNER` | Super admin — full access to all features |
| `DIRECTOR` | Management — access to most features except system config |
| `MARKETER` | Field reps — can manage providers, interactions, events |
| `FRONT_DESK` | Front desk staff — can manage referrals |
| `ANALYST` | Read-only analytics access |

Endpoints specify required roles. `OWNER` always has access to all endpoints.

---

## Public API (API Key Authentication)

For external integrations, use API key authentication instead of sessions.

**Header:** `x-api-key: <your-api-key>`

API keys are created by OWNER users and scoped to specific permissions:
- `physicians:read`
- `referrals:read`
- `locations:read`
- `interactions:read`
- `webhook:write`

### Getting Started with API Credentials

Follow these steps to set up API access for your external application:

#### Step 1: Create an API Key

Only OWNER-role users can create API keys. Log in to the Tristar 360 web app, then navigate to **Admin > Integrations > Developer Guide** or use the API directly:

```bash
curl -X POST https://your-domain.com/api/api-keys \
  -H "Content-Type: application/json" \
  -H "Cookie: connect.sid=<your-session-cookie>" \
  -d '{
    "name": "My Integration",
    "scopes": ["physicians:read", "referrals:read"],
    "expiresAt": "2027-12-31T00:00:00Z"
  }'
```

**Response:**
```json
{
  "id": "uuid-here",
  "name": "My Integration",
  "key": "tsk_abc123def456...",
  "scopes": ["physicians:read", "referrals:read"],
  "expiresAt": "2027-12-31T00:00:00Z",
  "createdAt": "2026-02-25T14:00:00Z"
}
```

> **Important:** The full API key (`tsk_...`) is only shown once at creation. Store it securely. If lost, rotate the key.

#### Step 2: Use the API Key

Include the key in the `x-api-key` header for all public API requests:

```bash
curl -H "x-api-key: tsk_abc123def456..." \
  https://your-domain.com/api/public/physicians?limit=10&offset=0
```

#### Step 3: Manage Keys

| Action | Method | Endpoint |
|--------|--------|----------|
| List all keys | GET | `/api/api-keys` |
| Rotate a key | POST | `/api/api-keys/:id/rotate` |
| Delete a key | DELETE | `/api/api-keys/:id` |

**Rotating a key** generates a new secret while keeping the same ID and scopes. The old key is immediately invalidated.

#### Scopes Reference

| Scope | Grants Access To |
|-------|-----------------|
| `physicians:read` | `GET /api/public/physicians`, `GET /api/public/physicians/:id` |
| `referrals:read` | `GET /api/public/referrals` |
| `locations:read` | `GET /api/public/locations` |
| `interactions:read` | `GET /api/public/interactions` |
| `webhook:write` | `POST /api/public/webhook` (inbound data) |

#### Security Best Practices

1. **Least privilege:** Only grant the scopes your integration actually needs.
2. **Set expiration dates:** Always set an `expiresAt` value. Rotate keys before they expire.
3. **Environment variables:** Store keys in environment variables, never in source code.
4. **Monitor usage:** Check the audit log for API key activity.
5. **Rotate on compromise:** If a key is exposed, immediately rotate or delete it.

#### Rate Limits

Public API endpoints are subject to rate limiting. If you exceed the limit, you'll receive a `429 Too Many Requests` response. Back off and retry after the `Retry-After` header duration.

#### Error Responses

```json
{
  "message": "Invalid or expired API key"
}
```

| Status | Meaning |
|--------|---------|
| 401 | Missing or invalid API key |
| 403 | Key doesn't have the required scope |
| 429 | Rate limited |

---

## Endpoints

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | None (rate limited) | Self-register a new account (pending approval) |
| POST | `/api/auth/login` | None (rate limited) | Log in |
| POST | `/api/auth/logout` | None | Log out |
| GET | `/api/auth/me` | None | Get current session user |
| GET | `/api/auth/session-timeout` | None | Get session timeout config |
| POST | `/api/auth/forgot-password` | None (rate limited) | Request password reset email |
| POST | `/api/auth/reset-password` | None (rate limited) | Reset password with token |
| POST | `/api/auth/change-password` | Authenticated | Change current password |
| GET | `/api/admin/pending-users` | OWNER | List pending registrations |
| POST | `/api/admin/approve-user/:id` | OWNER | Approve a pending user |
| POST | `/api/admin/reject-user/:id` | OWNER | Reject a pending user |

#### Register

```
POST /api/auth/register
```

**Body:**
```json
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "password": "SecurePass123!"
}
```

Account will be in `PENDING` status until approved by an OWNER.

#### Forgot Password

```
POST /api/auth/forgot-password
```

**Body:**
```json
{
  "email": "user@example.com"
}
```

Sends a reset link via email. Token expires in 1 hour.

#### Reset Password

```
POST /api/auth/reset-password
```

**Body:**
```json
{
  "token": "reset-token-from-email",
  "password": "NewSecurePass123!"
}
```

---

### Users

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/users` | Authenticated | List all users |
| POST | `/api/users` | OWNER | Create a new user |
| PATCH | `/api/users/:id` | OWNER | Update a user |
| DELETE | `/api/users/:id` | OWNER | Delete a user |
| GET | `/api/marketers` | Authenticated | List users with MARKETER role |
| GET | `/api/marketer-territories` | OWNER, DIRECTOR, MARKETER | List marketer territory assignments |

#### Create User

```
POST /api/users
```

**Body:**
```json
{
  "name": "New User",
  "email": "newuser@example.com",
  "password": "TempPass123!",
  "role": "MARKETER"
}
```

---

### Physicians (Providers)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/physicians` | Authenticated | List all physicians |
| GET | `/api/physicians/paginated` | Authenticated | Paginated list with search/filters |
| GET | `/api/physicians/search` | Authenticated | Search physicians |
| GET | `/api/physicians/:id` | Authenticated | Get physician by ID |
| POST | `/api/physicians` | OWNER, DIRECTOR, MARKETER | Create a physician |
| PATCH | `/api/physicians/:id` | OWNER, DIRECTOR, MARKETER | Update a physician |
| DELETE | `/api/physicians/:id` | OWNER, DIRECTOR | Soft-delete a physician |
| POST | `/api/physicians/:id/restore` | OWNER, DIRECTOR | Restore soft-deleted physician |
| PATCH | `/api/physicians/:id/assign` | OWNER, DIRECTOR | Assign physician to a marketer |
| GET | `/api/physicians/by-npi` | Authenticated | Look up physician by NPI |
| GET | `/api/physicians/practice-names` | Authenticated | List all practice/office names |
| GET | `/api/physicians/by-practice` | Authenticated | Get physicians at a practice |
| GET | `/api/physicians/tiering` | OWNER, DIRECTOR, MARKETER, ANALYST | Get tiering data |
| GET | `/api/physicians/declining` | OWNER, DIRECTOR, MARKETER, ANALYST | Get declining providers |
| GET | `/api/physicians/duplicates` | OWNER, DIRECTOR | Find duplicate physicians |
| POST | `/api/physicians/merge` | OWNER, DIRECTOR | Merge duplicate physicians |
| POST | `/api/physicians/bulk-assign` | OWNER, DIRECTOR | Bulk assign physicians |
| POST | `/api/physicians/bulk-status` | OWNER, DIRECTOR | Bulk update status |
| POST | `/api/physicians/bulk-delete` | OWNER, DIRECTOR | Bulk soft-delete |

#### Paginated List

```
GET /api/physicians/paginated?page=1&limit=50&search=smith&stage=ACTIVE&status=ACTIVE&sortBy=lastName&sortOrder=asc&territory=uuid&assignedTo=uuid
```

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| page | number | 1 | Page number |
| limit | number | 50 | Items per page |
| search | string | — | Search by name, NPI, practice name, city |
| stage | string | — | Filter by relationship stage |
| status | string | — | Filter by status |
| territory | string | — | Filter by territory ID |
| assignedTo | string | — | Filter by assigned marketer ID |
| sortBy | string | lastName | Sort column |
| sortOrder | string | asc | Sort direction |

**Response:**
```json
{
  "data": [...],
  "total": 1250,
  "page": 1,
  "limit": 50,
  "totalPages": 25
}
```

#### Create Physician

```
POST /api/physicians
```

**Body:**
```json
{
  "firstName": "John",
  "lastName": "Smith",
  "credentials": "M.D.",
  "specialty": "Orthopedics",
  "npi": "1234567890",
  "practiceName": "Smith Ortho Group",
  "primaryOfficeAddress": "123 Main St",
  "city": "Knoxville",
  "state": "TN",
  "zip": "37901",
  "phone": "(865) 555-0100",
  "fax": "(865) 555-0101",
  "email": "dr.smith@example.com",
  "status": "PROSPECT",
  "relationshipStage": "NEW",
  "priority": "MEDIUM",
  "territoryId": "uuid or null",
  "assignedOwnerId": "uuid or null",
  "tags": ["orthopedic", "high-volume"],
  "notes": "Optional notes"
}
```

#### Comments

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/physicians/:id/comments` | Authenticated | List comments |
| POST | `/api/physicians/:id/comments` | Authenticated | Add a comment |
| PATCH | `/api/physicians/:id/comments/:commentId` | Authenticated | Edit a comment |
| DELETE | `/api/physicians/:id/comments/:commentId` | OWNER, DIRECTOR | Delete a comment |

#### Provider Offices

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/provider-offices` | Authenticated | List all provider offices (grouped by practice name) |
| GET | `/api/provider-offices/:name/providers` | Authenticated | Get providers at a specific office |

---

### Referrals

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/referrals` | Authenticated | List all referrals |
| GET | `/api/referrals/paginated` | Authenticated | Paginated list with search/filters |
| POST | `/api/referrals` | OWNER, DIRECTOR, MARKETER, FRONT_DESK | Create a referral |
| PATCH | `/api/referrals/:id` | OWNER, DIRECTOR, MARKETER, FRONT_DESK | Update a referral |
| DELETE | `/api/referrals/:id` | OWNER, DIRECTOR | Soft-delete a referral |
| POST | `/api/referrals/:id/restore` | OWNER, DIRECTOR | Restore soft-deleted referral |
| DELETE | `/api/referrals/all` | OWNER | Soft-delete all referrals |
| POST | `/api/referrals/restore-all` | OWNER | Restore all soft-deleted referrals |
| DELETE | `/api/referrals/bulk` | OWNER | Bulk soft-delete referrals |
| GET | `/api/referrals/duplicates` | OWNER, DIRECTOR | Find duplicate referrals |
| GET | `/api/referrals/unlinked` | OWNER, DIRECTOR | Get unlinked (self) referrals |
| POST | `/api/referrals/:id/link` | OWNER, DIRECTOR | Link a referral to a physician |
| POST | `/api/referrals/:id/self-referral` | OWNER, DIRECTOR | Mark as self-referral |
| GET | `/api/referrals/:id/suggested-matches` | OWNER, DIRECTOR | Get suggested physician matches |

#### Paginated List

```
GET /api/referrals/paginated?page=1&limit=50&search=smith&locationId=uuid&physicianId=uuid&status=RECEIVED
```

#### Create Referral

```
POST /api/referrals
```

**Body:**
```json
{
  "physicianId": "uuid or null",
  "locationId": "uuid or null",
  "referringProviderName": "DR. JOHN SMITH",
  "referringProviderNpi": "1234567890",
  "referralDate": "2026-02-20",
  "patientFullName": "Jane Doe",
  "patientAccountNumber": "ACC-12345",
  "caseTitle": "PT1 LBP 2026",
  "status": "RECEIVED",
  "discipline": "PT",
  "primaryInsurance": "BCBS",
  "primaryPayerType": "COMMERCIAL"
}
```

---

### Interactions

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/interactions` | Authenticated | List interactions (optional `?physicianId=uuid`) |
| POST | `/api/interactions` | OWNER, DIRECTOR, MARKETER | Log a new interaction |

#### Create Interaction

```
POST /api/interactions
```

**Body:**
```json
{
  "physicianId": "uuid",
  "locationId": "uuid or null",
  "userId": "uuid",
  "type": "VISIT",
  "occurredAt": "2026-02-20T14:00:00Z",
  "summary": "Office visit to discuss referral volume",
  "nextStep": "Follow up in 2 weeks",
  "followUpDueAt": "2026-03-06T00:00:00Z"
}
```

**Interaction Types:** `VISIT`, `CALL`, `EMAIL`, `EVENT`, `LUNCH`, `OTHER`

---

### Locations

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/locations` | Authenticated | List all locations |
| GET | `/api/locations/:id` | Authenticated | Get location by ID |
| POST | `/api/locations` | OWNER, DIRECTOR | Create a location |
| PATCH | `/api/locations/:id` | OWNER, DIRECTOR | Update a location |
| DELETE | `/api/locations/:id` | OWNER | Delete a location |

#### Create Location

```
POST /api/locations
```

**Body:**
```json
{
  "name": "Tristar PT - Knoxville",
  "address": "123 Main St",
  "city": "Knoxville",
  "state": "TN",
  "phone": "(865) 555-0100",
  "isActive": true
}
```

---

### Territories

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/territories` | Authenticated | List all territories |
| GET | `/api/territories/:id` | Authenticated | Get territory by ID |
| POST | `/api/territories` | OWNER, DIRECTOR | Create a territory |
| PATCH | `/api/territories/:id` | OWNER, DIRECTOR | Update a territory |
| DELETE | `/api/territories/:id` | OWNER, DIRECTOR | Delete a territory |
| GET | `/api/collections` | Authenticated | List collections |
| POST | `/api/collections` | OWNER, DIRECTOR | Create a collection record |

---

### Tasks

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/tasks` | Authenticated | List tasks (filtered by assigned user) |
| POST | `/api/tasks` | OWNER, DIRECTOR, MARKETER | Create a task |
| PATCH | `/api/tasks/:id` | Authenticated | Update a task (e.g., mark done) |

#### Create Task

```
POST /api/tasks
```

**Body:**
```json
{
  "physicianId": "uuid or null",
  "assignedToUserId": "uuid",
  "dueAt": "2026-03-01T00:00:00Z",
  "priority": "HIGH",
  "status": "OPEN",
  "description": "Follow up with Dr. Smith about referral program"
}
```

**Task Statuses:** `OPEN`, `DONE`  
**Priority Levels:** `LOW`, `MEDIUM`, `HIGH`

---

### Calendar Events

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/calendar-events` | Authenticated | List events (with date range filters) |
| GET | `/api/calendar-events/:id` | Authenticated | Get event by ID |
| POST | `/api/calendar-events` | OWNER, DIRECTOR, MARKETER | Create an event |
| PATCH | `/api/calendar-events/:id` | OWNER, DIRECTOR, MARKETER | Update an event |
| DELETE | `/api/calendar-events/:id` | OWNER, DIRECTOR, MARKETER | Delete an event |

#### List Events

```
GET /api/calendar-events?startDate=2026-02-01&endDate=2026-02-28&locationId=uuid&practiceName=Smith%20Ortho
```

#### Create Event

```
POST /api/calendar-events
```

**Body:**
```json
{
  "title": "Office Visit - Smith Ortho",
  "description": "Discuss referral partnership",
  "eventType": "OFFICE_VISIT",
  "startAt": "2026-02-25T09:00:00Z",
  "endAt": "2026-02-25T10:00:00Z",
  "locationId": "uuid or null",
  "physicianId": "uuid or null",
  "practiceName": "Smith Ortho Group",
  "organizerUserId": "uuid",
  "meetingUrl": "https://teams.microsoft.com/...",
  "allDay": false
}
```

**Event Types:** `MEETING`, `LUNCH`, `OFFICE_VISIT`, `CALL`, `CONFERENCE`, `OTHER`

---

### Dashboard & Analytics

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/dashboard/stats` | Authenticated | Main dashboard stats |
| GET | `/api/dashboard/executive` | OWNER, DIRECTOR, ANALYST | Executive dashboard KPIs |
| GET | `/api/dashboard/territory/:territoryId` | Authenticated | Territory-specific analytics |
| GET | `/api/dashboard/location/:locationId` | Authenticated | Location-specific analytics |
| GET | `/api/physicians/:id/monthly` | Authenticated | Monthly summary for a physician |
| GET | `/api/activity-feed` | OWNER, DIRECTOR, MARKETER, ANALYST | Recent activity feed |
| GET | `/api/reports/user-activity` | OWNER, DIRECTOR | User activity report |
| GET | `/api/tiering-weights` | OWNER, DIRECTOR, ANALYST | Get tiering weight configuration |
| PATCH | `/api/tiering-weights` | OWNER | Update tiering weights |
| POST | `/api/etl/run` | OWNER, DIRECTOR | Manually trigger ETL/analytics job |

---

### Import

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/import/preview` | OWNER, DIRECTOR | Preview import data (Excel/CSV) |
| POST | `/api/import/physicians` | OWNER, DIRECTOR | Import physicians from Excel/CSV |
| POST | `/api/import/referrals` | OWNER, DIRECTOR | Import referrals from Excel/CSV |

Upload files as `multipart/form-data` with field name `file`.

---

### Export

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/export/physicians` | OWNER, DIRECTOR, ANALYST | Export physicians as CSV |
| GET | `/api/export/referrals` | OWNER, DIRECTOR, ANALYST | Export referrals as CSV |
| GET | `/api/export/interactions` | OWNER, DIRECTOR, ANALYST | Export interactions as CSV |
| GET | `/api/export/tasks` | OWNER, DIRECTOR | Export tasks as CSV |
| GET | `/api/export/audit-logs` | OWNER | Export audit logs as CSV |

---

### Search & Favorites

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/search?q=smith` | Authenticated | Global search across physicians, referrals, locations |
| GET | `/api/favorites` | Authenticated | List favorited physicians |
| POST | `/api/favorites/:physicianId` | Authenticated | Add physician to favorites |
| DELETE | `/api/favorites/:physicianId` | Authenticated | Remove physician from favorites |
| GET | `/api/physicians/:id/health-score` | Authenticated | Get physician health/risk score |

---

### Goals

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/goals` | Authenticated | List all goals |
| POST | `/api/goals` | OWNER, DIRECTOR | Create a goal |
| DELETE | `/api/goals/:id` | OWNER, DIRECTOR | Delete a goal |
| GET | `/api/goals/progress` | Authenticated | Get goal progress metrics |

---

### Interaction Templates

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/interaction-templates` | Authenticated | List templates |
| POST | `/api/interaction-templates` | OWNER, DIRECTOR | Create a template |
| PATCH | `/api/interaction-templates/:id` | OWNER, DIRECTOR | Update a template |
| DELETE | `/api/interaction-templates/:id` | OWNER, DIRECTOR | Delete a template |

---

### Scorecards & Features

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/physicians/:id/scorecard` | Authenticated | Provider scorecard |
| GET | `/api/roi/providers` | Authenticated | ROI analysis by provider |
| GET | `/api/leaderboard` | OWNER, DIRECTOR, ANALYST | Marketer leaderboard |
| GET | `/api/physicians/:id/stage-history` | Authenticated | Relationship stage change history |

---

### Integrations

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/integrations/status` | Authenticated | Get integration statuses |
| GET | `/api/integrations` | OWNER, DIRECTOR | List all integration configs |
| POST | `/api/integrations` | OWNER, DIRECTOR | Create integration config |
| PATCH | `/api/integrations/:id` | OWNER, DIRECTOR | Update integration config |
| DELETE | `/api/integrations/:id` | OWNER, DIRECTOR | Delete integration config |
| POST | `/api/integrations/:id/test` | OWNER, DIRECTOR | Test integration connection |
| GET | `/api/integrations/:id/custom-fields` | OWNER, DIRECTOR | Get custom field mappings |
| POST | `/api/integrations/:id/sync` | OWNER, DIRECTOR | Trigger sync |
| GET | `/api/integrations/:id/logs` | OWNER, DIRECTOR | Get sync logs |
| POST | `/api/integrations/outlook/sync-event` | OWNER, DIRECTOR, MARKETER | Sync calendar event to Outlook |

**Integration Types:** `GOHIGHLEVEL`, `CUSTOM_API`, `MICROSOFT`

---

### SharePoint

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/sharepoint/sites` | OWNER, DIRECTOR | List available SharePoint sites |
| GET | `/api/sharepoint/site` | OWNER, DIRECTOR | Get configured SharePoint site |
| POST | `/api/sharepoint/site` | OWNER, DIRECTOR | Configure SharePoint site |
| GET | `/api/sharepoint/status` | OWNER, DIRECTOR | Get sync status |
| POST | `/api/sharepoint/sync/:entity` | OWNER, DIRECTOR | Sync specific entity to SharePoint |
| POST | `/api/sharepoint/sync-all` | OWNER, DIRECTOR | Sync all entities to SharePoint |

**Entities:** `physicians`, `referrals`, `interactions`, `tasks`, `locations`

---

### Admin & Audit

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/audit-logs` | OWNER, DIRECTOR | List audit logs (paginated) |
| GET | `/api/settings/audit-retention` | OWNER | Get retention settings |
| PATCH | `/api/settings/audit-retention` | OWNER | Update retention settings |
| POST | `/api/audit-logs/purge` | OWNER | Purge old audit logs |

---

### Scheduled Reports

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/scheduled-reports` | OWNER, DIRECTOR | List scheduled reports |
| POST | `/api/scheduled-reports` | OWNER, DIRECTOR | Create a scheduled report |
| PATCH | `/api/scheduled-reports/:id` | OWNER, DIRECTOR | Update a scheduled report |
| DELETE | `/api/scheduled-reports/:id` | OWNER, DIRECTOR | Delete a scheduled report |
| POST | `/api/scheduled-reports/:id/run` | OWNER, DIRECTOR | Manually run a report |

---

### API Keys Management

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/api-keys` | OWNER | List API keys |
| POST | `/api/api-keys` | OWNER | Create a new API key |
| POST | `/api/api-keys/:id/rotate` | OWNER | Rotate an API key |
| DELETE | `/api/api-keys/:id` | OWNER | Delete an API key |

#### Create API Key

```
POST /api/api-keys
```

**Body:**
```json
{
  "name": "External Integration Key",
  "scopes": ["physicians:read", "referrals:read", "locations:read"],
  "expiresAt": "2027-01-01T00:00:00Z"
}
```

**Available Scopes:** `physicians:read`, `referrals:read`, `locations:read`, `interactions:read`, `webhook:write`

---

### Public API Endpoints

These endpoints use API key authentication via the `x-api-key` header.

| Method | Path | Required Scope | Description |
|--------|------|---------------|-------------|
| GET | `/api/public/physicians` | `physicians:read` | List all physicians |
| GET | `/api/public/physicians/:id` | `physicians:read` | Get physician by ID |
| GET | `/api/public/referrals` | `referrals:read` | List all referrals |
| GET | `/api/public/locations` | `locations:read` | List all locations |
| GET | `/api/public/interactions` | `interactions:read` | List all interactions |
| POST | `/api/public/webhook` | `webhook:write` | Receive inbound webhook data |

#### Example Public API Call

```bash
curl -H "x-api-key: tsk_abc123..." \
  https://your-domain.com/api/public/physicians?limit=10&offset=0
```

---

## Data Models

### User

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | string | Full name |
| email | string | Email address (unique) |
| role | enum | OWNER, DIRECTOR, MARKETER, FRONT_DESK, ANALYST |
| approvalStatus | enum | PENDING, APPROVED, REJECTED |
| lastLoginAt | timestamp | Last login time |
| createdAt | timestamp | Account creation time |

### Physician

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| firstName | string | First name |
| lastName | string | Last name |
| credentials | string | Credentials (e.g., M.D., D.O.) |
| specialty | string | Medical specialty |
| npi | string | National Provider Identifier |
| practiceName | string | Practice/office name |
| primaryOfficeAddress | string | Office address |
| city | string | City |
| state | string | State |
| zip | string | ZIP code |
| phone | string | Phone number |
| fax | string | Fax number |
| email | string | Email |
| status | enum | PROSPECT, ACTIVE, INACTIVE |
| relationshipStage | enum | NEW, DEVELOPING, STRONG, AT_RISK |
| priority | enum | LOW, MEDIUM, HIGH |
| referralSourceAttribution | string | Source attribution |
| territoryId | UUID | Assigned territory |
| assignedOwnerId | UUID | Assigned marketer/rep |
| lastInteractionAt | timestamp | Last interaction date |
| nextFollowUpAt | timestamp | Next follow-up date |
| notes | text | Free-text notes |
| tags | string[] | Tags array |
| customFields | jsonb | Custom key-value fields |
| deletedAt | timestamp | Soft-delete timestamp |

### Referral

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| physicianId | UUID | Linked physician (nullable for unlinked) |
| locationId | UUID | Clinic location |
| referringProviderName | string | Name from referral |
| referringProviderNpi | string | NPI from referral |
| referralDate | date | Date of referral |
| patientAccountNumber | string | Patient account # |
| patientFullName | string | Patient name |
| caseTitle | string | Case description |
| caseTherapist | string | Assigned therapist |
| discipline | string | Therapy discipline (PT, OT, etc.) |
| status | enum | RECEIVED, SCHEDULED, EVAL_COMPLETED, DISCHARGED, LOST |
| scheduledVisits | integer | Total scheduled visits |
| arrivedVisits | integer | Completed visits |
| primaryInsurance | string | Insurance carrier |
| primaryPayerType | enum | COMMERCIAL, MEDICARE, MEDICAID, CASH, OTHER |
| valueEstimate | decimal | Estimated revenue value |

### Interaction

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| physicianId | UUID | Related physician |
| locationId | UUID | Location |
| userId | UUID | User who logged it |
| type | enum | VISIT, CALL, EMAIL, EVENT, LUNCH, OTHER |
| occurredAt | timestamp | When it occurred |
| summary | text | Description |
| nextStep | text | Planned next step |
| followUpDueAt | timestamp | Follow-up deadline |

### Location

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | string | Location name |
| address | string | Street address |
| city | string | City |
| state | string | State |
| phone | string | Phone |
| isActive | boolean | Active status |

### Task

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| physicianId | UUID | Related physician |
| assignedToUserId | UUID | Assigned user |
| dueAt | timestamp | Due date |
| priority | enum | LOW, MEDIUM, HIGH |
| status | enum | OPEN, DONE |
| description | text | Task description |

### Calendar Event

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| title | string | Event title |
| description | text | Description |
| eventType | enum | MEETING, LUNCH, OFFICE_VISIT, CALL, CONFERENCE, OTHER |
| startAt | timestamp | Start time |
| endAt | timestamp | End time |
| locationId | UUID | Location |
| physicianId | UUID | Related physician |
| practiceName | string | Practice name |
| organizerUserId | UUID | Organizer |
| outlookEventId | string | Outlook sync ID |
| meetingUrl | string | Meeting URL |
| allDay | boolean | All-day event flag |

### Territory

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| name | string | Territory name |
| repUserId | UUID | Assigned rep |

### Audit Log

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| userId | UUID | User who performed action |
| action | string | Action type (e.g., LOGIN_SUCCESS, CREATE_PHYSICIAN) |
| entity | string | Entity type |
| entityId | string | Entity ID |
| timestamp | timestamp | When it occurred |
| detailJson | jsonb | Additional details |
| ipAddress | string | Client IP |
| userAgent | string | Browser user agent |

---

## Error Handling

All errors follow a consistent format:

```json
{
  "message": "Human-readable error description"
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad request / validation error |
| 401 | Not authenticated |
| 403 | Forbidden (insufficient role) |
| 404 | Resource not found |
| 423 | Account locked |
| 429 | Rate limited |
| 500 | Internal server error |

### Rate Limiting

Login and password reset endpoints are rate-limited. If exceeded, a `429` response is returned.

### Account Lockout

After 10 consecutive failed login attempts, the account is locked for 5 minutes.

---

## Health Check

```
GET /api/health
```

**Response (200):**
```json
{
  "status": "ok"
}
```

Use this endpoint for uptime monitoring and load balancer health checks.
