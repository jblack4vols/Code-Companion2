import { sql } from "drizzle-orm";
import {
  pgTable, text, varchar, integer, boolean, timestamp, date, real, json, index, pgEnum, numeric, uniqueIndex,
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

export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  role: userRoleEnum("role").notNull().default("MARKETER"),
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
  status: physicianStatusEnum("status").notNull().default("PROSPECT"),
  relationshipStage: relationshipStageEnum("relationship_stage").notNull().default("NEW"),
  priority: priorityEnum("priority").notNull().default("MEDIUM"),
  referralSourceAttribution: text("referral_source_attribution"),
  territoryId: varchar("territory_id", { length: 36 }),
  assignedOwnerId: varchar("assigned_owner_id", { length: 36 }).references(() => users.id),
  lastInteractionAt: timestamp("last_interaction_at"),
  nextFollowUpAt: timestamp("next_follow_up_at"),
  notes: text("notes"),
  tags: text("tags").array(),
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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
  status: referralStatusEnum("status").notNull().default("RECEIVED"),
  valueEstimate: real("value_estimate"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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
});

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
});

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
  id: true, createdAt: true, updatedAt: true,
});
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
  isActive: boolean("is_active").notNull().default(true),
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

export const insertPhysicianCommentSchema = createInsertSchema(physicianComments).omit({
  id: true, createdAt: true, updatedAt: true,
});
export type PhysicianComment = typeof physicianComments.$inferSelect;
export type InsertPhysicianComment = z.infer<typeof insertPhysicianCommentSchema>;

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

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
