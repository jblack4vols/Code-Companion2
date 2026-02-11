import { sql } from "drizzle-orm";
import {
  pgTable, text, varchar, integer, boolean, timestamp, date, real, json, index, pgEnum,
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

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
