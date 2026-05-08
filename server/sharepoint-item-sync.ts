/**
 * Per-item SharePoint sync. Called from CRUD route handlers after a
 * successful local write to mirror the change to the corresponding
 * SharePoint list.
 *
 * Best-effort: every helper catches its own errors and returns
 * boolean/void. Local DB is always the source of truth — a failed
 * SharePoint write logs but does not roll back the user's save. The
 * bulk Sync All button on /admin/sharepoint can repair drift.
 *
 * Block-on-save: callers `await` these. The user's save click waits
 * ~300-500ms (single round-trip) for create, or ~500-1000ms (lookup +
 * mutate) for update/delete. Confirmed acceptable by user.
 *
 * Prerequisites: bulk sync must have run at least once for the
 * entity (so the list exists and we have a listId in
 * sharepoint_sync_status). If listId is null we silently skip.
 */
import { Client } from '@microsoft/microsoft-graph-client';
import { db } from './db';
import { eq, sql, desc } from 'drizzle-orm';
import {
  appSettings,
  sharepointSyncStatus,
  userOauthTokens,
  users,
  physicians,
  locations,
} from '@shared/schema';
import { getValidAccessToken } from './outlook-oauth-token-helpers';
import {
  mapPhysicianFields,
  mapReferralFields,
  mapInteractionFields,
  mapTaskFields,
  mapLocationFields,
} from './sharepoint-row-mappers';

export type SharePointEntity = 'physicians' | 'referrals' | 'interactions' | 'tasks' | 'locations';

async function getServiceUserId(): Promise<string | null> {
  const [row] = await db
    .select({ userId: userOauthTokens.userId })
    .from(userOauthTokens)
    .innerJoin(users, eq(users.id, userOauthTokens.userId))
    .where(eq(users.role, 'OWNER'))
    .orderBy(desc(userOauthTokens.updatedAt))
    .limit(1);
  return row?.userId ?? null;
}

async function getSiteId(): Promise<string | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, 'sharepoint_site_id'));
  return row?.value ?? null;
}

async function getListId(entity: SharePointEntity): Promise<string | null> {
  const [row] = await db.select().from(sharepointSyncStatus).where(eq(sharepointSyncStatus.entity, entity));
  return row?.listId ?? null;
}

/**
 * Returns a Graph client + the configured siteId + the entity's listId
 * if all prerequisites are met. Returns null (and logs nothing) if
 * SharePoint isn't set up — callers treat null as "skip silently".
 */
async function getContext(entity: SharePointEntity): Promise<{ client: Client; siteId: string; listId: string } | null> {
  try {
    const [serviceUserId, siteId, listId] = await Promise.all([
      getServiceUserId(),
      getSiteId(),
      getListId(entity),
    ]);
    if (!serviceUserId || !siteId || !listId) return null;
    const accessToken = await getValidAccessToken(serviceUserId);
    const client = Client.initWithMiddleware({
      authProvider: { getAccessToken: async () => accessToken },
    });
    return { client, siteId, listId };
  } catch {
    return null;
  }
}

async function findItemIdByExternalId(
  client: Client,
  siteId: string,
  listId: string,
  externalId: string,
): Promise<string | null> {
  try {
    const result = await client
      .api(`/sites/${siteId}/lists/${listId}/items`)
      .filter(`fields/ExternalId eq '${externalId}'`)
      .expand('fields($select=ExternalId)')
      .header('Prefer', 'HonorNonIndexedQueriesWarningMayFailRandomly')
      .top(1)
      .get();
    return result.value?.[0]?.id ?? null;
  } catch (err: any) {
    console.warn(`[SharePoint item-sync] findByExternalId failed for ${externalId}:`, err?.message);
    return null;
  }
}

/**
 * Builds the per-entity field object from a fresh DB read. For entities
 * with denormalized fields (referrals/interactions/tasks reference
 * physician/user names), runs a single-row JOIN.
 */
async function loadFields(entity: SharePointEntity, id: string): Promise<Record<string, unknown> | null> {
  switch (entity) {
    case 'physicians': {
      const [row] = await db.select().from(physicians).where(eq(physicians.id, id));
      return row ? mapPhysicianFields(row) : null;
    }
    case 'locations': {
      const [row] = await db.select().from(locations).where(eq(locations.id, id));
      return row ? mapLocationFields(row) : null;
    }
    case 'referrals': {
      const result = await db.execute(sql`
        SELECT r.*,
          p.first_name as physician_first_name, p.last_name as physician_last_name, p.npi as physician_npi,
          l.name as location_name
        FROM referrals r
        LEFT JOIN physicians p ON r.physician_id = p.id
        LEFT JOIN locations l ON r.location_id = l.id
        WHERE r.id = ${id}
        LIMIT 1
      `);
      const row = (result.rows as any[])[0];
      return row ? mapReferralFields(row) : null;
    }
    case 'interactions': {
      const result = await db.execute(sql`
        SELECT i.*,
          p.first_name as physician_first_name, p.last_name as physician_last_name,
          u.name as user_name
        FROM interactions i
        LEFT JOIN physicians p ON i.physician_id = p.id
        LEFT JOIN users u ON i.user_id = u.id
        WHERE i.id = ${id}
        LIMIT 1
      `);
      const row = (result.rows as any[])[0];
      return row ? mapInteractionFields(row) : null;
    }
    case 'tasks': {
      const result = await db.execute(sql`
        SELECT t.*,
          p.first_name as physician_first_name, p.last_name as physician_last_name,
          u.name as user_name
        FROM tasks t
        LEFT JOIN physicians p ON t.physician_id = p.id
        LEFT JOIN users u ON t.assigned_to_user_id = u.id
        WHERE t.id = ${id}
        LIMIT 1
      `);
      const row = (result.rows as any[])[0];
      return row ? mapTaskFields(row) : null;
    }
  }
}

/** Mirror a newly-created entity row to SharePoint. Returns true if posted, false otherwise. */
export async function syncItemCreate(entity: SharePointEntity, id: string): Promise<boolean> {
  const ctx = await getContext(entity);
  if (!ctx) return false;
  try {
    const fields = await loadFields(entity, id);
    if (!fields) return false;
    await ctx.client.api(`/sites/${ctx.siteId}/lists/${ctx.listId}/items`).post({ fields });
    return true;
  } catch (err: any) {
    console.warn(`[SharePoint item-sync] create ${entity}/${id} failed:`, err?.message);
    return false;
  }
}

/**
 * Mirror an updated entity row. If the SharePoint item exists, PATCH
 * its fields. If it doesn't (row created before auto-sync was on, or
 * a previous create failed), POST it instead so the data eventually
 * shows up.
 */
export async function syncItemUpdate(entity: SharePointEntity, id: string): Promise<boolean> {
  const ctx = await getContext(entity);
  if (!ctx) return false;
  try {
    const fields = await loadFields(entity, id);
    if (!fields) return false;
    const itemId = await findItemIdByExternalId(ctx.client, ctx.siteId, ctx.listId, id);
    if (itemId) {
      await ctx.client.api(`/sites/${ctx.siteId}/lists/${ctx.listId}/items/${itemId}/fields`).patch(fields);
    } else {
      await ctx.client.api(`/sites/${ctx.siteId}/lists/${ctx.listId}/items`).post({ fields });
    }
    return true;
  } catch (err: any) {
    console.warn(`[SharePoint item-sync] update ${entity}/${id} failed:`, err?.message);
    return false;
  }
}

/** Mirror a deletion. No-op if the SharePoint item is already gone (404 treated as success). */
export async function syncItemDelete(entity: SharePointEntity, id: string): Promise<boolean> {
  const ctx = await getContext(entity);
  if (!ctx) return false;
  try {
    const itemId = await findItemIdByExternalId(ctx.client, ctx.siteId, ctx.listId, id);
    if (!itemId) return true; // already absent
    await ctx.client.api(`/sites/${ctx.siteId}/lists/${ctx.listId}/items/${itemId}`).delete();
    return true;
  } catch (err: any) {
    if (err?.statusCode === 404) return true;
    console.warn(`[SharePoint item-sync] delete ${entity}/${id} failed:`, err?.message);
    return false;
  }
}
