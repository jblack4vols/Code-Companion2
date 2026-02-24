import { Client } from '@microsoft/microsoft-graph-client';
import { db } from './db';
import { sharepointSyncStatus, appSettings, physicians, referrals, interactions, tasks, locations } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings?.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? 'depl ' + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error('X-Replit-Token not found');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=sharepoint',
    {
      headers: {
        'Accept': 'application/json',
        'X-Replit-Token': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;
  if (!connectionSettings || !accessToken) {
    throw new Error('SharePoint not connected');
  }
  return accessToken;
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
    console.error('SharePoint site search error:', err.message);
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
  if (existing) return existing.id;

  const listPayload: any = {
    displayName: def.displayName,
    list: { template: "genericList" }
  };

  const created = await client.api(`/sites/${siteId}/lists`).post(listPayload);
  const listId = created.id;

  for (const col of def.columns) {
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
  let hasMore = true;
  while (hasMore) {
    const items = await client.api(`/sites/${siteId}/lists/${listId}/items`).select('id').top(100).get();
    const batch = items.value || [];
    if (batch.length === 0) { hasMore = false; break; }

    for (let i = 0; i < batch.length; i += 20) {
      const chunk = batch.slice(i, i + 20);
      const batchReqs = chunk.map((item: any, idx: number) => ({
        id: `${idx}`,
        method: "DELETE",
        url: `/sites/${siteId}/lists/${listId}/items/${item.id}`
      }));
      try {
        await client.api('/$batch').post({ requests: batchReqs });
      } catch (err: any) {
        console.warn('Batch delete error:', err.message);
        for (const item of chunk) {
          try {
            await client.api(`/sites/${siteId}/lists/${listId}/items/${item.id}`).delete();
          } catch {}
        }
      }
    }
  }
}

async function batchCreateItems(client: Client, siteId: string, listId: string, items: any[]): Promise<{ created: number; failed: number }> {
  let created = 0;
  let failed = 0;

  for (let i = 0; i < items.length; i += 20) {
    const chunk = items.slice(i, i + 20);
    const batchReqs = chunk.map((fields: any, idx: number) => ({
      id: `${idx}`,
      method: "POST",
      url: `/sites/${siteId}/lists/${listId}/items`,
      headers: { "Content-Type": "application/json" },
      body: { fields }
    }));

    try {
      const result = await client.api('/$batch').post({ requests: batchReqs });
      for (const resp of result.responses || []) {
        if (resp.status >= 200 && resp.status < 300) created++;
        else {
          failed++;
          console.warn(`Item create failed:`, resp.body?.error?.message);
        }
      }
    } catch (err: any) {
      console.warn('Batch create error, falling back to individual:', err.message);
      for (const fields of chunk) {
        try {
          await client.api(`/sites/${siteId}/lists/${listId}/items`).post({ fields });
          created++;
        } catch (e: any) {
          failed++;
          console.warn('Individual item create failed:', e.message);
        }
      }
    }

    if (i % 200 === 0 && i > 0) {
      console.log(`  Progress: ${i}/${items.length} items processed`);
    }
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
    console.error(`Sync failed for ${entity}:`, err.message);
    await updateSyncStatus(entity, { status: 'ERROR', errorMessage: err.message });
    throw err;
  }
}

async function getEntityData(entity: string): Promise<any[]> {
  switch (entity) {
    case 'physicians': {
      const rows = await db.select().from(physicians);
      return rows.map(p => ({
        Title: `${p.lastName}, ${p.firstName}`,
        ExternalId: p.id,
        FirstName: p.firstName || '',
        LastName: p.lastName || '',
        Credentials: p.credentials || '',
        Specialty: p.specialty || '',
        NPI: p.npi || '',
        PracticeName: p.practiceName || '',
        Address: p.primaryOfficeAddress || '',
        City: p.city || '',
        State: p.state || '',
        Zip: p.zip || '',
        Phone: p.phone || '',
        Fax: p.fax || '',
        Email: p.email || '',
        Status: p.status || '',
        RelationshipStage: p.relationshipStage || '',
        Priority: p.priority || '',
        Notes: p.notes || '',
        LastInteractionAt: p.lastInteractionAt ? new Date(p.lastInteractionAt).toISOString() : '',
      }));
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
      return (rows.rows as any[]).map(r => ({
        Title: r.case_title || r.patient_account_number || 'Referral',
        ExternalId: r.id,
        PhysicianName: r.physician_first_name && r.physician_last_name ? `${r.physician_last_name}, ${r.physician_first_name}` : (r.referring_provider_name || ''),
        PhysicianNPI: r.physician_npi || r.referring_provider_npi || '',
        LocationName: r.location_name || '',
        ReferralDate: r.referral_date || '',
        PatientAccount: r.patient_account_number || '',
        PatientName: r.patient_full_name || '',
        CaseTitle: r.case_title || '',
        CaseTherapist: r.case_therapist || '',
        ReferralSource: r.referral_source || '',
        Status: r.status || '',
        Discipline: r.discipline || '',
        DiagnosisCategory: r.diagnosis_category || '',
        PrimaryInsurance: r.primary_insurance || '',
        PrimaryPayerType: r.primary_payer_type || '',
        ScheduledVisits: r.scheduled_visits || 0,
        ArrivedVisits: r.arrived_visits || 0,
        DischargeDate: r.discharge_date || '',
        DischargeReason: r.discharge_reason || '',
        DateOfInitialEval: r.date_of_initial_eval || '',
      }));
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
      return (rows.rows as any[]).map(r => ({
        Title: `${r.type} - ${r.physician_last_name || 'Unknown'}`,
        ExternalId: r.id,
        PhysicianName: r.physician_first_name && r.physician_last_name ? `${r.physician_last_name}, ${r.physician_first_name}` : '',
        UserName: r.user_name || '',
        Type: r.type || '',
        OccurredAt: r.occurred_at ? new Date(r.occurred_at).toISOString() : '',
        Summary: r.summary || '',
        NextStep: r.next_step || '',
        FollowUpDueAt: r.follow_up_due_at ? new Date(r.follow_up_due_at).toISOString() : '',
      }));
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
      return (rows.rows as any[]).map(r => ({
        Title: (r.description as string)?.substring(0, 100) || 'Task',
        ExternalId: r.id,
        PhysicianName: r.physician_first_name && r.physician_last_name ? `${r.physician_last_name}, ${r.physician_first_name}` : '',
        AssignedTo: r.user_name || '',
        DueAt: r.due_at ? new Date(r.due_at as string).toISOString() : '',
        Priority: r.priority || '',
        Status: r.status || '',
        Description: r.description || '',
      }));
    }
    case 'locations': {
      const rows = await db.select().from(locations);
      return rows.map(l => ({
        Title: l.name,
        ExternalId: l.id,
        LocationName: l.name || '',
        Address: l.address || '',
        City: l.city || '',
        State: l.state || '',
        Phone: l.phone || '',
        IsActive: l.isActive ? 'Yes' : 'No',
      }));
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
