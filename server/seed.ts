import { db } from "./db";
import { users, locations, physicians, interactions, referrals, tasks, calendarEvents, userLocationAccess, auditLogs, appSettings, type InsertPhysician, type InsertReferral } from "@shared/schema";
import { sql, eq, isNull } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import { bulkUpsertPhysicians } from "./storage-physicians";
import { bulkUpsertReferrals } from "./storage-referrals";

async function loadJsonData(filename: string): Promise<any[]> {
  const filePath = path.join(process.cwd(), "data", filename);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

async function syncOwnerCredentials() {
  const ownerEmail = "jblack@tristarpt.com";
  const bcrypt = await import("bcryptjs");
  const seedOwnerPw = process.env.SEED_OWNER_PASSWORD;
  if (!seedOwnerPw) return;

  const existingOwner = await db.select().from(users).where(eq(users.email, ownerEmail));

  if (existingOwner.length > 0) {
    const owner = existingOwner[0];
    const passwordMatch = owner.password ? await bcrypt.compare(seedOwnerPw, owner.password) : false;
    if (!passwordMatch) {
      const newHash = await bcrypt.hash(seedOwnerPw, 10);
      await db.update(users).set({ password: newHash }).where(eq(users.id, owner.id));
      console.log(`[seed] Updated password for ${ownerEmail}`);
    }
    return;
  }

  const legacyOwner = await db.select().from(users).where(eq(users.email, "admin@tristar360.com"));
  if (legacyOwner.length > 0) {
    const newHash = await bcrypt.hash(seedOwnerPw, 10);
    await db.update(users).set({ email: ownerEmail, password: newHash }).where(eq(users.id, legacyOwner[0].id));
    console.log(`[seed] Migrated owner from admin@tristar360.com -> ${ownerEmail}`);
  }
}

async function syncUserCredentials() {
  const bcrypt = await import("bcryptjs");
  const credentialUpdates: { email: string; password: string; }[] = [
    { email: "cvaughn@tristarpt.com", password: process.env.SEED_CVAUGHN_PASSWORD || "" },
  ];

  for (const { email, password } of credentialUpdates) {
    if (!password) continue;
    const existing = await db.select().from(users).where(eq(users.email, email));
    if (existing.length === 0) continue;
    const user = existing[0];
    const match = user.password ? await bcrypt.compare(password, user.password) : false;
    if (!match) {
      const hash = await bcrypt.hash(password, 10);
      await db.update(users).set({ password: hash, forcePasswordChange: false }).where(eq(users.id, user.id));
      console.log(`[seed] Updated password for ${email}`);
    }
  }
}

async function ensureUserLocationAccess() {
  const allUsers = await db.select({ id: users.id, role: users.role }).from(users);
  const allLocations = await db.select({ id: locations.id }).from(locations);
  if (allLocations.length === 0) return;

  for (const user of allUsers) {
    if (user.role === "OWNER" || user.role === "DIRECTOR") continue;
    const existing = await db.select({ locationId: userLocationAccess.locationId })
      .from(userLocationAccess)
      .where(eq(userLocationAccess.userId, user.id));
    const existingSet = new Set(existing.map(e => e.locationId));
    for (const loc of allLocations) {
      if (!existingSet.has(loc.id)) {
        await db.insert(userLocationAccess).values({ userId: user.id, locationId: loc.id });
      }
    }
    if (existing.length < allLocations.length) {
      console.log(`[seed] Assigned ${allLocations.length - existing.length} locations to user ${user.id}`);
    }
  }
}

export async function seed() {
  await syncOwnerCredentials();
  await syncUserCredentials();
  await ensureUserLocationAccess();

  const existingUsers = await db.select().from(users);
  const existingPhysicians = await db.select({ id: physicians.id }).from(physicians).limit(20);

  if (existingUsers.length > 0 && existingPhysicians.length > 15) {
    console.log("Database already has real data, skipping seed...");
    return;
  }

  const dataDir = path.join(process.cwd(), "data");
  const hasDataFiles = fs.existsSync(path.join(dataDir, "physicians.json"));

  if (hasDataFiles) {
    console.log("Loading data from exported JSON files...");

    await db.delete(auditLogs);
    await db.delete(tasks);
    await db.delete(interactions);
    await db.delete(referrals);
    await db.delete(calendarEvents);
    await db.delete(physicians);
    await db.delete(userLocationAccess);
    await db.delete(locations);
    await db.delete(users);

    const usersData = await loadJsonData("users.json");
    if (usersData.length > 0) {
      const bcrypt = await import("bcryptjs");
      if (process.env.NODE_ENV === "production") {
        if (!process.env.SEED_OWNER_PASSWORD) {
          console.warn("[seed] WARNING: SEED_OWNER_PASSWORD env var is not set. Using weak default password in production!");
        }
        if (!process.env.SEED_USER_PASSWORD) {
          console.warn("[seed] WARNING: SEED_USER_PASSWORD env var is not set. Using weak default password in production!");
        }
      }
      const seedOwnerPw = process.env.SEED_OWNER_PASSWORD || "change_me_owner";
      const seedUserPw = process.env.SEED_USER_PASSWORD || "change_me_user";
      const ownerHash = await bcrypt.hash(seedOwnerPw, 10);
      const userHash = await bcrypt.hash(seedUserPw, 10);
      for (const u of usersData) {
        await db.insert(users).values({
          id: u.id,
          name: u.name,
          email: u.email,
          password: u.role === "OWNER" ? ownerHash : userHash,
          role: u.role,
        }).onConflictDoNothing();
      }
      console.log(`Loaded ${usersData.length} users`);
    }

    const locationsData = await loadJsonData("locations.json");
    if (locationsData.length > 0) {
      for (const l of locationsData) {
        await db.insert(locations).values({
          id: l.id,
          name: l.name,
          address: l.address,
          city: l.city,
          state: l.state,
          phone: l.phone,
          isActive: l.isActive,
        }).onConflictDoNothing();
      }
      console.log(`Loaded ${locationsData.length} locations`);
    }

    const physiciansData = await loadJsonData("physicians.json");
    if (physiciansData.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < physiciansData.length; i += BATCH_SIZE) {
        const batch = physiciansData.slice(i, i + BATCH_SIZE).map((p: any) => ({
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          credentials: p.credentials,
          specialty: p.specialty,
          npi: p.npi,
          practiceName: p.practiceName,
          primaryOfficeAddress: p.primaryOfficeAddress,
          city: p.city,
          state: p.state,
          zip: p.zip,
          phone: p.phone,
          fax: p.fax,
          email: p.email,
          status: p.status,
          relationshipStage: p.relationshipStage,
          priority: p.priority,
          assignedOwnerId: p.assignedOwnerId,
          notes: p.notes,
          tags: p.tags,
        }));
        await db.insert(physicians).values(batch).onConflictDoNothing();
      }
      console.log(`Loaded ${physiciansData.length} physicians`);
    }

    const referralsData = await loadJsonData("referrals.json");
    if (referralsData.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < referralsData.length; i += BATCH_SIZE) {
        const batch = referralsData.slice(i, i + BATCH_SIZE).map((r: any) => ({
          id: r.id,
          physicianId: r.physicianId,
          locationId: r.locationId,
          referringProviderName: r.referringProviderName,
          referringProviderNpi: r.referringProviderNpi,
          referralDate: r.referralDate,
          patientAccountNumber: r.patientAccountNumber,
          patientInitialsOrAnonId: r.patientInitialsOrAnonId,
          patientFullName: r.patientFullName,
          patientDob: r.patientDob,
          patientPhone: r.patientPhone,
          caseTitle: r.caseTitle,
          caseTherapist: r.caseTherapist,
          dateOfInitialEval: r.dateOfInitialEval,
          referralSource: r.referralSource,
          dischargeDate: r.dischargeDate,
          dischargeReason: r.dischargeReason,
          scheduledVisits: r.scheduledVisits,
          arrivedVisits: r.arrivedVisits,
          discipline: r.discipline,
          primaryInsurance: r.primaryInsurance,
          primaryPayerType: r.primaryPayerType,
          dateOfFirstScheduledVisit: r.dateOfFirstScheduledVisit,
          dateOfFirstArrivedVisit: r.dateOfFirstArrivedVisit,
          createdToArrived: r.createdToArrived,
          payerType: r.payerType,
          diagnosisCategory: r.diagnosisCategory,
          status: r.status,
          valueEstimate: r.valueEstimate,
        }));
        await db.insert(referrals).values(batch).onConflictDoNothing();
      }
      console.log(`Loaded ${referralsData.length} referrals`);
    }

    const interactionsData = await loadJsonData("interactions.json");
    if (interactionsData.length > 0) {
      for (const item of interactionsData) {
        await db.insert(interactions).values({
          id: item.id,
          physicianId: item.physicianId,
          locationId: item.locationId,
          userId: item.userId,
          type: item.type,
          occurredAt: new Date(item.occurredAt),
          summary: item.summary,
          nextStep: item.nextStep,
          followUpDueAt: item.followUpDueAt ? new Date(item.followUpDueAt) : null,
        }).onConflictDoNothing();
      }
      console.log(`Loaded ${interactionsData.length} interactions`);
    }

    const tasksData = await loadJsonData("tasks.json");
    if (tasksData.length > 0) {
      for (const item of tasksData) {
        await db.insert(tasks).values({
          id: item.id,
          physicianId: item.physicianId,
          assignedToUserId: item.assignedToUserId,
          dueAt: new Date(item.dueAt),
          priority: item.priority,
          status: item.status,
          description: item.description,
        }).onConflictDoNothing();
      }
      console.log(`Loaded ${tasksData.length} tasks`);
    }

    console.log("Data import from JSON files complete!");
    return;
  }

  if (existingUsers.length > 0) {
    console.log("Database already seeded, skipping...");
    return;
  }

  console.log("Seeding database with default data...");

  const bcrypt = await import("bcryptjs");
  const adminHash = await bcrypt.hash(process.env.SEED_OWNER_PASSWORD || "change_me_owner", 10);
  const passHash = await bcrypt.hash(process.env.SEED_USER_PASSWORD || "change_me_user", 10);

  await db.insert(users).values([
    { name: "Sarah Mitchell", email: "jblack@tristarpt.com", password: adminHash, role: "OWNER" },
    { name: "James Wilson", email: "james@tristar360.com", password: passHash, role: "DIRECTOR" },
    { name: "Emily Chen", email: "emily@tristar360.com", password: passHash, role: "MARKETER" },
    { name: "Maria Santos", email: "maria@tristar360.com", password: passHash, role: "FRONT_DESK" },
    { name: "David Park", email: "david@tristar360.com", password: passHash, role: "ANALYST" },
  ]);

  await db.insert(locations).values([
    { name: "Nashville Downtown", address: "100 Broadway", city: "Nashville", state: "TN", phone: "(615) 555-0100" },
    { name: "Franklin", address: "210 Main St", city: "Franklin", state: "TN", phone: "(615) 555-0200" },
    { name: "Murfreesboro", address: "500 Memorial Blvd", city: "Murfreesboro", state: "TN", phone: "(615) 555-0300" },
    { name: "Hendersonville", address: "300 Indian Lake Blvd", city: "Hendersonville", state: "TN", phone: "(615) 555-0400" },
    { name: "Brentwood", address: "150 Franklin Rd", city: "Brentwood", state: "TN", phone: "(615) 555-0500" },
    { name: "Mt. Juliet", address: "400 N Mt Juliet Rd", city: "Mt. Juliet", state: "TN", phone: "(615) 555-0600" },
    { name: "Clarksville", address: "700 Riverside Dr", city: "Clarksville", state: "TN", phone: "(931) 555-0700" },
    { name: "Gallatin", address: "200 W Main St", city: "Gallatin", state: "TN", phone: "(615) 555-0800" },
  ]);

  console.log("Default seed complete: 5 users, 8 locations");
}

/**
 * One-shot import of the canonical Tristar referring-provider roster from
 * `scripts/data/tristar-referring-providers-import.csv`. Runs on startup,
 * exits early via an `app_settings` sentinel so it only fires the first
 * time after this code lands. Re-running requires deleting the sentinel.
 *
 * Calls `bulkUpsertPhysicians` which dedups by NPI: existing physicians
 * UPDATE rather than duplicate. Custom fields (cf_*) are merged with any
 * existing customFields on the physician, never overwriting individual keys.
 *
 * Skips NPPES enrichment that the user-driven /import flow does — the CSV
 * already has clean addresses, and adding 3865 NPPES round trips to startup
 * would push cold-start over Railway's healthcheck timeout. Run
 * /api/import/enrich-npis from the UI afterward if any rows need NPPES fill.
 */
export async function seedReferringProvidersRoster(): Promise<void> {
  const SENTINEL_KEY = "providers_roster_seeded_v1";
  const CSV_RELATIVE = "scripts/data/tristar-referring-providers-import.csv";

  const existing = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, SENTINEL_KEY));
  if (existing.length > 0) {
    console.log("[seed] Provider roster already imported, skipping");
    return;
  }

  const csvPath = path.join(process.cwd(), CSV_RELATIVE);
  if (!fs.existsSync(csvPath)) {
    console.warn(`[seed] Provider roster CSV not found at ${csvPath} — skipping`);
    return;
  }

  // Parse CSV using ExcelJS (already a dep — keeps tooling consistent with /import flow).
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.csv.readFile(csvPath);
  const ws = workbook.worksheets[0];
  if (!ws) {
    console.warn("[seed] Provider roster CSV had no worksheets — skipping");
    return;
  }

  const headers: string[] = [];
  ws.getRow(1).eachCell((cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? "").trim();
  });

  const rows: InsertPhysician[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (h: string): string | undefined => {
      const idx = headers.indexOf(h);
      if (idx < 0) return undefined;
      const v = row.getCell(idx).value;
      if (v == null || v === "") return undefined;
      return String(v).trim() || undefined;
    };

    const customFields: Record<string, string> = {};
    for (const h of headers) {
      if (h.startsWith("cf_")) {
        const v = get(h);
        if (v) customFields[h] = v;
      }
    }

    const firstName = get("firstName");
    const lastName = get("lastName");
    if (!firstName || !lastName) continue;

    rows.push({
      firstName,
      lastName,
      credentials: get("credentials"),
      specialty: get("specialty"),
      npi: get("npi"),
      practiceName: get("practiceName"),
      primaryOfficeAddress: get("address1"),
      city: get("city"),
      state: get("state"),
      zip: get("zip"),
      phone: get("phone"),
      fax: get("fax"),
      customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
      status: "PROSPECT",
      relationshipStage: "NEW",
      priority: "MEDIUM",
    });
  }

  if (rows.length === 0) {
    console.warn("[seed] Provider roster CSV had zero parseable rows — skipping");
    return;
  }

  console.log(`[seed] Importing ${rows.length} providers from canonical roster…`);
  const result = await bulkUpsertPhysicians(rows);
  console.log(
    `[seed] Provider roster imported: ${result.inserted} inserted, ${result.updated} updated, ${result.errors.length} errors`,
  );

  await db
    .insert(appSettings)
    .values({
      key: SENTINEL_KEY,
      value: JSON.stringify({
        importedAt: new Date().toISOString(),
        inserted: result.inserted,
        updated: result.updated,
        totalParsed: rows.length,
      }),
    })
    .onConflictDoNothing();
}

/**
 * One-shot import of the YTD created-cases (referrals) roster from
 * `scripts/data/tristar-created-cases-ytd-import.csv`. Idempotent via the
 * app_settings sentinel, runs once on the first deploy after this code lands.
 *
 * Strategy:
 *   - Pre-load all physicians (NPI + name) and locations (name) into memory
 *     once. 2k+ rows × per-row DB lookups would be too slow at startup.
 *   - Resolve referringProviderNpi → physicianId via the in-memory map.
 *     Rows whose NPI matches a known physician get linked. Unmatched rows
 *     still insert with referringProviderName + referringProviderNpi
 *     populated; physicianId stays null. The CRM has separate flows
 *     (provider-office-linker, /api/import/enrich-npis) to retroactively
 *     link these.
 *   - Resolve facilityName → locationId via name (case-insensitive substring).
 *     Rows without a matching location are skipped (location_id is notNull
 *     in the schema). Logs the unmatched count.
 *   - Single bulkUpsertReferrals call. Dedupes by patientAccountNumber +
 *     caseTitle.
 */
export async function seedReferralsRoster(): Promise<void> {
  const SENTINEL_KEY = "referrals_ytd_seeded_v1";
  const CSV_RELATIVE = "scripts/data/tristar-created-cases-ytd-import.csv";

  const existing = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, SENTINEL_KEY));
  if (existing.length > 0) {
    console.log("[seed] Referrals roster already imported, skipping");
    return;
  }

  const csvPath = path.join(process.cwd(), CSV_RELATIVE);
  if (!fs.existsSync(csvPath)) {
    console.warn(`[seed] Referrals CSV not found at ${csvPath} — skipping`);
    return;
  }

  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.csv.readFile(csvPath);
  const ws = workbook.worksheets[0];
  if (!ws) {
    console.warn("[seed] Referrals CSV had no worksheets — skipping");
    return;
  }

  const headers: string[] = [];
  ws.getRow(1).eachCell((cell, colNumber) => {
    headers[colNumber] = String(cell.value ?? "").trim();
  });

  // Pre-load physicians and locations once.
  const allPhysicians = await db.select().from(physicians).where(isNull(physicians.deletedAt));
  const physByNpi = new Map<string, string>();
  for (const p of allPhysicians) {
    if (p.npi) physByNpi.set(p.npi.trim(), p.id);
  }

  const allLocations = await db.select().from(locations);
  const locByName = new Map<string, string>();
  for (const l of allLocations) {
    locByName.set(l.name.trim().toLowerCase(), l.id);
  }
  const resolveLocation = (name: string): string | undefined => {
    const key = name.trim().toLowerCase();
    if (locByName.has(key)) return locByName.get(key);
    // Substring match — Excel "Tristar PT - Morristown" against DB "Morristown"
    const entries = Array.from(locByName.entries());
    for (const [n, id] of entries) {
      if (key.includes(n) || n.includes(key)) return id;
    }
    return undefined;
  };

  const rows: InsertReferral[] = [];
  let unmatchedLocations = 0;
  let unmatchedPhysicians = 0;
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (h: string): string | undefined => {
      const idx = headers.indexOf(h);
      if (idx < 0) return undefined;
      const v = row.getCell(idx).value;
      if (v == null || v === "") return undefined;
      return String(v).trim() || undefined;
    };
    const getInt = (h: string): number | undefined => {
      const v = get(h);
      if (!v) return undefined;
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : undefined;
    };

    const facilityName = get("facilityName");
    const locationId = facilityName ? resolveLocation(facilityName) : undefined;
    if (!locationId) {
      unmatchedLocations++;
      continue;
    }

    const referralDate = get("referralDate");
    if (!referralDate) continue;

    const npi = get("referringProviderNpi");
    const physicianId = npi ? physByNpi.get(npi) : undefined;
    if (npi && !physicianId) unmatchedPhysicians++;

    const status = (get("status") ?? "RECEIVED") as InsertReferral["status"];

    rows.push({
      patientAccountNumber: get("patientAccountNumber"),
      patientFullName: get("patientFullName"),
      caseTitle: get("caseTitle"),
      caseTherapist: get("caseTherapist"),
      locationId,
      physicianId: physicianId ?? null,
      referringProviderName: get("referringProviderName"),
      referringProviderNpi: npi,
      referralSource: get("referralSource"),
      referralDate,
      dateOfInitialEval: get("dateOfInitialEval") ?? null,
      dischargeDate: get("dischargeDate") ?? null,
      dischargeReason: get("dischargeReason"),
      scheduledVisits: getInt("scheduledVisits") ?? 0,
      arrivedVisits: getInt("arrivedVisits") ?? 0,
      dateOfFirstScheduledVisit: get("dateOfFirstScheduledVisit") ?? null,
      dateOfFirstArrivedVisit: get("dateOfFirstArrivedVisit") ?? null,
      createdToArrived: getInt("createdToArrived"),
      primaryInsurance: get("primaryInsurance"),
      primaryPayerType: get("primaryPayerType"),
      discipline: get("discipline"),
      diagnosisCategory: get("diagnosisCategory"),
      status,
    });
  }

  if (rows.length === 0) {
    console.warn("[seed] Referrals CSV had zero importable rows — skipping");
    return;
  }

  console.log(
    `[seed] Importing ${rows.length} referrals from YTD roster ` +
      `(${unmatchedLocations} skipped — no location match; ` +
      `${unmatchedPhysicians} inserted without physician link — no NPI match)…`,
  );
  const result = await bulkUpsertReferrals(rows);
  console.log(
    `[seed] Referrals roster imported: ${result.inserted} inserted, ${result.updated} updated, ${result.errors.length} errors`,
  );

  await db
    .insert(appSettings)
    .values({
      key: SENTINEL_KEY,
      value: JSON.stringify({
        importedAt: new Date().toISOString(),
        inserted: result.inserted,
        updated: result.updated,
        unmatchedLocations,
        unmatchedPhysicians,
        totalParsed: rows.length,
      }),
    })
    .onConflictDoNothing();
}

/**
 * Seed Brandon's hand-curated decline alerts (Apr 2026 review of Oct 2025
 * → Apr 2026 referral trends). Adds three custom fields per matched
 * physician — alert level, free-text note, and a back-reference to the
 * source review — merging with any existing customFields so the prior
 * roster import (PR #22) and ongoing user edits aren't blown away.
 *
 * Sentinel-gated; bump SENTINEL_KEY to re-run with updated data.
 */
export async function seedProviderDeclineAlerts(): Promise<void> {
  const SENTINEL_KEY = "provider_decline_alerts_v1";
  const REVIEW_LABEL = "Brandon — Oct 2025 to Apr 2026 review";

  const existing = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, SENTINEL_KEY));
  if (existing.length > 0) {
    console.log("[seed] Provider decline alerts already imported, skipping");
    return;
  }

  // 28 rows from the "Declines over six months" sheet of the
  // March-vs-April spreadsheet. Alert levels stripped of source
  // emoji prefixes (🔴 CRITICAL → CRITICAL, etc.).
  const DECLINE_ALERTS: { npi: string; alertLevel: "CRITICAL" | "WATCH" | "MONITOR"; note?: string }[] = [
    { npi: "1811125057", alertLevel: "CRITICAL", note: "ETSU Pediatrics" },
    { npi: "1932633484", alertLevel: "CRITICAL" },
    { npi: "1649326596", alertLevel: "WATCH", note: "No longer at Newport" },
    { npi: "1518052687", alertLevel: "WATCH", note: "Pediatric at Fort Sanders" },
    { npi: "1760686711", alertLevel: "WATCH", note: "Newport" },
    { npi: "1831959022", alertLevel: "WATCH", note: "KOC" },
    { npi: "1942251806", alertLevel: "WATCH" },
    { npi: "1992152144", alertLevel: "WATCH" },
    { npi: "1295936391", alertLevel: "WATCH" },
    { npi: "1457320012", alertLevel: "WATCH" },
    { npi: "1760916985", alertLevel: "WATCH" },
    { npi: "1467403386", alertLevel: "WATCH" },
    { npi: "1184123382", alertLevel: "WATCH" },
    { npi: "1477100113", alertLevel: "WATCH" },
    { npi: "1730137423", alertLevel: "WATCH" },
    { npi: "1558872531", alertLevel: "WATCH" },
    { npi: "1710913900", alertLevel: "WATCH" },
    { npi: "1174913180", alertLevel: "WATCH", note: "Maternity Leave" },
    { npi: "1841295011", alertLevel: "WATCH" },
    { npi: "1639129323", alertLevel: "WATCH" },
    { npi: "1134704133", alertLevel: "WATCH" },
    { npi: "1093159436", alertLevel: "WATCH" },
    { npi: "1093071268", alertLevel: "WATCH" },
    { npi: "1457767345", alertLevel: "WATCH" },
    { npi: "1801819198", alertLevel: "WATCH" },
    { npi: "1063452365", alertLevel: "WATCH" },
    { npi: "1023094349", alertLevel: "MONITOR" },
    { npi: "1801892054", alertLevel: "MONITOR" },
  ];

  const allPhysicians = await db
    .select()
    .from(physicians)
    .where(isNull(physicians.deletedAt));
  const byNpi = new Map<string, (typeof allPhysicians)[number]>();
  for (const p of allPhysicians) {
    if (p.npi) byNpi.set(p.npi.trim(), p);
  }

  let updated = 0;
  let unmatched = 0;
  for (const alert of DECLINE_ALERTS) {
    const phys = byNpi.get(alert.npi);
    if (!phys) {
      unmatched++;
      continue;
    }
    const existingCf = (phys.customFields ?? {}) as Record<string, string>;
    const merged: Record<string, string> = {
      ...existingCf,
      cf_decline_alert_level: alert.alertLevel,
      cf_decline_alert_source: REVIEW_LABEL,
    };
    if (alert.note) merged.cf_decline_note = alert.note;
    await db
      .update(physicians)
      .set({ customFields: merged, updatedAt: new Date() })
      .where(eq(physicians.id, phys.id));
    updated++;
  }

  console.log(
    `[seed] Provider decline alerts imported: ${updated} updated, ${unmatched} unmatched (NPI not in physicians table)`,
  );

  await db
    .insert(appSettings)
    .values({
      key: SENTINEL_KEY,
      value: JSON.stringify({
        importedAt: new Date().toISOString(),
        updated,
        unmatched,
        source: REVIEW_LABEL,
      }),
    })
    .onConflictDoNothing();
}
