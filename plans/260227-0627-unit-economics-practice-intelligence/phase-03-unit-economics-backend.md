# Phase 3: Unit Economics Backend

## Context Links
- Schema additions: `phase-01-data-model.md`
- Storage pattern: `server/storage.ts` lines 78-229
- Route pattern: `server/routes/dashboard.ts`
- Role middleware: `server/routes/shared.ts` lines 25-33
- Permissions matrix: `docs/permissions.md`

## Overview
- **Priority:** P1
- **Status:** pending
- **Description:** Storage layer (CRUD + aggregation queries), API routes (10 endpoints), and alert engine for the unit economics subsystem.

## Key Insights
- Storage interface pattern: define method in `IStorage`, implement in `DatabaseStorage`
- Routes follow `registerXxxRoutes(app: Express)` convention
- Role guards: OWNER=full, DIRECTOR=read+manage targets, ANALYST=read-only, MARKETER/FRONT_DESK=no access
- Alert engine is a standalone module called after data import, not a cron job
- Financial data uses `numeric(12,2)` for precision; `parseFloat()` when reading

## Architecture

```
                     +--------------------------+
  POST /financials   | unit-economics-routes.ts |   GET /dashboard
  POST /import  -->  |   10 endpoints           | --> aggregation queries
                     +------------+-------------+
                                  |
                     +------------v-------------+
                     |   storage.ts              |
                     |   IStorage + Database     |
                     +------------+-------------+
                                  |
                     +------------v-------------+
                     | alert-engine.ts           |
                     | evaluateAlerts() called   |
                     | after each data import    |
                     +--------------------------+
```

## Related Code Files

### Files to Create
- `server/routes/unit-economics.ts` -- 10 API endpoints
- `server/unit-economics-alert-engine.ts` -- alert evaluation logic

### Files to Modify
- `server/storage.ts` -- add IStorage methods + DatabaseStorage implementations
- `server/routes.ts` -- register new route module

## Implementation Steps

### Step 1: Add IStorage Methods

Add to the `IStorage` interface in `server/storage.ts`:

```typescript
// Unit Economics - Clinic Financials
getClinicFinancials(filters: {
  locationId?: string;
  periodType?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<ClinicFinancial[]>;
upsertClinicFinancial(data: InsertClinicFinancial): Promise<ClinicFinancial>;
bulkUpsertClinicFinancials(rows: InsertClinicFinancial[]): Promise<{ inserted: number; updated: number }>;

// Unit Economics - Provider Productivity
getProviderProductivity(filters: {
  userId?: string;
  locationId?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<ProviderProductivity[]>;
upsertProviderProductivity(data: InsertProviderProductivity): Promise<ProviderProductivity>;
bulkUpsertProviderProductivity(rows: InsertProviderProductivity[]): Promise<{ inserted: number; updated: number }>;

// Unit Economics - Financial Alerts
getFinancialAlerts(filters: {
  locationId?: string;
  acknowledged?: boolean;
}): Promise<FinancialAlert[]>;
createFinancialAlert(alert: InsertFinancialAlert): Promise<FinancialAlert>;
acknowledgeFinancialAlert(id: string, userId: string): Promise<FinancialAlert | undefined>;

// Unit Economics - Financial Targets
getFinancialTargets(locationId?: string): Promise<FinancialTarget[]>;
upsertFinancialTarget(data: InsertFinancialTarget): Promise<FinancialTarget>;

// Unit Economics - Aggregation Queries
getUnitEconomicsDashboard(): Promise<UnitEconomicsLocationSummary[]>;
getUnitEconomicsLocationDetail(locationId: string, dateFrom?: string, dateTo?: string): Promise<UnitEconomicsLocationDetail>;
getProviderProductivityLeaderboard(dateFrom?: string, dateTo?: string): Promise<ProviderProductivityEntry[]>;
getUnitEconomicsForecast(locationId?: string): Promise<ForecastEntry[]>;
```

Add type definitions:

```typescript
export interface UnitEconomicsLocationSummary {
  locationId: string;
  locationName: string;
  grossRevenue: number;
  totalVisits: number;
  revenuePerVisit: number;
  costPerVisit: number;
  laborPercent: number;
  netMargin: number;
  netContribution: number;
  activeAlerts: number;
}

export interface UnitEconomicsLocationDetail {
  location: { id: string; name: string; city: string; state: string };
  currentPeriod: UnitEconomicsLocationSummary | null;
  trends: Array<{
    periodDate: string;
    grossRevenue: number;
    totalVisits: number;
    revenuePerVisit: number;
    costPerVisit: number;
    laborPercent: number;
    netContribution: number;
  }>;
  providers: ProviderProductivityEntry[];
}

export interface ProviderProductivityEntry {
  userId: string;
  userName: string;
  locationName: string;
  totalVisits: number;
  totalUnits: number;
  unitsPerHour: number;
  hoursWorked: number;
  revenueGenerated: number;
  revenueTarget: number;
  targetAttainment: number;
}

export interface ForecastEntry {
  locationId: string;
  locationName: string;
  forecastRevenue: number;
  forecastVisits: number;
  forecastRevenuePerVisit: number;
  trendDirection: "up" | "down" | "flat";
  confidenceScore: number;
}
```

### Step 2: Implement DatabaseStorage Methods

Key implementations (abbreviated for plan; full SQL in implementation):

**`getClinicFinancials`**: Simple SELECT with optional WHERE filters on locationId, periodType, date range. ORDER BY periodDate DESC.

**`upsertClinicFinancial`**: INSERT ... ON CONFLICT (location_id, period_date, period_type) DO UPDATE.

**`bulkUpsertClinicFinancials`**: Loop over `upsertClinicFinancial` in a transaction (or use `Promise.all` with reasonable batch sizes).

**`getUnitEconomicsDashboard`**: Core aggregation query:

```sql
SELECT
  l.id as location_id,
  l.name as location_name,
  COALESCE(SUM(cf.gross_revenue), 0) as gross_revenue,
  COALESCE(SUM(cf.total_visits), 0) as total_visits,
  CASE WHEN SUM(cf.total_visits) > 0
    THEN ROUND(SUM(cf.gross_revenue)::numeric / SUM(cf.total_visits), 2)
    ELSE 0 END as revenue_per_visit,
  CASE WHEN SUM(cf.total_visits) > 0
    THEN ROUND((SUM(cf.labor_cost) + SUM(cf.rent_cost) + SUM(cf.supplies_cost) + SUM(cf.other_fixed_costs))::numeric / SUM(cf.total_visits), 2)
    ELSE 0 END as cost_per_visit,
  CASE WHEN SUM(cf.gross_revenue) > 0
    THEN ROUND(SUM(cf.labor_cost)::numeric / SUM(cf.gross_revenue) * 100, 1)
    ELSE 0 END as labor_percent,
  CASE WHEN SUM(cf.gross_revenue) > 0
    THEN ROUND(SUM(cf.net_contribution)::numeric / SUM(cf.gross_revenue) * 100, 1)
    ELSE 0 END as net_margin,
  COALESCE(SUM(cf.net_contribution), 0) as net_contribution,
  COALESCE(alert_counts.active_alerts, 0)::int as active_alerts
FROM locations l
LEFT JOIN clinic_financials cf ON cf.location_id = l.id
  AND cf.period_date >= (CURRENT_DATE - INTERVAL '30 days')
LEFT JOIN (
  SELECT location_id, COUNT(*) as active_alerts
  FROM financial_alerts
  WHERE acknowledged_at IS NULL
  GROUP BY location_id
) alert_counts ON alert_counts.location_id = l.id
WHERE l.is_active = true
GROUP BY l.id, l.name, alert_counts.active_alerts
ORDER BY gross_revenue DESC
```

**`getProviderProductivityLeaderboard`**: Join `provider_productivity` with `users` and `locations`, aggregate by userId for given date range.

**`getUnitEconomicsForecast`**: Rolling 30-day forecast. Take last 4 weeks of `clinic_financials` per location, compute linear trend, extrapolate 30 days.

```typescript
async getUnitEconomicsForecast(locationId?: string): Promise<ForecastEntry[]> {
  // 1. Get last 8 weeks of weekly data per location
  // 2. Linear regression on revenue and visits
  // 3. Extrapolate 4 weeks forward
  // 4. Return forecast with confidence based on R-squared
  const locFilter = locationId ? sql`AND cf.location_id = ${locationId}` : sql``;
  const result = await db.execute(sql`
    SELECT cf.location_id, l.name as location_name,
      cf.period_date, cf.gross_revenue, cf.total_visits
    FROM clinic_financials cf
    JOIN locations l ON l.id = cf.location_id
    WHERE cf.period_type = 'WEEKLY'
      AND cf.period_date >= CURRENT_DATE - INTERVAL '8 weeks'
      ${locFilter}
    ORDER BY cf.location_id, cf.period_date
  `);
  // Group by location, compute trend, return forecast entries
  // Implementation uses simple linear regression in JS
}
```

### Step 3: Create Alert Engine

Create `server/unit-economics-alert-engine.ts`:

```typescript
import { db } from "./db";
import { storage } from "./storage";
import { sql } from "drizzle-orm";
import type { InsertFinancialAlert } from "@shared/schema";

interface AlertRule {
  alertType: InsertFinancialAlert["alertType"];
  metricName: string;
  defaultThreshold: number;
  comparison: "lt" | "gt"; // less-than or greater-than triggers alert
  messageTemplate: (location: string, actual: number, threshold: number) => string;
}

const DEFAULT_RULES: AlertRule[] = [
  {
    alertType: "LOW_REVENUE_PER_VISIT",
    metricName: "revenue_per_visit",
    defaultThreshold: 95,
    comparison: "lt",
    messageTemplate: (loc, actual, thresh) =>
      `${loc}: Revenue/visit $${actual.toFixed(0)} below $${thresh} threshold`,
  },
  {
    alertType: "HIGH_COST_PER_VISIT",
    metricName: "cost_per_visit",
    defaultThreshold: 92,
    comparison: "gt",
    messageTemplate: (loc, actual, thresh) =>
      `${loc}: Cost/visit $${actual.toFixed(0)} exceeds $${thresh} threshold`,
  },
  {
    alertType: "HIGH_LABOR_PERCENT",
    metricName: "labor_percent",
    defaultThreshold: 57.5, // midpoint of 55-60% range
    comparison: "gt",
    messageTemplate: (loc, actual, thresh) =>
      `${loc}: Labor ${actual.toFixed(1)}% exceeds ${thresh}% threshold`,
  },
];

export async function evaluateAlerts(locationId?: string): Promise<number> {
  // 1. Get current metrics per location (last 7 days of data)
  // 2. Get financial_targets (location-specific or global defaults)
  // 3. For each rule, check if actual crosses threshold
  // 4. Insert new financial_alerts (skip if identical unacknowledged alert exists)
  // Returns count of new alerts created

  const dashboard = await storage.getUnitEconomicsDashboard();
  const targets = await storage.getFinancialTargets();
  let alertsCreated = 0;

  for (const locSummary of dashboard) {
    if (locationId && locSummary.locationId !== locationId) continue;

    for (const rule of DEFAULT_RULES) {
      // Find location-specific or global threshold
      const target = targets.find(
        t => t.metricName === rule.metricName &&
             (t.locationId === locSummary.locationId || t.locationId === null)
      );
      const threshold = target?.criticalThreshold ?? rule.defaultThreshold;

      const actual = getMetricValue(locSummary, rule.metricName);
      const triggered = rule.comparison === "lt"
        ? actual < threshold
        : actual > threshold;

      if (triggered && actual > 0) {
        // Check for existing unacknowledged alert of same type+location
        const existing = await db.execute(sql`
          SELECT id FROM financial_alerts
          WHERE location_id = ${locSummary.locationId}
            AND alert_type = ${rule.alertType}
            AND acknowledged_at IS NULL
          LIMIT 1
        `);

        if (existing.rows.length === 0) {
          await storage.createFinancialAlert({
            locationId: locSummary.locationId,
            alertType: rule.alertType,
            threshold,
            actualValue: actual,
            message: rule.messageTemplate(locSummary.locationName, actual, threshold),
          });
          alertsCreated++;
        }
      }
    }
  }

  return alertsCreated;
}

function getMetricValue(summary: any, metricName: string): number {
  const map: Record<string, string> = {
    revenue_per_visit: "revenuePerVisit",
    cost_per_visit: "costPerVisit",
    labor_percent: "laborPercent",
  };
  return summary[map[metricName] || metricName] || 0;
}
```

**Provider-level alerts** (LOW_PROVIDER_REVENUE): Separate function that checks `provider_productivity` for any provider below $5,700/week:

```typescript
export async function evaluateProviderAlerts(): Promise<number> {
  // Query provider_productivity for last week
  // Check each provider's revenueGenerated against target or $5,700 default
  // Create alerts for underperformers
}
```

### Step 4: Create Route File

Create `server/routes/unit-economics.ts`:

```typescript
import type { Express } from "express";
import { storage } from "../storage";
import { requireRole, getClientIp } from "./shared";
import { evaluateAlerts, evaluateProviderAlerts } from "../unit-economics-alert-engine";

export function registerUnitEconomicsRoutes(app: Express) {

  // GET /api/unit-economics/dashboard
  app.get("/api/unit-economics/dashboard",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const data = await storage.getUnitEconomicsDashboard();
        res.json(data);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  // GET /api/unit-economics/location/:id
  app.get("/api/unit-economics/location/:id",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const dateFrom = req.query.dateFrom as string | undefined;
        const dateTo = req.query.dateTo as string | undefined;
        const data = await storage.getUnitEconomicsLocationDetail(
          req.params.id, dateFrom, dateTo
        );
        res.json(data);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  // GET /api/unit-economics/providers
  app.get("/api/unit-economics/providers",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const dateFrom = req.query.dateFrom as string | undefined;
        const dateTo = req.query.dateTo as string | undefined;
        const data = await storage.getProviderProductivityLeaderboard(dateFrom, dateTo);
        res.json(data);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  // POST /api/unit-economics/financials — manual data entry
  app.post("/api/unit-economics/financials",
    requireRole("OWNER", "DIRECTOR"),
    async (req, res) => {
      try {
        const result = await storage.upsertClinicFinancial(req.body);
        // Trigger alert evaluation for this location
        const alertCount = await evaluateAlerts(result.locationId);
        await storage.createAuditLog({
          userId: req.session.userId!,
          action: "CREATE",
          entity: "ClinicFinancial",
          entityId: result.id,
          detailJson: { ...req.body, alertsTriggered: alertCount },
          ipAddress: getClientIp(req),
          userAgent: req.headers["user-agent"] || null,
        });
        res.json({ financial: result, alertsTriggered: alertCount });
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
    }
  );

  // POST /api/unit-economics/financials/import — CSV/Excel import
  // (Implemented in phase-06-data-import-pipeline.md)

  // GET /api/unit-economics/alerts
  app.get("/api/unit-economics/alerts",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const acknowledged = req.query.acknowledged === "true" ? true :
                             req.query.acknowledged === "false" ? false : undefined;
        const locationId = req.query.locationId as string | undefined;
        const data = await storage.getFinancialAlerts({ locationId, acknowledged });
        res.json(data);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  // POST /api/unit-economics/alerts/:id/acknowledge
  app.post("/api/unit-economics/alerts/:id/acknowledge",
    requireRole("OWNER", "DIRECTOR"),
    async (req, res) => {
      try {
        const alert = await storage.acknowledgeFinancialAlert(
          req.params.id, req.session.userId!
        );
        if (!alert) return res.status(404).json({ message: "Alert not found" });
        res.json(alert);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  // GET /api/unit-economics/targets
  app.get("/api/unit-economics/targets",
    requireRole("OWNER", "DIRECTOR"),
    async (req, res) => {
      try {
        const locationId = req.query.locationId as string | undefined;
        const data = await storage.getFinancialTargets(locationId);
        res.json(data);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );

  // PATCH /api/unit-economics/targets
  app.patch("/api/unit-economics/targets",
    requireRole("OWNER"),
    async (req, res) => {
      try {
        // req.body = { targets: InsertFinancialTarget[] }
        const targets = req.body.targets;
        if (!Array.isArray(targets)) {
          return res.status(400).json({ message: "targets array required" });
        }
        const results = await Promise.all(
          targets.map((t: any) => storage.upsertFinancialTarget(t))
        );
        await storage.createAuditLog({
          userId: req.session.userId!,
          action: "UPDATE",
          entity: "FinancialTargets",
          entityId: "bulk",
          detailJson: { count: results.length },
          ipAddress: getClientIp(req),
          userAgent: req.headers["user-agent"] || null,
        });
        res.json(results);
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
    }
  );

  // GET /api/unit-economics/forecast
  app.get("/api/unit-economics/forecast",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const locationId = req.query.locationId as string | undefined;
        const data = await storage.getUnitEconomicsForecast(locationId);
        res.json(data);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    }
  );
}
```

### Step 5: Register Routes

In `server/routes.ts`:

```typescript
import { registerUnitEconomicsRoutes } from "./routes/unit-economics";
// Inside registerRoutes():
registerUnitEconomicsRoutes(app);
```

## Todo List

- [ ] Add type interfaces to `server/storage.ts` (UnitEconomicsLocationSummary, etc.)
- [ ] Add all IStorage method signatures
- [ ] Implement `getClinicFinancials()` in DatabaseStorage
- [ ] Implement `upsertClinicFinancial()` with ON CONFLICT
- [ ] Implement `bulkUpsertClinicFinancials()`
- [ ] Implement `getProviderProductivity()`
- [ ] Implement `upsertProviderProductivity()`
- [ ] Implement `bulkUpsertProviderProductivity()`
- [ ] Implement `getFinancialAlerts()`
- [ ] Implement `createFinancialAlert()`
- [ ] Implement `acknowledgeFinancialAlert()`
- [ ] Implement `getFinancialTargets()`
- [ ] Implement `upsertFinancialTarget()`
- [ ] Implement `getUnitEconomicsDashboard()` aggregation query
- [ ] Implement `getUnitEconomicsLocationDetail()`
- [ ] Implement `getProviderProductivityLeaderboard()`
- [ ] Implement `getUnitEconomicsForecast()` with linear regression
- [ ] Create `server/unit-economics-alert-engine.ts`
- [ ] Create `server/routes/unit-economics.ts`
- [ ] Register in `server/routes.ts`
- [ ] Run `npm run check`
- [ ] Test all 10 endpoints manually

## Success Criteria

- All 10 endpoints return correct data shapes
- Dashboard aggregation returns data for all 8 active locations
- Alert engine creates alerts when thresholds breached; skips duplicates
- Forecast returns directional trends per location
- Audit logs created for mutations
- Role guards enforce: OWNER=full, DIRECTOR=read+manage, ANALYST=read, MARKETER/FRONT_DESK=403

## Risk Assessment

- **Storage.ts file size**: Already large. New methods add ~300 lines. Consider extracting unit-economics storage into `server/storage-unit-economics.ts` if file exceeds 200 lines of new code. Can use class extension or composition.
- **Forecast accuracy**: Simple linear regression on 8 weeks is rough. Acceptable for MVP; document as "directional indicator, not prediction."
- **Alert deduplication**: Only one unacknowledged alert per type per location. If data changes and violation persists, existing alert stays; if resolved and re-triggered, new alert created after old one is acknowledged.

## Security Considerations

- All write endpoints restricted to OWNER/DIRECTOR
- Read endpoints restricted to OWNER/DIRECTOR/ANALYST
- MARKETER and FRONT_DESK receive 403 Forbidden
- Audit log on all mutations (financials insert, target updates, alert acknowledgment)
- No PII in financial data tables
