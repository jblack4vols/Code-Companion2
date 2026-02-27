# Phase 01: Data Model

## Context Links
- [Current schema](../../shared/schema.ts)
- [Plan overview](./plan.md)

## Overview
- **Priority:** P1 (blocking all other phases)
- **Status:** pending
- **Effort:** 3h
- Add 6 new tables, 2 new enums, insert schemas, and TypeScript types to `shared/schema.ts`

## Key Insights
- Follow existing pattern: `varchar("id", { length: 36 }).primaryKey().default(sql\`gen_random_uuid()\`)`
- Money fields use `numeric(precision: 12, scale: 2)`
- All tables get `createdAt`/`updatedAt` timestamps
- Indexes defined inline via table callback
- Schema push via `npm run db:push` (no migration files)

## New Enums

### `claimStatusEnum`
```typescript
export const claimStatusEnum = pgEnum("claim_status", [
  "SUBMITTED", "ACCEPTED", "PENDING", "PAID", "PARTIAL_PAID",
  "DENIED", "APPEALED", "VOID",
]);
```

### `appealStatusEnum`
```typescript
export const appealStatusEnum = pgEnum("appeal_status", [
  "DRAFTED", "SUBMITTED", "WON", "LOST", "EXPIRED",
]);
```

## New Tables

### 1. `claims`
Core claim record linking DOS, patient, provider, clinic, and payer.

```typescript
export const claims = pgTable("claims", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  claimNumber: text("claim_number").notNull(),
  locationId: varchar("location_id", { length: 36 }).notNull().references(() => locations.id),
  providerId: varchar("provider_id", { length: 36 }).references(() => users.id),
  referralId: varchar("referral_id", { length: 36 }).references(() => referrals.id),
  patientAccountNumber: text("patient_account_number"),
  patientName: text("patient_name"),
  payer: text("payer").notNull(),
  payerType: payerTypeEnum("payer_type"),
  dateOfService: date("date_of_service").notNull(),
  cptCodes: jsonb("cpt_codes").$type<string[]>().notNull().default([]),
  billedAmount: numeric("billed_amount", { precision: 12, scale: 2 }).notNull(),
  expectedAmount: numeric("expected_amount", { precision: 12, scale: 2 }),
  submissionDate: date("submission_date"),
  status: claimStatusEnum("status").notNull().default("SUBMITTED"),
  source: text("source").notNull().default("import"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("claim_number_unique_idx").on(table.claimNumber),
  index("claim_location_idx").on(table.locationId),
  index("claim_provider_idx").on(table.providerId),
  index("claim_payer_idx").on(table.payer),
  index("claim_dos_idx").on(table.dateOfService),
  index("claim_status_idx").on(table.status),
  index("claim_submission_date_idx").on(table.submissionDate),
]);
```

### 2. `claim_payments`
Payment/adjustment events per claim. Multiple payments possible (partial pays, adjustments).

```typescript
export const claimPayments = pgTable("claim_payments", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  claimId: varchar("claim_id", { length: 36 }).notNull().references(() => claims.id),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).notNull(),
  adjustmentAmount: numeric("adjustment_amount", { precision: 12, scale: 2 }).default("0"),
  paymentDate: date("payment_date").notNull(),
  checkOrEftNumber: text("check_or_eft_number"),
  denialCodes: jsonb("denial_codes").$type<string[]>().default([]),
  adjustmentCodes: jsonb("adjustment_codes").$type<string[]>().default([]),
  remarkCodes: jsonb("remark_codes").$type<string[]>().default([]),
  isDenial: boolean("is_denial").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("claim_payment_claim_idx").on(table.claimId),
  index("claim_payment_date_idx").on(table.paymentDate),
  index("claim_payment_denial_idx").on(table.isDenial),
]);
```

### 3. `payer_rate_schedule`
Expected reimbursement by payer + CPT code. Used to compute underpayment flags.

```typescript
export const payerRateSchedule = pgTable("payer_rate_schedule", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  payer: text("payer").notNull(),
  cptCode: text("cpt_code").notNull(),
  expectedRate: numeric("expected_rate", { precision: 12, scale: 2 }).notNull(),
  effectiveDate: date("effective_date").notNull(),
  expirationDate: date("expiration_date"),
  source: text("source").notNull().default("historical"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("payer_rate_payer_cpt_date_idx").on(table.payer, table.cptCode, table.effectiveDate),
  index("payer_rate_payer_idx").on(table.payer),
  index("payer_rate_cpt_idx").on(table.cptCode),
]);
```

### 4. `denial_codes`
Lookup table for CARC/RARC code descriptions. Seeded once, rarely updated.

```typescript
export const denialCodes = pgTable("denial_codes", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull(),
  codeType: text("code_type").notNull().default("CARC"), // CARC or RARC
  description: text("description").notNull(),
  category: text("category"), // e.g., "Medical Necessity", "Authorization", "Coding"
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("denial_code_unique_idx").on(table.code, table.codeType),
]);
```

### 5. `appeal_templates`
Template text with `{{placeholder}}` tokens for auto-fill.

```typescript
export const appealTemplates = pgTable("appeal_templates", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  denialCodePattern: text("denial_code_pattern"), // regex or CSV of codes this template targets
  templateBody: text("template_body").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

### 6. `appeals`
Generated appeal letters linked to claims. Track lifecycle from draft to outcome.

```typescript
export const appeals = pgTable("appeals", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  claimId: varchar("claim_id", { length: 36 }).notNull().references(() => claims.id),
  claimPaymentId: varchar("claim_payment_id", { length: 36 }).references(() => claimPayments.id),
  templateId: varchar("template_id", { length: 36 }).references(() => appealTemplates.id),
  generatedText: text("generated_text").notNull(),
  status: appealStatusEnum("status").notNull().default("DRAFTED"),
  submittedDate: date("submitted_date"),
  outcomeDate: date("outcome_date"),
  outcomeAmount: numeric("outcome_amount", { precision: 12, scale: 2 }),
  notes: text("notes"),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("appeal_claim_idx").on(table.claimId),
  index("appeal_status_idx").on(table.status),
]);
```

## Insert Schemas & Types

```typescript
export const insertClaimSchema = createInsertSchema(claims).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertClaimPaymentSchema = createInsertSchema(claimPayments).omit({
  id: true, createdAt: true,
});
export const insertPayerRateScheduleSchema = createInsertSchema(payerRateSchedule).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertDenialCodeSchema = createInsertSchema(denialCodes).omit({
  id: true, createdAt: true,
});
export const insertAppealTemplateSchema = createInsertSchema(appealTemplates).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertAppealSchema = createInsertSchema(appeals).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type Claim = typeof claims.$inferSelect;
export type InsertClaim = z.infer<typeof insertClaimSchema>;
export type ClaimPayment = typeof claimPayments.$inferSelect;
export type InsertClaimPayment = z.infer<typeof insertClaimPaymentSchema>;
export type PayerRateSchedule = typeof payerRateSchedule.$inferSelect;
export type InsertPayerRateSchedule = z.infer<typeof insertPayerRateScheduleSchema>;
export type DenialCode = typeof denialCodes.$inferSelect;
export type InsertDenialCode = z.infer<typeof insertDenialCodeSchema>;
export type AppealTemplate = typeof appealTemplates.$inferSelect;
export type InsertAppealTemplate = z.infer<typeof insertAppealTemplateSchema>;
export type Appeal = typeof appeals.$inferSelect;
export type InsertAppeal = z.infer<typeof insertAppealSchema>;
```

## Implementation Steps

1. Add `claimStatusEnum` and `appealStatusEnum` after existing enums in `shared/schema.ts`
2. Add all 6 table definitions after the `financialTargets` table
3. Add insert schemas and types after existing unit economics types
4. Run `npm run db:push` to apply schema
5. Run `npm run check` to verify types compile

## Related Code Files
- **Modify:** `shared/schema.ts`

## Success Criteria
- [ ] All 6 tables created in PostgreSQL via `db:push`
- [ ] `npm run check` passes with no type errors
- [ ] All insert schemas validate correctly

## Risk Assessment
- **Low risk:** Additive schema change, no existing table modifications
- **Enum naming conflicts:** Verify no collision with existing `approvalStatusEnum`
