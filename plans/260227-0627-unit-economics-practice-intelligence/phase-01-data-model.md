# Phase 1: Data Model

## Context Links
- Schema file: `shared/schema.ts`
- Existing enums: `userRoleEnum`, `payerTypeEnum`, etc. (lines 8-46)
- Existing location table: lines 66-76
- Existing `physicianMonthlySummary`: lines 280-301
- DB push: `npm run db:push`

## Overview
- **Priority:** P1 (blocks all other phases)
- **Status:** pending
- **Description:** Add 4 new tables + 2 new enums to `shared/schema.ts` for the unit economics subsystem. Practice Intelligence uses existing tables only (no new tables).

## Key Insights
- Codebase uses `varchar("id", { length: 36 }).primaryKey().default(sql\`gen_random_uuid()\`)` for all IDs
- All tables have `createdAt` / `updatedAt` timestamps
- `numeric(precision, scale)` used for money (see `collections.amount`)
- `real` used for percentages/rates
- Insert schemas always `.omit({ id: true, createdAt: true, updatedAt: true })`
- Enums defined via `pgEnum()` before table usage

## Requirements

### New Enums

```typescript
// In shared/schema.ts, add after line 46 (after approvalStatusEnum)

export const periodTypeEnum = pgEnum("period_type", [
  "DAILY", "WEEKLY", "MONTHLY",
]);

export const financialAlertTypeEnum = pgEnum("financial_alert_type", [
  "LOW_REVENUE_PER_VISIT",
  "HIGH_COST_PER_VISIT",
  "LOW_PROVIDER_REVENUE",
  "LOW_ARRIVAL_RATE",
  "HIGH_LABOR_PERCENT",
]);
```

### New Tables

#### 1. `clinic_financials` -- Daily/weekly/monthly financial snapshots per location

```typescript
export const clinicFinancials = pgTable("clinic_financials", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id", { length: 36 }).notNull().references(() => locations.id),
  periodDate: date("period_date").notNull(),
  periodType: periodTypeEnum("period_type").notNull().default("WEEKLY"),
  grossRevenue: numeric("gross_revenue", { precision: 12, scale: 2 }).notNull().default("0"),
  totalVisits: integer("total_visits").notNull().default(0),
  totalUnits: integer("total_units").notNull().default(0),
  laborCost: numeric("labor_cost", { precision: 12, scale: 2 }).notNull().default("0"),
  rentCost: numeric("rent_cost", { precision: 12, scale: 2 }).notNull().default("0"),
  suppliesCost: numeric("supplies_cost", { precision: 12, scale: 2 }).notNull().default("0"),
  otherFixedCosts: numeric("other_fixed_costs", { precision: 12, scale: 2 }).notNull().default("0"),
  netContribution: numeric("net_contribution", { precision: 12, scale: 2 }).notNull().default("0"),
  source: text("source").notNull().default("manual"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("clinic_fin_location_period_idx").on(table.locationId, table.periodDate, table.periodType),
  index("clinic_fin_period_date_idx").on(table.periodDate),
  index("clinic_fin_location_idx").on(table.locationId),
]);
```

#### 2. `provider_productivity` -- Per-provider weekly metrics

```typescript
export const providerProductivity = pgTable("provider_productivity", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  locationId: varchar("location_id", { length: 36 }).notNull().references(() => locations.id),
  weekStartDate: date("week_start_date").notNull(),
  totalVisits: integer("total_visits").notNull().default(0),
  totalUnits: integer("total_units").notNull().default(0),
  unitsPerHour: real("units_per_hour").default(0),
  hoursWorked: real("hours_worked").default(0),
  revenueGenerated: numeric("revenue_generated", { precision: 12, scale: 2 }).notNull().default("0"),
  revenueTarget: numeric("revenue_target", { precision: 12, scale: 2 }).default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("provider_prod_user_week_idx").on(table.userId, table.locationId, table.weekStartDate),
  index("provider_prod_location_idx").on(table.locationId),
  index("provider_prod_week_idx").on(table.weekStartDate),
]);
```

#### 3. `financial_alerts` -- Triggered alerts

```typescript
export const financialAlerts = pgTable("financial_alerts", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id", { length: 36 }).notNull().references(() => locations.id),
  alertType: financialAlertTypeEnum("alert_type").notNull(),
  threshold: real("threshold").notNull(),
  actualValue: real("actual_value").notNull(),
  message: text("message"),
  triggeredAt: timestamp("triggered_at").defaultNow().notNull(),
  acknowledgedAt: timestamp("acknowledged_at"),
  acknowledgedBy: varchar("acknowledged_by", { length: 36 }).references(() => users.id),
}, (table) => [
  index("fin_alert_location_idx").on(table.locationId),
  index("fin_alert_triggered_idx").on(table.triggeredAt),
  index("fin_alert_ack_idx").on(table.acknowledgedAt),
]);
```

#### 4. `financial_targets` -- Configurable thresholds

```typescript
export const financialTargets = pgTable("financial_targets", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id", { length: 36 }).references(() => locations.id),
  metricName: text("metric_name").notNull(),
  targetValue: real("target_value").notNull(),
  warningThreshold: real("warning_threshold"),
  criticalThreshold: real("critical_threshold"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("fin_target_location_metric_idx").on(table.locationId, table.metricName),
  index("fin_target_metric_idx").on(table.metricName),
]);
```

### Insert Schemas and Types

Add after existing insert schemas (around line 580):

```typescript
export const insertClinicFinancialSchema = createInsertSchema(clinicFinancials).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertProviderProductivitySchema = createInsertSchema(providerProductivity).omit({
  id: true, createdAt: true,
});
export const insertFinancialAlertSchema = createInsertSchema(financialAlerts).omit({
  id: true, triggeredAt: true,
});
export const insertFinancialTargetSchema = createInsertSchema(financialTargets).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type ClinicFinancial = typeof clinicFinancials.$inferSelect;
export type InsertClinicFinancial = z.infer<typeof insertClinicFinancialSchema>;
export type ProviderProductivity = typeof providerProductivity.$inferSelect;
export type InsertProviderProductivity = z.infer<typeof insertProviderProductivitySchema>;
export type FinancialAlert = typeof financialAlerts.$inferSelect;
export type InsertFinancialAlert = z.infer<typeof insertFinancialAlertSchema>;
export type FinancialTarget = typeof financialTargets.$inferSelect;
export type InsertFinancialTarget = z.infer<typeof insertFinancialTargetSchema>;
```

### DB Indexes (server/db.ts)

Add to the `indexes` array in `ensureSearchIndexes()`:

```typescript
// Unit economics indexes
`CREATE INDEX IF NOT EXISTS idx_clinic_fin_location_period ON clinic_financials (location_id, period_date)`,
`CREATE INDEX IF NOT EXISTS idx_clinic_fin_period_type ON clinic_financials (period_type, period_date)`,
`CREATE INDEX IF NOT EXISTS idx_provider_prod_user ON provider_productivity (user_id, week_start_date)`,
`CREATE INDEX IF NOT EXISTS idx_fin_alerts_unack ON financial_alerts (acknowledged_at) WHERE acknowledged_at IS NULL`,
```

## Implementation Steps

1. Open `shared/schema.ts`
2. Add `periodTypeEnum` and `financialAlertTypeEnum` after line 46
3. Add `clinicFinancials` table definition after `locationMonthlySummary` (after line 331)
4. Add `providerProductivity` table after `clinicFinancials`
5. Add `financialAlerts` table after `providerProductivity`
6. Add `financialTargets` table after `financialAlerts`
7. Add insert schemas and type exports at the bottom of the file
8. Open `server/db.ts`, add new indexes to the `indexes` array
9. Run `npm run db:push` to apply schema changes
10. Run `npm run check` to verify TypeScript compiles

## Todo List

- [ ] Add `periodTypeEnum` enum
- [ ] Add `financialAlertTypeEnum` enum
- [ ] Add `clinicFinancials` table
- [ ] Add `providerProductivity` table
- [ ] Add `financialAlerts` table
- [ ] Add `financialTargets` table
- [ ] Add insert schemas + types for all 4 tables
- [ ] Add indexes in `server/db.ts`
- [ ] Run `npm run db:push`
- [ ] Run `npm run check`

## Success Criteria

- `npm run db:push` succeeds without errors
- `npm run check` (TypeScript) passes
- All 4 tables visible in database
- Types importable from `@shared/schema` in both client and server code

## Risk Assessment

- **Unique constraint on `clinic_financials`** prevents duplicate entries per location+date+period. If import runs twice with same data, need upsert logic (handled in Phase 3).
- **`locationId` nullable on `financial_targets`** -- null means global default. Application logic must check global fallback when location-specific target missing.

## Security Considerations

- No auth concerns at schema level; enforced at route layer (Phase 3).
- Financial data (revenue, costs) is sensitive; role guards block MARKETER and FRONT_DESK.
