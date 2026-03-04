import { db } from "./db";
import { eq, and, desc, asc, gte, lte, sql, ilike, or, inArray, isNull, isNotNull } from "drizzle-orm";
import {
  users, locations, physicians, interactions, referrals, tasks, auditLogs, calendarEvents, userLocationAccess,
  territories, collections, physicianMonthlySummary, territoryMonthlySummary, locationMonthlySummary, tieringWeights,
  integrationConfigs, apiKeys, integrationSyncLogs, physicianComments, scheduledReports, physicianFavorites,
  interactionTemplates, physicianStageHistory,
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
import * as unitEconomicsStorage from "./storage-unit-economics";
import * as revenueRecoveryStorage from "./storage-revenue-recovery";
import * as denialIntelligenceStorage from "./storage-denial-intelligence";
export type {
  UnitEconomicsLocationSummary,
  UnitEconomicsLocationDetail,
  ProviderProductivityEntry,
  ForecastEntry,
} from "./storage-unit-economics";
export type {
  UnderpaidClaim,
  ReimbursementSummary,
} from "./storage-revenue-recovery";
export type {
  DenialSummary,
  DenialCodeStat,
  ProviderDenialOutlier,
  DenialTrend,
} from "./storage-denial-intelligence";

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

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByResetToken(token: string): Promise<User | undefined>;
  getUsersByApprovalStatus(status: string): Promise<User[]>;
  getUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<InsertUser> & { failedLoginAttempts?: number; lockedUntil?: Date | null; lastLoginAt?: Date; passwordChangedAt?: Date; approvalStatus?: string; passwordResetToken?: string | null; passwordResetExpires?: Date | null }): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;

  getLocations(): Promise<Location[]>;
  getLocation(id: string): Promise<Location | undefined>;
  createLocation(loc: InsertLocation): Promise<Location>;
  updateLocation(id: string, data: Partial<InsertLocation>): Promise<Location | undefined>;
  deleteLocation(id: string): Promise<boolean>;

  getPhysicians(): Promise<Physician[]>;
  searchPhysiciansTypeahead(query: string, limit?: number): Promise<Pick<Physician, 'id' | 'firstName' | 'lastName' | 'credentials' | 'npi' | 'practiceName' | 'specialty'>[]>;
  getPhysiciansPaginated(filters: PhysicianFilters): Promise<PaginatedResult<any>>;
  getPhysicianIdsByLocations(locationIds: string[]): Promise<Set<string>>;
  getPhysician(id: string): Promise<Physician | undefined>;
  createPhysician(phys: InsertPhysician): Promise<Physician>;
  updatePhysician(id: string, data: Partial<InsertPhysician>): Promise<Physician | undefined>;

  getInteraction(id: string): Promise<Interaction | undefined>;
  getInteractions(physicianId?: string, includeDeleted?: boolean): Promise<Interaction[]>;
  getInteractionsPaginated(filters: InteractionFilters): Promise<PaginatedResult<any>>;
  createInteraction(inter: InsertInteraction): Promise<Interaction>;
  updateInteraction(id: string, data: Partial<InsertInteraction>): Promise<Interaction | undefined>;

  getReferrals(physicianId?: string, locationIds?: string[]): Promise<Referral[]>;
  getReferralsPaginated(filters: ReferralFilters): Promise<PaginatedResult<any>>;
  createReferral(ref: InsertReferral): Promise<Referral>;
  updateReferral(id: string, data: Partial<InsertReferral>): Promise<Referral | undefined>;

  getTask(id: string): Promise<Task | undefined>;
  getTasks(physicianId?: string): Promise<Task[]>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: string, data: Partial<InsertTask & { status: string }>): Promise<Task | undefined>;

  getCalendarEvents(filters?: { startDate?: string; endDate?: string; locationId?: string; physicianId?: string; practiceName?: string }): Promise<CalendarEvent[]>;
  getCalendarEvent(id: string): Promise<CalendarEvent | undefined>;
  createCalendarEvent(event: InsertCalendarEvent): Promise<CalendarEvent>;
  updateCalendarEvent(id: string, data: Partial<InsertCalendarEvent>): Promise<CalendarEvent | undefined>;
  deleteCalendarEvent(id: string): Promise<boolean>;

  getAuditLogs(filters?: { userId?: string; entity?: string; action?: string; limit?: number }): Promise<AuditLog[]>;
  createAuditLog(log: Omit<AuditLog, "id" | "timestamp" | "ipAddress" | "userAgent"> & { ipAddress?: string | null; userAgent?: string | null }): Promise<void>;

  getDashboardStats(filters?: { startDate?: string; endDate?: string; locationId?: string; territoryId?: string; physicianId?: string }): Promise<any>;

  getPhysicianTiering(filters?: { period?: string; year?: number; month?: number }): Promise<any>;
  getDecliningReferrals(filters?: { months?: number; minDrop?: number }): Promise<any>;
  exportPhysiciansCsv(filters: PhysicianFilters): Promise<any[]>;
  exportReferralsCsv(filters: ReferralFilters): Promise<any[]>;
  exportInteractionsCsv(filters?: { physicianId?: string; type?: string; dateFrom?: string; dateTo?: string }): Promise<any[]>;
  exportTasksCsv(filters?: { status?: string; assignedToUserId?: string }): Promise<any[]>;
  exportAuditLogsCsv(filters?: { entity?: string; action?: string }): Promise<any[]>;
  getMarketers(): Promise<any[]>;
  getMarketerTerritories(): Promise<any>;
  assignPhysicianToMarketer(physicianId: string, marketerId: string | null): Promise<Physician | undefined>;
  bulkAssignPhysiciansToMarketer(physicianIds: string[], marketerId: string | null): Promise<number>;
  bulkUpdatePhysicianStatus(physicianIds: string[], status: string): Promise<number>;

  softDeletePhysician(id: string): Promise<boolean>;
  restorePhysician(id: string): Promise<boolean>;
  softDeleteReferral(id: string): Promise<boolean>;
  restoreReferral(id: string): Promise<boolean>;
  softDeleteAllReferrals(): Promise<number>;
  restoreAllReferrals(): Promise<number>;
  softDeleteInteraction(id: string): Promise<boolean>;
  restoreInteraction(id: string): Promise<boolean>;

  bulkUpsertPhysicians(rows: InsertPhysician[]): Promise<{ inserted: number; updated: number; errors: string[] }>;
  bulkUpsertReferrals(rows: InsertReferral[]): Promise<{ inserted: number; updated: number; errors: string[] }>;
  bulkDeleteReferrals(ids: string[]): Promise<number>;
  findPhysicianByNameAndNpi(firstName: string, lastName: string, npi?: string | null): Promise<Physician | undefined>;
  findLocationByName(name: string): Promise<Location | undefined>;

  getTerritories(): Promise<Territory[]>;
  getTerritory(id: string): Promise<Territory | undefined>;
  createTerritory(territory: InsertTerritory): Promise<Territory>;
  updateTerritory(id: string, data: Partial<InsertTerritory>): Promise<Territory | undefined>;
  deleteTerritory(id: string): Promise<boolean>;

  getCollections(filters?: { physicianId?: string; locationId?: string; locationIds?: string[]; dateFrom?: string; dateTo?: string }): Promise<Collection[]>;
  createCollection(col: InsertCollection): Promise<Collection>;

  getTieringWeights(): Promise<TieringWeights | undefined>;
  updateTieringWeights(data: Partial<TieringWeights>): Promise<TieringWeights | undefined>;

  getPhysicianMonthlySummaries(filters?: { physicianId?: string; month?: string; months?: number }): Promise<PhysicianMonthlySummary[]>;
  getTerritoryMonthlySummaries(filters?: { territoryId?: string; month?: string }): Promise<TerritoryMonthlySummary[]>;
  getLocationMonthlySummaries(filters?: { locationId?: string; month?: string }): Promise<LocationMonthlySummary[]>;

  getIntegrationConfigs(): Promise<IntegrationConfig[]>;
  getIntegrationConfig(id: string): Promise<IntegrationConfig | undefined>;
  getIntegrationConfigByType(type: string): Promise<IntegrationConfig | undefined>;
  createIntegrationConfig(config: InsertIntegrationConfig): Promise<IntegrationConfig>;
  updateIntegrationConfig(id: string, data: Partial<InsertIntegrationConfig>): Promise<IntegrationConfig | undefined>;
  deleteIntegrationConfig(id: string): Promise<boolean>;

  getApiKeys(): Promise<ApiKey[]>;
  getApiKeyById(id: string): Promise<ApiKey | undefined>;
  createApiKey(key: InsertApiKey): Promise<ApiKey>;
  getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined>;
  updateApiKeyLastUsed(id: string): Promise<void>;
  deactivateApiKey(id: string): Promise<boolean>;

  getIntegrationSyncLogs(integrationId?: string, limit?: number): Promise<IntegrationSyncLog[]>;
  createIntegrationSyncLog(log: InsertIntegrationSyncLog): Promise<IntegrationSyncLog>;
  updateIntegrationSyncLog(id: string, data: Partial<IntegrationSyncLog>): Promise<IntegrationSyncLog | undefined>;

  getPhysicianComments(physicianId: string): Promise<PhysicianComment[]>;
  createPhysicianComment(comment: InsertPhysicianComment): Promise<PhysicianComment>;
  updatePhysicianComment(id: string, content: string): Promise<PhysicianComment | undefined>;
  deletePhysicianComment(id: string): Promise<boolean>;

  getScheduledReports(): Promise<ScheduledReport[]>;
  getScheduledReport(id: string): Promise<ScheduledReport | undefined>;
  createScheduledReport(report: InsertScheduledReport): Promise<ScheduledReport>;
  updateScheduledReport(id: string, data: Partial<InsertScheduledReport>): Promise<ScheduledReport>;
  deleteScheduledReport(id: string): Promise<void>;

  // Favorites
  getPhysicianFavorites(userId: string): Promise<string[]>;
  addPhysicianFavorite(userId: string, physicianId: string): Promise<void>;
  removePhysicianFavorite(userId: string, physicianId: string): Promise<void>;

  // Global search
  globalSearch(query: string, limit?: number): Promise<{ physicians: any[]; referrals: any[]; }>;

  // Unlinked referrals
  getUnlinkedReferrals(page?: number, pageSize?: number): Promise<PaginatedResult<any>>;
  linkReferralToPhysician(referralId: string, physicianId: string): Promise<Referral | undefined>;
  bulkLinkReferralsByProviderName(providerName: string, physicianId: string, excludeId: string): Promise<number>;
  categorizeReferralAsSelfReferral(referralId: string): Promise<Referral | undefined>;

  // At-risk referral sources
  getAtRiskReferralSources(filters?: { locationId?: string; territoryId?: string }): Promise<AtRiskResult>;

  // Location scoping
  getUserLocationIds(userId: string): Promise<string[]>;

  // Interaction templates
  getInteractionTemplates(): Promise<InteractionTemplate[]>;
  createInteractionTemplate(template: InsertInteractionTemplate): Promise<InteractionTemplate>;
  updateInteractionTemplate(id: string, data: Partial<InsertInteractionTemplate>): Promise<InteractionTemplate | undefined>;
  deleteInteractionTemplate(id: string): Promise<boolean>;

  // Physician stage history
  getPhysicianStageHistory(physicianId: string): Promise<PhysicianStageHistory[]>;

  // Practice Intelligence
  getPractices(filters: {
    search?: string;
    sortBy?: string;
    sortOrder?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaginatedResult<PracticeSummary>>;
  getPracticeDetail(practiceName: string): Promise<PracticeDetail | null>;

  // Unit Economics - Clinic Financials
  getClinicFinancials(filters: { locationId?: string; periodType?: string; dateFrom?: string; dateTo?: string }): Promise<ClinicFinancial[]>;
  upsertClinicFinancial(data: InsertClinicFinancial): Promise<ClinicFinancial>;
  bulkUpsertClinicFinancials(rows: InsertClinicFinancial[]): Promise<{ inserted: number; updated: number }>;

  // Unit Economics - Provider Productivity
  getProviderProductivity(filters: { userId?: string; locationId?: string; dateFrom?: string; dateTo?: string }): Promise<ProviderProductivity[]>;
  upsertProviderProductivity(data: InsertProviderProductivity): Promise<ProviderProductivity>;
  bulkUpsertProviderProductivity(rows: InsertProviderProductivity[]): Promise<{ inserted: number; updated: number }>;

  // Unit Economics - Financial Alerts
  getFinancialAlerts(filters: { locationId?: string; acknowledged?: boolean }): Promise<FinancialAlert[]>;
  createFinancialAlert(alert: InsertFinancialAlert): Promise<FinancialAlert>;
  acknowledgeFinancialAlert(id: string, userId: string): Promise<FinancialAlert | undefined>;

  // Unit Economics - Financial Targets
  getFinancialTargets(locationId?: string): Promise<FinancialTarget[]>;
  upsertFinancialTarget(data: InsertFinancialTarget): Promise<FinancialTarget>;

  // Unit Economics - Aggregation
  getUnitEconomicsDashboard(locationIds?: string[]): Promise<unitEconomicsStorage.UnitEconomicsLocationSummary[]>;
  getUnitEconomicsLocationDetail(locationId: string, dateFrom?: string, dateTo?: string): Promise<unitEconomicsStorage.UnitEconomicsLocationDetail>;
  getProviderProductivityLeaderboard(dateFrom?: string, dateTo?: string, locationId?: string): Promise<unitEconomicsStorage.ProviderProductivityEntry[]>;
  getUnitEconomicsForecast(locationId?: string): Promise<unitEconomicsStorage.ForecastEntry[]>;

  // Revenue Recovery - Claims
  getClaims(filters: { locationId?: string; payer?: string; status?: string; dateFrom?: string; dateTo?: string; isUnderpaid?: boolean; page?: number; pageSize?: number }): Promise<{ data: Claim[]; total: number }>;
  getClaim(id: string): Promise<Claim | undefined>;
  upsertClaim(data: InsertClaim): Promise<Claim>;
  bulkUpsertClaims(data: InsertClaim[]): Promise<{ inserted: number; updated: number }>;

  // Revenue Recovery - Reimbursement Analysis
  getUnderpaidClaims(filters: { locationId?: string; payer?: string; dateFrom?: string; dateTo?: string; minVariance?: number }): Promise<revenueRecoveryStorage.UnderpaidClaim[]>;
  getReimbursementSummary(filters: { locationId?: string; dateFrom?: string; dateTo?: string }): Promise<revenueRecoveryStorage.ReimbursementSummary[]>;
  calculateExpectedAmount(claimId: string): Promise<number>;
  flagUnderpaidClaims(filters?: { locationId?: string }): Promise<number>;

  // Revenue Recovery - Payer Rate Schedule
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

export class DatabaseStorage implements IStorage {
  async getUser(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async getUserByResetToken(token: string) {
    const [user] = await db.select().from(users).where(eq(users.passwordResetToken, token));
    return user;
  }

  async getUsersByApprovalStatus(status: string) {
    return db.select().from(users).where(eq(users.approvalStatus, status as any)).orderBy(desc(users.createdAt));
  }

  async getUsers() {
    return db.select().from(users).orderBy(asc(users.name));
  }

  async createUser(user: InsertUser) {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async updateUser(id: string, data: Partial<InsertUser> & { failedLoginAttempts?: number; lockedUntil?: Date | null; lastLoginAt?: Date; passwordChangedAt?: Date }) {
    const [updated] = await db.update(users)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updated;
  }

  async deleteUser(id: string) {
    const interCount = await db.select({ count: sql<number>`count(*)` }).from(interactions).where(eq(interactions.userId, id));
    const taskCount = await db.select({ count: sql<number>`count(*)` }).from(tasks).where(eq(tasks.assignedToUserId, id));
    if (Number(interCount[0]?.count) > 0 || Number(taskCount[0]?.count) > 0) {
      throw new Error("Cannot delete user that has interactions or tasks assigned. Reassign them first.");
    }
    await db.update(physicians).set({ assignedOwnerId: null }).where(eq(physicians.assignedOwnerId, id));
    await db.update(territories).set({ repUserId: null }).where(eq(territories.repUserId, id));
    await db.delete(calendarEvents).where(eq(calendarEvents.organizerUserId, id));
    await db.update(auditLogs).set({ userId: null }).where(eq(auditLogs.userId, id));
    await db.delete(userLocationAccess).where(eq(userLocationAccess.userId, id));
    await db.delete(users).where(eq(users.id, id));
    return true;
  }

  async getLocations() {
    return db.select().from(locations).orderBy(asc(locations.name));
  }

  async getLocation(id: string) {
    const [loc] = await db.select().from(locations).where(eq(locations.id, id));
    return loc;
  }

  async createLocation(loc: InsertLocation) {
    const [created] = await db.insert(locations).values(loc).returning();
    return created;
  }

  async updateLocation(id: string, data: Partial<InsertLocation>) {
    const [updated] = await db.update(locations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(locations.id, id))
      .returning();
    return updated;
  }

  async deleteLocation(id: string) {
    const refCount = await db.select({ count: sql<number>`count(*)` }).from(referrals).where(eq(referrals.locationId, id));
    const interCount = await db.select({ count: sql<number>`count(*)` }).from(interactions).where(eq(interactions.locationId, id));
    if (Number(refCount[0]?.count) > 0 || Number(interCount[0]?.count) > 0) {
      throw new Error("Cannot delete location that has referrals or interactions linked to it. Deactivate it instead.");
    }
    const result = await db.delete(locations).where(eq(locations.id, id));
    return true;
  }

  async getPhysicians() {
    return db.select().from(physicians).where(isNull(physicians.deletedAt)).orderBy(asc(physicians.lastName), asc(physicians.firstName));
  }

  async searchPhysiciansTypeahead(query: string, limit: number = 15) {
    const term = `%${query}%`;
    return db.select({
      id: physicians.id,
      firstName: physicians.firstName,
      lastName: physicians.lastName,
      credentials: physicians.credentials,
      npi: physicians.npi,
      practiceName: physicians.practiceName,
      specialty: physicians.specialty,
    })
    .from(physicians)
    .where(and(
      isNull(physicians.deletedAt),
      or(
        ilike(physicians.firstName, term),
        ilike(physicians.lastName, term),
        ilike(sql`coalesce(${physicians.practiceName}, '')`, term),
        ilike(sql`coalesce(${physicians.npi}, '')`, term),
        ilike(sql`concat(${physicians.firstName}, ' ', ${physicians.lastName})`, term),
      )
    ))
    .orderBy(asc(physicians.lastName), asc(physicians.firstName))
    .limit(limit);
  }

  async getPhysiciansPaginated(filters: PhysicianFilters): Promise<PaginatedResult<any>> {
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 50;
    const conditions: any[] = [isNull(physicians.deletedAt)];

    if (filters.status && filters.status !== "all") conditions.push(eq(physicians.status, filters.status as any));
    if (filters.stage && filters.stage !== "all") conditions.push(eq(physicians.relationshipStage, filters.stage as any));
    if (filters.priority && filters.priority !== "all") conditions.push(eq(physicians.priority, filters.priority as any));
    if (filters.practiceName) conditions.push(eq(physicians.practiceName, filters.practiceName));
    if (filters.locationIds && filters.locationIds.length > 0) {
      conditions.push(
        sql`${physicians.id} IN (SELECT DISTINCT ${referrals.physicianId} FROM ${referrals} WHERE ${referrals.deletedAt} IS NULL AND ${inArray(referrals.locationId, filters.locationIds)})`
      );
    }
    if (filters.search) {
      const term = `%${filters.search}%`;
      conditions.push(or(
        ilike(physicians.firstName, term),
        ilike(physicians.lastName, term),
        ilike(sql`coalesce(${physicians.practiceName}, '')`, term),
        ilike(sql`coalesce(${physicians.credentials}, '')`, term),
        ilike(sql`coalesce(${physicians.npi}, '')`, term),
        ilike(sql`coalesce(${physicians.city}, '')`, term),
      ));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db.select({ count: sql<number>`count(*)` }).from(physicians).where(where);
    const total = Number(countResult?.count || 0);

    const refCountExpr = sql<number>`count(${referrals.id})`;

    const sortDir = filters.sortOrder === "desc" ? desc : asc;
    let orderClause: any[];
    switch (filters.sortBy) {
      case "name":
        orderClause = [sortDir(physicians.lastName), sortDir(physicians.firstName)];
        break;
      case "location":
        orderClause = [sortDir(physicians.city)];
        break;
      case "status":
        orderClause = [sortDir(physicians.status)];
        break;
      case "stage":
        orderClause = [sortDir(physicians.relationshipStage)];
        break;
      case "priority":
        orderClause = [sortDir(physicians.priority)];
        break;
      case "referrals":
        orderClause = [sortDir(refCountExpr)];
        break;
      default:
        orderClause = [asc(physicians.lastName), asc(physicians.firstName)];
    }

    const data = await db.select({
      id: physicians.id,
      firstName: physicians.firstName,
      lastName: physicians.lastName,
      credentials: physicians.credentials,
      specialty: physicians.specialty,
      practiceName: physicians.practiceName,
      npi: physicians.npi,
      phone: physicians.phone,
      fax: physicians.fax,
      email: physicians.email,
      primaryOfficeAddress: physicians.primaryOfficeAddress,
      city: physicians.city,
      state: physicians.state,
      zip: physicians.zip,
      status: physicians.status,
      relationshipStage: physicians.relationshipStage,
      priority: physicians.priority,
      assignedOwnerId: physicians.assignedOwnerId,
      lastInteractionAt: physicians.lastInteractionAt,
      nextFollowUpAt: physicians.nextFollowUpAt,
      notes: physicians.notes,
      tags: physicians.tags,
      createdAt: physicians.createdAt,
      referralCount: refCountExpr,
    })
      .from(physicians)
      .leftJoin(referrals, and(
        eq(referrals.physicianId, physicians.id),
        isNull(referrals.deletedAt),
        sql`${referrals.referralDate} >= '2025-01-01'`,
        sql`${referrals.referralDate} <= '2026-01-31'`,
      ))
      .where(where)
      .groupBy(physicians.id)
      .orderBy(...orderClause)
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async getPhysician(id: string) {
    const [phys] = await db.select().from(physicians).where(and(eq(physicians.id, id), isNull(physicians.deletedAt)));
    return phys;
  }

  async createPhysician(phys: InsertPhysician) {
    const [created] = await db.insert(physicians).values(phys).returning();
    return created;
  }

  async updatePhysician(id: string, data: Partial<InsertPhysician>) {
    const [updated] = await db.update(physicians)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(physicians.id, id))
      .returning();
    return updated;
  }

  async getInteraction(id: string) {
    const [interaction] = await db.select().from(interactions).where(eq(interactions.id, id));
    return interaction;
  }

  async getInteractions(physicianId?: string, includeDeleted?: boolean) {
    const conditions: any[] = [];
    if (physicianId) conditions.push(eq(interactions.physicianId, physicianId));
    if (!includeDeleted) conditions.push(isNull(interactions.deletedAt));
    return db.select().from(interactions)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(interactions.occurredAt));
  }

  async createInteraction(inter: InsertInteraction) {
    const [created] = await db.insert(interactions).values(inter).returning();
    await db.update(physicians)
      .set({ lastInteractionAt: new Date(inter.occurredAt), updatedAt: new Date() })
      .where(eq(physicians.id, inter.physicianId));
    return created;
  }

  async getReferrals(physicianId?: string, locationIds?: string[]) {
    const conditions: any[] = [isNull(referrals.deletedAt)];
    if (physicianId) conditions.push(eq(referrals.physicianId, physicianId));
    if (locationIds && locationIds.length > 0) conditions.push(inArray(referrals.locationId, locationIds));
    return db.select().from(referrals)
      .where(and(...conditions))
      .orderBy(desc(referrals.referralDate));
  }

  async getReferralsPaginated(filters: ReferralFilters): Promise<PaginatedResult<any>> {
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 50;
    const conditions: any[] = [isNull(referrals.deletedAt)];

    if (filters.status && filters.status !== "all") conditions.push(eq(referrals.status, filters.status as any));
    if (filters.locationId && filters.locationId !== "all") conditions.push(eq(referrals.locationId, filters.locationId));
    if (filters.locationIds && filters.locationIds.length > 0) conditions.push(inArray(referrals.locationId, filters.locationIds));
    if (filters.discipline && filters.discipline !== "all") conditions.push(eq(referrals.discipline, filters.discipline));
    if (filters.referralSource && filters.referralSource !== "all") conditions.push(eq(referrals.referralSource, filters.referralSource));
    if (filters.primaryPayerType && filters.primaryPayerType !== "all") conditions.push(eq(referrals.primaryPayerType, filters.primaryPayerType));
    if (filters.physicianId) conditions.push(eq(referrals.physicianId, filters.physicianId));
    if (filters.dateFrom) conditions.push(gte(referrals.referralDate, filters.dateFrom));
    if (filters.dateTo) conditions.push(lte(referrals.referralDate, filters.dateTo));
    if (filters.search) {
      const term = `%${filters.search}%`;
      conditions.push(or(
        ilike(sql`coalesce(${referrals.patientFullName}, '')`, term),
        ilike(sql`coalesce(${referrals.patientAccountNumber}, '')`, term),
        ilike(sql`coalesce(${referrals.caseTherapist}, '')`, term),
        ilike(sql`coalesce(${physicians.firstName} || ' ' || ${physicians.lastName}, '')`, term),
      ));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(referrals)
      .leftJoin(physicians, eq(referrals.physicianId, physicians.id))
      .where(where);
    const total = Number(countResult?.count || 0);

    const activeCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(referrals)
      .leftJoin(physicians, eq(referrals.physicianId, physicians.id))
      .where(where ? and(where, sql`${referrals.status} != 'DISCHARGED'`) : sql`${referrals.status} != 'DISCHARGED'`);

    const dischargedCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(referrals)
      .leftJoin(physicians, eq(referrals.physicianId, physicians.id))
      .where(where ? and(where, eq(referrals.status, "DISCHARGED")) : eq(referrals.status, "DISCHARGED"));

    const data = await db
      .select({
        id: referrals.id,
        physicianId: referrals.physicianId,
        locationId: referrals.locationId,
        referralDate: referrals.referralDate,
        patientAccountNumber: referrals.patientAccountNumber,
        patientInitialsOrAnonId: referrals.patientInitialsOrAnonId,
        patientFullName: referrals.patientFullName,
        patientDob: referrals.patientDob,
        patientPhone: referrals.patientPhone,
        caseTitle: referrals.caseTitle,
        caseTherapist: referrals.caseTherapist,
        dateOfInitialEval: referrals.dateOfInitialEval,
        referralSource: referrals.referralSource,
        dischargeDate: referrals.dischargeDate,
        dischargeReason: referrals.dischargeReason,
        scheduledVisits: referrals.scheduledVisits,
        arrivedVisits: referrals.arrivedVisits,
        discipline: referrals.discipline,
        primaryInsurance: referrals.primaryInsurance,
        primaryPayerType: referrals.primaryPayerType,
        dateOfFirstScheduledVisit: referrals.dateOfFirstScheduledVisit,
        dateOfFirstArrivedVisit: referrals.dateOfFirstArrivedVisit,
        createdToArrived: referrals.createdToArrived,
        payerType: referrals.payerType,
        diagnosisCategory: referrals.diagnosisCategory,
        customFields: referrals.customFields,
        status: referrals.status,
        valueEstimate: referrals.valueEstimate,
        physicianFirstName: physicians.firstName,
        physicianLastName: physicians.lastName,
        physicianCredentials: physicians.credentials,
        locationName: locations.name,
      })
      .from(referrals)
      .leftJoin(physicians, eq(referrals.physicianId, physicians.id))
      .leftJoin(locations, eq(referrals.locationId, locations.id))
      .where(where)
      .orderBy(...(() => {
        const dir = filters.sortDir === "asc" ? asc : desc;
        switch (filters.sortBy) {
          case "referralDate":
            return [dir(referrals.referralDate)];
          case "patientFullName":
            return [dir(referrals.patientFullName)];
          case "status":
            return [dir(referrals.status)];
          case "referringProviderName":
            return [dir(physicians.lastName), dir(physicians.firstName)];
          default:
            return [desc(referrals.referralDate)];
        }
      })())
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      activeCount: Number(activeCount[0]?.count || 0),
      dischargedCount: Number(dischargedCount[0]?.count || 0),
    } as any;
  }

  async createReferral(ref: InsertReferral) {
    const [created] = await db.insert(referrals).values(ref).returning();
    return created;
  }

  async updateReferral(id: string, data: Partial<InsertReferral>) {
    const [updated] = await db.update(referrals)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(referrals.id, id), isNull(referrals.deletedAt)))
      .returning();
    return updated;
  }

  async getTask(id: string) {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task;
  }

  async getTasks(physicianId?: string) {
    if (physicianId) {
      return db.select().from(tasks)
        .where(eq(tasks.physicianId, physicianId))
        .orderBy(asc(tasks.dueAt));
    }
    return db.select().from(tasks).orderBy(asc(tasks.dueAt));
  }

  async createTask(task: InsertTask) {
    const [created] = await db.insert(tasks).values(task).returning();
    return created;
  }

  async updateTask(id: string, data: Partial<InsertTask & { status: string }>) {
    const [updated] = await db.update(tasks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return updated;
  }

  async getCalendarEvents(filters?: { startDate?: string; endDate?: string; locationId?: string; physicianId?: string; practiceName?: string }) {
    const conditions = [];
    if (filters?.startDate) conditions.push(gte(calendarEvents.startAt, new Date(filters.startDate)));
    if (filters?.endDate) conditions.push(lte(calendarEvents.endAt, new Date(filters.endDate)));
    if (filters?.locationId) conditions.push(eq(calendarEvents.locationId, filters.locationId));
    if (filters?.physicianId) conditions.push(eq(calendarEvents.physicianId, filters.physicianId));
    if (filters?.practiceName) conditions.push(eq(calendarEvents.practiceName, filters.practiceName));

    if (conditions.length > 0) {
      return db.select().from(calendarEvents).where(and(...conditions)).orderBy(asc(calendarEvents.startAt));
    }
    return db.select().from(calendarEvents).orderBy(asc(calendarEvents.startAt));
  }

  async getCalendarEvent(id: string) {
    const [event] = await db.select().from(calendarEvents).where(eq(calendarEvents.id, id));
    return event;
  }

  async createCalendarEvent(event: InsertCalendarEvent) {
    const [created] = await db.insert(calendarEvents).values(event).returning();
    return created;
  }

  async updateCalendarEvent(id: string, data: Partial<InsertCalendarEvent>) {
    const [updated] = await db.update(calendarEvents)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(calendarEvents.id, id))
      .returning();
    return updated;
  }

  async deleteCalendarEvent(id: string) {
    await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
    return true;
  }

  async getAuditLogs(filters?: { userId?: string; entity?: string; action?: string; limit?: number }) {
    const conditions = [];
    if (filters?.userId) conditions.push(eq(auditLogs.userId, filters.userId));
    if (filters?.entity) conditions.push(eq(auditLogs.entity, filters.entity));
    if (filters?.action) conditions.push(eq(auditLogs.action, filters.action));

    const limit = filters?.limit || 200;

    if (conditions.length > 0) {
      return db.select().from(auditLogs).where(and(...conditions)).orderBy(desc(auditLogs.timestamp)).limit(limit);
    }
    return db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(limit);
  }

  async createAuditLog(log: Omit<AuditLog, "id" | "timestamp" | "ipAddress" | "userAgent"> & { ipAddress?: string | null; userAgent?: string | null }) {
    await db.insert(auditLogs).values(log);
  }

  async getPhysicianTiering(filters?: { period?: string; year?: number; month?: number }) {
    const period = filters?.period || "year";
    const now = new Date();
    const year = filters?.year || now.getFullYear();
    const month = filters?.month || (now.getMonth() + 1);

    let dateFrom: string;
    let dateTo: string;

    if (period === "month") {
      dateFrom = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      dateTo = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
    } else {
      dateFrom = `${year}-01-01`;
      dateTo = `${year}-12-31`;
    }

    const tierThresholds = period === "month"
      ? { A: 5, B: 2, C: 1 }
      : { A: 20, B: 5, C: 1 };

    const data = await db.select({
      id: physicians.id,
      firstName: physicians.firstName,
      lastName: physicians.lastName,
      credentials: physicians.credentials,
      specialty: physicians.specialty,
      practiceName: physicians.practiceName,
      npi: physicians.npi,
      city: physicians.city,
      state: physicians.state,
      assignedOwnerId: physicians.assignedOwnerId,
      referralCount: sql<number>`count(${referrals.id})`,
    })
      .from(physicians)
      .leftJoin(referrals, and(
        eq(referrals.physicianId, physicians.id),
        isNull(referrals.deletedAt),
        sql`${referrals.referralDate} >= ${dateFrom}`,
        sql`${referrals.referralDate} <= ${dateTo}`,
      ))
      .where(isNull(physicians.deletedAt))
      .groupBy(physicians.id)
      .orderBy(desc(sql`count(${referrals.id})`));

    const tiered = data.map(p => {
      const count = Number(p.referralCount);
      let tier: string;
      if (count >= tierThresholds.A) tier = "A";
      else if (count >= tierThresholds.B) tier = "B";
      else if (count >= tierThresholds.C) tier = "C";
      else tier = "D";
      return { ...p, referralCount: count, tier };
    });

    const summary = {
      A: tiered.filter(p => p.tier === "A").length,
      B: tiered.filter(p => p.tier === "B").length,
      C: tiered.filter(p => p.tier === "C").length,
      D: tiered.filter(p => p.tier === "D").length,
    };

    return { physicians: tiered, summary, thresholds: tierThresholds, period, dateFrom, dateTo };
  }

  async getDecliningReferrals(filters?: { months?: number; minDrop?: number }) {
    const months = filters?.months || 3;
    const minDrop = filters?.minDrop || 1;
    const now = new Date();

    const currentEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const currentStart = new Date(now);
    currentStart.setMonth(currentStart.getMonth() - months);
    const currentStartStr = `${currentStart.getFullYear()}-${String(currentStart.getMonth() + 1).padStart(2, "0")}-01`;

    const priorEnd = currentStartStr;
    const priorStart = new Date(currentStart);
    priorStart.setMonth(priorStart.getMonth() - months);
    const priorStartStr = `${priorStart.getFullYear()}-${String(priorStart.getMonth() + 1).padStart(2, "0")}-01`;

    const currentCounts = await db.select({
      physicianId: referrals.physicianId,
      count: sql<number>`count(*)`,
    }).from(referrals)
      .where(and(
        isNull(referrals.deletedAt),
        sql`${referrals.physicianId} IS NOT NULL`,
        sql`${referrals.referralDate} >= ${currentStartStr}`,
        sql`${referrals.referralDate} <= ${currentEnd}`,
      ))
      .groupBy(referrals.physicianId);

    const priorCounts = await db.select({
      physicianId: referrals.physicianId,
      count: sql<number>`count(*)`,
    }).from(referrals)
      .where(and(
        isNull(referrals.deletedAt),
        sql`${referrals.physicianId} IS NOT NULL`,
        sql`${referrals.referralDate} >= ${priorStartStr}`,
        sql`${referrals.referralDate} < ${priorEnd}`,
      ))
      .groupBy(referrals.physicianId);

    const currentMap = new Map(currentCounts.map(c => [c.physicianId, Number(c.count)]));
    const priorMap = new Map(priorCounts.map(c => [c.physicianId, Number(c.count)]));

    const allPhysicianIds = Array.from(new Set([...Array.from(currentMap.keys()), ...Array.from(priorMap.keys())]));
    const declining: { physicianId: string; currentCount: number; priorCount: number; change: number; changePercent: number }[] = [];

    for (let i = 0; i < allPhysicianIds.length; i++) {
      const id = allPhysicianIds[i];
      if (!id) continue;
      const current = currentMap.get(id) || 0;
      const prior = priorMap.get(id) || 0;
      const change = current - prior;
      if (change < 0 && Math.abs(change) >= minDrop) {
        const changePercent = prior > 0 ? Math.round((change / prior) * 100) : -100;
        declining.push({ physicianId: id, currentCount: current, priorCount: prior, change, changePercent });
      }
    }

    declining.sort((a, b) => a.change - b.change);

    const physicianIds = declining.map(d => d.physicianId).filter(Boolean);
    let physicianDetails: any[] = [];
    if (physicianIds.length > 0) {
      physicianDetails = await db.select({
        id: physicians.id,
        firstName: physicians.firstName,
        lastName: physicians.lastName,
        credentials: physicians.credentials,
        specialty: physicians.specialty,
        practiceName: physicians.practiceName,
        npi: physicians.npi,
        city: physicians.city,
        state: physicians.state,
        assignedOwnerId: physicians.assignedOwnerId,
      }).from(physicians)
        .where(and(isNull(physicians.deletedAt), sql`${physicians.id} IN (${sql.join(physicianIds.map(id => sql`${id}`), sql`, `)})`));
    }

    const physMap = new Map(physicianDetails.map(p => [p.id, p]));

    const result = declining.map(d => ({
      ...d,
      physician: physMap.get(d.physicianId) || null,
    })).filter(d => d.physician !== null);

    return {
      data: result,
      period: { currentStart: currentStartStr, currentEnd, priorStart: priorStartStr, priorEnd, months },
      total: result.length,
    };
  }

  async exportPhysiciansCsv(filters: PhysicianFilters) {
    const conditions: any[] = [isNull(physicians.deletedAt)];
    if (filters.status && filters.status !== "all") conditions.push(eq(physicians.status, filters.status as any));
    if (filters.stage && filters.stage !== "all") conditions.push(eq(physicians.relationshipStage, filters.stage as any));
    if (filters.priority && filters.priority !== "all") conditions.push(eq(physicians.priority, filters.priority as any));
    if (filters.practiceName) conditions.push(eq(physicians.practiceName, filters.practiceName));
    if (filters.search) {
      const term = `%${filters.search}%`;
      conditions.push(or(
        ilike(physicians.firstName, term),
        ilike(physicians.lastName, term),
        ilike(sql`coalesce(${physicians.practiceName}, '')`, term),
        ilike(sql`coalesce(${physicians.npi}, '')`, term),
        ilike(sql`coalesce(${physicians.city}, '')`, term),
      ));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    return db.select({
      firstName: physicians.firstName,
      lastName: physicians.lastName,
      credentials: physicians.credentials,
      specialty: physicians.specialty,
      npi: physicians.npi,
      practiceName: physicians.practiceName,
      address: physicians.primaryOfficeAddress,
      city: physicians.city,
      state: physicians.state,
      zip: physicians.zip,
      phone: physicians.phone,
      fax: physicians.fax,
      email: physicians.email,
      status: physicians.status,
      relationshipStage: physicians.relationshipStage,
      priority: physicians.priority,
      referralCount: sql<number>`count(${referrals.id})`,
    })
      .from(physicians)
      .leftJoin(referrals, and(eq(referrals.physicianId, physicians.id), isNull(referrals.deletedAt)))
      .where(where)
      .groupBy(physicians.id)
      .orderBy(asc(physicians.lastName), asc(physicians.firstName));
  }

  async exportReferralsCsv(filters: ReferralFilters) {
    const conditions: any[] = [isNull(referrals.deletedAt)];
    if (filters.status && filters.status !== "all") conditions.push(eq(referrals.status, filters.status as any));
    if (filters.locationId && filters.locationId !== "all") conditions.push(eq(referrals.locationId, filters.locationId));
    if (filters.discipline && filters.discipline !== "all") conditions.push(eq(referrals.discipline, filters.discipline));
    if (filters.physicianId) conditions.push(eq(referrals.physicianId, filters.physicianId));
    if (filters.dateFrom) conditions.push(sql`${referrals.referralDate} >= ${filters.dateFrom}`);
    if (filters.dateTo) conditions.push(sql`${referrals.referralDate} <= ${filters.dateTo}`);
    if (filters.search) {
      const term = `%${filters.search}%`;
      conditions.push(or(
        ilike(sql`coalesce(${referrals.patientFullName}, '')`, term),
        ilike(sql`coalesce(${referrals.patientAccountNumber}, '')`, term),
        ilike(sql`coalesce(${referrals.caseTherapist}, '')`, term),
      ));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    return db.select({
      referralDate: referrals.referralDate,
      patientFullName: referrals.patientFullName,
      patientAccountNumber: referrals.patientAccountNumber,
      caseTitle: referrals.caseTitle,
      caseTherapist: referrals.caseTherapist,
      discipline: referrals.discipline,
      status: referrals.status,
      primaryInsurance: referrals.primaryInsurance,
      scheduledVisits: referrals.scheduledVisits,
      arrivedVisits: referrals.arrivedVisits,
      dateOfInitialEval: referrals.dateOfInitialEval,
      dischargeDate: referrals.dischargeDate,
      dischargeReason: referrals.dischargeReason,
      referralSource: referrals.referralSource,
      physicianFirstName: physicians.firstName,
      physicianLastName: physicians.lastName,
      locationName: locations.name,
    })
      .from(referrals)
      .leftJoin(physicians, eq(referrals.physicianId, physicians.id))
      .leftJoin(locations, eq(referrals.locationId, locations.id))
      .where(where)
      .orderBy(desc(referrals.referralDate));
  }

  async exportInteractionsCsv(filters?: { physicianId?: string; type?: string; dateFrom?: string; dateTo?: string }) {
    const conditions: any[] = [isNull(interactions.deletedAt)];
    if (filters?.physicianId) conditions.push(eq(interactions.physicianId, filters.physicianId));
    if (filters?.type && filters.type !== "all") conditions.push(eq(interactions.type, filters.type as any));
    if (filters?.dateFrom) conditions.push(gte(interactions.occurredAt, new Date(filters.dateFrom)));
    if (filters?.dateTo) conditions.push(lte(interactions.occurredAt, new Date(filters.dateTo)));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    return db.select({
      occurredAt: interactions.occurredAt,
      type: interactions.type,
      summary: interactions.summary,
      nextStep: interactions.nextStep,
      physicianFirstName: physicians.firstName,
      physicianLastName: physicians.lastName,
      userName: users.name,
      locationName: locations.name,
    })
      .from(interactions)
      .leftJoin(physicians, eq(interactions.physicianId, physicians.id))
      .leftJoin(users, eq(interactions.userId, users.id))
      .leftJoin(locations, eq(interactions.locationId, locations.id))
      .where(where)
      .orderBy(desc(interactions.occurredAt));
  }

  async exportTasksCsv(filters?: { status?: string; assignedToUserId?: string }) {
    const conditions: any[] = [];
    if (filters?.status && filters.status !== "all") conditions.push(eq(tasks.status, filters.status as any));
    if (filters?.assignedToUserId && filters.assignedToUserId !== "all") conditions.push(eq(tasks.assignedToUserId, filters.assignedToUserId));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    return db.select({
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueAt,
      assignedTo: users.name,
      physicianFirstName: physicians.firstName,
      physicianLastName: physicians.lastName,
    })
      .from(tasks)
      .leftJoin(users, eq(tasks.assignedToUserId, users.id))
      .leftJoin(physicians, eq(tasks.physicianId, physicians.id))
      .where(where)
      .orderBy(desc(tasks.dueAt));
  }

  async exportAuditLogsCsv(filters?: { entity?: string; action?: string }) {
    const conditions: any[] = [];
    if (filters?.entity && filters.entity !== "all") conditions.push(eq(auditLogs.entity, filters.entity));
    if (filters?.action && filters.action !== "all") conditions.push(eq(auditLogs.action, filters.action));
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    return db.select({
      timestamp: auditLogs.timestamp,
      userName: users.name,
      action: auditLogs.action,
      entity: auditLogs.entity,
      entityId: auditLogs.entityId,
      ipAddress: auditLogs.ipAddress,
      detailJson: auditLogs.detailJson,
    })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.userId, users.id))
      .where(where)
      .orderBy(desc(auditLogs.timestamp))
      .limit(5000);
  }

  async getMarketers() {
    return db.select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users)
      .where(or(eq(users.role, "MARKETER"), eq(users.role, "DIRECTOR"), eq(users.role, "OWNER")))
      .orderBy(asc(users.name));
  }

  async getMarketerTerritories() {
    const assigned = await db.select({
      marketerId: physicians.assignedOwnerId,
      count: sql<number>`count(*)`,
    })
      .from(physicians)
      .where(and(isNull(physicians.deletedAt), sql`${physicians.assignedOwnerId} IS NOT NULL`))
      .groupBy(physicians.assignedOwnerId);

    const [unassigned] = await db.select({ count: sql<number>`count(*)` })
      .from(physicians)
      .where(and(isNull(physicians.deletedAt), sql`${physicians.assignedOwnerId} IS NULL`));

    const marketers = await this.getMarketers();
    const assignedMap = new Map(assigned.map(a => [a.marketerId, Number(a.count)]));

    const territories = marketers.map(m => ({
      marketer: m,
      assignedCount: assignedMap.get(m.id) || 0,
    }));

    return { territories, unassignedCount: Number(unassigned?.count || 0), totalPhysicians: await db.select({ count: sql<number>`count(*)` }).from(physicians).where(isNull(physicians.deletedAt)).then(r => Number(r[0]?.count || 0)) };
  }

  async assignPhysicianToMarketer(physicianId: string, marketerId: string | null) {
    const [updated] = await db.update(physicians)
      .set({ assignedOwnerId: marketerId, updatedAt: new Date() })
      .where(eq(physicians.id, physicianId))
      .returning();
    return updated;
  }

  async bulkAssignPhysiciansToMarketer(physicianIds: string[], marketerId: string | null) {
    if (physicianIds.length === 0) return 0;
    const result = await db.update(physicians)
      .set({ assignedOwnerId: marketerId, updatedAt: new Date() })
      .where(sql`${physicians.id} IN (${sql.join(physicianIds.map(id => sql`${id}`), sql`, `)})`);
    return physicianIds.length;
  }

  async bulkUpdatePhysicianStatus(physicianIds: string[], status: string) {
    if (physicianIds.length === 0) return 0;
    await db.update(physicians)
      .set({ status: status as any, updatedAt: new Date() })
      .where(sql`${physicians.id} IN (${sql.join(physicianIds.map(id => sql`${id}`), sql`, `)})`);
    return physicianIds.length;
  }

  async getDashboardStats(filters?: { startDate?: string; endDate?: string; locationId?: string; territoryId?: string; physicianId?: string }) {
    const refConditions = [];
    const interConditions = [];
    const physConditions = [];

    if (filters?.startDate) {
      refConditions.push(gte(referrals.referralDate, filters.startDate));
      interConditions.push(gte(interactions.occurredAt, new Date(filters.startDate)));
    }
    if (filters?.endDate) {
      refConditions.push(lte(referrals.referralDate, filters.endDate));
      interConditions.push(lte(interactions.occurredAt, new Date(filters.endDate)));
    }
    if (filters?.locationId) {
      refConditions.push(eq(referrals.locationId, filters.locationId));
      interConditions.push(eq(interactions.locationId, filters.locationId));
    }
    if (filters?.territoryId) {
      physConditions.push(eq(physicians.territoryId, filters.territoryId));
      const territoryPhysSubquery = sql`${referrals.physicianId} IN (SELECT id FROM physicians WHERE territory_id = ${filters.territoryId} AND deleted_at IS NULL)`;
      const territoryInterSubquery = sql`${interactions.physicianId} IN (SELECT id FROM physicians WHERE territory_id = ${filters.territoryId} AND deleted_at IS NULL)`;
      refConditions.push(territoryPhysSubquery);
      interConditions.push(territoryInterSubquery);
    }
    if (filters?.physicianId) {
      refConditions.push(eq(referrals.physicianId, filters.physicianId));
      interConditions.push(eq(interactions.physicianId, filters.physicianId));
      physConditions.push(eq(physicians.id, filters.physicianId));
    }

    refConditions.push(isNull(referrals.deletedAt));
    interConditions.push(isNull(interactions.deletedAt));

    const [refCountResult] = await db.select({ count: sql<number>`count(*)` }).from(referrals)
      .where(and(...refConditions));

    const [interCountResult] = await db.select({ count: sql<number>`count(*)` }).from(interactions)
      .where(and(...interConditions));

    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const ninetyDaysAgoStr = ninetyDaysAgo.toISOString().slice(0, 10);

    const activePhysConditions = [
      isNull(referrals.deletedAt),
      isNotNull(referrals.physicianId),
      gte(referrals.referralDate, ninetyDaysAgoStr),
    ];
    if (filters?.locationId) activePhysConditions.push(eq(referrals.locationId, filters.locationId));
    if (filters?.territoryId) activePhysConditions.push(sql`${referrals.physicianId} IN (SELECT id FROM physicians WHERE territory_id = ${filters.territoryId} AND deleted_at IS NULL)`);
    if (filters?.physicianId) activePhysConditions.push(eq(referrals.physicianId, filters.physicianId));

    const [activePhysicians] = await db.select({
      count: sql<number>`count(DISTINCT ${referrals.physicianId})`,
    }).from(referrals).where(and(...activePhysConditions));

    const atRiskPhysicians = await db.select({ count: sql<number>`count(*)` }).from(physicians)
      .where(physConditions.length > 0
        ? and(isNull(physicians.deletedAt), eq(physicians.relationshipStage, "AT_RISK"), ...physConditions)
        : and(isNull(physicians.deletedAt), eq(physicians.relationshipStage, "AT_RISK")));

    const refByMonth = await db.select({
      month: sql<string>`to_char(referral_date::date, 'YYYY-MM')`,
      count: sql<number>`count(*)`,
    }).from(referrals)
      .where(and(...refConditions))
      .groupBy(sql`to_char(referral_date::date, 'YYYY-MM')`)
      .orderBy(sql`to_char(referral_date::date, 'YYYY-MM')`);

    const topReferrers = await db.select({
      physicianId: referrals.physicianId,
      count: sql<number>`count(*)`,
    }).from(referrals)
      .where(and(...refConditions))
      .groupBy(referrals.physicianId)
      .orderBy(desc(sql`count(*)`))
      .limit(5);

    const openTasks = await db.select({ count: sql<number>`count(*)` }).from(tasks)
      .where(eq(tasks.status, "OPEN"));

    const [conversionResult] = await db.select({
      totalReceived: sql<number>`count(*)`,
      totalArrived: sql<number>`count(*) FILTER (WHERE ${referrals.arrivedVisits} > 0)`,
    }).from(referrals).where(and(...refConditions));

    const [avgTimeResult] = await db.select({
      avgDays: sql<number>`avg(
        CASE WHEN ${referrals.dateOfFirstArrivedVisit} IS NOT NULL AND ${referrals.referralDate} IS NOT NULL
        THEN (${referrals.dateOfFirstArrivedVisit}::date - ${referrals.referralDate}::date)
        ELSE NULL END
      )`,
    }).from(referrals).where(and(...refConditions));

    const now = new Date();
    const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const prevMonthDate = new Date(now);
    prevMonthDate.setMonth(prevMonthDate.getMonth() - 1);
    const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`;

    const momData = refByMonth.map(r => ({ month: r.month, count: Number(r.count) }));
    const curMonthCount = momData.find(d => d.month === currentMonthStr)?.count || 0;
    const prevMonthCount = momData.find(d => d.month === prevMonthStr)?.count || 0;
    const momGrowth = prevMonthCount > 0 ? ((curMonthCount - prevMonthCount) / prevMonthCount * 100) : (curMonthCount > 0 ? 100 : 0);

    const totalReceived = Number(conversionResult?.totalReceived || 0);
    const totalArrived = Number(conversionResult?.totalArrived || 0);
    const conversionRate = totalReceived > 0 ? Math.round((totalArrived / totalReceived) * 100) : 0;
    const avgTimeToFirstVisit = avgTimeResult?.avgDays != null ? Math.round(Number(avgTimeResult.avgDays)) : null;

    return {
      totalReferrals: Number(refCountResult?.count || 0),
      totalInteractions: Number(interCountResult?.count || 0),
      activePhysicians: Number(activePhysicians?.count || 0),
      atRiskPhysicians: Number(atRiskPhysicians[0]?.count || 0),
      openTasks: Number(openTasks[0]?.count || 0),
      referralsByMonth: momData,
      topReferrers,
      conversionRate,
      avgTimeToFirstVisit,
      momGrowth: Math.round(momGrowth),
    };
  }

  async findPhysicianByNameAndNpi(firstName: string, lastName: string, npi?: string | null): Promise<Physician | undefined> {
    const conditions: any[] = [
      isNull(physicians.deletedAt),
      ilike(physicians.firstName, firstName.trim()),
      ilike(physicians.lastName, lastName.trim()),
    ];
    if (npi) {
      conditions.push(eq(physicians.npi, npi.trim()));
    }
    const [found] = await db.select().from(physicians).where(and(...conditions)).limit(1);
    return found;
  }

  async fuzzyFindPhysicians(lastName: string, firstName?: string): Promise<Physician[]> {
    const conditions: any[] = [
      isNull(physicians.deletedAt),
      ilike(physicians.lastName, `%${lastName.trim()}%`),
    ];
    if (firstName && firstName.trim().length > 1) {
      conditions.push(ilike(physicians.firstName, `${firstName.trim().charAt(0)}%`));
    }
    return db.select().from(physicians).where(and(...conditions)).limit(5);
  }

  async getSuggestedPhysicianMatches(referralId: string): Promise<Physician[]> {
    const [ref] = await db.select().from(referrals).where(eq(referrals.id, referralId));
    if (!ref?.referringProviderName) return [];
    const name = ref.referringProviderName.replace(/^(Dr\.?\s*)/i, "").trim();
    const parts = name.split(/\s+/);
    if (parts.length < 2) {
      return db.select().from(physicians)
        .where(and(isNull(physicians.deletedAt), ilike(physicians.lastName, `%${parts[0]}%`)))
        .limit(5);
    }
    const lastName = parts.slice(1).join(" ").replace(/,?\s*(MD|DO|PT|DPT|OT|DC|DDS|DMD|PhD|NP|PA|PA-C)\.?$/i, "").trim();
    const firstName = parts[0];
    return this.fuzzyFindPhysicians(lastName, firstName);
  }

  async findLocationByName(name: string): Promise<Location | undefined> {
    const [found] = await db.select().from(locations).where(ilike(locations.name, `%${name.trim()}%`)).limit(1);
    return found;
  }

  async bulkUpsertPhysicians(rows: InsertPhysician[]): Promise<{ inserted: number; updated: number; errors: string[] }> {
    let inserted = 0, updated = 0;
    const errors: string[] = [];

    const allExisting = await db.select().from(physicians).where(isNull(physicians.deletedAt));

    const npiMap = new Map<string, Physician>();
    const nameMap = new Map<string, Physician[]>();
    for (const p of allExisting) {
      if (p.npi) {
        npiMap.set(p.npi.trim().toLowerCase(), p);
      }
      const nameKey = `${p.firstName.trim().toLowerCase()}|${p.lastName.trim().toLowerCase()}`;
      const list = nameMap.get(nameKey) || [];
      list.push(p);
      nameMap.set(nameKey, list);
    }

    const findMatch = (firstName: string, lastName: string, npi?: string | null): Physician | undefined => {
      const fnLower = firstName.trim().toLowerCase();
      const lnLower = lastName.trim().toLowerCase();
      if (npi) {
        const npiKey = npi.trim().toLowerCase();
        const byNpi = npiMap.get(npiKey);
        if (byNpi && byNpi.firstName.trim().toLowerCase() === fnLower && byNpi.lastName.trim().toLowerCase() === lnLower) {
          return byNpi;
        }
      }
      const nameKey = `${fnLower}|${lnLower}`;
      const candidates = nameMap.get(nameKey);
      if (candidates) {
        if (npi) {
          const withNpi = candidates.find(c => c.npi && c.npi.trim().toLowerCase() === npi.trim().toLowerCase());
          if (withNpi) return withNpi;
        }
        const withoutNpiFilter = candidates.find(c => !npi || !c.npi);
        return withoutNpiFilter || candidates[0];
      }
      return undefined;
    };

    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i];
        const existing = findMatch(row.firstName, row.lastName, row.npi);
        if (existing) {
          const updateData: any = {};
          if (row.credentials && !existing.credentials) updateData.credentials = row.credentials;
          if (row.npi && !existing.npi) updateData.npi = row.npi;
          if (row.practiceName && !existing.practiceName) updateData.practiceName = row.practiceName;
          if (row.primaryOfficeAddress && !existing.primaryOfficeAddress) updateData.primaryOfficeAddress = row.primaryOfficeAddress;
          if (row.city && !existing.city) updateData.city = row.city;
          if (row.state && !existing.state) updateData.state = row.state;
          if (row.zip && !existing.zip) updateData.zip = row.zip;
          if (row.phone && !existing.phone) updateData.phone = row.phone;
          if (row.fax && !existing.fax) updateData.fax = row.fax;
          if (row.email && !existing.email) updateData.email = row.email;
          if (row.specialty && !existing.specialty) updateData.specialty = row.specialty;
          if (row.customFields) {
            updateData.customFields = existing.customFields
              ? { ...existing.customFields, ...row.customFields }
              : row.customFields;
          }
          if (Object.keys(updateData).length > 0) {
            await db.update(physicians).set({ ...updateData, updatedAt: new Date() }).where(eq(physicians.id, existing.id));
            updated++;
          }
        } else {
          await db.insert(physicians).values(row);
          inserted++;
        }
      } catch (e: any) {
        errors.push(`Row ${i + 1}: ${e.message}`);
      }
    }
    return { inserted, updated, errors };
  }

  async bulkUpsertReferrals(rows: InsertReferral[]): Promise<{ inserted: number; updated: number; errors: string[] }> {
    let inserted = 0, updated = 0;
    const errors: string[] = [];

    const accountNumbers = rows
      .map(r => r.patientAccountNumber)
      .filter((v): v is string => !!v);

    let existingReferrals: Referral[] = [];
    if (accountNumbers.length > 0) {
      const uniqueAccounts = Array.from(new Set(accountNumbers));
      const batchSize = 500;
      for (let b = 0; b < uniqueAccounts.length; b += batchSize) {
        const batch = uniqueAccounts.slice(b, b + batchSize);
        const results = await db.select().from(referrals)
          .where(inArray(referrals.patientAccountNumber, batch));
        existingReferrals.push(...results);
      }
    }

    const referralMap = new Map<string, Referral[]>();
    for (const ref of existingReferrals) {
      if (ref.patientAccountNumber) {
        const key = ref.patientAccountNumber;
        const list = referralMap.get(key) || [];
        list.push(ref);
        referralMap.set(key, list);
      }
    }

    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i];
        if (row.patientAccountNumber) {
          const candidates = referralMap.get(row.patientAccountNumber);
          if (candidates) {
            let existing: Referral | undefined;
            if (row.caseTitle) {
              existing = candidates.find(c => c.caseTitle === row.caseTitle);
            } else {
              existing = candidates[0];
            }
            if (existing) {
              const updateData: any = { ...row };
              delete updateData.id;
              await db.update(referrals).set({ ...updateData, updatedAt: new Date() }).where(eq(referrals.id, existing.id));
              updated++;
              continue;
            }
          }
        }
        await db.insert(referrals).values(row);
        inserted++;
      } catch (e: any) {
        errors.push(`Row ${i + 1}: ${e.message}`);
      }
    }
    return { inserted, updated, errors };
  }
  async bulkDeleteReferrals(ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const result = await db.update(referrals)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(inArray(referrals.id, ids), isNull(referrals.deletedAt)));
    return result.rowCount ?? 0;
  }

  async softDeletePhysician(id: string): Promise<boolean> {
    const result = await db.update(physicians)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(physicians.id, id), isNull(physicians.deletedAt)));
    return (result.rowCount ?? 0) > 0;
  }

  async restorePhysician(id: string): Promise<boolean> {
    const result = await db.update(physicians)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(physicians.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async softDeleteReferral(id: string): Promise<boolean> {
    const result = await db.update(referrals)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(referrals.id, id), isNull(referrals.deletedAt)));
    return (result.rowCount ?? 0) > 0;
  }

  async restoreReferral(id: string): Promise<boolean> {
    const result = await db.update(referrals)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(referrals.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async softDeleteAllReferrals(): Promise<number> {
    const result = await db.update(referrals)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(isNull(referrals.deletedAt));
    return result.rowCount ?? 0;
  }

  async restoreAllReferrals(): Promise<number> {
    const result = await db.update(referrals)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(isNotNull(referrals.deletedAt));
    return result.rowCount ?? 0;
  }

  async softDeleteInteraction(id: string): Promise<boolean> {
    const result = await db.update(interactions)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(interactions.id, id), isNull(interactions.deletedAt)));
    return (result.rowCount ?? 0) > 0;
  }

  async getInteractionsPaginated(filters: InteractionFilters): Promise<PaginatedResult<any>> {
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 50;
    const conditions: any[] = [];

    if (!filters.includeDeleted) conditions.push(isNull(interactions.deletedAt));
    if (filters.type && filters.type !== "all") conditions.push(eq(interactions.type, filters.type as any));
    if (filters.locationIds && filters.locationIds.length > 0) {
      conditions.push(inArray(interactions.locationId, filters.locationIds));
    } else if (filters.locationId && filters.locationId !== "all") {
      conditions.push(eq(interactions.locationId, filters.locationId));
    }
    if (filters.physicianId) conditions.push(eq(interactions.physicianId, filters.physicianId));
    if (filters.dateFrom) conditions.push(gte(interactions.occurredAt, new Date(filters.dateFrom)));
    if (filters.dateTo) {
      const endDate = new Date(filters.dateTo);
      endDate.setHours(23, 59, 59, 999);
      conditions.push(lte(interactions.occurredAt, endDate));
    }
    if (filters.search) {
      const term = `%${filters.search}%`;
      conditions.push(or(
        ilike(interactions.summary, term),
        ilike(sql`coalesce(${interactions.nextStep}, '')`, term),
        ilike(sql`coalesce(${physicians.firstName} || ' ' || ${physicians.lastName}, '')`, term),
      ));
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(interactions)
      .leftJoin(physicians, eq(interactions.physicianId, physicians.id))
      .where(where);
    const total = Number(countResult?.count || 0);

    const data = await db
      .select({
        id: interactions.id,
        physicianId: interactions.physicianId,
        locationId: interactions.locationId,
        userId: interactions.userId,
        type: interactions.type,
        occurredAt: interactions.occurredAt,
        summary: interactions.summary,
        nextStep: interactions.nextStep,
        followUpDueAt: interactions.followUpDueAt,
        deletedAt: interactions.deletedAt,
        createdAt: interactions.createdAt,
        updatedAt: interactions.updatedAt,
        physicianFirstName: physicians.firstName,
        physicianLastName: physicians.lastName,
      })
      .from(interactions)
      .leftJoin(physicians, eq(interactions.physicianId, physicians.id))
      .where(where)
      .orderBy(desc(interactions.occurredAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async updateInteraction(id: string, data: Partial<InsertInteraction>): Promise<Interaction | undefined> {
    const [updated] = await db.update(interactions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(interactions.id, id))
      .returning();
    return updated;
  }

  async restoreInteraction(id: string): Promise<boolean> {
    const result = await db.update(interactions)
      .set({ deletedAt: null, updatedAt: new Date() })
      .where(eq(interactions.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getTerritories() {
    return db.select().from(territories).orderBy(asc(territories.name));
  }

  async getTerritory(id: string) {
    const [t] = await db.select().from(territories).where(eq(territories.id, id));
    return t;
  }

  async createTerritory(territory: InsertTerritory) {
    const [created] = await db.insert(territories).values(territory).returning();
    return created;
  }

  async updateTerritory(id: string, data: Partial<InsertTerritory>) {
    const [updated] = await db.update(territories).set({ ...data, updatedAt: new Date() }).where(eq(territories.id, id)).returning();
    return updated;
  }

  async deleteTerritory(id: string) {
    const result = await db.delete(territories).where(eq(territories.id, id));
    return true;
  }

  async getCollections(filters?: { physicianId?: string; locationId?: string; locationIds?: string[]; dateFrom?: string; dateTo?: string }) {
    const conditions = [];
    if (filters?.physicianId) conditions.push(eq(collections.physicianId, filters.physicianId));
    if (filters?.locationId) conditions.push(eq(collections.locationId, filters.locationId));
    // Server-side scope: restrict to user's allowed locations (non-admin)
    if (filters?.locationIds && filters.locationIds.length > 0) conditions.push(inArray(collections.locationId, filters.locationIds));
    if (filters?.dateFrom) conditions.push(gte(collections.collectionDate, filters.dateFrom));
    if (filters?.dateTo) conditions.push(lte(collections.collectionDate, filters.dateTo));
    if (conditions.length > 0) {
      return db.select().from(collections).where(and(...conditions)).orderBy(desc(collections.collectionDate));
    }
    return db.select().from(collections).orderBy(desc(collections.collectionDate));
  }

  async createCollection(col: InsertCollection) {
    const [created] = await db.insert(collections).values(col).returning();
    return created;
  }

  async getTieringWeights() {
    const [w] = await db.select().from(tieringWeights);
    return w;
  }

  async updateTieringWeights(data: Partial<TieringWeights>) {
    const existing = await this.getTieringWeights();
    if (!existing) return undefined;
    const [updated] = await db.update(tieringWeights).set({ ...data, updatedAt: new Date() }).where(eq(tieringWeights.id, existing.id)).returning();
    return updated;
  }

  async getPhysicianMonthlySummaries(filters?: { physicianId?: string; month?: string; months?: number }) {
    const conditions = [];
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

  async getTerritoryMonthlySummaries(filters?: { territoryId?: string; month?: string }) {
    const conditions = [];
    if (filters?.territoryId) conditions.push(eq(territoryMonthlySummary.territoryId, filters.territoryId));
    if (filters?.month) conditions.push(eq(territoryMonthlySummary.month, filters.month));
    if (conditions.length > 0) {
      return db.select().from(territoryMonthlySummary).where(and(...conditions)).orderBy(desc(territoryMonthlySummary.month));
    }
    return db.select().from(territoryMonthlySummary).orderBy(desc(territoryMonthlySummary.month));
  }

  async getLocationMonthlySummaries(filters?: { locationId?: string; month?: string }) {
    const conditions = [];
    if (filters?.locationId) conditions.push(eq(locationMonthlySummary.locationId, filters.locationId));
    if (filters?.month) conditions.push(eq(locationMonthlySummary.month, filters.month));
    if (conditions.length > 0) {
      return db.select().from(locationMonthlySummary).where(and(...conditions)).orderBy(desc(locationMonthlySummary.month));
    }
    return db.select().from(locationMonthlySummary).orderBy(desc(locationMonthlySummary.month));
  }

  async getIntegrationConfigs() {
    return db.select().from(integrationConfigs).orderBy(asc(integrationConfigs.name));
  }

  async getIntegrationConfig(id: string) {
    const [config] = await db.select().from(integrationConfigs).where(eq(integrationConfigs.id, id));
    return config;
  }

  async getIntegrationConfigByType(type: string) {
    const [config] = await db.select().from(integrationConfigs).where(eq(integrationConfigs.type, type as any));
    return config;
  }

  async createIntegrationConfig(config: InsertIntegrationConfig) {
    const [created] = await db.insert(integrationConfigs).values(config).returning();
    return created;
  }

  async updateIntegrationConfig(id: string, data: Partial<InsertIntegrationConfig>) {
    const [updated] = await db.update(integrationConfigs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(integrationConfigs.id, id)).returning();
    return updated;
  }

  async deleteIntegrationConfig(id: string) {
    const result = await db.delete(integrationConfigs).where(eq(integrationConfigs.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getApiKeys() {
    return db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt));
  }

  async getApiKeyById(id: string) {
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
    return key;
  }

  async createApiKey(key: InsertApiKey) {
    const [created] = await db.insert(apiKeys).values({
      ...key,
      scopes: key.scopes ? [...key.scopes] : null,
    } as any).returning();
    return created;
  }

  async getApiKeyByHash(keyHash: string) {
    const [key] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash));
    return key;
  }

  async updateApiKeyLastUsed(id: string) {
    await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
  }

  async deactivateApiKey(id: string) {
    const result = await db.update(apiKeys).set({ isActive: false }).where(eq(apiKeys.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getIntegrationSyncLogs(integrationId?: string, limit = 50) {
    if (integrationId) {
      return db.select().from(integrationSyncLogs)
        .where(eq(integrationSyncLogs.integrationId, integrationId))
        .orderBy(desc(integrationSyncLogs.startedAt))
        .limit(limit);
    }
    return db.select().from(integrationSyncLogs).orderBy(desc(integrationSyncLogs.startedAt)).limit(limit);
  }

  async createIntegrationSyncLog(log: InsertIntegrationSyncLog) {
    const [created] = await db.insert(integrationSyncLogs).values(log).returning();
    return created;
  }

  async updateIntegrationSyncLog(id: string, data: Partial<IntegrationSyncLog>) {
    const [updated] = await db.update(integrationSyncLogs)
      .set(data)
      .where(eq(integrationSyncLogs.id, id)).returning();
    return updated;
  }

  async getPhysicianComments(physicianId: string) {
    return db.select().from(physicianComments)
      .where(eq(physicianComments.physicianId, physicianId))
      .orderBy(desc(physicianComments.createdAt));
  }

  async createPhysicianComment(comment: InsertPhysicianComment) {
    const [created] = await db.insert(physicianComments).values(comment).returning();
    return created;
  }

  async updatePhysicianComment(id: string, content: string) {
    const [updated] = await db.update(physicianComments)
      .set({ content, updatedAt: new Date() })
      .where(eq(physicianComments.id, id)).returning();
    return updated;
  }

  async deletePhysicianComment(id: string) {
    const result = await db.delete(physicianComments).where(eq(physicianComments.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  async getScheduledReports() {
    return db.select().from(scheduledReports).orderBy(desc(scheduledReports.createdAt));
  }

  async getScheduledReport(id: string) {
    const [report] = await db.select().from(scheduledReports).where(eq(scheduledReports.id, id));
    return report;
  }

  async createScheduledReport(report: InsertScheduledReport) {
    const [created] = await db.insert(scheduledReports).values(report).returning();
    return created;
  }

  async updateScheduledReport(id: string, data: Partial<InsertScheduledReport>) {
    const [updated] = await db.update(scheduledReports)
      .set(data)
      .where(eq(scheduledReports.id, id))
      .returning();
    return updated;
  }

  async deleteScheduledReport(id: string) {
    await db.delete(scheduledReports).where(eq(scheduledReports.id, id));
  }

  async getPhysicianFavorites(userId: string): Promise<string[]> {
    const rows = await db.select({ physicianId: physicianFavorites.physicianId })
      .from(physicianFavorites)
      .where(eq(physicianFavorites.userId, userId));
    return rows.map(r => r.physicianId);
  }

  async addPhysicianFavorite(userId: string, physicianId: string): Promise<void> {
    await db.insert(physicianFavorites).values({ userId, physicianId }).onConflictDoNothing();
  }

  async removePhysicianFavorite(userId: string, physicianId: string): Promise<void> {
    await db.delete(physicianFavorites).where(
      and(eq(physicianFavorites.userId, userId), eq(physicianFavorites.physicianId, physicianId))
    );
  }

  async globalSearch(query: string, limit: number = 10): Promise<{ physicians: any[]; referrals: any[]; }> {
    const searchPattern = `%${query}%`;
    const physicianResults = await db.select({
      id: physicians.id,
      firstName: physicians.firstName,
      lastName: physicians.lastName,
      npi: physicians.npi,
      practiceName: physicians.practiceName,
      specialty: physicians.specialty,
      credentials: physicians.credentials,
    }).from(physicians)
      .where(and(
        isNull(physicians.deletedAt),
        or(
          ilike(physicians.firstName, searchPattern),
          ilike(physicians.lastName, searchPattern),
          ilike(physicians.npi, searchPattern),
          ilike(physicians.practiceName, searchPattern),
          sql`CONCAT(${physicians.firstName}, ' ', ${physicians.lastName}) ILIKE ${searchPattern}`
        )
      ))
      .limit(limit);

    const referralResults = await db.select({
      id: referrals.id,
      patientFullName: referrals.patientFullName,
      patientAccountNumber: referrals.patientAccountNumber,
      referralDate: referrals.referralDate,
      referringProviderName: referrals.referringProviderName,
      locationId: referrals.locationId,
      status: referrals.status,
    }).from(referrals)
      .where(and(
        isNull(referrals.deletedAt),
        or(
          ilike(referrals.patientFullName, searchPattern),
          ilike(referrals.patientAccountNumber, searchPattern),
          ilike(referrals.referringProviderName, searchPattern)
        )
      ))
      .limit(limit);

    return { physicians: physicianResults, referrals: referralResults };
  }

  async getUnlinkedReferrals(page: number = 1, pageSize: number = 50): Promise<PaginatedResult<any>> {
    const offset = (page - 1) * pageSize;
    const countResult = await db.select({ count: sql<number>`count(*)` }).from(referrals)
      .where(and(isNull(referrals.physicianId), isNull(referrals.deletedAt)));
    const total = Number(countResult[0].count);
    const data = await db.select().from(referrals)
      .where(and(isNull(referrals.physicianId), isNull(referrals.deletedAt)))
      .orderBy(desc(referrals.referralDate))
      .limit(pageSize).offset(offset);
    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async linkReferralToPhysician(referralId: string, physicianId: string): Promise<Referral | undefined> {
    const physician = await this.getPhysician(physicianId);
    if (!physician) return undefined;
    const [updated] = await db.update(referrals).set({
      physicianId,
      referringProviderName: `${physician.lastName}, ${physician.firstName}`,
      referringProviderNpi: physician.npi,
      updatedAt: new Date(),
    }).where(eq(referrals.id, referralId)).returning();
    return updated;
  }

  async bulkLinkReferralsByProviderName(providerName: string, physicianId: string, excludeId: string): Promise<number> {
    const physician = await this.getPhysician(physicianId);
    if (!physician) return 0;
    const result = await db.update(referrals).set({
      physicianId,
      referringProviderName: `${physician.lastName}, ${physician.firstName}`,
      referringProviderNpi: physician.npi,
      updatedAt: new Date(),
    }).where(and(
      isNull(referrals.physicianId),
      isNull(referrals.deletedAt),
      eq(referrals.referringProviderName, providerName),
      sql`${referrals.id} != ${excludeId}`,
    ));
    return result.rowCount ?? 0;
  }

  async categorizeReferralAsSelfReferral(referralId: string): Promise<Referral | undefined> {
    const [updated] = await db.update(referrals).set({
      referringProviderName: "Self-Referral / Walk-In",
      referralSource: "Self-Referral",
      updatedAt: new Date(),
    }).where(eq(referrals.id, referralId)).returning();
    return updated;
  }

  async getUserLocationIds(userId: string): Promise<string[]> {
    const rows = await db.select({ locationId: userLocationAccess.locationId })
      .from(userLocationAccess)
      .where(eq(userLocationAccess.userId, userId));
    return rows.map(r => r.locationId);
  }

  async getPhysicianIdsByLocations(locationIds: string[]): Promise<Set<string>> {
    if (locationIds.length === 0) return new Set();
    const rows = await db.selectDistinct({ physicianId: referrals.physicianId })
      .from(referrals)
      .where(and(
        isNull(referrals.deletedAt),
        inArray(referrals.locationId, locationIds),
        isNotNull(referrals.physicianId),
      ));
    return new Set(rows.map(r => r.physicianId).filter(Boolean) as string[]);
  }

  async getInteractionTemplates(): Promise<InteractionTemplate[]> {
    return db.select().from(interactionTemplates)
      .where(eq(interactionTemplates.isActive, true))
      .orderBy(asc(interactionTemplates.name));
  }

  async createInteractionTemplate(template: InsertInteractionTemplate): Promise<InteractionTemplate> {
    const [created] = await db.insert(interactionTemplates).values(template).returning();
    return created;
  }

  async updateInteractionTemplate(id: string, data: Partial<InsertInteractionTemplate>): Promise<InteractionTemplate | undefined> {
    const [updated] = await db.update(interactionTemplates)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(interactionTemplates.id, id))
      .returning();
    return updated;
  }

  async deleteInteractionTemplate(id: string): Promise<boolean> {
    const [updated] = await db.update(interactionTemplates)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(interactionTemplates.id, id))
      .returning();
    return !!updated;
  }

  async getPhysicianStageHistory(physicianId: string): Promise<PhysicianStageHistory[]> {
    return db.select().from(physicianStageHistory)
      .where(eq(physicianStageHistory.physicianId, physicianId))
      .orderBy(desc(physicianStageHistory.changedAt));
  }

  async getAtRiskReferralSources(filters?: { locationId?: string; territoryId?: string }): Promise<AtRiskResult> {
    const now = new Date();
    // Use exclusive upper bound [start, end) for consistent date boundaries
    const currentEndExcl = new Date(now);
    currentEndExcl.setDate(currentEndExcl.getDate() + 1);
    const currentEndStr = currentEndExcl.toISOString().slice(0, 10);
    const currentMonthStart = new Date(now);
    currentMonthStart.setDate(currentMonthStart.getDate() - 30);
    const currentStartStr = currentMonthStart.toISOString().slice(0, 10);

    const priorEndStr = currentStartStr; // exclusive upper bound for prior window
    const priorMonthStart = new Date(currentMonthStart);
    priorMonthStart.setDate(priorMonthStart.getDate() - 30);
    const priorStartStr = priorMonthStart.toISOString().slice(0, 10);

    const touchpointCutoff = new Date(now);
    touchpointCutoff.setDate(touchpointCutoff.getDate() - 30);

    const emptyResult: AtRiskResult = { data: [], total: 0, period: { currentStart: currentStartStr, currentEnd: currentEndStr, priorStart: priorStartStr, priorEnd: priorEndStr } };

    // Build physician filter conditions for location/territory
    const physConditions: any[] = [isNull(physicians.deletedAt)];
    if (filters?.locationId) {
      physConditions.push(sql`${physicians.id} IN (
        SELECT DISTINCT physician_id FROM referrals
        WHERE location_id = ${filters.locationId} AND deleted_at IS NULL
      )`);
    }
    if (filters?.territoryId) {
      physConditions.push(eq(physicians.territoryId, filters.territoryId));
    }

    // Get eligible physician IDs
    const eligiblePhysicians = await db.select({ id: physicians.id })
      .from(physicians)
      .where(and(...physConditions));
    const eligibleIds = eligiblePhysicians.map(p => p.id);
    if (eligibleIds.length === 0) return emptyResult;

    // Scope referral queries to eligible physicians only (perf fix)
    const eligibleIdsSql = sql.join(eligibleIds.map(id => sql`${id}`), sql`, `);

    // Query A: referrals in current 30-day window [currentStart, currentEnd)
    const currentCounts = await db.select({
      physicianId: referrals.physicianId,
      count: sql<number>`count(*)`,
    }).from(referrals)
      .where(and(
        isNull(referrals.deletedAt),
        isNotNull(referrals.physicianId),
        sql`${referrals.physicianId} IN (${eligibleIdsSql})`,
        sql`${referrals.referralDate} >= ${currentStartStr}`,
        sql`${referrals.referralDate} < ${currentEndStr}`,
      ))
      .groupBy(referrals.physicianId);

    // Query B: referrals in prior 30-day window [priorStart, priorEnd)
    const priorCounts = await db.select({
      physicianId: referrals.physicianId,
      count: sql<number>`count(*)`,
    }).from(referrals)
      .where(and(
        isNull(referrals.deletedAt),
        isNotNull(referrals.physicianId),
        sql`${referrals.physicianId} IN (${eligibleIdsSql})`,
        sql`${referrals.referralDate} >= ${priorStartStr}`,
        sql`${referrals.referralDate} < ${priorEndStr}`,
      ))
      .groupBy(referrals.physicianId);

    const currentMap = new Map(currentCounts.map(c => [c.physicianId, Number(c.count)]));
    const priorMap = new Map(priorCounts.map(c => [c.physicianId, Number(c.count)]));

    // Compute decline: >20% drop, only for physicians with prior referrals
    const declining: { physicianId: string; currentCount: number; priorCount: number; changePercent: number }[] = [];

    const priorEntries = Array.from(priorMap.entries());
    for (let i = 0; i < priorEntries.length; i++) {
      const [physId, priorCount] = priorEntries[i];
      if (!physId || priorCount === 0) continue;
      const currentCount = currentMap.get(physId) || 0;
      const changePercent = Math.round(((currentCount - priorCount) / priorCount) * 100);
      if (changePercent <= -20) {
        declining.push({ physicianId: physId, currentCount, priorCount, changePercent });
      }
    }

    if (declining.length === 0) return emptyResult;

    const decliningIds = declining.map(d => d.physicianId);
    const decliningIdsSql = sql.join(decliningIds.map(id => sql`${id}`), sql`, `);

    // Query C: physicians with no recent touchpoint
    const noTouchpoint = await db.select({ id: physicians.id })
      .from(physicians)
      .where(and(
        sql`${physicians.id} IN (${decliningIdsSql})`,
        or(
          isNull(physicians.lastInteractionAt),
          sql`${physicians.lastInteractionAt} < ${touchpointCutoff.toISOString()}`,
        ),
      ));
    const noTouchpointSet = new Set(noTouchpoint.map(p => p.id));

    // Query D: physicians with overdue open tasks
    const overdueTasks = await db.select({
      physicianId: tasks.physicianId,
    }).from(tasks)
      .where(and(
        sql`${tasks.physicianId} IN (${decliningIdsSql})`,
        eq(tasks.status, "OPEN"),
        sql`${tasks.dueAt} < ${now.toISOString()}`,
      ))
      .groupBy(tasks.physicianId);
    const overdueSet = new Set(overdueTasks.map(t => t.physicianId));

    // Intersect: decline AND (no-touchpoint OR overdue-task)
    const atRisk = declining.filter(d =>
      noTouchpointSet.has(d.physicianId) || overdueSet.has(d.physicianId)
    );

    if (atRisk.length === 0) return emptyResult;

    // Hydrate physician details
    const atRiskIds = atRisk.map(d => d.physicianId);
    const physicianDetails = await db.select({
      id: physicians.id,
      firstName: physicians.firstName,
      lastName: physicians.lastName,
      credentials: physicians.credentials,
      specialty: physicians.specialty,
      practiceName: physicians.practiceName,
      relationshipStage: physicians.relationshipStage,
      assignedOwnerId: physicians.assignedOwnerId,
      territoryId: physicians.territoryId,
      lastInteractionAt: physicians.lastInteractionAt,
    }).from(physicians)
      .where(sql`${physicians.id} IN (${sql.join(atRiskIds.map(id => sql`${id}`), sql`, `)})`);

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
    })).filter(d => d.physician !== null)
      .sort((a, b) => a.changePercent - b.changePercent);

    return {
      data: result,
      total: result.length,
      period: { currentStart: currentStartStr, currentEnd: currentEndStr, priorStart: priorStartStr, priorEnd: priorEndStr },
    };
  }

  async getPractices(filters: {
    search?: string; sortBy?: string; sortOrder?: string;
    page?: number; pageSize?: number;
  }): Promise<PaginatedResult<PracticeSummary>> {
    const page = filters.page || 1;
    const pageSize = filters.pageSize || 50;
    const offset = (page - 1) * pageSize;
    const searchPattern = filters.search ? `%${filters.search}%` : null;

    // Valid sort column mapping to prevent SQL injection
    const sortMap: Record<string, string> = {
      practiceName: "practice_name",
      physicianCount: "physician_count",
      totalReferrals: "total_referrals",
      totalRevenue: "total_revenue",
      arrivalRate: "arrival_rate",
      lastInteractionAt: "last_interaction",
    };
    const sortCol = sortMap[filters.sortBy || "totalReferrals"] || "total_referrals";
    const sortDir = filters.sortOrder === "asc" ? "ASC" : "DESC";

    const searchCond = searchPattern
      ? sql`AND (p.practice_name ILIKE ${searchPattern} OR p.city ILIKE ${searchPattern})`
      : sql``;

    const countResult = await db.execute(sql`
      SELECT COUNT(DISTINCT TRIM(p.practice_name)) as total
      FROM physicians p
      WHERE p.deleted_at IS NULL
        AND p.practice_name IS NOT NULL
        AND TRIM(p.practice_name) != ''
        ${searchCond}
    `);
    const total = parseInt((countResult.rows[0] as any)?.total || "0");

    const dataResult = await db.execute(sql`
      SELECT
        TRIM(p.practice_name) as practice_name,
        COUNT(DISTINCT p.id)::int as physician_count,
        COALESCE(SUM(ref_agg.ref_count), 0)::int as total_referrals,
        COALESCE(SUM(rev_agg.total_rev), 0)::numeric as total_revenue,
        CASE
          WHEN COALESCE(SUM(ref_agg.scheduled), 0) > 0
          THEN ROUND(SUM(ref_agg.arrived)::numeric / SUM(ref_agg.scheduled)::numeric * 100, 1)
          ELSE 0
        END as arrival_rate,
        MAX(p.last_interaction_at) as last_interaction,
        MIN(p.city) as city,
        MIN(p.state) as state
      FROM physicians p
      LEFT JOIN (
        SELECT physician_id,
          COUNT(*) as ref_count,
          SUM(COALESCE(scheduled_visits, 0)) as scheduled,
          SUM(COALESCE(arrived_visits, 0)) as arrived
        FROM referrals WHERE deleted_at IS NULL
        GROUP BY physician_id
      ) ref_agg ON ref_agg.physician_id = p.id
      LEFT JOIN (
        SELECT physician_id, SUM(COALESCE(revenue_generated, 0)::numeric) as total_rev
        FROM physician_monthly_summary
        GROUP BY physician_id
      ) rev_agg ON rev_agg.physician_id = p.id
      WHERE p.deleted_at IS NULL
        AND p.practice_name IS NOT NULL
        AND TRIM(p.practice_name) != ''
        ${searchCond}
      GROUP BY TRIM(p.practice_name)
      ORDER BY ${sql.raw(sortCol)} ${sql.raw(sortDir)}
      LIMIT ${pageSize} OFFSET ${offset}
    `);

    const data: PracticeSummary[] = (dataResult.rows as any[]).map(r => ({
      practiceName: r.practice_name,
      physicianCount: r.physician_count,
      totalReferrals: r.total_referrals,
      totalRevenue: parseFloat(r.total_revenue || "0"),
      arrivalRate: parseFloat(r.arrival_rate || "0"),
      lastInteractionAt: r.last_interaction ? new Date(r.last_interaction).toISOString() : null,
      city: r.city,
      state: r.state,
    }));

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async getPracticeDetail(practiceName: string): Promise<PracticeDetail | null> {
    const trimmedName = practiceName.trim();
    if (!trimmedName) return null;

    const physResult = await db.execute(sql`
      SELECT p.*,
        COALESCE(ref_agg.ref_count, 0)::int as referral_count,
        COALESCE(ref_agg.scheduled, 0)::int as total_scheduled,
        COALESCE(ref_agg.arrived, 0)::int as total_arrived,
        COALESCE(rev_agg.total_rev, 0)::numeric as revenue_generated,
        COALESCE(int_agg.int_count, 0)::int as interaction_count
      FROM physicians p
      LEFT JOIN (
        SELECT physician_id,
          COUNT(*) as ref_count,
          SUM(COALESCE(scheduled_visits, 0)) as scheduled,
          SUM(COALESCE(arrived_visits, 0)) as arrived
        FROM referrals WHERE deleted_at IS NULL
        GROUP BY physician_id
      ) ref_agg ON ref_agg.physician_id = p.id
      LEFT JOIN (
        SELECT physician_id, SUM(COALESCE(revenue_generated, 0)::numeric) as total_rev
        FROM physician_monthly_summary
        GROUP BY physician_id
      ) rev_agg ON rev_agg.physician_id = p.id
      LEFT JOIN (
        SELECT physician_id, COUNT(*) as int_count
        FROM interactions WHERE deleted_at IS NULL
        GROUP BY physician_id
      ) int_agg ON int_agg.physician_id = p.id
      WHERE p.deleted_at IS NULL
        AND TRIM(p.practice_name) = ${trimmedName}
      ORDER BY revenue_generated DESC
    `);

    if (physResult.rows.length === 0) return null;

    const physicians = (physResult.rows as any[]).map(r => {
      const scheduled = r.total_scheduled || 0;
      const arrived = r.total_arrived || 0;
      return {
        id: r.id,
        firstName: r.first_name,
        lastName: r.last_name,
        credentials: r.credentials,
        specialty: r.specialty,
        status: r.status,
        relationshipStage: r.relationship_stage,
        referralCount: r.referral_count,
        revenueGenerated: parseFloat(r.revenue_generated || "0"),
        arrivalRate: scheduled > 0 ? Math.round((arrived / scheduled) * 1000) / 10 : 0,
        lastInteractionAt: r.last_interaction_at ? new Date(r.last_interaction_at).toISOString() : null,
        interactionCount: r.interaction_count,
      };
    });

    const rows = physResult.rows as any[];
    const totalSched = rows.reduce((s, r) => s + (r.total_scheduled || 0), 0);
    const totalArr = rows.reduce((s, r) => s + (r.total_arrived || 0), 0);

    const practice: PracticeSummary = {
      practiceName: trimmedName,
      physicianCount: physicians.length,
      totalReferrals: physicians.reduce((s, p) => s + p.referralCount, 0),
      totalRevenue: physicians.reduce((s, p) => s + p.revenueGenerated, 0),
      arrivalRate: totalSched > 0 ? Math.round((totalArr / totalSched) * 1000) / 10 : 0,
      lastInteractionAt: physicians.reduce((latest: string | null, p) => {
        if (!p.lastInteractionAt) return latest;
        if (!latest) return p.lastInteractionAt;
        return p.lastInteractionAt > latest ? p.lastInteractionAt : latest;
      }, null),
      city: rows[0]?.city || null,
      state: rows[0]?.state || null,
    };

    return { practice, physicians };
  }

  // Unit Economics — delegate to storage-unit-economics module

  async getClinicFinancials(filters: { locationId?: string; periodType?: string; dateFrom?: string; dateTo?: string }) {
    return unitEconomicsStorage.getClinicFinancials(filters);
  }
  async upsertClinicFinancial(data: InsertClinicFinancial) {
    return unitEconomicsStorage.upsertClinicFinancial(data);
  }
  async bulkUpsertClinicFinancials(rows: InsertClinicFinancial[]) {
    return unitEconomicsStorage.bulkUpsertClinicFinancials(rows);
  }
  async getProviderProductivity(filters: { userId?: string; locationId?: string; dateFrom?: string; dateTo?: string }) {
    return unitEconomicsStorage.getProviderProductivity(filters);
  }
  async upsertProviderProductivity(data: InsertProviderProductivity) {
    return unitEconomicsStorage.upsertProviderProductivity(data);
  }
  async bulkUpsertProviderProductivity(rows: InsertProviderProductivity[]) {
    return unitEconomicsStorage.bulkUpsertProviderProductivity(rows);
  }
  async getFinancialAlerts(filters: { locationId?: string; acknowledged?: boolean }) {
    return unitEconomicsStorage.getFinancialAlerts(filters);
  }
  async createFinancialAlert(alert: InsertFinancialAlert) {
    return unitEconomicsStorage.createFinancialAlert(alert);
  }
  async acknowledgeFinancialAlert(id: string, userId: string) {
    return unitEconomicsStorage.acknowledgeFinancialAlert(id, userId);
  }
  async getFinancialTargets(locationId?: string) {
    return unitEconomicsStorage.getFinancialTargets(locationId);
  }
  async upsertFinancialTarget(data: InsertFinancialTarget) {
    return unitEconomicsStorage.upsertFinancialTarget(data);
  }
  async getUnitEconomicsDashboard(locationIds?: string[]) {
    return unitEconomicsStorage.getUnitEconomicsDashboard(locationIds);
  }
  async getUnitEconomicsLocationDetail(locationId: string, dateFrom?: string, dateTo?: string) {
    return unitEconomicsStorage.getUnitEconomicsLocationDetail(locationId, dateFrom, dateTo);
  }
  async getProviderProductivityLeaderboard(dateFrom?: string, dateTo?: string, locationId?: string) {
    return unitEconomicsStorage.getProviderProductivityLeaderboard(dateFrom, dateTo, locationId);
  }
  async getUnitEconomicsForecast(locationId?: string) {
    return unitEconomicsStorage.getUnitEconomicsForecast(locationId);
  }

  // Revenue Recovery — delegate to storage-revenue-recovery module
  async getClaims(filters: { locationId?: string; payer?: string; status?: string; dateFrom?: string; dateTo?: string; isUnderpaid?: boolean; page?: number; pageSize?: number }) {
    return revenueRecoveryStorage.getClaims(filters);
  }
  async getClaim(id: string) {
    return revenueRecoveryStorage.getClaim(id);
  }
  async upsertClaim(data: InsertClaim) {
    return revenueRecoveryStorage.upsertClaim(data);
  }
  async bulkUpsertClaims(data: InsertClaim[]) {
    return revenueRecoveryStorage.bulkUpsertClaims(data);
  }
  async getUnderpaidClaims(filters: { locationId?: string; payer?: string; dateFrom?: string; dateTo?: string; minVariance?: number }) {
    return revenueRecoveryStorage.getUnderpaidClaims(filters);
  }
  async getReimbursementSummary(filters: { locationId?: string; dateFrom?: string; dateTo?: string }) {
    return revenueRecoveryStorage.getReimbursementSummary(filters);
  }
  async calculateExpectedAmount(claimId: string) {
    return revenueRecoveryStorage.calculateExpectedAmount(claimId);
  }
  async flagUnderpaidClaims(filters?: { locationId?: string }) {
    return revenueRecoveryStorage.flagUnderpaidClaims(filters);
  }
  async getPayerRates(payer?: string, cptCode?: string) {
    return revenueRecoveryStorage.getPayerRates(payer, cptCode);
  }
  async upsertPayerRate(data: InsertPayerRate) {
    return revenueRecoveryStorage.upsertPayerRate(data);
  }
  async bulkUpsertPayerRates(data: InsertPayerRate[]) {
    return revenueRecoveryStorage.bulkUpsertPayerRates(data);
  }
  async buildRatesFromHistory(payer?: string) {
    return revenueRecoveryStorage.buildRatesFromHistory(payer);
  }

  // Denial Intelligence — delegate to storage-denial-intelligence module
  async getDenialSummary(filters: { locationId?: string; dateFrom?: string; dateTo?: string }) {
    return denialIntelligenceStorage.getDenialSummary(filters);
  }
  async getTopDenialCodes(filters: { locationId?: string; limit?: number }) {
    return denialIntelligenceStorage.getTopDenialCodes(filters);
  }
  async getProviderDenialOutliers(filters: { dateFrom?: string; dateTo?: string }) {
    return denialIntelligenceStorage.getProviderDenialOutliers(filters);
  }
  async getDenialTrends(filters: { locationId?: string; months?: number }) {
    return denialIntelligenceStorage.getDenialTrends(filters);
  }
}

export const storage = new DatabaseStorage();
