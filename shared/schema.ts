import { sql } from "drizzle-orm";
import {
  pgTable, text, varchar, integer, boolean, timestamp, date, real, json, jsonb, index, pgEnum, numeric, uniqueIndex, uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const userRoleEnum = pgEnum("user_role", [
  "OWNER", "DIRECTOR", "MARKETER", "FRONT_DESK", "ANALYST",
]);

export const physicianStatusEnum = pgEnum("physician_status", [
  "PROSPECT", "ACTIVE", "INACTIVE",
]);

export const relationshipStageEnum = pgEnum("relationship_stage", [
  "NEW", "DEVELOPING", "STRONG", "AT_RISK",
]);

export const priorityEnum = pgEnum("priority", [
  "LOW", "MEDIUM", "HIGH",
]);

export const interactionTypeEnum = pgEnum("interaction_type", [
  "VISIT", "CALL", "EMAIL", "EVENT", "LUNCH", "OTHER",
]);

export const referralStatusEnum = pgEnum("referral_status", [
  "RECEIVED", "SCHEDULED", "EVAL_COMPLETED", "DISCHARGED", "LOST",
]);

export const payerTypeEnum = pgEnum("payer_type", [
  "COMMERCIAL", "MEDICARE", "MEDICAID", "CASH", "OTHER",
]);

export const taskStatusEnum = pgEnum("task_status", [
  "OPEN", "DONE",
]);

export const eventTypeEnum = pgEnum("event_type", [
  "MEETING", "LUNCH", "OFFICE_VISIT", "CALL", "CONFERENCE", "OTHER",
]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "PENDING", "APPROVED", "REJECTED",
]);

export const periodTypeEnum = pgEnum("period_type", [
  "DAILY", "WEEKLY", "MONTHLY",
]);

export const financialAlertTypeEnum = pgEnum("financial_alert_type", [
  "LOW_REVENUE_PER_VISIT",
  "HIGH_COST_PER_VISIT",
  "LOW_PROVIDER_REVENUE",
  "LOW_ARRIVAL_RATE",
  "HIGH_LABOR_PERCENT",
  "HIGH_BILLING_LAG",
  "HIGH_AR_AGING",
  "UNDERPAYMENT_RATE",
]);

export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: userRoleEnum("role").notNull().default("MARKETER"),
  approvalStatus: approvalStatusEnum("approval_status").notNull().default("APPROVED"),
  failedLoginAttempts: integer("failed_login_attempts").default(0).notNull(),
  lockedUntil: timestamp("locked_until"),
  lastLoginAt: timestamp("last_login_at"),
  passwordChangedAt: timestamp("password_changed_at"),
  forcePasswordChange: boolean("force_password_change").default(true).notNull(),
  passwordResetToken: text("password_reset_token"),
  passwordResetExpires: timestamp("password_reset_expires"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const locations = pgTable("locations", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  address: text("address").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  phone: text("phone"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const userLocationAccess = pgTable("user_location_access", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  locationId: varchar("location_id", { length: 36 }).notNull().references(() => locations.id),
});

export const physicians = pgTable("physicians", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  credentials: text("credentials"),
  specialty: text("specialty"),
  npi: text("npi"),
  practiceName: text("practice_name"),
  primaryOfficeAddress: text("primary_office_address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  phone: text("phone"),
  fax: text("fax"),
  email: text("email"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  status: physicianStatusEnum("status").notNull().default("PROSPECT"),
  relationshipStage: relationshipStageEnum("relationship_stage").notNull().default("NEW"),
  priority: priorityEnum("priority").notNull().default("MEDIUM"),
  referralSourceAttribution: text("referral_source_attribution"),
  territoryId: varchar("territory_id", { length: 36 }).references(() => territories.id),
  assignedOwnerId: varchar("assigned_owner_id", { length: 36 }).references(() => users.id),
  lastInteractionAt: timestamp("last_interaction_at"),
  nextFollowUpAt: timestamp("next_follow_up_at"),
  notes: text("notes"),
  tags: text("tags").array(),
  customFields: jsonb("custom_fields").$type<Record<string, string>>(),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("physician_name_idx").on(table.lastName, table.firstName),
  index("physician_status_idx").on(table.status, table.relationshipStage, table.priority),
]);

export const interactions = pgTable("interactions", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  physicianId: varchar("physician_id", { length: 36 }).notNull().references(() => physicians.id),
  locationId: varchar("location_id", { length: 36 }).references(() => locations.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  type: interactionTypeEnum("type").notNull(),
  occurredAt: timestamp("occurred_at").notNull(),
  summary: text("summary").notNull(),
  nextStep: text("next_step"),
  followUpDueAt: timestamp("follow_up_due_at"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("interaction_physician_idx").on(table.physicianId),
  index("interaction_user_idx").on(table.userId),
  index("interaction_occurred_at_idx").on(table.occurredAt),
]);

export const referrals = pgTable("referrals", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  physicianId: varchar("physician_id", { length: 36 }).references(() => physicians.id),
  locationId: varchar("location_id", { length: 36 }).notNull().references(() => locations.id),
  referringProviderName: text("referring_provider_name"),
  referringProviderNpi: text("referring_provider_npi"),
  referralDate: date("referral_date").notNull(),
  patientAccountNumber: text("patient_account_number"),
  patientInitialsOrAnonId: text("patient_initials_or_anon_id"),
  patientFullName: text("patient_full_name"),
  patientDob: date("patient_dob"),
  patientPhone: text("patient_phone"),
  caseTitle: text("case_title"),
  caseTherapist: text("case_therapist"),
  dateOfInitialEval: date("date_of_initial_eval"),
  referralSource: text("referral_source"),
  dischargeDate: date("discharge_date"),
  dischargeReason: text("discharge_reason"),
  scheduledVisits: integer("scheduled_visits").default(0),
  arrivedVisits: integer("arrived_visits").default(0),
  discipline: text("discipline"),
  primaryInsurance: text("primary_insurance"),
  primaryPayerType: text("primary_payer_type"),
  dateOfFirstScheduledVisit: date("date_of_first_scheduled_visit"),
  dateOfFirstArrivedVisit: date("date_of_first_arrived_visit"),
  createdToArrived: integer("created_to_arrived"),
  payerType: payerTypeEnum("payer_type"),
  diagnosisCategory: text("diagnosis_category"),
  customFields: jsonb("custom_fields").$type<Record<string, string>>(),
  status: referralStatusEnum("status").notNull().default("RECEIVED"),
  valueEstimate: real("value_estimate"),
  deletedAt: timestamp("deleted_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("referral_physician_idx").on(table.physicianId),
  index("referral_location_idx").on(table.locationId),
  index("referral_date_idx").on(table.referralDate),
  index("referral_status_idx").on(table.status),
  index("referral_patient_account_idx").on(table.patientAccountNumber),
]);

export const tasks = pgTable("tasks", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  physicianId: varchar("physician_id", { length: 36 }).notNull().references(() => physicians.id),
  assignedToUserId: varchar("assigned_to_user_id", { length: 36 }).notNull().references(() => users.id),
  dueAt: timestamp("due_at").notNull(),
  priority: priorityEnum("priority").notNull().default("MEDIUM"),
  status: taskStatusEnum("status").notNull().default("OPEN"),
  description: text("description").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("task_assigned_user_idx").on(table.assignedToUserId),
  index("task_status_idx").on(table.status),
  index("task_due_at_idx").on(table.dueAt),
  index("task_physician_idx").on(table.physicianId),
]);

export const calendarEvents = pgTable("calendar_events", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  eventType: eventTypeEnum("event_type").notNull().default("MEETING"),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at").notNull(),
  locationId: varchar("location_id", { length: 36 }).references(() => locations.id),
  physicianId: varchar("physician_id", { length: 36 }).references(() => physicians.id),
  practiceName: text("practice_name"),
  organizerUserId: varchar("organizer_user_id", { length: 36 }).notNull().references(() => users.id),
  outlookEventId: text("outlook_event_id"),
  meetingUrl: text("meeting_url"),
  allDay: boolean("all_day").default(false).notNull(),
  completed: boolean("completed").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("calendar_event_date_idx").on(table.startAt, table.endAt),
  index("calendar_event_physician_idx").on(table.physicianId),
  index("calendar_event_location_idx").on(table.locationId),
]);

export const sharepointSyncStatus = pgTable("sharepoint_sync_status", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  entity: text("entity").notNull(),
  siteId: text("site_id"),
  listId: text("list_id"),
  lastSyncAt: timestamp("last_sync_at"),
  itemsSynced: integer("items_synced").default(0),
  itemsFailed: integer("items_failed").default(0),
  status: text("status").notNull().default("IDLE"),
  errorMessage: text("error_message"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).references(() => users.id),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  detailJson: json("detail_json"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
}, (table) => [
  index("audit_logs_user_idx").on(table.userId),
  index("audit_logs_timestamp_idx").on(table.timestamp),
  index("audit_logs_entity_idx").on(table.entity, table.action),
]);

export const tierLabelEnum = pgEnum("tier_label", ["A", "B", "C", "D"]);

export const territories = pgTable("territories", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  repUserId: varchar("rep_user_id", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const collections = pgTable("collections", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  physicianId: varchar("physician_id", { length: 36 }).references(() => physicians.id),
  locationId: varchar("location_id", { length: 36 }).references(() => locations.id),
  collectionDate: date("collection_date").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  payerType: payerTypeEnum("payer_type"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("collection_physician_date_idx").on(table.physicianId, table.collectionDate),
  index("collection_location_date_idx").on(table.locationId, table.collectionDate),
]);

export const physicianMonthlySummary = pgTable("physician_monthly_summary", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  physicianId: varchar("physician_id", { length: 36 }).notNull().references(() => physicians.id),
  month: date("month").notNull(),
  referralsCount: integer("referrals_count").default(0).notNull(),
  scheduledCount: integer("scheduled_count").default(0).notNull(),
  evaluatedCount: integer("evaluated_count").default(0).notNull(),
  arrivedCount: integer("arrived_count").default(0).notNull(),
  arrivalRate: real("arrival_rate").default(0),
  totalVisitsGenerated: integer("total_visits_generated").default(0).notNull(),
  revenueGenerated: numeric("revenue_generated", { precision: 12, scale: 2 }).default("0"),
  revenuePerReferral: numeric("revenue_per_referral", { precision: 12, scale: 2 }).default("0"),
  commercialMixPct: real("commercial_mix_pct").default(0),
  growthRate3mo: real("growth_rate_3mo").default(0),
  tierScore: real("tier_score").default(0),
  tierLabel: tierLabelEnum("tier_label").default("D"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("physician_month_unique_idx").on(table.physicianId, table.month),
  index("physician_summary_month_idx").on(table.month),
  index("physician_summary_tier_idx").on(table.tierLabel),
]);

export const territoryMonthlySummary = pgTable("territory_monthly_summary", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  territoryId: varchar("territory_id", { length: 36 }).notNull().references(() => territories.id),
  month: date("month").notNull(),
  referralsCount: integer("referrals_count").default(0).notNull(),
  totalVisits: integer("total_visits").default(0).notNull(),
  revenueTotal: numeric("revenue_total", { precision: 12, scale: 2 }).default("0"),
  revenuePerRep: numeric("revenue_per_rep", { precision: 12, scale: 2 }).default("0"),
  visitsPerRep: integer("visits_per_rep").default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("territory_month_unique_idx").on(table.territoryId, table.month),
  index("territory_summary_month_idx").on(table.month),
]);

export const locationMonthlySummary = pgTable("location_monthly_summary", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  locationId: varchar("location_id", { length: 36 }).notNull().references(() => locations.id),
  month: date("month").notNull(),
  referralsCount: integer("referrals_count").default(0).notNull(),
  totalVisits: integer("total_visits").default(0).notNull(),
  revenueTotal: numeric("revenue_total", { precision: 12, scale: 2 }).default("0"),
  referralDependencyRatio: real("referral_dependency_ratio").default(0),
  riskScore: real("risk_score").default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("location_month_unique_idx").on(table.locationId, table.month),
  index("location_summary_month_idx").on(table.month),
]);

// Unit Economics Tables

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

export const tieringWeights = pgTable("tiering_weights", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  revenueWeight: real("revenue_weight").default(0.4).notNull(),
  trendWeight: real("trend_weight").default(0.2).notNull(),
  conversionWeight: real("conversion_weight").default(0.2).notNull(),
  payerMixWeight: real("payer_mix_weight").default(0.2).notNull(),
  tierAThreshold: real("tier_a_threshold").default(0.8).notNull(),
  tierBThreshold: real("tier_b_threshold").default(0.5).notNull(),
  tierCThreshold: real("tier_c_threshold").default(0.2).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true, createdAt: true, updatedAt: true, failedLoginAttempts: true, lockedUntil: true, lastLoginAt: true, passwordChangedAt: true, forcePasswordChange: true, approvalStatus: true, passwordResetToken: true, passwordResetExpires: true,
});

export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
});

export const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character");
export const insertLocationSchema = createInsertSchema(locations).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertPhysicianSchema = createInsertSchema(physicians).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertInteractionSchema = createInsertSchema(interactions).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertReferralSchema = createInsertSchema(referrals).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertCalendarEventSchema = createInsertSchema(calendarEvents).omit({
  id: true, createdAt: true, updatedAt: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Location = typeof locations.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type Physician = typeof physicians.$inferSelect;
export type InsertPhysician = z.infer<typeof insertPhysicianSchema>;
export type Interaction = typeof interactions.$inferSelect;
export type InsertInteraction = z.infer<typeof insertInteractionSchema>;
export type Referral = typeof referrals.$inferSelect;
export type InsertReferral = z.infer<typeof insertReferralSchema>;
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type CalendarEvent = typeof calendarEvents.$inferSelect;
export type InsertCalendarEvent = z.infer<typeof insertCalendarEventSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

export const insertTerritorySchema = createInsertSchema(territories).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertCollectionSchema = createInsertSchema(collections).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertPhysicianMonthlySummarySchema = createInsertSchema(physicianMonthlySummary).omit({
  id: true, updatedAt: true,
});
export const insertTerritoryMonthlySummarySchema = createInsertSchema(territoryMonthlySummary).omit({
  id: true, updatedAt: true,
});
export const insertLocationMonthlySummarySchema = createInsertSchema(locationMonthlySummary).omit({
  id: true, updatedAt: true,
});

export type Territory = typeof territories.$inferSelect;
export type InsertTerritory = z.infer<typeof insertTerritorySchema>;
export type Collection = typeof collections.$inferSelect;
export type InsertCollection = z.infer<typeof insertCollectionSchema>;
export type PhysicianMonthlySummary = typeof physicianMonthlySummary.$inferSelect;
export type TerritoryMonthlySummary = typeof territoryMonthlySummary.$inferSelect;
export type LocationMonthlySummary = typeof locationMonthlySummary.$inferSelect;
export type TieringWeights = typeof tieringWeights.$inferSelect;

// --- API Integrations ---

export const integrationTypeEnum = pgEnum("integration_type", [
  "GOHIGHLEVEL", "CUSTOM_API", "MICROSOFT",
]);

export const integrationStatusEnum = pgEnum("integration_status", [
  "DISCONNECTED", "CONNECTED", "ERROR",
]);

export const integrationConfigs = pgTable("integration_configs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  type: integrationTypeEnum("type").notNull(),
  name: text("name").notNull(),
  status: integrationStatusEnum("status").notNull().default("DISCONNECTED"),
  settings: json("settings").$type<Record<string, any>>().default({}),
  lastSyncAt: timestamp("last_sync_at"),
  lastSyncStatus: text("last_sync_status"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const apiKeys = pgTable("api_keys", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: varchar("key_prefix", { length: 8 }).notNull(),
  scopes: json("scopes").$type<string[]>().default([]),
  // Optional location scoping: if set, public API endpoints filter results to these location IDs.
  // If null/empty, all data is returned (backward-compatible).
  locationIds: json("location_ids").$type<string[]>().default([]),
  isActive: boolean("is_active").notNull().default(true),
  expiresAt: timestamp("expires_at"),
  lastUsedAt: timestamp("last_used_at"),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const integrationSyncLogs = pgTable("integration_sync_logs", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  integrationId: varchar("integration_id", { length: 36 }).references(() => integrationConfigs.id).notNull(),
  direction: varchar("direction", { length: 10 }).notNull(),
  status: varchar("status", { length: 20 }).notNull(),
  recordsProcessed: integer("records_processed").default(0),
  recordsFailed: integer("records_failed").default(0),
  details: json("details").$type<Record<string, any>>().default({}),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  finishedAt: timestamp("finished_at"),
});

export const physicianComments = pgTable("physician_comments", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  physicianId: varchar("physician_id", { length: 36 }).references(() => physicians.id).notNull(),
  userId: varchar("user_id", { length: 36 }).references(() => users.id).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const physicianFavorites = pgTable("physician_favorites", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  physicianId: varchar("physician_id", { length: 36 }).notNull().references(() => physicians.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("physician_favorite_unique_idx").on(table.userId, table.physicianId),
]);

export const insertPhysicianCommentSchema = createInsertSchema(physicianComments).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type PhysicianComment = typeof physicianComments.$inferSelect;
export type InsertPhysicianComment = z.infer<typeof insertPhysicianCommentSchema>;
export type PhysicianFavorite = typeof physicianFavorites.$inferSelect;

export const insertIntegrationConfigSchema = createInsertSchema(integrationConfigs).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertApiKeySchema = createInsertSchema(apiKeys).omit({
  id: true, createdAt: true,
});
export const insertIntegrationSyncLogSchema = createInsertSchema(integrationSyncLogs).omit({
  id: true, startedAt: true,
});

export type IntegrationConfig = typeof integrationConfigs.$inferSelect;
export type InsertIntegrationConfig = z.infer<typeof insertIntegrationConfigSchema>;
export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = z.infer<typeof insertApiKeySchema>;
export type IntegrationSyncLog = typeof integrationSyncLogs.$inferSelect;
export type InsertIntegrationSyncLog = z.infer<typeof insertIntegrationSyncLogSchema>;

export const scheduledReports = pgTable("scheduled_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  frequency: varchar("frequency", { length: 50 }).notNull(),
  reportType: varchar("report_type", { length: 50 }).notNull(),
  recipients: text("recipients").notNull(),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  config: jsonb("config"),
});

export const insertScheduledReportSchema = createInsertSchema(scheduledReports).omit({ id: true, createdAt: true, lastRunAt: true });
export type InsertScheduledReport = z.infer<typeof insertScheduledReportSchema>;
export type ScheduledReport = typeof scheduledReports.$inferSelect;

export const goalScopeEnum = pgEnum("goal_scope", ["TERRITORY", "LOCATION"]);

export const goals = pgTable("goals", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  month: date("month").notNull(),
  scopeType: goalScopeEnum("scope_type").notNull(),
  scopeId: varchar("scope_id", { length: 36 }).notNull(),
  targetReferrals: integer("target_referrals").notNull().default(0),
  targetRevenue: numeric("target_revenue", { precision: 12, scale: 2 }),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("goal_scope_month_unique_idx").on(table.month, table.scopeType, table.scopeId),
  index("goal_month_idx").on(table.month),
]);

export const interactionTemplates = pgTable("interaction_templates", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: interactionTypeEnum("type").notNull(),
  defaultSummary: text("default_summary").notNull(),
  defaultNextStep: text("default_next_step"),
  isActive: boolean("is_active").default(true).notNull(),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const physicianStageHistory = pgTable("physician_stage_history", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  physicianId: varchar("physician_id", { length: 36 }).notNull().references(() => physicians.id),
  previousStage: text("previous_stage"),
  newStage: text("new_stage").notNull(),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
  changedBy: varchar("changed_by", { length: 36 }).references(() => users.id),
  reason: text("reason"),
}, (table) => [
  index("stage_history_physician_idx").on(table.physicianId),
  index("stage_history_changed_at_idx").on(table.changedAt),
]);

export const insertGoalSchema = createInsertSchema(goals).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertInteractionTemplateSchema = createInsertSchema(interactionTemplates).omit({
  id: true, createdAt: true, updatedAt: true,
});
export const insertPhysicianStageHistorySchema = createInsertSchema(physicianStageHistory).omit({
  id: true, changedAt: true,
});

export type Goal = typeof goals.$inferSelect;
export type InsertGoal = z.infer<typeof insertGoalSchema>;
export type InteractionTemplate = typeof interactionTemplates.$inferSelect;
export type InsertInteractionTemplate = z.infer<typeof insertInteractionTemplateSchema>;
export type PhysicianStageHistory = typeof physicianStageHistory.$inferSelect;
export type InsertPhysicianStageHistory = z.infer<typeof insertPhysicianStageHistorySchema>;

// Unit Economics Insert Schemas and Types

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

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// --- Revenue Leakage Recovery Engine ---

export const claimStatusEnum = pgEnum("claim_status", [
  "SUBMITTED", "PAID", "PARTIAL", "DENIED", "APPEALED", "ADJUSTED", "VOID",
]);

export const appealStatusEnum = pgEnum("appeal_status", [
  "DRAFTED", "SUBMITTED", "WON", "LOST", "WITHDRAWN",
]);

export const claims = pgTable("claims", {
  id: uuid("id").defaultRandom().primaryKey(),
  claimNumber: varchar("claim_number", { length: 50 }).notNull(),
  locationId: varchar("location_id", { length: 36 }).references(() => locations.id),
  providerId: varchar("provider_id", { length: 36 }), // user who provided service (therapist)
  physicianId: varchar("physician_id", { length: 36 }).references(() => physicians.id), // referring physician
  patientAccountNumber: varchar("patient_account_number", { length: 50 }),
  dos: date("dos").notNull(), // date of service
  cptCodes: text("cpt_codes"), // comma-separated CPT codes
  units: integer("units").default(0),
  payer: varchar("payer", { length: 100 }),
  payerType: varchar("payer_type", { length: 50 }), // Commercial, Medicare, Medicaid, etc.
  billedAmount: numeric("billed_amount", { precision: 12, scale: 2 }).default("0"),
  expectedAmount: numeric("expected_amount", { precision: 12, scale: 2 }), // from rate schedule
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).default("0"),
  adjustmentAmount: numeric("adjustment_amount", { precision: 12, scale: 2 }).default("0"),
  patientResponsibility: numeric("patient_responsibility", { precision: 12, scale: 2 }).default("0"),
  status: claimStatusEnum("status").default("SUBMITTED"),
  submissionDate: date("submission_date"),
  paymentDate: date("payment_date"),
  denialCodes: text("denial_codes"), // comma-separated CARC codes
  denialReason: text("denial_reason"),
  isUnderpaid: boolean("is_underpaid").default(false),
  underpaidAmount: numeric("underpaid_amount", { precision: 12, scale: 2 }),
  source: varchar("source", { length: 50 }).default("import"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("claims_location_idx").on(table.locationId),
  index("claims_dos_idx").on(table.dos),
  index("claims_status_idx").on(table.status),
  index("claims_payer_idx").on(table.payer),
  index("claims_underpaid_idx").on(table.isUnderpaid),
]);

export const claimPayments = pgTable("claim_payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  claimId: uuid("claim_id").references(() => claims.id).notNull(),
  paymentDate: date("payment_date").notNull(),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).notNull(),
  adjustmentAmount: numeric("adjustment_amount", { precision: 12, scale: 2 }).default("0"),
  adjustmentCodes: text("adjustment_codes"), // CARC/RARC codes
  checkNumber: varchar("check_number", { length: 50 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("claim_payments_claim_idx").on(table.claimId),
]);

export const payerRateSchedule = pgTable("payer_rate_schedule", {
  id: uuid("id").defaultRandom().primaryKey(),
  payer: varchar("payer", { length: 100 }).notNull(),
  payerType: varchar("payer_type", { length: 50 }),
  cptCode: varchar("cpt_code", { length: 10 }).notNull(),
  expectedRate: numeric("expected_rate", { precision: 10, scale: 2 }).notNull(),
  effectiveDate: date("effective_date"),
  locationId: varchar("location_id", { length: 36 }).references(() => locations.id), // null = global default
  source: varchar("source", { length: 50 }).default("manual"), // "manual" or "calculated"
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("payer_rate_payer_cpt_idx").on(table.payer, table.cptCode),
]);

export const appealTemplates = pgTable("appeal_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  denialCodePattern: varchar("denial_code_pattern", { length: 50 }), // matches denial codes
  templateText: text("template_text").notNull(),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const appeals = pgTable("appeals", {
  id: uuid("id").defaultRandom().primaryKey(),
  claimId: uuid("claim_id").references(() => claims.id).notNull(),
  templateId: uuid("template_id").references(() => appealTemplates.id),
  generatedText: text("generated_text").notNull(),
  status: appealStatusEnum("status").default("DRAFTED"),
  submittedDate: date("submitted_date"),
  outcomeDate: date("outcome_date"),
  outcomeNotes: text("outcome_notes"),
  recoveredAmount: numeric("recovered_amount", { precision: 12, scale: 2 }),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("appeals_claim_idx").on(table.claimId),
  index("appeals_status_idx").on(table.status),
]);

export type InsertClaim = typeof claims.$inferInsert;
export type Claim = typeof claims.$inferSelect;
export type InsertClaimPayment = typeof claimPayments.$inferInsert;
export type ClaimPayment = typeof claimPayments.$inferSelect;
export type InsertPayerRate = typeof payerRateSchedule.$inferInsert;
export type PayerRate = typeof payerRateSchedule.$inferSelect;
export type InsertAppealTemplate = typeof appealTemplates.$inferInsert;
export type AppealTemplate = typeof appealTemplates.$inferSelect;
export type InsertAppeal = typeof appeals.$inferInsert;
export type Appeal = typeof appeals.$inferSelect;
