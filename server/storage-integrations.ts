/**
 * Integration config, API keys, and sync log CRUD storage methods.
 * Extracted from storage.ts to keep files under 200 lines.
 */
import { db } from "./db";
import { eq, asc, desc } from "drizzle-orm";
import {
  integrationConfigs, apiKeys, integrationSyncLogs,
  type IntegrationConfig, type InsertIntegrationConfig,
  type ApiKey, type InsertApiKey,
  type IntegrationSyncLog, type InsertIntegrationSyncLog,
} from "@shared/schema";

// ---- Integration configs ----

export async function getIntegrationConfigs(): Promise<IntegrationConfig[]> {
  return db.select().from(integrationConfigs).orderBy(asc(integrationConfigs.name));
}

export async function getIntegrationConfig(id: string): Promise<IntegrationConfig | undefined> {
  const [config] = await db.select().from(integrationConfigs).where(eq(integrationConfigs.id, id));
  return config;
}

export async function getIntegrationConfigByType(type: string): Promise<IntegrationConfig | undefined> {
  const [config] = await db.select().from(integrationConfigs)
    .where(eq(integrationConfigs.type, type as any));
  return config;
}

export async function createIntegrationConfig(config: InsertIntegrationConfig): Promise<IntegrationConfig> {
  const [created] = await db.insert(integrationConfigs).values(config).returning();
  return created;
}

export async function updateIntegrationConfig(id: string, data: Partial<InsertIntegrationConfig>): Promise<IntegrationConfig | undefined> {
  const [updated] = await db.update(integrationConfigs)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(integrationConfigs.id, id))
    .returning();
  return updated;
}

export async function deleteIntegrationConfig(id: string): Promise<boolean> {
  const result = await db.delete(integrationConfigs).where(eq(integrationConfigs.id, id));
  return (result.rowCount ?? 0) > 0;
}

// ---- API keys ----

export async function getApiKeys(): Promise<ApiKey[]> {
  return db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt));
}

export async function getApiKeyById(id: string): Promise<ApiKey | undefined> {
  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.id, id));
  return key;
}

export async function createApiKey(key: InsertApiKey): Promise<ApiKey> {
  const [created] = await db.insert(apiKeys).values({
    ...key,
    scopes: key.scopes ? [...key.scopes] : null,
  } as any).returning();
  return created;
}

export async function getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined> {
  const [key] = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash));
  return key;
}

export async function updateApiKeyLastUsed(id: string): Promise<void> {
  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, id));
}

export async function deactivateApiKey(id: string): Promise<boolean> {
  const result = await db.update(apiKeys).set({ isActive: false }).where(eq(apiKeys.id, id));
  return (result.rowCount ?? 0) > 0;
}

// ---- Sync logs ----

export async function getIntegrationSyncLogs(integrationId?: string, limit = 50): Promise<IntegrationSyncLog[]> {
  if (integrationId) {
    return db.select().from(integrationSyncLogs)
      .where(eq(integrationSyncLogs.integrationId, integrationId))
      .orderBy(desc(integrationSyncLogs.startedAt))
      .limit(limit);
  }
  return db.select().from(integrationSyncLogs)
    .orderBy(desc(integrationSyncLogs.startedAt))
    .limit(limit);
}

export async function createIntegrationSyncLog(log: InsertIntegrationSyncLog): Promise<IntegrationSyncLog> {
  const [created] = await db.insert(integrationSyncLogs).values(log).returning();
  return created;
}

export async function updateIntegrationSyncLog(id: string, data: Partial<IntegrationSyncLog>): Promise<IntegrationSyncLog | undefined> {
  const [updated] = await db.update(integrationSyncLogs)
    .set(data)
    .where(eq(integrationSyncLogs.id, id))
    .returning();
  return updated;
}
