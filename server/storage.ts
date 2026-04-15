/**
 * Storage barrel — IStorage interface + DatabaseStorage class.
 * Business logic lives in domain modules; this file wires them together.
 *
 * Domain modules:
 *   storage-users.ts          — user CRUD + auth
 *   storage-locations.ts      — location + territory CRUD
 *   storage-physicians.ts     — physician CRUD + bulk ops + comments + favorites
 *   storage-interactions.ts   — interaction CRUD + paginated queries
 *   storage-referrals.ts      — referral CRUD + bulk ops
 *   storage-tasks.ts          — task CRUD + CSV export
 *   storage-calendar.ts       — calendar event CRUD
 *   storage-search.ts         — global search + typeahead
 *   storage-dashboard.ts      — dashboard stats + analytics + audit logs + collections
 *   storage-integrations.ts   — integration configs + API keys + sync logs
 *   storage-unit-economics.ts — clinic financials + provider productivity (pre-existing)
 *   storage-revenue-recovery.ts — claims + payer rates (pre-existing)
 *   storage-denial-intelligence.ts — denial analytics (pre-existing)
 */

import * as usersStorage from "./storage-users";
import * as locationsStorage from "./storage-locations";
import * as physiciansStorage from "./storage-physicians";
import * as interactionsStorage from "./storage-interactions";
import * as referralsStorage from "./storage-referrals";
import * as tasksStorage from "./storage-tasks";
import * as calendarStorage from "./storage-calendar";
import * as searchStorage from "./storage-search";
import * as dashboardStorage from "./storage-dashboard";
import * as integrationsStorage from "./storage-integrations";
import * as unitEconomicsStorage from "./storage-unit-economics";
import * as revenueRecoveryStorage from "./storage-revenue-recovery";
import * as denialIntelligenceStorage from "./storage-denial-intelligence";

import { db } from "./db";
import { eq, desc, and, gte, isNull, sql } from "drizzle-orm";
import {
  physicianMonthlySummary, territoryMonthlySummary, locationMonthlySummary,
  physicians, referrals, tasks, interactions,
  type User, type InsertUser,
  type Location, type InsertLocation,
  type Physician, type InsertPhysician,
  type Interaction, type InsertInteraction,
  type Referral, type InsertReferral,
  type Task, type InsertTask,
  type CalendarEvent, type InsertCalendarEvent,
  type AuditLog,
  type Territory, type InsertTerritory,
  type Collection, type InsertCollection,
  type PhysicianMonthlySummary,
  type TerritoryMonthlySummary,
  type LocationMonthlySummary,
  type TieringWeights,
  type IntegrationConfig, type InsertIntegrationConfig,
  type ApiKey, type InsertApiKey,
  type IntegrationSyncLog, type InsertIntegrationSyncLog,
  type PhysicianComment, type InsertPhysicianComment,
  type ScheduledReport, type InsertScheduledReport,
  type PhysicianFavorite,
  type InteractionTemplate, type InsertInteractionTemplate,
  type PhysicianStageHistory,
  type ClinicFinancial, type InsertClinicFinancial,
  type ProviderProductivity, type InsertProviderProductivity,
  type FinancialAlert, type InsertFinancialAlert,
  type FinancialTarget, type InsertFinancialTarget,
  type Claim, type InsertClaim,
  type ClaimPayment, type InsertClaimPayment,
  type PayerRate, type InsertPayerRate,
  type AppealTemplate, type InsertAppealTemplate,
  type Appeal, type InsertAppeal,
} from "@shared/schema";

// ---- Re-export types used by routes ----
export type {
  UnitEconomicsLocationSummary,
  UnitEconomicsLocationDetail,
  ProviderProductivityEntry,
  ForecastEntry,
} from "./storage-unit-economics";
export type { UnderpaidClaim, ReimbursementSummary } from "./storage-revenue-recovery";
export type {
  DenialSummary,
  DenialCodeStat,
  ProviderDenialOutlier,
  DenialTrend,
} from "./storage-denial-intelligence";

// ---- Shared filter/result types ----

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface PhysicianFilters {
  search?: string;
  status?: string;
  stage?: string;
  priority?: string;
  practiceName?: string;
  locationIds?: string[];
  sortBy?: string;
  sortOrder?: string;
  page?: number;
  pageSize?: number;
}

export interface InteractionFilters {
  search?: string;
  type?: string;
  locationId?: string;
  locationIds?: string[];
  physicianId?: string;
  dateFrom?: string;
  dateTo?: string;
  includeDeleted?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ReferralFilters {
  search?: string;
  status?: string;
  locationId?: string;
  /** Server-side location scope enforcement: list of allowed location IDs for non-admin users */
  locationIds?: string[];
  discipline?: string;
  referralSource?: string;
  primaryPayerType?: string;
  dateFrom?: string;
  dateTo?: string;
  physicianId?: string;
  sortBy?: string;
  sortDir?: string;
  page?: number;
  pageSize?: number;
}

export interface PracticeSummary {
  practiceName: string;
  physicianCount: number;
  totalReferrals: number;
  totalRevenue: number;
  arrivalRate: number;
  lastInteractionAt: string | null;
  city: string | null;
  state: string | null;
}

export interface PracticeDetail {
  practice: PracticeSummary;
  physicians: Array<{
    id: string;
    firstName: string;
    lastName: string;
    credentials: string | null;
    specialty: string | null;
    status: string;
    relationshipStage: string;
    referralCount: number;
    revenueGenerated: number;
    arrivalRate: number;
    lastInteractionAt: string | null;
    interactionCount: number;
  }>;
}

export interface AtRiskSourceEntry {
  physicianId: string;
  currentCount: number;
  priorCount: number;
  changePercent: number;
  physician: {
    id: string; firstName: string; lastName: string; credentials: string | null;
    specialty: string | null; practiceName: string | null; relationshipStage: string;
    assignedOwnerId: string | null; territoryId: string | null; lastInteractionAt: Date | null;
  } | null;
  riskSignal: "no_contact" | "overdue_task";
  daysSinceContact: number | null;
}

export interface AtRiskResult {
  data: AtRiskSourceEntry[];
  total: number;
  period: { currentStart: string; currentEnd: string; priorStart: string; priorEnd: string };
}

// ---- IStorage interface ----

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByResetToken(token: string): Promise<User | undefined>;
  getUsersByApprovalStatus(status: string): Promise<User[]>;
  getUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser> & { failedLoginAttempts?: number; lockedUntil?: Date | null; lastLoginAt?: Date; passwordChangedAt?: Date; approvalStatus?: string; passwordResetToken?: string | null; passwordResetExpires?: Date | null }): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;

  // Locations
  getLocations(): Promise<Location[]>;
  getLocation(id: string): Promise<Location | undefined>;
  createLocation(loc: InsertLocation): Promise<Location>;
  updateLocation(id: string, data: Partial<InsertLocation>): Promise<Location | undefined>;
  deleteLocation(id: string): Promise<boolean>;

  // Physicians
  getPhysicians(): Promise<Physician[]>;
  searchPhysiciansTypeahead(query: string, limit?: number): Promise<Pick<Physician, 'id' | 'firstName' | 'lastName' | 'credentials' | 'npi' | 'practiceName' | 'specialty'>[]>;
  getPhysiciansPaginated(filters: PhysicianFilters): Promise<PaginatedResult<any>>;
  getPhysicianIdsByLocations(locationIds: string[]): Promise<Set<string>>;
  getPhysician(id: string): Promise<Physician | undefined>;
  createPhysician(phys: InsertPhysician): Promise<Physician>;
  updatePhysician(id: string, data: Partial<InsertPhysician>): Promise<Physician | undefined>;
  fuzzyFindPhysicians(lastName: string, firstName?: string): Promise<Physician[]>;
  getSuggestedPhysicianMatches(referralId: string): Promise<Physician[]>;

  // Interactions
  getInteraction(id: string): Promise<Interaction | undefined>;
  getInteractions(physicianId?: string, includeDeleted?: boolean): Promise<Interaction[]>;
  getInteractionsPaginated(filters: InteractionFilters): Promise<PaginatedResult<any>>;
  createInteraction(inter: InsertInteraction): Promise<Interaction>;
  updateInteraction(id: string, data: Partial<InsertInteraction>): Promise<Interaction | undefined>;

  // Referrals
  getReferrals(physicianId?: string, locationIds?: string[]): Promise<Referral[]>;
  getReferralsPaginated(filters: ReferralFilters): Promise<PaginatedResult<any>>;
  createReferral(ref: InsertReferral): Promise<Referral>;
  updateReferral(id: string, data: Partial<InsertReferral>): Promise<Referral | undefined>;

  // Tasks
  getTask(id: string): Promise<Task | undefined>;
  getTasks(physicianId?: string): Promise<Task[]>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: string, data: Partial<InsertTask & { status: string }>): Promise<Task | undefined>;

  // Calendar
  getCalendarEvents(filters?: { startDate?: string; endDate?: string; locationId?: string; physicianId?: string; practiceName?: string }): Promise<CalendarEvent[]>;
  getCalendarEvent(id: string): Promise<CalendarEvent | undefined>;
  createCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent>;
  updateCalendarEvent(id: string, data: Partial<InsertCalendarEvent>): Promise<CalendarEvent | undefined>;
  deleteCalendarEvent(id: string): Promise<boolean>;

  // Audit logs
  getAuditLogs(filters?: { userId?: string; entity?: string; action?: string; limit?: number }): Promise<AuditLog[]>;
  createAuditLog(log: Omit<AuditLog, "id" | "timestamp" | "ipAddress" | "userAgent"> & { ipAddress?: string | null; userAgent?: string | null }): Promise<void>;

  // Dashboard / analytics
  getDashboardStats(filters?: { startDate?: string; endDate?: string; locationId?: string; territoryId?: string; physicianId?: string }): Promise<any>;
  getPhysicianTiering(filters?: { period?: string; year?: number; month?: number }): Promise<any>;
  getDecliningReferrals(filters?: { months?: number; minDrop?: number }): Promise<any>;

  // Exports
  exportPhysiciansCsv(filters: PhysicianFilters): Promise<any[]>;
  exportReferralsCsv(filters: ReferralFilters): Promise<any[]>;
  exportInteractionsCsv(filters?: { physicianId?: string; type?: string; dateFrom?: string; dateTo?: string }): Promise<any[]>;
  exportTasksCsv(filters?: { status?: string; assignedToUserId?: string }): Promise<any[]>;
  exportAuditLogsCsv(filters?: { entity?: string; action?: string }): Promise<any[]>;

  // Marketer / territory assignment
  getMarketers(): Promise<any[]>;
  getMarketerTerritories(): Promise<any>;
  assignPhysicianToMarketer(physicianId: string, marketerId: string | null): Promise<Physician | undefined>;
  bulkAssignPhysiciansToMarketer(physicianIds: string[], marketerId: string | null): Promise<number>;
  bulkUpdatePhysicianStatus(physicianIds: string[], status: string): Promise<number>;

  // Soft delete / restore
  softDeletePhysician(id: string): Promise<boolean>;
  restorePhysician(id: string): Promise<boolean>;
  softDeleteReferral(id: string): Promise<boolean>;
  restoreReferral(id: string): Promise<boolean>;
  softDeleteAllReferrals(): Promise<number>;
  restoreAllReferrals(): Promise<number>;
  softDeleteInteraction(id: string): Promise<boolean>;
  restoreInteraction(id: string): Promise<boolean>;

  // Bulk upsert
  bulkUpsertPhysicians(rows: InsertPhysician[]): Promise<{ inserted: number; updated: number; errors: string[] }>;
  bulkUpsertReferrals(rows: InsertReferral[]): Promise<{ inserted: number; updated: number; errors: string[] }>;
  bulkDeleteReferrals(ids: string[]): Promise<number>;
  findPhysicianByNameAndNpi(firstName: string, lastName: string, npi?: string | null): Promise<Physician | undefined>;
  findLocationByName(name: string): Promise<Location | undefined>;

  // Territories
  getTerritories(): Promise<Territory[]>;
  getTerritory(id: string): Promise<Territory | undefined>;
  createTerritory(territory: InsertTerritory): Promise<Territory>;
  updateTerritory(id: string, data: Partial<InsertTerritory>): Promise<Territory | undefined>;
  deleteTerritory(id: string): Promise<boolean>;

  // Collections
  getCollections(filters?: { physicianId?: string; locationId?: string; locationIds?: string[]; dateFrom?: string; dateTo?: string }): Promise<Collection[]>;
  createCollection(col: InsertCollection): Promise<Collection>;

  // Tiering weights
  getTieringWeights(): Promise<TieringWeights | undefined>;
  updateTieringWeights(data: Partial<TieringWeights>): Promise<TieringWeights | undefined>;

  // Monthly summaries
  getPhysicianMonthlySummaries(filters?: { physicianId?: string; month?: string; months?: number }): Promise<PhysicianMonthlySummary[]>;
  getTerritoryMonthlySummaries(filters?: { territoryId?: string; month?: string }): Promise<TerritoryMonthlySummary[]>;
  getLocationMonthlySummaries(filters?: { locationId?: string; month?: string }): Promise<LocationMonthlySummary[]>;

  // Integration configs
  getIntegrationConfigs(): Promise<IntegrationConfig[]>;
  getIntegrationConfig(id: string): Promise<IntegrationConfig | undefined>;
  getIntegrationConfigByType(type: string): Promise<IntegrationConfig | undefined>;
  createIntegrationConfig(config: InsertIntegrationConfig): Promise<IntegrationConfig>;
  updateIntegrationConfig(id: string, data: Partial<InsertIntegrationConfig>): Promise<IntegrationConfig | undefined>;
  deleteIntegrationConfig(id: string): Promise<boolean>;

  // API keys
  getApiKeys(): Promise<ApiKey[]>;
  getApiKeyById(id: string): Promise<ApiKey | undefined>;
  createApiKey(key: InsertApiKey): Promise<ApiKey>;
  getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined>;
  updateApiKeyLastUsed(id: string): Promise<void>;
  deactivateApiKey(id: string): Promise<boolean>;

  // Sync logs
  getIntegrationSyncLogs(integrationId?: string, limit?: number): Promise<IntegrationSyncLog[]>;
  createIntegrationSyncLog(log: InsertIntegrationSyncLog): Promise<IntegrationSyncLog>;
  updateIntegrationSyncLog(id: string, data: Partial<IntegrationSyncLog>): Promise<IntegrationSyncLog | undefined>;

  // Physician comments
  getPhysicianComments(physicianId: string): Promise<PhysicianComment[]>;
  createPhysicianComment(comment: InsertPhysicianComment): Promise<PhysicianComment>;
  updatePhysicianComment(id: string, content: string): Promise<PhysicianComment | undefined>;
  deletePhysicianComment(id: string): Promise<boolean>;

  // Scheduled reports
  getScheduledReports(): Promise<ScheduledReport[]>;
  getScheduledReport(id: string): Promise<ScheduledReport | undefined>;
  createScheduledReport(report: InsertScheduledReport): Promise<ScheduledReport>;
  updateScheduledReport(id: string, data: Partial<InsertScheduledReport>): Promise<ScheduledReport>;
  deleteScheduledReport(id: string): Promise<void>;

  // Favorites
  getPhysicianFavorites(userId: string): Promise<string[]>;
  addPhysicianFavorite(userId: string, physicianId: string): Promise<void>;
  removePhysicianFavorite(userId: string, physicianId: string): Promise<void>;

  // Search
  globalSearch(query: string, limit?: number): Promise<{ physicians: any[]; referrals: any[] }>;

  // Unlinked referrals
  getUnlinkedReferrals(page?: number, pageSize?: number): Promise<PaginatedResult<any>>;
  linkReferralToPhysician(referralId: string, physicianId: string): Promise<Referral | undefined>;
  bulkLinkReferralsByProviderName(providerName: string, physicianId: string, excludeId: string): Promise<number>;
  categorizeReferralAsSelfReferral(referralId: string): Promise<Referral | undefined>;

  // At-risk referral sources
  getAtRiskReferralSources(filters?: { locationId?: string; territoryId?: string }): Promise<AtRiskResult>;

  // Location scoping
  getUserLocationIds(userId: string): Promise<string[]>;
  assignUserToAllLocations(userId: string): Promise<void>;

  // Interaction templates
  getInteractionTemplates(): Promise<InteractionTemplate[]>;
  createInteractionTemplate(template: InsertInteractionTemplate): Promise<InteractionTemplate>;
  updateInteractionTemplate(id: string, data: Partial<InsertInteractionTemplate>): Promise<InteractionTemplate | undefined>;
  deleteInteractionTemplate(id: string): Promise<boolean>;

  // Physician stage history
  getPhysicianStageHistory(physicianId: string): Promise<PhysicianStageHistory[]>;

  // Practice Intelligence
  getPractices(filters: { search?: string; sortBy?: string; sortOrder?: string; page?: number; pageSize?: number }): Promise<PaginatedResult<PracticeSummary>>;
  getPracticeDetail(practiceName: string): Promise<PracticeDetail | null>;

  // Unit Economics
  getClinicFinancials(filters: { locationId?: string; periodType?: string; dateFrom?: string; dateTo?: string }): Promise<ClinicFinancial[]>;
  upsertClinicFinancial(data: InsertClinicFinancial): Promise<ClinicFinancial>;
  bulkUpsertClinicFinancials(rows: InsertClinicFinancial[]): Promise<{ inserted: number; updated: number }>;
  getProviderProductivity(filters: { userId?: string; locationId?: string; dateFrom?: string; dateTo?: string }): Promise<ProviderProductivity[]>;
  upsertProviderProductivity(data: InsertProviderProductivity): Promise<ProviderProductivity>;
  bulkUpsertProviderProductivity(rows: InsertProviderProductivity[]): Promise<{ inserted: number; updated: number }>;
  getFinancialAlerts(filters: { locationId?: string; acknowledged?: boolean }): Promise<FinancialAlert[]>;
  createFinancialAlert(alert: InsertFinancialAlert): Promise<FinancialAlert>;
  acknowledgeFinancialAlert(id: string, userId: string): Promise<FinancialAlert | undefined>;
  getFinancialTargets(locationId?: string): Promise<FinancialTarget[]>;
  upsertFinancialTarget(data: InsertFinancialTarget): Promise<FinancialTarget>;
  getUnitEconomicsDashboard(locationIds?: string[]): Promise<unitEconomicsStorage.UnitEconomicsLocationSummary[]>;
  getUnitEconomicsLocationDetail(locationId: string, dateFrom?: string, dateTo?: string): Promise<unitEconomicsStorage.UnitEconomicsLocationDetail>;
  getProviderProductivityLeaderboard(dateFrom?: string, dateTo?: string, locationId?: string): Promise<unitEconomicsStorage.ProviderProductivityEntry[]>;
  getUnitEconomicsForecast(locationId?: string): Promise<unitEconomicsStorage.ForecastEntry[]>;

  // Revenue Recovery
  getClaims(filters: { locationId?: string; payer?: string; status?: string; dateFrom?: string; dateTo?: string; isUnderpaid?: boolean; page?: number; pageSize?: number }): Promise<{ data: Claim[]; total: number }>;
  getClaim(id: string): Promise<Claim | undefined>;
  upsertClaim(data: InsertClaim): Promise<Claim>;
  bulkUpsertClaims(data: InsertClaim[]): Promise<{ inserted: number; updated: number }>;
  getUnderpaidClaims(filters: { locationId?: string; payer?: string; dateFrom?: string; dateTo?: string; minVariance?: number }): Promise<revenueRecoveryStorage.UnderpaidClaim[]>;
  getReimbursementSummary(filters: { locationId?: string; dateFrom?: string; dateTo?: string }): Promise<revenueRecoveryStorage.ReimbursementSummary[]>;
  calculateExpectedAmount(claimId: string): Promise<number>;
  flagUnderpaidClaims(filters?: { locationId?: string }): Promise<number>;
  getPayerRates(payer?: string, cptCode?: string): Promise<PayerRate[]>;
  upsertPayerRate(data: InsertPayerRate): Promise<PayerRate>;
  bulkUpsertPayerRates(data: InsertPayerRate[]): Promise<{ inserted: number; updated: number }>;
  buildRatesFromHistory(payer?: string): Promise<number>;

  // Denial Intelligence
  getDenialSummary(filters: { locationId?: string; dateFrom?: string; dateTo?: string }): Promise<denialIntelligenceStorage.DenialSummary>;
  getTopDenialCodes(filters: { locationId?: string; limit?: number }): Promise<denialIntelligenceStorage.DenialCodeStat[]>;
  getProviderDenialOutliers(filters: { dateFrom?: string; dateTo?: string }): Promise<denialIntelligenceStorage.ProviderDenialOutlier[]>;
  getDenialTrends(filters: { locationId?: string; months?: number }): Promise<denialIntelligenceStorage.DenialTrend[]>;
}

// ---- DatabaseStorage: delegates to domain modules ----

export class DatabaseStorage implements IStorage {
  // Users
  getUser = usersStorage.getUser;
  getUserByEmail = usersStorage.getUserByEmail;
  getUserByResetToken = usersStorage.getUserByResetToken;
  getUsersByApprovalStatus = usersStorage.getUsersByApprovalStatus;
  getUsers = usersStorage.getUsers;
  createUser = usersStorage.createUser;
  updateUser = usersStorage.updateUser;
  deleteUser = usersStorage.deleteUser;
  getMarketers = usersStorage.getMarketers;
  getUserLocationIds = usersStorage.getUserLocationIds;
  assignUserToAllLocations = usersStorage.assignUserToAllLocations;

  // Locations
  getLocations = locationsStorage.getLocations;
  getLocation = locationsStorage.getLocation;
  createLocation = locationsStorage.createLocation;
  updateLocation = locationsStorage.updateLocation;
  deleteLocation = locationsStorage.deleteLocation;
  findLocationByName = locationsStorage.findLocationByName;
  getTerritories = locationsStorage.getTerritories;
  getTerritory = locationsStorage.getTerritory;
  createTerritory = locationsStorage.createTerritory;
  updateTerritory = locationsStorage.updateTerritory;
  deleteTerritory = locationsStorage.deleteTerritory;

  // Physicians
  getPhysicians = physiciansStorage.getPhysicians;
  searchPhysiciansTypeahead = physiciansStorage.searchPhysiciansTypeahead;
  getPhysiciansPaginated = physiciansStorage.getPhysiciansPaginated;
  getPhysicianIdsByLocations = physiciansStorage.getPhysicianIdsByLocations;
  getPhysician = physiciansStorage.getPhysician;
  createPhysician = physiciansStorage.createPhysician;
  updatePhysician = physiciansStorage.updatePhysician;
  softDeletePhysician = physiciansStorage.softDeletePhysician;
  restorePhysician = physiciansStorage.restorePhysician;
  assignPhysicianToMarketer = physiciansStorage.assignPhysicianToMarketer;
  bulkAssignPhysiciansToMarketer = physiciansStorage.bulkAssignPhysiciansToMarketer;
  bulkUpdatePhysicianStatus = physiciansStorage.bulkUpdatePhysicianStatus;
  findPhysicianByNameAndNpi = physiciansStorage.findPhysicianByNameAndNpi;
  fuzzyFindPhysicians = physiciansStorage.fuzzyFindPhysicians;
  getSuggestedPhysicianMatches = searchStorage.getSuggestedPhysicianMatches;
  bulkUpsertPhysicians = physiciansStorage.bulkUpsertPhysicians;
  getPhysicianFavorites = physiciansStorage.getPhysicianFavorites;
  addPhysicianFavorite = physiciansStorage.addPhysicianFavorite;
  removePhysicianFavorite = physiciansStorage.removePhysicianFavorite;
  getPhysicianComments = physiciansStorage.getPhysicianComments;
  createPhysicianComment = physiciansStorage.createPhysicianComment;
  updatePhysicianComment = physiciansStorage.updatePhysicianComment;
  deletePhysicianComment = physiciansStorage.deletePhysicianComment;
  getPhysicianStageHistory = physiciansStorage.getPhysicianStageHistory;
  getInteractionTemplates = physiciansStorage.getInteractionTemplates;
  createInteractionTemplate = physiciansStorage.createInteractionTemplate;
  updateInteractionTemplate = physiciansStorage.updateInteractionTemplate;
  deleteInteractionTemplate = physiciansStorage.deleteInteractionTemplate;

  async getMarketerTerritories() {
    return physiciansStorage.getMarketerTerritories(usersStorage.getMarketers);
  }

  // Interactions
  getInteraction = interactionsStorage.getInteraction;
  getInteractions = interactionsStorage.getInteractions;
  getInteractionsPaginated = interactionsStorage.getInteractionsPaginated;
  createInteraction = interactionsStorage.createInteraction;
  updateInteraction = interactionsStorage.updateInteraction;
  softDeleteInteraction = interactionsStorage.softDeleteInteraction;
  restoreInteraction = interactionsStorage.restoreInteraction;
  exportInteractionsCsv = interactionsStorage.exportInteractionsCsv;

  // Referrals
  getReferrals = referralsStorage.getReferrals;
  getReferralsPaginated = referralsStorage.getReferralsPaginated;
  createReferral = referralsStorage.createReferral;
  updateReferral = referralsStorage.updateReferral;
  softDeleteReferral = referralsStorage.softDeleteReferral;
  restoreReferral = referralsStorage.restoreReferral;
  softDeleteAllReferrals = referralsStorage.softDeleteAllReferrals;
  restoreAllReferrals = referralsStorage.restoreAllReferrals;
  bulkUpsertReferrals = referralsStorage.bulkUpsertReferrals;
  bulkDeleteReferrals = referralsStorage.bulkDeleteReferrals;
  getUnlinkedReferrals = referralsStorage.getUnlinkedReferrals;
  linkReferralToPhysician = referralsStorage.linkReferralToPhysician;
  bulkLinkReferralsByProviderName = referralsStorage.bulkLinkReferralsByProviderName;
  categorizeReferralAsSelfReferral = referralsStorage.categorizeReferralAsSelfReferral;
  exportReferralsCsv = referralsStorage.exportReferralsCsv;

  // Tasks
  getTask = tasksStorage.getTask;
  getTasks = tasksStorage.getTasks;
  createTask = tasksStorage.createTask;
  updateTask = tasksStorage.updateTask;
  exportTasksCsv = tasksStorage.exportTasksCsv;

  // Calendar
  getCalendarEvents = calendarStorage.getCalendarEvents;
  getCalendarEvent = calendarStorage.getCalendarEvent;
  createCalendarEvent = calendarStorage.createCalendarEvent;
  updateCalendarEvent = calendarStorage.updateCalendarEvent;
  deleteCalendarEvent = calendarStorage.deleteCalendarEvent;

  // Audit logs + dashboard
  getAuditLogs = dashboardStorage.getAuditLogs;
  createAuditLog = dashboardStorage.createAuditLog;
  exportAuditLogsCsv = dashboardStorage.exportAuditLogsCsv;
  getDashboardStats = dashboardStorage.getDashboardStats;
  getPhysicianTiering = dashboardStorage.getPhysicianTiering;
  getDecliningReferrals = dashboardStorage.getDecliningReferrals;
  getTieringWeights = dashboardStorage.getTieringWeights;
  updateTieringWeights = dashboardStorage.updateTieringWeights;
  getCollections = dashboardStorage.getCollections;
  createCollection = dashboardStorage.createCollection;
  exportPhysiciansCsv = dashboardStorage.exportPhysiciansCsv;
  getScheduledReports = dashboardStorage.getScheduledReports;
  getScheduledReport = dashboardStorage.getScheduledReport;
  createScheduledReport = dashboardStorage.createScheduledReport;
  updateScheduledReport = dashboardStorage.updateScheduledReport;
  deleteScheduledReport = dashboardStorage.deleteScheduledReport;

  // Search
  globalSearch = searchStorage.globalSearch;

  // Integrations
  getIntegrationConfigs = integrationsStorage.getIntegrationConfigs;
  getIntegrationConfig = integrationsStorage.getIntegrationConfig;
  getIntegrationConfigByType = integrationsStorage.getIntegrationConfigByType;
  createIntegrationConfig = integrationsStorage.createIntegrationConfig;
  updateIntegrationConfig = integrationsStorage.updateIntegrationConfig;
  deleteIntegrationConfig = integrationsStorage.deleteIntegrationConfig;
  getApiKeys = integrationsStorage.getApiKeys;
  getApiKeyById = integrationsStorage.getApiKeyById;
  createApiKey = integrationsStorage.createApiKey;
  getApiKeyByHash = integrationsStorage.getApiKeyByHash;
  updateApiKeyLastUsed = integrationsStorage.updateApiKeyLastUsed;
  deactivateApiKey = integrationsStorage.deactivateApiKey;
  getIntegrationSyncLogs = integrationsStorage.getIntegrationSyncLogs;
  createIntegrationSyncLog = integrationsStorage.createIntegrationSyncLog;
  updateIntegrationSyncLog = integrationsStorage.updateIntegrationSyncLog;

  // Monthly summaries (inline — small, not worth a separate module)
  async getPhysicianMonthlySummaries(filters?: { physicianId?: string; month?: string; months?: number }): Promise<PhysicianMonthlySummary[]> {
    const conditions: any[] = [];
    if (filters?.physicianId) conditions.push(eq(physicianMonthlySummary.physicianId, filters.physicianId));
    if (filters?.month) conditions.push(eq(physicianMonthlySummary.month, filters.month));
    if (filters?.months) {
      const d = new Date();
      d.setMonth(d.getMonth() - filters.months);
      conditions.push(gte(physicianMonthlySummary.month, d.toISOString().slice(0, 10)));
    }
    if (conditions.length > 0) {
      return db.select().from(physicianMonthlySummary).where(and(...conditions)).orderBy(desc(physicianMonthlySummary.month));
    }
    return db.select().from(physicianMonthlySummary).orderBy(desc(physicianMonthlySummary.month));
  }

  async getTerritoryMonthlySummaries(filters?: { territoryId?: string; month?: string }): Promise<TerritoryMonthlySummary[]> {
    const conditions: any[] = [];
    if (filters?.territoryId) conditions.push(eq(territoryMonthlySummary.territoryId, filters.territoryId));
    if (filters?.month) conditions.push(eq(territoryMonthlySummary.month, filters.month));
    if (conditions.length > 0) {
      return db.select().from(territoryMonthlySummary).where(and(...conditions)).orderBy(desc(territoryMonthlySummary.month));
    }
    return db.select().from(territoryMonthlySummary).orderBy(desc(territoryMonthlySummary.month));
  }

  async getLocationMonthlySummaries(filters?: { locationId?: string; month?: string }): Promise<LocationMonthlySummary[]> {
    const conditions: any[] = [];
    if (filters?.locationId) conditions.push(eq(locationMonthlySummary.locationId, filters.locationId));
    if (filters?.month) conditions.push(eq(locationMonthlySummary.month, filters.month));
    if (conditions.length > 0) {
      return db.select().from(locationMonthlySummary).where(and(...conditions)).orderBy(desc(locationMonthlySummary.month));
    }
    return db.select().from(locationMonthlySummary).orderBy(desc(locationMonthlySummary.month));
  }

  // At-risk referral sources (kept inline — self-contained complex query)
  async getAtRiskReferralSources(filters?: { locationId?: string; territoryId?: string }): Promise<AtRiskResult> {
    const { isNotNull, inArray, or } = await import("drizzle-orm");
    const now = new Date();
    const currentEndExcl = new Date(now);
    currentEndExcl.setDate(currentEndExcl.getDate() + 1);
    const currentEndStr = currentEndExcl.toISOString().slice(0, 10);
    const currentMonthStart = new Date(now);
    currentMonthStart.setDate(currentMonthStart.getDate() - 30);
    const currentStartStr = currentMonthStart.toISOString().slice(0, 10);
    const priorEndStr = currentStartStr;
    const priorMonthStart = new Date(currentMonthStart);
    priorMonthStart.setDate(priorMonthStart.getDate() - 30);
    const priorStartStr = priorMonthStart.toISOString().slice(0, 10);
    const touchpointCutoff = new Date(now);
    touchpointCutoff.setDate(touchpointCutoff.getDate() - 30);

    const emptyResult: AtRiskResult = { data: [], total: 0, period: { currentStart: currentStartStr, currentEnd: currentEndStr, priorStart: priorStartStr, priorEnd: priorEndStr } };

    const physConditions: any[] = [isNull(physicians.deletedAt)];
    if (filters?.locationId) {
      physConditions.push(sql`${physicians.id} IN (SELECT DISTINCT physician_id FROM referrals WHERE location_id = ${filters.locationId} AND deleted_at IS NULL)`);
    }
    if (filters?.territoryId) physConditions.push(eq(physicians.territoryId, filters.territoryId));

    const eligiblePhysicians = await db.select({ id: physicians.id }).from(physicians).where(and(...physConditions));
    const eligibleIds = eligiblePhysicians.map(p => p.id);
    if (eligibleIds.length === 0) return emptyResult;

    const eligibleIdsSql = sql.join(eligibleIds.map(id => sql`${id}`), sql`, `);

    const currentCounts = await db.select({ physicianId: referrals.physicianId, count: sql<number>`count(*)` })
      .from(referrals)
      .where(and(isNull(referrals.deletedAt), isNotNull(referrals.physicianId), sql`${referrals.physicianId} IN (${eligibleIdsSql})`, sql`${referrals.referralDate} >= ${currentStartStr}`, sql`${referrals.referralDate} < ${currentEndStr}`))
      .groupBy(referrals.physicianId);

    const priorCounts = await db.select({ physicianId: referrals.physicianId, count: sql<number>`count(*)` })
      .from(referrals)
      .where(and(isNull(referrals.deletedAt), isNotNull(referrals.physicianId), sql`${referrals.physicianId} IN (${eligibleIdsSql})`, sql`${referrals.referralDate} >= ${priorStartStr}`, sql`${referrals.referralDate} < ${priorEndStr}`))
      .groupBy(referrals.physicianId);

    const currentMap = new Map(currentCounts.map(c => [c.physicianId, Number(c.count)]));
    const priorMap = new Map(priorCounts.map(c => [c.physicianId, Number(c.count)]));

    const declining: { physicianId: string; currentCount: number; priorCount: number; changePercent: number }[] = [];
    for (const [physId, priorCount] of Array.from(priorMap.entries())) {
      if (!physId || priorCount === 0) continue;
      const currentCount = currentMap.get(physId) || 0;
      const changePercent = Math.round(((currentCount - priorCount) / priorCount) * 100);
      if (changePercent <= -20) declining.push({ physicianId: physId, currentCount, priorCount, changePercent });
    }
    if (declining.length === 0) return emptyResult;

    const decliningIds = declining.map(d => d.physicianId);
    const decliningIdsSql = sql.join(decliningIds.map(id => sql`${id}`), sql`, `);

    const noTouchpoint = await db.select({ id: physicians.id }).from(physicians)
      .where(and(sql`${physicians.id} IN (${decliningIdsSql})`, or(isNull(physicians.lastInteractionAt), sql`${physicians.lastInteractionAt} < ${touchpointCutoff.toISOString()}`)));
    const noTouchpointSet = new Set(noTouchpoint.map(p => p.id));

    const overdueTasks = await db.select({ physicianId: tasks.physicianId }).from(tasks)
      .where(and(sql`${tasks.physicianId} IN (${decliningIdsSql})`, eq(tasks.status, "OPEN"), sql`${tasks.dueAt} < ${now.toISOString()}`))
      .groupBy(tasks.physicianId);
    const overdueSet = new Set(overdueTasks.map(t => t.physicianId));

    const atRisk = declining.filter(d => noTouchpointSet.has(d.physicianId) || overdueSet.has(d.physicianId));
    if (atRisk.length === 0) return emptyResult;

    const atRiskIds = atRisk.map(d => d.physicianId);
    const physicianDetails = await db.select({
      id: physicians.id, firstName: physicians.firstName, lastName: physicians.lastName,
      credentials: physicians.credentials, specialty: physicians.specialty, practiceName: physicians.practiceName,
      relationshipStage: physicians.relationshipStage, assignedOwnerId: physicians.assignedOwnerId,
      territoryId: physicians.territoryId, lastInteractionAt: physicians.lastInteractionAt,
    }).from(physicians).where(sql`${physicians.id} IN (${sql.join(atRiskIds.map(id => sql`${id}`), sql`, `)})`);

    const physMap = new Map(physicianDetails.map(p => [p.id, p]));
    const result = atRisk.map(d => ({
      ...d,
      physician: physMap.get(d.physicianId) || null,
      riskSignal: (noTouchpointSet.has(d.physicianId) ? "no_contact" : "overdue_task") as "no_contact" | "overdue_task",
      daysSinceContact: (() => {
        const phys = physMap.get(d.physicianId);
        if (!phys?.lastInteractionAt) return null;
        return Math.floor((now.getTime() - new Date(phys.lastInteractionAt).getTime()) / (1000 * 60 * 60 * 24));
      })(),
    })).filter(d => d.physician !== null).sort((a, b) => a.changePercent - b.changePercent);

    return { data: result, total: result.length, period: { currentStart: currentStartStr, currentEnd: currentEndStr, priorStart: priorStartStr, priorEnd: priorEndStr } };
  }

  // Practice Intelligence (inline — raw SQL, self-contained)
  async getPractices(filters: { search?: string; sortBy?: string; sortOrder?: string; page?: number; pageSize?: number }): Promise<PaginatedResult<PracticeSummary>> {
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 50;
    const offset = (page - 1) * pageSize;
    const searchPattern = filters.search ? `%${filters.search}%` : null;

    const sortMap: Record<string, string> = { practiceName: "practice_name", physicianCount: "physician_count", totalReferrals: "total_referrals", totalRevenue: "total_revenue", arrivalRate: "arrival_rate", lastInteractionAt: "last_interaction" };
    const allowedSortCols = new Set(Object.values(sortMap));
    const rawSortCol = sortMap[filters.sortBy || "totalReferrals"] || "total_referrals";
    const sortCol = allowedSortCols.has(rawSortCol) ? rawSortCol : "total_referrals";
    const sortDir = filters.sortOrder === "asc" ? "ASC" : "DESC";
    const searchCond = searchPattern ? sql`AND (p.practice_name ILIKE ${searchPattern} OR p.city ILIKE ${searchPattern})` : sql``;

    const countResult = await db.execute(sql`SELECT COUNT(DISTINCT TRIM(p.practice_name)) as total FROM physicians p WHERE p.deleted_at IS NULL AND p.practice_name IS NOT NULL AND TRIM(p.practice_name) != '' ${searchCond}`);
    const total = parseInt((countResult.rows[0] as any)?.total || "0");

    const dataResult = await db.execute(sql`
      SELECT TRIM(p.practice_name) as practice_name, COUNT(DISTINCT p.id)::int as physician_count,
        COALESCE(SUM(ref_agg.ref_count), 0)::int as total_referrals, COALESCE(SUM(rev_agg.total_rev), 0)::numeric as total_revenue,
        CASE WHEN COALESCE(SUM(ref_agg.scheduled), 0) > 0 THEN ROUND(SUM(ref_agg.arrived)::numeric / SUM(ref_agg.scheduled)::numeric * 100, 1) ELSE 0 END as arrival_rate,
        MAX(p.last_interaction_at) as last_interaction, MIN(p.city) as city, MIN(p.state) as state
      FROM physicians p
      LEFT JOIN (SELECT physician_id, COUNT(*) as ref_count, SUM(COALESCE(scheduled_visits, 0)) as scheduled, SUM(COALESCE(arrived_visits, 0)) as arrived FROM referrals WHERE deleted_at IS NULL GROUP BY physician_id) ref_agg ON ref_agg.physician_id = p.id
      LEFT JOIN (SELECT physician_id, SUM(COALESCE(revenue_generated, 0)::numeric) as total_rev FROM physician_monthly_summary GROUP BY physician_id) rev_agg ON rev_agg.physician_id = p.id
      WHERE p.deleted_at IS NULL AND p.practice_name IS NOT NULL AND TRIM(p.practice_name) != '' ${searchCond}
      GROUP BY TRIM(p.practice_name) ORDER BY ${sql.raw(sortCol)} ${sql.raw(sortDir)} LIMIT ${pageSize} OFFSET ${offset}
    `);

    const data: PracticeSummary[] = (dataResult.rows as any[]).map(r => ({
      practiceName: r.practice_name, physicianCount: r.physician_count, totalReferrals: r.total_referrals,
      totalRevenue: parseFloat(r.total_revenue || "0"), arrivalRate: parseFloat(r.arrival_rate || "0"),
      lastInteractionAt: r.last_interaction ? new Date(r.last_interaction).toISOString() : null,
      city: r.city, state: r.state,
    }));
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async getPracticeDetail(practiceName: string): Promise<PracticeDetail | null> {
    const trimmedName = practiceName.trim();
    if (!trimmedName) return null;

    const physResult = await db.execute(sql`
      SELECT p.*, COALESCE(ref_agg.ref_count, 0)::int as referral_count, COALESCE(ref_agg.scheduled, 0)::int as total_scheduled,
        COALESCE(ref_agg.arrived, 0)::int as total_arrived, COALESCE(rev_agg.total_rev, 0)::numeric as revenue_generated,
        COALESCE(int_agg.int_count, 0)::int as interaction_count
      FROM physicians p
      LEFT JOIN (SELECT physician_id, COUNT(*) as ref_count, SUM(COALESCE(scheduled_visits, 0)) as scheduled, SUM(COALESCE(arrived_visits, 0)) as arrived FROM referrals WHERE deleted_at IS NULL GROUP BY physician_id) ref_agg ON ref_agg.physician_id = p.id
      LEFT JOIN (SELECT physician_id, SUM(COALESCE(revenue_generated, 0)::numeric) as total_rev FROM physician_monthly_summary GROUP BY physician_id) rev_agg ON rev_agg.physician_id = p.id
      LEFT JOIN (SELECT physician_id, COUNT(*) as int_count FROM interactions WHERE deleted_at IS NULL GROUP BY physician_id) int_agg ON int_agg.physician_id = p.id
      WHERE p.deleted_at IS NULL AND TRIM(p.practice_name) = ${trimmedName} ORDER BY revenue_generated DESC
    `);

    if (physResult.rows.length === 0) return null;

    const physicianRows = (physResult.rows as any[]).map(r => {
      const scheduled = r.total_scheduled || 0;
      const arrived = r.total_arrived || 0;
      return {
        id: r.id, firstName: r.first_name, lastName: r.last_name, credentials: r.credentials,
        specialty: r.specialty, status: r.status, relationshipStage: r.relationship_stage,
        referralCount: r.referral_count, revenueGenerated: parseFloat(r.revenue_generated || "0"),
        arrivalRate: scheduled > 0 ? Math.round((arrived / scheduled) * 1000) / 10 : 0,
        lastInteractionAt: r.last_interaction_at ? new Date(r.last_interaction_at).toISOString() : null,
        interactionCount: r.interaction_count,
      };
    });

    const rows = physResult.rows as any[];
    const totalSched = rows.reduce((s, r) => s + (r.total_scheduled || 0), 0);
    const totalArr = rows.reduce((s, r) => s + (r.total_arrived || 0), 0);

    const practice: PracticeSummary = {
      practiceName: trimmedName, physicianCount: physicianRows.length,
      totalReferrals: physicianRows.reduce((s, p) => s + p.referralCount, 0),
      totalRevenue: physicianRows.reduce((s, p) => s + p.revenueGenerated, 0),
      arrivalRate: totalSched > 0 ? Math.round((totalArr / totalSched) * 1000) / 10 : 0,
      lastInteractionAt: physicianRows.reduce((latest: string | null, p) => {
        if (!p.lastInteractionAt) return latest;
        if (!latest) return p.lastInteractionAt;
        return p.lastInteractionAt > latest ? p.lastInteractionAt : latest;
      }, null),
      city: rows[0]?.city || null, state: rows[0]?.state || null,
    };
    return { practice, physicians: physicianRows };
  }

  // Unit Economics — delegate to storage-unit-economics module
  getClinicFinancials = unitEconomicsStorage.getClinicFinancials;
  upsertClinicFinancial = unitEconomicsStorage.upsertClinicFinancial;
  bulkUpsertClinicFinancials = unitEconomicsStorage.bulkUpsertClinicFinancials;
  getProviderProductivity = unitEconomicsStorage.getProviderProductivity;
  upsertProviderProductivity = unitEconomicsStorage.upsertProviderProductivity;
  bulkUpsertProviderProductivity = unitEconomicsStorage.bulkUpsertProviderProductivity;
  getFinancialAlerts = unitEconomicsStorage.getFinancialAlerts;
  createFinancialAlert = unitEconomicsStorage.createFinancialAlert;
  acknowledgeFinancialAlert = unitEconomicsStorage.acknowledgeFinancialAlert;
  getFinancialTargets = unitEconomicsStorage.getFinancialTargets;
  upsertFinancialTarget = unitEconomicsStorage.upsertFinancialTarget;
  getUnitEconomicsDashboard = unitEconomicsStorage.getUnitEconomicsDashboard;
  getUnitEconomicsLocationDetail = unitEconomicsStorage.getUnitEconomicsLocationDetail;
  getProviderProductivityLeaderboard = unitEconomicsStorage.getProviderProductivityLeaderboard;
  getUnitEconomicsForecast = unitEconomicsStorage.getUnitEconomicsForecast;

  // Revenue Recovery — delegate to storage-revenue-recovery module
  getClaims = revenueRecoveryStorage.getClaims;
  getClaim = revenueRecoveryStorage.getClaim;
  upsertClaim = revenueRecoveryStorage.upsertClaim;
  bulkUpsertClaims = revenueRecoveryStorage.bulkUpsertClaims;
  getUnderpaidClaims = revenueRecoveryStorage.getUnderpaidClaims;
  getReimbursementSummary = revenueRecoveryStorage.getReimbursementSummary;
  calculateExpectedAmount = revenueRecoveryStorage.calculateExpectedAmount;
  flagUnderpaidClaims = revenueRecoveryStorage.flagUnderpaidClaims;
  getPayerRates = revenueRecoveryStorage.getPayerRates;
  upsertPayerRate = revenueRecoveryStorage.upsertPayerRate;
  bulkUpsertPayerRates = revenueRecoveryStorage.bulkUpsertPayerRates;
  buildRatesFromHistory = revenueRecoveryStorage.buildRatesFromHistory;

  // Denial Intelligence — delegate to storage-denial-intelligence module
  getDenialSummary = denialIntelligenceStorage.getDenialSummary;
  getTopDenialCodes = denialIntelligenceStorage.getTopDenialCodes;
  getProviderDenialOutliers = denialIntelligenceStorage.getProviderDenialOutliers;
  getDenialTrends = denialIntelligenceStorage.getDenialTrends;
}

export const storage = new DatabaseStorage();
