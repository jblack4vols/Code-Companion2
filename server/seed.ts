import { db } from "./db";
import { users, locations, physicians, interactions, referrals, tasks, calendarEvents, userLocationAccess, auditLogs, appSettings, type InsertPhysician } from "@shared/schema";
import { sql, eq } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";
import { bulkUpsertPhysicians } from "./storage-physicians";

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
