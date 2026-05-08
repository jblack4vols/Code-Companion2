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

async function getClient() {
  const accessToken = await getAccessToken();
  return Client.initWithMiddleware({
    authProvider: { getAccessToken: async () => accessToken }
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

async function clearList(client: Client, siteId: string, listId: string) {
  // Mirror the Retry-After handling from batchCreateItems — clearList
  // also issues hundreds of inner DELETE requests via $batch and trips
  // SharePoint's rate limit when wiping a 3000+ row list. Without this,
  // a 429 in the delete batch would either get silently dropped or
  // bubble up as 'The request has been throttled' from syncEntity.
  const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
  const readRetryAfter = (headers: any): number => {
    const v = headers?.['Retry-After'] ?? headers?.['retry-after'] ?? '5';
    const n = parseInt(String(v), 10);
    return Number.isFinite(n) ? n : 5;
  };
  const INTER_BATCH_PAUSE_MS = 100;
  const MAX_RETRY_WAIT_SEC = 60;
  const MAX_ATTEMPTS_PER_ITEM = 4;

  let hasMore = true;
  while (hasMore) {
    const page = await client.api(`/sites/${siteId}/lists/${listId}/items`).select('id').top(100).get();
    const batch = (page.value as any[]) || [];
    if (batch.length === 0) { hasMore = false; break; }

    // Track pending IDs across retry attempts. Each pass deletes what it
    // can, throttled IDs go back into pending for the next pass.
    let pending = batch.map((item: any) => item.id as string);
    let attempt = 1;

    while (pending.length > 0 && attempt <= MAX_ATTEMPTS_PER_ITEM) {
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
              // success or already gone — both fine
            } else if (resp.status === 429 || resp.status === 503) {
              stillThrottled.push(itemId);
              const retry = readRetryAfter(resp.headers);
              if (retry > maxRetryAfter) maxRetryAfter = retry;
            }
            // other errors: drop the item, will get caught next sync if it sticks around
          }
        } catch (err: any) {
          console.warn('Batch delete error, treating chunk as throttled:', err?.message);
          for (const id of chunkIds) stillThrottled.push(id);
          if (maxRetryAfter < 5) maxRetryAfter = 5;
        }

        if (i + 20 < pending.length) await sleep(INTER_BATCH_PAUSE_MS);
      }

      pending = stillThrottled;
      if (pending.length > 0 && attempt < MAX_ATTEMPTS_PER_ITEM) {
        const waitSec = Math.min(Math.max(maxRetryAfter, 5), MAX_RETRY_WAIT_SEC);
        console.log(`clearList: ${pending.length} delete(s) throttled, waiting ${waitSec}s...`);
        await sleep(waitSec * 1000);
      }
      attempt++;
    }
  }
}

async function batchCreateItems(
  client: Client,
  siteId: string,
  listId: string,
  items: any[],
): Promise<{ created: number; failed: number }> {
  // Microsoft Graph $batch returns 200 overall but individual sub-requests
  // can come back 429 (throttled) when SharePoint's per-app/per-tenant rate
  // limit is hit (~1200 reqs/min). Previous version logged "throttled" and
  // dropped those items — sync of 3867 physicians lost ~half. Now we:
  //   1. Collect items that came back 429 (or 503).
  //   2. Read their Retry-After hint from response headers.
  //   3. After the pass finishes, sleep that long.
  //   4. Retry the throttled subset. Up to MAX_ATTEMPTS rounds.
  // Plus a small inter-batch pause to stay below the rate limit proactively.
  const MAX_ATTEMPTS = 4;
  const INTER_BATCH_PAUSE_MS = 100;
  const MAX_RETRY_WAIT_SEC = 60;

  let created = 0;
  let failed = 0;
  let pending: any[] = items.slice();
  let attempt = 1;

  const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
  const readRetryAfter = (headers: any): number => {
    const v = headers?.['Retry-After'] ?? headers?.['retry-after'] ?? '5';
    const n = parseInt(String(v), 10);
    return Number.isFinite(n) ? n : 5;
  };

  while (pending.length > 0 && attempt <= MAX_ATTEMPTS) {
    if (attempt > 1) {
      console.log(`Retry pass ${attempt}: ${pending.length} items remaining`);
    }

    const stillThrottled: any[] = [];
    let maxRetryAfter = 0;
    let processed = 0;
    const total = pending.length;

    for (let i = 0; i < pending.length; i += 20) {
      const chunk = pending.slice(i, i + 20);
      const batchReqs = chunk.map((fields: any, idx: number) => ({
        id: `${idx}`,
        method: 'POST',
        url: `/sites/${siteId}/lists/${listId}/items`,
        headers: { 'Content-Type': 'application/json' },
        body: { fields },
      }));

      try {
        const result = await client.api('/$batch').post({ requests: batchReqs });
        for (const resp of result.responses || []) {
          const reqIdx = parseInt(resp.id, 10);
          const item = chunk[reqIdx];
          if (resp.status >= 200 && resp.status < 300) {
            created++;
          } else if (resp.status === 429 || resp.status === 503) {
            stillThrottled.push(item);
            const retry = readRetryAfter(resp.headers);
            if (retry > maxRetryAfter) maxRetryAfter = retry;
          } else {
            failed++;
            console.warn(`Item create failed (${resp.status}):`, resp.body?.error?.message);
          }
        }
      } catch (err: any) {
        // Whole $batch call exploded — treat as throttle and retry whole chunk
        console.warn('Batch create error, retrying chunk later:', err?.message);
        for (const fields of chunk) stillThrottled.push(fields);
        if (maxRetryAfter < 5) maxRetryAfter = 5;
      }

      processed += chunk.length;
      if (processed % 200 === 0 || i + 20 >= pending.length) {
        console.log(`  Progress: ${processed}/${total} items processed (attempt ${attempt})`);
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
  if (pending.length > 0) {
    console.warn(`Gave up on ${pending.length} items after ${MAX_ATTEMPTS} attempts`);
  }
  return { created, failed };
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

export async function syncEntity(entity: string): Promise<{ created: number; failed: number }> {
  const siteId = await getSiteId();
  if (!siteId) throw new Error('SharePoint site not configured. Please set a site first.');

  const client = await getClient();
  await updateSyncStatus(entity, { status: 'SYNCING', siteId, errorMessage: null });

  try {
    const listId = await ensureList(client, siteId, entity);
    await updateSyncStatus(entity, { listId });

    console.log(`Clearing existing items from ${entity} list...`);
    await clearList(client, siteId, listId);

    console.log(`Fetching ${entity} data from database...`);
    const items = await getEntityData(entity);
    console.log(`Syncing ${items.length} ${entity} items to SharePoint...`);

    const result = await batchCreateItems(client, siteId, listId, items);

    await updateSyncStatus(entity, {
      status: 'COMPLETE',
      lastSyncAt: new Date(),
      itemsSynced: result.created,
      itemsFailed: result.failed,
      errorMessage: result.failed > 0 ? `${result.failed} items failed` : null,
    });

    console.log(`Sync complete for ${entity}: ${result.created} created, ${result.failed} failed`);
    return result;
  } catch (err: any) {
    logGraphErr(`Sync failed for ${entity}:`, err);
    await updateSyncStatus(entity, { status: 'ERROR', errorMessage: err.message });
    throw err;
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
