# Tristar 360° System Architecture Diagrams

## 1. High-Level System Architecture

```mermaid
graph TB
    subgraph Client["Client (Browser)"]
        SPA["React 18 SPA<br/>Vite 7 + wouter"]
        TQ["TanStack Query v5"]
        UI["shadcn/ui + Tailwind CSS"]
    end

    subgraph Server["Express 5 Server (Node.js)"]
        MW["Middleware Chain"]
        Routes["18 Route Modules"]
        Storage["Storage Layer (IStorage)"]
        ETL["ETL / Cron Jobs"]
    end

    subgraph Database["PostgreSQL 16"]
        Tables["Core Tables<br/>physicians, referrals,<br/>interactions, users, etc."]
        Summaries["ETL Summaries<br/>physician/territory/location<br/>monthly summaries"]
        Sessions["Session Store<br/>connect-pg-simple"]
    end

    subgraph External["External Services"]
        Outlook["Microsoft Outlook<br/>SMTP + Graph API"]
        SharePoint["Microsoft SharePoint<br/>Graph API"]
        Connectors["Replit Connectors<br/>OAuth Token Broker"]
    end

    SPA -->|"HTTP/JSON (port 5000)"| MW
    MW --> Routes
    Routes --> Storage
    Storage -->|"Drizzle ORM + pg"| Tables
    Storage -->|"Drizzle ORM + pg"| Summaries
    MW -->|"Session Read/Write"| Sessions
    ETL -->|"Scheduled Jobs"| Tables
    ETL -->|"Compute Summaries"| Summaries
    ETL -->|"Email Digests"| Outlook
    Routes -->|"SharePoint Sync"| SharePoint
    SharePoint -->|"OAuth Tokens"| Connectors
    Outlook -->|"OAuth Tokens"| Connectors
```

## 2. Request Flow — Middleware Chain

```mermaid
flowchart TD
    A["Incoming Request"] --> B["cookie-parser"]
    B --> C["Security Headers<br/>X-Content-Type-Options, X-Frame-Options,<br/>CSP, HSTS (prod)"]
    C --> D["express-session<br/>PgStore, 15min rolling,<br/>httpOnly, sameSite=lax"]
    D --> E{"/api route?"}
    E -->|Yes| F["Rate Limiter<br/>120 req/min per IP"]
    E -->|No| K["Vite Dev Server<br/>or Static Files"]
    F --> G{"Mutating Method?<br/>POST/PATCH/DELETE"}
    G -->|Yes| H{"API Key or<br/>/api/public/*?"}
    H -->|Yes| I["Skip CSRF"]
    H -->|No| J["CSRF Double-Submit<br/>Cookie Validation"]
    G -->|No| I
    I --> L["Route Handler"]
    J -->|Valid| L
    J -->|Invalid| M["403 Forbidden"]
    L --> N{"Auth Required?"}
    N -->|Yes| O["requireAuth<br/>Check session.userId"]
    N -->|No| P["Execute Handler"]
    O -->|Authenticated| Q{"Role Check?"}
    O -->|Not Auth| R["401 Unauthorized"]
    Q -->|Yes| S["requireRole<br/>OWNER bypasses all"]
    Q -->|No| P
    S -->|Authorized| P
    S -->|Forbidden| T["403 Forbidden"]
    P --> U["Storage Layer<br/>(Drizzle ORM)"]
    U --> V["PostgreSQL"]
    V --> W["res.json(data)"]
    W --> X["Global Error Handler<br/>(catches unhandled)"]
```

## 3. Database Entity Relationship Diagram

```mermaid
erDiagram
    users {
        varchar id PK
        text name
        text email UK
        text password
        user_role role
        approval_status approvalStatus
        integer failedLoginAttempts
        timestamp lockedUntil
        boolean forcePasswordChange
        timestamp lastLoginAt
        timestamp createdAt
        timestamp updatedAt
    }

    locations {
        varchar id PK
        text name
        text address
        text city
        text state
        text phone
        boolean isActive
    }

    territories {
        varchar id PK
        text name
        varchar repUserId FK
    }

    physicians {
        varchar id PK
        text firstName
        text lastName
        text specialty
        text npi
        text practiceName
        physician_status status
        relationship_stage relationshipStage
        priority priority
        varchar territoryId FK
        varchar assignedOwnerId FK
        timestamp deletedAt
    }

    referrals {
        varchar id PK
        varchar physicianId FK
        varchar locationId FK
        date referralDate
        text patientFullName
        referral_status status
        integer scheduledVisits
        integer arrivedVisits
        real valueEstimate
        payer_type payerType
        timestamp deletedAt
    }

    interactions {
        varchar id PK
        varchar physicianId FK
        varchar locationId FK
        varchar userId FK
        interaction_type type
        timestamp occurredAt
        text summary
        timestamp deletedAt
    }

    tasks {
        varchar id PK
        varchar physicianId FK
        varchar assignedToUserId FK
        timestamp dueAt
        priority priority
        task_status status
        text description
    }

    calendar_events {
        varchar id PK
        text title
        event_type eventType
        timestamp startAt
        timestamp endAt
        varchar locationId FK
        varchar physicianId FK
        varchar organizerUserId FK
    }

    collections {
        varchar id PK
        varchar physicianId FK
        varchar locationId FK
        date collectionDate
        numeric amount
        payer_type payerType
    }

    user_location_access {
        varchar id PK
        varchar userId FK
        varchar locationId FK
    }

    audit_logs {
        varchar id PK
        varchar userId FK
        text action
        text entity
        text entityId
        timestamp timestamp
    }

    physician_monthly_summary {
        varchar id PK
        varchar physicianId FK
        date month
        integer referralsCount
        real arrivalRate
        real tierScore
        tier_label tierLabel
    }

    territory_monthly_summary {
        varchar id PK
        varchar territoryId FK
        date month
        integer referralsCount
        numeric revenueTotal
    }

    location_monthly_summary {
        varchar id PK
        varchar locationId FK
        date month
        integer referralsCount
        real riskScore
    }

    users ||--o{ interactions : "logs"
    users ||--o{ tasks : "assigned to"
    users ||--o{ calendar_events : "organizes"
    users ||--o{ audit_logs : "performs"
    users ||--o{ physicians : "owns"
    users ||--o| territories : "rep for"
    users ||--o{ user_location_access : "has access"

    physicians ||--o{ interactions : "receives"
    physicians ||--o{ referrals : "generates"
    physicians ||--o{ tasks : "related to"
    physicians ||--o{ collections : "collects from"
    physicians ||--o{ physician_monthly_summary : "summarized by"

    locations ||--o{ referrals : "receives at"
    locations ||--o{ interactions : "occurs at"
    locations ||--o{ calendar_events : "held at"
    locations ||--o{ collections : "collected at"
    locations ||--o{ user_location_access : "accessible by"
    locations ||--o{ location_monthly_summary : "summarized by"

    territories ||--o{ territory_monthly_summary : "summarized by"
```

## 4. ETL / Scheduled Jobs Flow

```mermaid
flowchart TD
    subgraph Scheduler["node-cron Scheduler"]
        C1["Daily 2:00 AM<br/>runETL()"]
        C2["Weekdays 7:00 AM<br/>sendOverdueDigests()"]
        C3["Daily 6:30 AM<br/>processScheduledReports()"]
        C4["Monday 8:00 AM<br/>checkUserInactivity()"]
    end

    subgraph ETL["runETL() Pipeline"]
        E1["Check last ETL run timestamp<br/>(app_settings table)"]
        E1 --> E2{"Incremental or<br/>Full Recompute?"}
        E2 -->|"Changes since last run"| E3["Identify affected months<br/>(changed referrals/collections)"]
        E2 -->|"No prior run or forced"| E4["Full recompute<br/>(last 6 months)"]
        E3 --> E5["Load all physicians,<br/>locations, territories"]
        E4 --> E5
        E5 --> E6["Aggregate referrals<br/>by physician + month"]
        E6 --> E7["Aggregate collections<br/>by physician + month"]
        E7 --> E8["Compute tier scores<br/>(revenue, trend, conversion,<br/>payer mix weights)"]
        E8 --> E9["Upsert physician_monthly_summary<br/>(batch of 100)"]
        E9 --> E10["Compute location_monthly_summary<br/>(referral dependency ratio,<br/>risk score)"]
        E10 --> E11["Compute territory_monthly_summary<br/>(referrals, revenue, visits)"]
        E11 --> E12["Auto-update physician<br/>relationship stages<br/>(NEW/ACTIVE/AT_RISK/INACTIVE)"]
        E12 --> E13["Generate provider alerts<br/>(declining referrals,<br/>reactivated providers)"]
        E13 --> E14["Email alerts to<br/>OWNER + DIRECTOR users"]
        E14 --> E15["Store ETL run timestamp"]
    end

    subgraph Digests["sendOverdueDigests()"]
        D1["Query overdue tasks<br/>(status=OPEN, dueAt < now)"]
        D1 --> D2["Group by assigned user"]
        D2 --> D3["Email digest per user<br/>via SMTP/Graph"]
    end

    subgraph Reports["processScheduledReports()"]
        R1["Query scheduled_reports<br/>due for delivery"]
        R1 --> R2["Generate CSV data"]
        R2 --> R3["Email CSV attachment<br/>to configured recipients"]
    end

    subgraph Inactivity["checkUserInactivity()"]
        I1["Find users inactive 7+ days"]
        I1 --> I2["Email alert to admins"]
    end

    C1 --> E1
    C2 --> D1
    C3 --> R1
    C4 --> I1
```

## 5. Authentication Flow

```mermaid
sequenceDiagram
    participant Browser
    participant Express
    participant Session as Session Store<br/>(PgStore)
    participant DB as PostgreSQL

    Note over Browser,DB: Login Flow

    Browser->>Express: GET /api/csrf-token
    Express->>Browser: { token } + Set-Cookie: csrf-token

    Browser->>Express: POST /api/auth/login<br/>{ email, password }<br/>Headers: x-csrf-token

    Express->>Express: CSRF validation<br/>(cookie === header)
    Express->>DB: SELECT user WHERE email
    DB-->>Express: User record

    alt Account locked
        Express-->>Browser: 403 Account locked
    end

    Express->>Express: bcrypt.compare(password, hash)

    alt Invalid password
        Express->>DB: INCREMENT failedLoginAttempts
        Note over Express,DB: Lock after 10 attempts (5 min)
        Express-->>Browser: 401 Invalid credentials
    end

    Express->>DB: RESET failedLoginAttempts<br/>SET lastLoginAt
    Express->>Session: Create session<br/>{ userId, userRole }
    Session->>DB: INSERT session row

    alt forcePasswordChange = true
        Express-->>Browser: 200 { user, forcePasswordChange: true }
        Browser->>Browser: Redirect to password change
    else Normal login
        Express-->>Browser: 200 { user }
    end

    Note over Browser,DB: Authenticated Request Flow

    Browser->>Express: GET /api/physicians<br/>Cookie: session-id
    Express->>Session: Validate session
    Session->>DB: SELECT session
    DB-->>Session: Session data
    Session-->>Express: { userId, userRole }
    Express->>Express: requireAuth() passes
    Express->>Express: requireRole() check
    Express->>DB: Query physicians
    DB-->>Express: Results
    Express-->>Browser: JSON response

    Note over Browser,DB: Session Management

    Express->>Express: Rolling 15-min expiry<br/>(refreshed on each request)
    Express->>Session: Update session maxAge

    Note over Browser,DB: Logout Flow

    Browser->>Express: POST /api/auth/logout<br/>Headers: x-csrf-token
    Express->>Session: Destroy session
    Session->>DB: DELETE session row
    Express-->>Browser: 200 OK
```
