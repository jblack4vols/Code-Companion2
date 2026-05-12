import { Client } from '@microsoft/microsoft-graph-client';
import { db } from './db';
import { sharepointSyncStatus, appSettings, physicians, referrals, interactions, tasks, locations, userOauthTokens, users } from '@shared/schema';
import { eq, sql, desc } from 'drizzle-orm';
import { getValidAccessToken } from './outlook-oauth-token-helpers';
import {
  mapPhysicianFields,
  mapReferralFields,
  mapInteractionFields,
  mapTaskFields,
  mapLocationFields,
} from './sharepoint-row-mappers';

/**
 * SharePoint Graph access uses the most recently authenticated OWNER's
 * delegated token (the same row written by the SSO / Outlook OAuth flow).
 * Required scopes — Sites.ReadWrite.All and Files.ReadWrite.All — are
 * granted by `SCOPES` in outlook-oauth-token-helpers.ts. If an OWNER
 * connected Outlook before that scope list was extended, they must
 * disconnect and reconnect once to upgrade the token.
 */
function logGraphErr(prefix: string, err: any) {
  // Microsoft Graph errors carry rich metadata (statusCode/code/body);
  // err.message alone strips the diagnostic info we need.
  console.error(prefix, {
    message: err?.message,
    statusCode: err?.statusCode,
    code: err?.code,
    requestId: err?.requestId,
    body: err?.body,
  });
}

async function getServiceUserId(): Promise<string> {
  const [row] = await db
    .select({ userId: userOauthTokens.userId })
    .from(userOauthTokens)
    .innerJoin(users, eq(users.id, userOauthTokens.userId))
    .where(eq(users.role, 'OWNER'))
    .orderBy(desc(userOauthTokens.updatedAt))
    .limit(1);
  if (!row) {
    throw new Error('SharePoint not connected — an OWNER must connect Microsoft 365 first via /calendar');
  }
  return row.userId;
}

async function getAccessToken() {
  return getValidAccessToken(await getServiceUserId());
}

/**
 * Returns a Graph Client whose authProvider calls getValidAccessToken on
 * every request, so a token that expires mid-sync (Microsoft access tokens
 * last ~60 min, our sync of 3000+ rows can run 3-10 min) gets refreshed
 * transparently. getValidAccessToken caches the DB row and only triggers
 * an actual Graph refresh-token call when the access token is within
 * 60s of expiry — so per-request overhead is a fast DB SELECT, not a
 * Microsoft round-trip.
 *
 * Previous version snapshotted the access token at client construction
 * and reused that string for every request — once the snapshot expired,
 * every batch failed with 'Lifetime validation failed, token is expired'
 * until the operator manually retried the sync.
 */
async function getClient() {
  const serviceUserId = await getServiceUserId();
  return Client.initWithMiddleware({
    authProvider: { getAccessToken: () => getValidAccessToken(serviceUserId) }
  });
}

export async function getSiteId(): Promise<string | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, 'sharepoint_site_id'));
  return row?.value || null;
}

export async function setSiteId(siteId: string) {
  await db.insert(appSettings).values({ key: 'sharepoint_site_id', value: siteId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: siteId, updatedAt: new Date() } });
}

export async function searchSites(query: string) {
  const client = await getClient();
  try {
    const result = await client.api(`/sites?search=${encodeURIComponent(query)}`).get();
    return result.value || [];
  } catch (err: any) {
    logGraphErr('SharePoint site search error:', err);
    return [];
  }
}

export async function validateSite(siteId: string) {
  const client = await getClient();
  const site = await client.api(`/sites/${siteId}`).get();
  return site;
}

export async function getSiteByUrl(hostname: string, sitePath: string) {
  const client = await getClient();
  const site = await client.api(`/sites/${hostname}:/${sitePath}`).get();
  return site;
}

const LIST_DEFINITIONS: Record<string, { displayName: string; columns: Array<{ name: string; text?: any; number?: any; dateTime?: any; boolean?: any }> }> = {
  physicians: {
    displayName: "Tristar360 - Physicians",
    columns: [
      { name: "ExternalId", text: {} },
      { name: "FirstName", text: {} },
      { name: "LastName", text: {} },
      { name: "Credentials", text: {} },
      { name: "Specialty", text: {} },
      { name: "NPI", text: {} },
      { name: "PracticeName", text: {} },
      { name: "Address", text: {} },
      { name: "City", text: {} },
      { name: "State", text: {} },
      { name: "Zip", text: {} },
      { name: "Phone", text: {} },
      { name: "Fax", text: {} },
      { name: "Email", text: {} },
      { name: "Status", text: {} },
      { name: "RelationshipStage", text: {} },
      { name: "Priority", text: {} },
      { name: "Notes", text: { allowMultipleLines: true } },
      { name: "LastInteractionAt", text: {} },
    ]
  },
  referrals: {
    displayName: "Tristar360 - Referrals",
    columns: [
      { name: "ExternalId", text: {} },
      { name: "PhysicianName", text: {} },
      { name: "PhysicianNPI", text: {} },
      { name: "LocationName", text: {} },
      { name: "ReferralDate", text: {} },
      { name: "PatientAccount", text: {} },
      { name: "PatientName", text: {} },
      { name: "CaseTitle", text: {} },
      { name: "CaseTherapist", text: {} },
      { name: "ReferralSource", text: {} },
      { name: "Status", text: {} },
      { name: "Discipline", text: {} },
      { name: "DiagnosisCategory", text: {} },
      { name: "PrimaryInsurance", text: {} },
      { name: "PrimaryPayerType", text: {} },
      { name: "ScheduledVisits", number: {} },
      { name: "ArrivedVisits", number: {} },
      { name: "DischargeDate", text: {} },
      { name: "DischargeReason", text: {} },
      { name: "DateOfInitialEval", text: {} },
    ]
  },
  interactions: {
    displayName: "Tristar360 - Interactions",
    columns: [
      { name: "ExternalId", text: {} },
      { name: "PhysicianName", text: {} },
      { name: "UserName", text: {} },
      { name: "Type", text: {} },
      { name: "OccurredAt", text: {} },
      { name: "Summary", text: { allowMultipleLines: true } },
      { name: "NextStep", text: { allowMultipleLines: true } },
      { name: "FollowUpDueAt", text: {} },
    ]
  },
  tasks: {
    displayName: "Tristar360 - Tasks",
    columns: [
      { name: "ExternalId", text: {} },
      { name: "PhysicianName", text: {} },
      { name: "AssignedTo", text: {} },
      { name: "DueAt", text: {} },
      { name: "Priority", text: {} },
      { name: "Status", text: {} },
      { name: "Description", text: { allowMultipleLines: true } },
    ]
  },
  locations: {
    displayName: "Tristar360 - Locations",
    columns: [
      { name: "ExternalId", text: {} },
      { name: "LocationName", text: {} },
      { name: "Address", text: {} },
      { name: "City", text: {} },
      { name: "State", text: {} },
      { name: "Phone", text: {} },
      { name: "IsActive", text: {} },
    ]
  }
};

async function ensureList(client: Client, siteId: string, entity: string): Promise<string> {
  const def = LIST_DEFINITIONS[entity];
  if (!def) throw new Error(`Unknown entity: ${entity}`);

  const existingLists = await client.api(`/sites/${siteId}/lists`).select('id,displayName').get();
  const existing = existingLists.value?.find((l: any) => l.displayName === def.displayName);

  let listId: string;
  if (existing) {
    listId = existing.id;
  } else {
    const listPayload: any = {
      displayName: def.displayName,
      list: { template: "genericList" }
    };
    const created = await client.api(`/sites/${siteId}/lists`).post(listPayload);
    listId = created.id;
  }

  // Always ensure columns — pre-existing lists (e.g. created by an earlier
  // sync attempt that failed mid-flight, or a list switched-to from a
  // different site) won't have the schema we need until we add it. Item
  // inserts later in the pipeline reference these columns by name, so a
  // missing column here = "Field 'ExternalId' is not recognized" at insert.
  // Idempotent: we fetch the existing column names and skip ones already present.
  const existingCols = await client.api(`/sites/${siteId}/lists/${listId}/columns`).select('name').get();
  const presentNames = new Set<string>((existingCols.value ?? []).map((c: any) => c.name));

  for (const col of def.columns) {
    if (presentNames.has(col.name)) continue;

    const colPayload: any = { name: col.name, enforceUniqueValues: false };
    if (col.text) colPayload.text = col.text;
    else if (col.number) colPayload.number = col.number;
    else if (col.dateTime) colPayload.dateTime = col.dateTime;
    else if (col.boolean) colPayload.boolean = col.boolean;

    try {
      await client.api(`/sites/${siteId}/lists/${listId}/columns`).post(colPayload);
    } catch (err: any) {
      console.warn(`Failed to create column ${col.name} on ${def.displayName}:`, err.message);
    }
  }

  return listId;
}


async function updateSyncStatus(entity: string, update: Partial<{ siteId: string; listId: string; lastSyncAt: Date; itemsSynced: number; itemsFailed: number; status: string; errorMessage: string | null }>) {
  const [existing] = await db.select().from(sharepointSyncStatus).where(eq(sharepointSyncStatus.entity, entity));
  if (existing) {
    await db.update(sharepointSyncStatus).set({ ...update, updatedAt: new Date() }).where(eq(sharepointSyncStatus.entity, entity));
  } else {
    await db.insert(sharepointSyncStatus).values({ entity, ...update, updatedAt: new Date() } as any);
  }
}

export async function getSyncStatuses() {
  return db.select().from(sharepointSyncStatus);
}

/**
 * Fetch all existing items from a SharePoint list, indexed by their
 * ExternalId field value. Used by syncEntity to decide whether each
 * incoming row should be POSTed (new) or PATCHed (existing).
 *
 * Paginates via @odata.nextLink — SharePoint returns at most ~5000 per
 * page. Items without an ExternalId field (e.g., manually-created rows
 * in SharePoint that don't correspond to anything in our DB) are
 * skipped — we don't try to manage them.
 */
async function fetchExistingItemMap(
  client: Client,
  siteId: string,
  listId: string,
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let nextLink: string | null = `/sites/${siteId}/lists/${listId}/items?$expand=fields($select=ExternalId)&$top=5000`;

  while (nextLink) {
    const page: any = await client.api(nextLink).get();
    for (const item of page.value || []) {
      const externalId = item.fields?.ExternalId;
      if (typeof externalId === 'string' && externalId.length > 0) {
        map.set(externalId, item.id);
      }
    }
    // Graph returns full URL; the SDK accepts it directly on subsequent calls
    nextLink = page['@odata.nextLink'] || null;
  }

  return map;
}

/**
 * Upsert N items into a SharePoint list. For each fields object:
 *   - If existingByExternalId has the row's ExternalId → PATCH the
 *     existing item's fields (overwrites all our managed columns).
 *   - Else → POST a new item.
 *
 * Same Retry-After + 4-attempt retry pattern as the old batchCreateItems.
 * Halves the API calls in steady state vs the old wipe-and-recreate flow.
 */
async function batchUpsertItems(
  client: Client,
  siteId: string,
  listId: string,
  items: any[],
  existingByExternalId: Map<string, string>,
  onProgress?: (created: number, updated: number, failed: number) => Promise<void>,
): Promise<{ created: number; updated: number; failed: number }> {
  const MAX_ATTEMPTS = 4;
  const INTER_BATCH_PAUSE_MS = 100;
  const MAX_RETRY_WAIT_SEC = 60;

  let created = 0;
  let updated = 0;
  let failed = 0;
  let pending = items.slice();
  let attempt = 1;

  const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
  const readRetryAfter = (headers: any): number => {
    const v = headers?.['Retry-After'] ?? headers?.['retry-after'] ?? '5';
    const n = parseInt(String(v), 10);
    return Number.isFinite(n) ? n : 5;
  };

  while (pending.length > 0 && attempt <= MAX_ATTEMPTS) {
    if (attempt > 1) console.log(`Upsert retry pass ${attempt}: ${pending.length} items remaining`);

    const stillThrottled: any[] = [];
    let maxRetryAfter = 0;
    let processed = 0;
    const total = pending.length;

    for (let i = 0; i < pending.length; i += 20) {
      const chunk = pending.slice(i, i + 20);
      const batchReqs = chunk.map((fields: any, idx: number) => {
        const existingItemId = existingByExternalId.get(fields.ExternalId);
        if (existingItemId) {
          return {
            id: `${idx}`,
            method: 'PATCH',
            url: `/sites/${siteId}/lists/${listId}/items/${existingItemId}/fields`,
            headers: { 'Content-Type': 'application/json' },
            body: fields,
          };
        }
        return {
          id: `${idx}`,
          method: 'POST',
          url: `/sites/${siteId}/lists/${listId}/items`,
          headers: { 'Content-Type': 'application/json' },
          body: { fields },
        };
      });

      try {
        const result = await client.api('/$batch').post({ requests: batchReqs });
        for (const resp of result.responses || []) {
          const reqIdx = parseInt(resp.id, 10);
          const item = chunk[reqIdx];
          const wasUpdate = existingByExternalId.has(item.ExternalId);
          if (resp.status >= 200 && resp.status < 300) {
            if (wasUpdate) updated++;
            else {
              created++;
              // POST response body has the new item id; record it so a
              // follow-up upsert in the same sync (unlikely, but possible)
              // would see it as existing.
              if (resp.body?.id) existingByExternalId.set(item.ExternalId, resp.body.id);
            }
          } else if (resp.status === 429 || resp.status === 503) {
            stillThrottled.push(item);
            const retry = readRetryAfter(resp.headers);
            if (retry > maxRetryAfter) maxRetryAfter = retry;
          } else {
            failed++;
            console.warn(`Item upsert failed (${resp.status}, ${wasUpdate ? 'PATCH' : 'POST'}):`, resp.body?.error?.message);
          }
        }
      } catch (err: any) {
        console.warn('Batch upsert error, retrying chunk later:', err?.message);
        for (const fields of chunk) stillThrottled.push(fields);
        if (maxRetryAfter < 5) maxRetryAfter = 5;
      }

      processed += chunk.length;
      if (processed % 200 === 0 || i + 20 >= pending.length) {
        console.log(`  Upsert progress: ${processed}/${total} items processed (attempt ${attempt})`);
        // Heartbeat: write progress to sync_status so the UI's 2-min stale
        // detector doesn't falsely flag a long-running sync as stuck, and
        // so the user can see live itemsSynced numbers tick up.
        if (onProgress) {
          await onProgress(created, updated, failed).catch(() => { /* progress write best-effort */ });
        }
      }

      if (i + 20 < pending.length) await sleep(INTER_BATCH_PAUSE_MS);
    }

    pending = stillThrottled;
    if (pending.length > 0 && attempt < MAX_ATTEMPTS) {
      const waitSec = Math.min(Math.max(maxRetryAfter, 5), MAX_RETRY_WAIT_SEC);
      console.log(`Throttled ${pending.length} items, waiting ${waitSec}s before retry...`);
      await sleep(waitSec * 1000);
    }
    attempt++;
  }

  failed += pending.length;
  if (pending.length > 0) console.warn(`Gave up on ${pending.length} upsert items after ${MAX_ATTEMPTS} attempts`);
  return { created, updated, failed };
}

/**
 * Delete SharePoint items whose ExternalId is no longer present in the
 * source DB (i.e. rows that were deleted from the CRM since the last
 * sync). Mirrors the Retry-After / 4-attempt pattern from clearList.
 *
 * Safer than wipe-and-recreate: only touches items that actually need
 * to disappear. For a sync where nothing's been deleted in the CRM,
 * this is a no-op after the existing-item lookup.
 */
async function deleteOrphans(
  client: Client,
  siteId: string,
  listId: string,
  currentExternalIds: Set<string>,
  existingByExternalId: Map<string, string>,
  onProgress?: (deleted: number, failed: number) => Promise<void>,
): Promise<{ deleted: number; failed: number }> {
  const orphanItemIds: string[] = [];
  // Array.from(...) sidesteps the tsconfig downlevelIteration constraint
  // that bites direct iteration of Map under our compile target.
  for (const [externalId, itemId] of Array.from(existingByExternalId.entries())) {
    if (!currentExternalIds.has(externalId)) orphanItemIds.push(itemId);
  }
  if (orphanItemIds.length === 0) return { deleted: 0, failed: 0 };

  console.log(`Deleting ${orphanItemIds.length} orphan items from SharePoint...`);

  const MAX_ATTEMPTS = 4;
  const INTER_BATCH_PAUSE_MS = 100;
  const MAX_RETRY_WAIT_SEC = 60;
  const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
  const readRetryAfter = (headers: any): number => {
    const v = headers?.['Retry-After'] ?? headers?.['retry-after'] ?? '5';
    const n = parseInt(String(v), 10);
    return Number.isFinite(n) ? n : 5;
  };

  let pending = orphanItemIds.slice();
  let attempt = 1;
  let deleted = 0;
  let failed = 0;

  while (pending.length > 0 && attempt <= MAX_ATTEMPTS) {
    const stillThrottled: string[] = [];
    let maxRetryAfter = 0;

    for (let i = 0; i < pending.length; i += 20) {
      const chunkIds = pending.slice(i, i + 20);
      const batchReqs = chunkIds.map((id, idx) => ({
        id: `${idx}`,
        method: 'DELETE',
        url: `/sites/${siteId}/lists/${listId}/items/${id}`,
      }));
      try {
        const result = await client.api('/$batch').post({ requests: batchReqs });
        for (const resp of result.responses || []) {
          const reqIdx = parseInt(resp.id, 10);
          const itemId = chunkIds[reqIdx];
          if ((resp.status >= 200 && resp.status < 300) || resp.status === 404) {
            deleted++;
          } else if (resp.status === 429 || resp.status === 503) {
            stillThrottled.push(itemId);
            const retry = readRetryAfter(resp.headers);
            if (retry > maxRetryAfter) maxRetryAfter = retry;
          } else {
            failed++;
          }
        }
      } catch (err: any) {
        for (const id of chunkIds) stillThrottled.push(id);
        if (maxRetryAfter < 5) maxRetryAfter = 5;
      }

      // Heartbeat: bump sync_status updatedAt every ~200 deletes so the
      // UI's stale-detector sees movement.
      if (onProgress && deleted > 0 && deleted % 200 < 20) {
        await onProgress(deleted, failed).catch(() => { /* best-effort */ });
      }

      if (i + 20 < pending.length) await sleep(INTER_BATCH_PAUSE_MS);
    }

    pending = stillThrottled;
    if (pending.length > 0 && attempt < MAX_ATTEMPTS) {
      const waitSec = Math.min(Math.max(maxRetryAfter, 5), MAX_RETRY_WAIT_SEC);
      console.log(`deleteOrphans: ${pending.length} delete(s) throttled, waiting ${waitSec}s...`);
      await sleep(waitSec * 1000);
    }
    attempt++;
  }

  failed += pending.length;
  return { deleted, failed };
}

export async function syncEntity(entity: string): Promise<{ created: number; failed: number }> {
  const siteId = await getSiteId();
  if (!siteId) throw new Error('SharePoint site not configured. Please set a site first.');

  const client = await getClient();
  await updateSyncStatus(entity, { status: 'SYNCING', siteId, errorMessage: null });

  // Time-based heartbeat (independent of batch progress). The batch
  // callback in batchUpsertItems only fires after ~200 items processed,
  // which can take longer than the UI's 2-min stuck-window during heavy
  // Microsoft Graph throttling (we sleep up to 60s between retry passes).
  // A 30-second timer that writes the latest known counts keeps updatedAt
  // fresh through those sleeps. Captured-in-closure progress vars are
  // updated by the batch callbacks.
  let lastSynced = 0;
  let lastFailed = 0;
  const heartbeatInterval = setInterval(() => {
    updateSyncStatus(entity, { itemsSynced: lastSynced, itemsFailed: lastFailed })
      .catch(err => console.warn(`[SharePoint heartbeat] ${entity}:`, err?.message));
  }, 30_000);

  try {
    const listId = await ensureList(client, siteId, entity);
    await updateSyncStatus(entity, { listId });

    // Upsert flow: fetch what's already in SharePoint indexed by
    // ExternalId, decide POST vs PATCH per row, then delete only the
    // orphans. Roughly half the API calls of the old wipe-and-recreate
    // and avoids the throttle storms that flow caused.
    console.log(`Fetching existing ${entity} items from SharePoint for upsert...`);
    const existing = await fetchExistingItemMap(client, siteId, listId);
    console.log(`  Found ${existing.size} existing items in SharePoint`);

    console.log(`Fetching ${entity} data from database...`);
    const items = await getEntityData(entity);
    console.log(`Upserting ${items.length} ${entity} items to SharePoint...`);

    // Per-batch progress writes: fine-grained itemsSynced updates as
    // each ~200 items finish. Combined with the 30s timer above, the
    // UI now sees movement either every 200 items OR every 30s,
    // whichever comes first.
    const writeProgress = async (synced: number, failed: number) => {
      lastSynced = synced;
      lastFailed = failed;
      await updateSyncStatus(entity, { itemsSynced: synced, itemsFailed: failed });
    };

    const upsertResult = await batchUpsertItems(
      client, siteId, listId, items, existing,
      async (created, updated, failed) => writeProgress(created + updated, failed),
    );

    const currentExternalIds = new Set<string>(items.map((i: any) => i.ExternalId).filter(Boolean));
    const orphanResult = await deleteOrphans(
      client, siteId, listId, currentExternalIds, existing,
      async (deleted, failed) => writeProgress(upsertResult.created + upsertResult.updated, upsertResult.failed + failed),
    );

    const totalSynced = upsertResult.created + upsertResult.updated;
    const totalFailed = upsertResult.failed + orphanResult.failed;

    await updateSyncStatus(entity, {
      status: 'COMPLETE',
      lastSyncAt: new Date(),
      itemsSynced: totalSynced,
      itemsFailed: totalFailed,
      errorMessage: totalFailed > 0 ? `${totalFailed} items failed` : null,
    });

    console.log(`Sync complete for ${entity}: ${upsertResult.created} created, ${upsertResult.updated} updated, ${orphanResult.deleted} deleted, ${totalFailed} failed`);
    return { created: totalSynced, failed: totalFailed };
  } catch (err: any) {
    logGraphErr(`Sync failed for ${entity}:`, err);
    await updateSyncStatus(entity, { status: 'ERROR', errorMessage: err.message });
    throw err;
  } finally {
    clearInterval(heartbeatInterval);
  }
}

async function getEntityData(entity: string): Promise<any[]> {
  switch (entity) {
    case 'physicians': {
      const rows = await db.select().from(physicians);
      return rows.map(mapPhysicianFields);
    }
    case 'referrals': {
      const rows = await db.execute(sql`
        SELECT r.*,
          p.first_name as physician_first_name, p.last_name as physician_last_name, p.npi as physician_npi,
          l.name as location_name
        FROM referrals r
        LEFT JOIN physicians p ON r.physician_id = p.id
        LEFT JOIN locations l ON r.location_id = l.id
      `);
      return (rows.rows as any[]).map(mapReferralFields);
    }
    case 'interactions': {
      const rows = await db.execute(sql`
        SELECT i.*,
          p.first_name as physician_first_name, p.last_name as physician_last_name,
          u.name as user_name
        FROM interactions i
        LEFT JOIN physicians p ON i.physician_id = p.id
        LEFT JOIN users u ON i.user_id = u.id
      `);
      return (rows.rows as any[]).map(mapInteractionFields);
    }
    case 'tasks': {
      const rows = await db.execute(sql`
        SELECT t.*,
          p.first_name as physician_first_name, p.last_name as physician_last_name,
          u.name as user_name
        FROM tasks t
        LEFT JOIN physicians p ON t.physician_id = p.id
        LEFT JOIN users u ON t.assigned_to_user_id = u.id
      `);
      return (rows.rows as any[]).map(mapTaskFields);
    }
    case 'locations': {
      const rows = await db.select().from(locations);
      return rows.map(mapLocationFields);
    }
    default:
      throw new Error(`Unknown entity: ${entity}`);
  }
}

export async function syncAll(): Promise<Record<string, { created: number; failed: number }>> {
  const entities = ['locations', 'physicians', 'referrals', 'interactions', 'tasks'];
  const results: Record<string, { created: number; failed: number }> = {};

  for (const entity of entities) {
    try {
      results[entity] = await syncEntity(entity);
    } catch (err: any) {
      results[entity] = { created: 0, failed: -1 };
    }
  }

  return results;
}
