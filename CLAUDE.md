# CLAUDE.md — crm.tristarpt.com
# Tristar Physical Therapy — Internal Operations CRM
# Owner: Jordan Black | GitHub: jblack4vols
# Last updated: 2026-04-16

---

## 1. Project Overview

`crm.tristarpt.com` is Tristar Physical Therapy's internal operations platform — a full-stack
Next.js app deployed on Railway. It consolidates referral intelligence, financial analytics,
provider management, scheduling ops, and marketing automation into a single owner-facing
dashboard. It is NOT a patient-facing product.

**Long-term goal:** Productize this stack as a licensable SaaS layer for other PT practice owners.
Every architectural decision should be made with multi-tenant extensibility in mind.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js (App Router) |
| Styling | Tailwind CSS + shadcn/ui |
| State | Zustand |
| Icons | Lucide React |
| Database | Supabase (PostgreSQL) |
| Auth | Microsoft Azure AD SSO |
| Deployment | Railway |
| Domain | crm.tristarpt.com |
| Source | github.com/jblack4vols (private repo) |

**Azure AD credentials (SSO):**
- App ID: `debda2f0-a35b-44c9-8e0b-9d1d306c49a8`
- Tenant ID: `668d2c67-481c-4c6c-8904-b08dfd68308c`

---

## 3. Brand & Design Tokens

Always use these exact values. Never substitute with generic Tailwind colors.

```css
--color-primary:   #FF8200   /* Tristar orange — CTAs, active states, badges */
--color-accent:    #FFEAD5   /* Light orange — backgrounds, hover states */
--color-dark:      #000000   /* Primary text, nav backgrounds */
--color-light:     #FFFFFF   /* Card backgrounds, inputs */
```

**Typography:** System font stack. Headings: `font-semibold`. Body: `font-normal`.
**Hierarchy:** Max 3 font sizes per screen. Use `text-sm` for data tables, `text-base` for body.
**Components:** Always use shadcn/ui primitives — never roll custom modal/dropdown/toast from scratch.
**Design principle:** Strong visual hierarchy, dense data tables, minimal decorative elements.
The audience is a practice owner reviewing operational data, not a consumer app.

---

## 4. Supabase Projects

### Primary Ops Database
- **Project ID:** `tkgygnninsbzzwlobtff`
- **URL:** `https://tkgygnninsbzzwlobtff.supabase.co`
- Used by: profit optimizer, BCBS remittance tracker, referral intelligence app

### CPT Revenue Analytics Database
- **Project ID:** `uignhceazgskozzczfyi`
- **URL:** `https://uignhceazgskozzczfyi.supabase.co`
- Seeded with 59,520 real claims
- Used by: reimbursement calculator, RPV analysis

**Key tables in `tkgygnninsbzzwlobtff`:**
```
profit_optimizer_runs       -- one row per analysis period, all system KPIs
profit_optimizer_locations  -- one row per location per period
profit_optimizer_benchmarks -- live targets (updatable, not hardcoded)
bcbs_remittance_tracker     -- BCBS offset tracking, CRT recoupments
referral_sources            -- physician/APRN referral data with payer tier
```

**Supabase access pattern:**
- Always read `profit_optimizer_benchmarks` for live targets — never hardcode RPV/CPV
- Upsert, never insert blindly — use `onConflict` to avoid duplicate rows
- Fallback to `window.localStorage` if Supabase is unavailable; show yellow warning banner

---

## 5. Business Context & KPI Benchmarks

These are the source-of-truth targets. Always reference these when building analytics features.

| Metric | Target | Current |
|---|---|---|
| Revenue Per Visit (RPV) | $95 | ~$92 |
| Cost Per Visit (CPV) | $92 | ~$92 |
| Labor Cost Ratio | 65% | ~70.6% |
| Arrival Rate | 85% | varies |
| Units Per Visit (UPV) | 4.0 | varies |
| Visits Per Provider Per Day | ≥10 | varies |
| Monthly Visit Volume | ~5,600 | system-wide |

---

## 6. Locations (8 Clinics)

```
Morristown     -- HQ, EIN: 84-4807683
Maryville
Bean Station   -- softest conversion rate, watch closely
Newport
Jefferson City
Rogersville
New Tazewell
Johnson City   -- opened August 2025, historically low visits-per-case
```

---

## 7. Payer Tier Classification

Used in all referral, revenue, and analytics features.

```
Tier A  -- BCBS TN, Medicare/Palmetto GBA        (highest reimbursement)
Tier B  -- Commercial, Workers Comp, VA           (mid-tier)
Tier C  -- Medicaid, Self-Pay                     (lowest reimbursement)
```

**Active audits (do not expose claim counts in UI):**
- BCBS TN strapping code post-pay audit — Letter IDs: `20260209L000073`, `20260212L000253`
- Palmetto GBA TPE audit — CPT 97112, 18 ADR claims
- Managed by: Nicole Atkins (billing coordinator)

---

## 8. Integrations & Connected Systems

| System | Purpose | Notes |
|---|---|---|
| Prompt EMR | Visit/revenue data source | BI via Metabase at `bistaging.promptemrdev.com` |
| GoHighLevel (GHL) | CRM / marketing automation | Drip sequences, campaign tracking |
| QuickBooks Online | Accounting | QBO API for expense/revenue sync |
| ADP | Payroll | Labor cost data |
| Microsoft 365 / Outlook | Email, calendar, Teams | Azure AD SSO shared with this app |
| GoTo Connect | Phone system | 28 seats, 8 locations |
| WP Engine / Divi | Public website | tristarpt.com (separate from CRM) |
| Vercel | Secondary deployments | Some tools live here |
| Railway | Primary deployment | crm.tristarpt.com lives here |

---

## 9. Key Personnel

| Name | Role |
|---|---|
| Jordan Black | Owner, remote (St. Augustine, FL) |
| VP of Operations | Ops leadership |
| Nicole Atkins | Billing coordinator — owns audit responses |
| Marketer/Physician Liaison | Referral outreach |

**Top referrers (do not cold-contact without checking gone-dark status):**
- Angelo Sorce MD — NPI `1215968300` (Tier A)
- Sonya Sartain APRN (Tier A)
- Sadril Mohammad PA-S (Tier A)
- David Caldwell PA — **REMOVED**, left state May 2025, never re-add

---

## 10. Coding Conventions

### Component Structure
```
src/
  app/              -- Next.js App Router pages and layouts
  components/
    ui/             -- shadcn/ui primitives only (never custom)
    features/       -- domain-specific components (referral, billing, ops)
    shared/         -- reusable layout pieces (PageHeader, DataTable, etc.)
  lib/
    supabase.ts     -- Supabase client singleton
    auth.ts         -- Azure AD session helpers
    utils.ts        -- shared formatters (currency, dates, percentages)
  store/            -- Zustand slices, one file per domain
  types/            -- shared TypeScript interfaces
```

### Rules
- **Readable over clever.** Clear variable names, comments on non-obvious logic.
  No one-liners that sacrifice clarity.
- **TypeScript everywhere.** No `any`. Define interfaces in `src/types/`.
- **Server Components by default.** Only add `"use client"` when genuinely needed
  (event handlers, browser APIs, Zustand store access).
- **Currency formatting:** Always `(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' })`.
  Never raw `.toFixed(2)` in UI.
- **Percentages:** Always show one decimal place: `(ratio * 100).toFixed(1) + '%'`.
- **Dates:** Use `date-fns`. Never `moment`. Format as `MMM d, yyyy` in UI.
- **Error boundaries:** Every data-fetching page gets a Suspense boundary + error state.
- **Loading states:** Use shadcn `Skeleton` — never a spinner alone.
- **Empty states:** Every table/list needs an empty state message with a CTA.
- **Alerts:** Use shadcn `Alert` with `variant="destructive"` for errors,
  default variant for info. Never raw colored divs.

### Data Tables
- Use shadcn `Table` with `TableHeader`, `TableBody`, `TableRow`, `TableCell`.
- Always sortable on the primary numeric column.
- Row counts > 50: add pagination or virtualization.
- Color-code performance vs. target: green = at/above target, amber = within 10%,
  red = more than 10% below target. Use Tailwind classes, not inline styles.

### Forms
- Never use HTML `<form>` tags directly — use controlled inputs with `onChange` + `onClick`.
- Validate client-side before any Supabase write.
- Show inline field errors, not toast-only errors.

---

## 11. Build & Dev Commands

```bash
npm run dev        # local dev server at localhost:3000
npm run build      # production build
npm run lint       # ESLint
npm run type-check # tsc --noEmit
```

**Before committing any feature:**
1. `npm run type-check` — must pass with zero errors
2. `npm run lint` — must pass with zero warnings on new files
3. Manually test the happy path and one error state in the browser

**Deployment:** Push to `main` → Railway auto-deploys. Check Railway dashboard for
build logs if deploy fails. Environment variables live in Railway project settings —
never commit `.env` files.

---

## 12. Environment Variables

Never hardcode these. Always read from `process.env`.

```
NEXT_PUBLIC_SUPABASE_URL          -- Supabase project URL
NEXT_PUBLIC_SUPABASE_ANON_KEY     -- Supabase anon key (public)
SUPABASE_SERVICE_ROLE_KEY         -- Server-only, never expose to client
AZURE_AD_CLIENT_ID                -- debda2f0-a35b-44c9-8e0b-9d1d306c49a8
AZURE_AD_TENANT_ID                -- 668d2c67-481c-4c6c-8904-b08dfd68308c
AZURE_AD_CLIENT_SECRET            -- Server-only
NEXTAUTH_SECRET                   -- Session encryption key
NEXTAUTH_URL                      -- https://crm.tristarpt.com in prod
```

---

## 13. Slash Commands Available (`.claude/commands/`)

These are pre-built skill prompts. Type `/command-name` in Claude Code to invoke.

| Command | What It Does |
|---|---|
| `/tristar-brand` | Enforce brand tokens on the component you're editing |
| `/frontend-design` | Generate a polished, production-grade UI screen |
| `/referral-feature` | Load payer tier rules + gone-dark logic before coding referral features |
| `/patient-lifecycle` | Load conversion/no-show/discharge business rules |
| `/ops-kpis` | Load the 10 KPI alert rules and benchmark targets |
| `/project-check` | Session check-in — surfaces what's next on the roadmap |
| `/audit-ts` | Audit a TypeScript file for type safety, error handling, dead code, complexity |
| `/review-component` | Review a component for brand compliance + accessibility |

---

## 14. Feature Roadmap (Current Priorities)

Track these in order. Do not start a new feature until the prior one is
committed and deployed.

1. **Referral Intelligence Dashboard** — physician rankings, payer tier badges, gone-dark alerts
2. **RPV Analytics by Location** — expected vs. actual RPV gap, color-coded by threshold
3. **Provider Productivity View** — visits/day, UPV, revenue gap per provider
4. **Patient Lifecycle Funnel** — conversion rate → arrival rate → completion rate
5. **BCBS Audit Status Panel** — read-only view of `bcbs_remittance_tracker` table
6. **Cash Flow Projection** — 341 seeded rows, rolling 13-week view

---

## 15. What NOT to Do

- **Never expose PHI.** No patient names, DOBs, or insurance IDs in the UI or logs.
- **Never hardcode API keys, anon keys, or secrets.** Always `process.env`.
- **Never commit a build with TypeScript errors.** Fix them; don't cast to `any`.
- **Never reference a specific BCBS audit claim count** in UI copy or comments.
- **Never re-add David Caldwell PA** to any referral list or outreach feature.
- **Never use `moment.js`.** Use `date-fns` exclusively.
- **Never create a custom modal from scratch.** Use shadcn `Dialog`.
- **Never deploy directly to Railway** by pushing to a branch other than `main`
  unless explicitly testing a preview deployment.
