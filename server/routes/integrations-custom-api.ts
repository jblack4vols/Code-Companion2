/**
 * Custom API + GoHighLevel integration route handlers (test, sync, CRUD).
 * Registered by integrations.ts barrel.
 */
import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { z } from "zod";
import { isNull } from "drizzle-orm";
import { physicians as physiciansTable, referrals as referralsTable } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { requireRole, getClientIp } from "./shared";

/** Prevent SSRF by rejecting private/internal URLs before outbound fetch */
function isUrlSafe(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    const hostname = url.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0") return false;
    if (hostname.startsWith("10.") || hostname.startsWith("192.168.") || hostname.startsWith("169.254.")) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) return false;
    if (hostname.endsWith(".internal") || hostname.endsWith(".local")) return false;
    return true;
  } catch { return false; }
}

const createIntegrationSchema = z.object({
  type: z.enum(["GOHIGHLEVEL", "CUSTOM_API", "MICROSOFT"]),
  name: z.string().min(1).max(100),
  settings: z.record(z.any()).optional().default({}),
});

const updateIntegrationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  status: z.enum(["CONNECTED", "DISCONNECTED", "ERROR"]).optional(),
  settings: z.record(z.any()).optional(),
});

export function registerCustomApiRoutes(app: Express) {
  // ---- CRUD ----

  app.get("/api/integrations", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      res.json(await storage.getIntegrationConfigs());
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/integrations", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const parsed = createIntegrationSchema.parse(req.body);
      const existing = await storage.getIntegrationConfigByType(parsed.type);
      if (existing) return res.status(400).json({ message: `Integration of type ${parsed.type} already exists` });
      const config = await storage.createIntegrationConfig(parsed);
      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE_INTEGRATION", entity: "Integration", entityId: config.id, detailJson: { type: parsed.type, name: parsed.name }, ipAddress: getClientIp(req), userAgent: (req.headers["user-agent"] as string) || null });
      res.json(config);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/integrations/:id", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const parsed = updateIntegrationSchema.parse(req.body);
      const updated = await storage.updateIntegrationConfig(req.params.id as string, parsed);
      if (!updated) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "UPDATE_INTEGRATION", entity: "Integration", entityId: updated.id, detailJson: { changes: Object.keys(req.body) }, ipAddress: getClientIp(req), userAgent: (req.headers["user-agent"] as string) || null });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/integrations/:id", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const deleted = await storage.deleteIntegrationConfig(req.params.id as string);
      if (!deleted) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "DELETE_INTEGRATION", entity: "Integration", entityId: req.params.id as string, detailJson: {}, ipAddress: getClientIp(req), userAgent: (req.headers["user-agent"] as string) || null });
      res.json({ success: true });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ---- Test connection ----

  app.post("/api/integrations/:id/test", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const config = await storage.getIntegrationConfig(req.params.id as string);
      if (!config) return res.status(404).json({ message: "Not found" });

      if (config.type === "GOHIGHLEVEL") {
        const apiKey = config.settings?.apiKey;
        const locationId = config.settings?.locationId || "";
        if (!apiKey) return res.json({ success: false, message: "No API key configured" });
        if (!locationId) return res.json({ success: false, message: "Location ID is required for GoHighLevel v2 API. Find it in your GHL sub-account settings." });
        try {
          const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json", Version: "2021-07-28" };
          const resp = await fetch(`https://services.leadconnectorhq.com/contacts/?locationId=${locationId}&limit=1`, { headers });
          if (resp.ok) {
            await storage.updateIntegrationConfig(config.id, { status: "CONNECTED" } as any);
            return res.json({ success: true, message: "Connected to GoHighLevel successfully" });
          } else {
            const errorBody = await resp.text().catch(() => "");
            await storage.updateIntegrationConfig(config.id, { status: "ERROR" } as any);
            let hint = "";
            if (resp.status === 401) hint = " Make sure you are using a Private Integration Token (not a v1 API key) and that it has the 'contacts.readonly' scope enabled.";
            else if (resp.status === 422) hint = " The Location ID may be incorrect. Check your GHL sub-account settings.";
            return res.json({ success: false, message: `GoHighLevel returned ${resp.status}: ${resp.statusText}.${hint}` });
          }
        } catch (fetchErr: any) {
          await storage.updateIntegrationConfig(config.id, { status: "ERROR" } as any);
          return res.json({ success: false, message: `Connection failed: ${fetchErr.message}` });
        }
      }

      if (config.type === "CUSTOM_API") {
        const baseUrl = config.settings?.baseUrl;
        const apiKey = config.settings?.apiKey;
        if (!baseUrl) return res.json({ success: false, message: "No base URL configured" });
        if (!isUrlSafe(baseUrl)) return res.status(400).json({ success: false, message: "Invalid or disallowed base URL" });
        try {
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
          const resp = await fetch(baseUrl, { method: "GET", headers });
          if (resp.ok || resp.status === 401 || resp.status === 403) {
            await storage.updateIntegrationConfig(config.id, { status: "CONNECTED" } as any);
            return res.json({ success: true, message: `Reached ${baseUrl} (HTTP ${resp.status})` });
          } else {
            await storage.updateIntegrationConfig(config.id, { status: "ERROR" } as any);
            return res.json({ success: false, message: `Endpoint returned ${resp.status}` });
          }
        } catch (fetchErr: any) {
          await storage.updateIntegrationConfig(config.id, { status: "ERROR" } as any);
          return res.json({ success: false, message: `Connection failed: ${fetchErr.message}` });
        }
      }

      res.json({ success: false, message: "Test not available for this integration type" });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ---- GHL custom fields ----

  app.get("/api/integrations/:id/custom-fields", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const config = await storage.getIntegrationConfig(req.params.id as string);
      if (!config) return res.status(404).json({ message: "Not found" });
      if (config.type !== "GOHIGHLEVEL") return res.status(400).json({ message: "Only supported for GoHighLevel" });
      const apiKey = config.settings?.apiKey;
      const locationId = config.settings?.locationId;
      if (!apiKey || !locationId) return res.status(400).json({ message: "API key and Location ID are required" });
      const ghlHeaders = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json", Version: "2021-07-28" };
      const cfResp = await fetch(`https://services.leadconnectorhq.com/locations/${locationId}/customFields`, { headers: ghlHeaders });
      if (!cfResp.ok) {
        let detail = "";
        try { const errBody = await cfResp.text(); detail = errBody.slice(0, 200); } catch {}
        console.error(`[GHL] Custom fields fetch failed: ${cfResp.status} ${detail}`);
        return res.json({ success: false, message: `GHL returned ${cfResp.status}`, fields: [] });
      }
      const cfData: any = await cfResp.json();
      const cfList = cfData.customFields || cfData.data || [];
      const fields = (Array.isArray(cfList) ? cfList : []).map((cf: any) => ({
        id: cf.id || cf.fieldKey || "",
        name: cf.name || cf.fieldKey || cf.label || "",
        fieldKey: cf.fieldKey || "",
        dataType: cf.dataType || "TEXT",
      }));
      return res.json({ success: true, fields });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  // ---- Sync ----

  app.post("/api/integrations/:id/sync", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const config = await storage.getIntegrationConfig(req.params.id as string);
      if (!config) return res.status(404).json({ message: "Not found" });
      const direction = req.body.direction || "push";

      const log = await storage.createIntegrationSyncLog({
        integrationId: config.id,
        direction,
        status: "running",
        details: { triggeredBy: req.session.userId } as Record<string, any>,
      });

      if (config.type === "GOHIGHLEVEL" && config.settings?.apiKey) {
        const apiKey = config.settings.apiKey;
        const locationId = config.settings.locationId || "";

        if (direction === "push") {
          return handleGhlPush(res, config, log.id, apiKey, locationId);
        }
        if (direction === "pull") {
          return handleGhlPull(res, config, log.id, apiKey, locationId);
        }
      }

      if (config.type === "CUSTOM_API") {
        return handleCustomApiPush(res, config, log.id);
      }

      await storage.updateIntegrationSyncLog(log.id, { status: "skipped", details: { message: "Sync not configured for this integration" }, finishedAt: new Date() });
      res.json({ success: false, message: "Sync not available or not configured" });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/integrations/:id/logs", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const logs = await storage.getIntegrationSyncLogs(req.params.id as string, 20);
      res.json(logs);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}

// ---- GHL push helper ----

async function handleGhlPush(res: any, config: any, logId: string, apiKey: string, locationId: string) {
  try {
    const allPhysicians = await storage.getPhysicians();
    let processed = 0, failed = 0;
    for (const phys of allPhysicians.slice(0, 100)) {
      try {
        const contactData: Record<string, any> = {
          firstName: phys.firstName, lastName: phys.lastName,
          email: phys.email || "", phone: phys.phone || "",
          companyName: phys.practiceName || "", address1: phys.primaryOfficeAddress || "",
          city: phys.city || "", state: phys.state || "", postalCode: phys.zip || "",
          tags: ["tristar-physician", phys.status?.toLowerCase() || "prospect"],
          customField: { npi: phys.npi || "", credentials: phys.credentials || "", specialty: phys.specialty || "" },
        };
        if (locationId) contactData.locationId = locationId;
        const resp = await fetch("https://services.leadconnectorhq.com/contacts/", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json", Version: "2021-07-28" },
          body: JSON.stringify(contactData),
        });
        if (resp.ok || resp.status === 200 || resp.status === 201) processed++;
        else failed++;
      } catch { failed++; }
    }
    await storage.updateIntegrationSyncLog(logId, { status: "completed", recordsProcessed: processed, recordsFailed: failed, finishedAt: new Date() });
    await storage.updateIntegrationConfig(config.id, { lastSyncAt: new Date(), lastSyncStatus: `Pushed ${processed} contacts` } as any);
    return res.json({ success: true, processed, failed });
  } catch (syncErr: any) {
    await storage.updateIntegrationSyncLog(logId, { status: "error", details: { error: syncErr.message }, finishedAt: new Date() });
    return res.json({ success: false, message: syncErr.message });
  }
}

// ---- GHL pull helper ----

async function handleGhlPull(res: any, config: any, logId: string, apiKey: string, locationId: string) {
  try {
    const ghlHeaders = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json", Version: "2021-07-28" };
    const savedMappings: Record<string, string> = config.settings?.fieldMappings || {};

    // Load custom field definitions
    let fieldIdToName: Record<string, string> = {};
    if (locationId) {
      try {
        const cfResp = await fetch(`https://services.leadconnectorhq.com/locations/${locationId}/customFields`, { headers: ghlHeaders });
        if (cfResp.ok) {
          const cfData: any = await cfResp.json();
          const cfList = cfData.customFields || cfData.data || [];
          for (const cf of (Array.isArray(cfList) ? cfList : [])) {
            const id = cf.id || cf.fieldKey || "";
            const name = (cf.name || cf.fieldKey || cf.label || "").toLowerCase();
            if (id) fieldIdToName[id] = name;
            if (cf.fieldKey) fieldIdToName[cf.fieldKey] = name;
          }
        }
      } catch (cfErr: any) {
        console.log(`[GHL] Custom field fetch error: ${cfErr.message}`);
      }
    }

    // Fetch all contacts with pagination
    let allContacts: any[] = [];
    let nextPageUrl: string | null = `https://services.leadconnectorhq.com/contacts/?limit=100${locationId ? "&locationId=" + locationId : ""}`;
    let pageCount = 0;
    while (nextPageUrl && pageCount < 50) {
      const resp = await fetch(nextPageUrl, { headers: ghlHeaders });
      if (!resp.ok) {
        if (pageCount === 0) {
          await storage.updateIntegrationSyncLog(logId, { status: "error", details: { httpStatus: resp.status }, finishedAt: new Date() });
          return res.json({ success: false, message: `GHL API returned ${resp.status}` });
        }
        break;
      }
      const data: any = await resp.json();
      const pageContacts = data.contacts || [];
      allContacts = allContacts.concat(pageContacts);
      pageCount++;
      const meta = data.meta || {};
      if (meta.nextPageUrl) nextPageUrl = meta.nextPageUrl;
      else if (meta.nextPage) nextPageUrl = `https://services.leadconnectorhq.com/contacts/?limit=100${locationId ? "&locationId=" + locationId : ""}&page=${meta.nextPage}`;
      else if (data.nextPage) nextPageUrl = `https://services.leadconnectorhq.com/contacts/?limit=100${locationId ? "&locationId=" + locationId : ""}&startAfterId=${pageContacts[pageContacts.length - 1]?.id || ""}`;
      else nextPageUrl = null;
      if (pageContacts.length < 100) nextPageUrl = null;
    }

    // Field classification helper
    const classifyField = (keyOrId: string): string | null => {
      if (savedMappings[keyOrId]) return savedMappings[keyOrId];
      const resolved = fieldIdToName[keyOrId];
      const name = (resolved || keyOrId || "").toLowerCase().replace(/[_.\-]/g, " ").trim();
      if (name.includes("npi")) return "npi";
      if (name.includes("credential")) return "credentials";
      if (name.includes("special")) return "specialty";
      if (name.includes("referring") && (name.includes("physician") || name.includes("doctor") || name.includes("provider"))) return "referringPhysician";
      if (["referring provider", "referring doctor", "referring physician", "doctor", "physician", "provider name", "provider", "contact referring provider"].includes(name)) return "referringPhysician";
      if (name.includes("ref doctor") || name.includes("ref provider") || name.includes("ref physician")) return "referringPhysician";
      if (name.includes("location") || name.includes("clinic")) return "location";
      if (name.includes("insurance") || name.includes("payer")) return "insurance";
      if (name.includes("diagnosis") || name.includes("condition")) return "diagnosis";
      return null;
    };

    // Preload data for dedup / matching
    const allLocations = await storage.getLocations();
    const defaultLocationId = allLocations.length > 0 ? allLocations[0].id : null;
    const allPhysiciansForSync = await storage.getPhysicians();
    const physicianByNpi = new Map<string, typeof allPhysiciansForSync[0]>();
    const physicianByName = new Map<string, typeof allPhysiciansForSync[0]>();
    for (const p of allPhysiciansForSync) {
      if (p.npi) physicianByNpi.set(p.npi.trim(), p);
      physicianByName.set(`${p.firstName.toLowerCase().trim()}|${p.lastName.toLowerCase().trim()}`, p);
    }
    const existingGhlReferrals = await db.select({ patientFullName: referralsTable.patientFullName, referralDate: referralsTable.referralDate })
      .from(referralsTable).where(and(eq(referralsTable.referralSource, "GoHighLevel"), isNull(referralsTable.deletedAt)));
    const existingGhlKeys = new Set(existingGhlReferrals.map(r => `${r.patientFullName}|${r.referralDate}`));

    let referralsCreated = 0, providersCreated = 0, providersMatched = 0, skipped = 0, failed = 0;
    const results: { patient: string; physician: string; action: string; referralId?: string }[] = [];

    for (const contact of allContacts) {
      try {
        const rawFirst = (contact.firstName || contact.first_name || "").trim();
        const rawLast = (contact.lastName || contact.last_name || "").trim();
        if (!rawFirst && !rawLast) { skipped++; continue; }

        const toTitleCase = (s: string) => s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
        const patientName = `${toTitleCase(rawFirst)} ${toTitleCase(rawLast)}`.trim();
        const patientPhone = (contact.phone || "").trim();
        const ghlContactId = contact.id || contact.contactId || "";

        let customFields: Record<string, any> = {};
        const rawCustom = contact.customField || contact.customFields || {};
        if (Array.isArray(rawCustom)) {
          for (const cf of rawCustom) {
            const val = cf.value ?? cf.field_value ?? "";
            if (!val && val !== 0) continue;
            const candidates = [cf.field_key, cf.key, cf.id, cf.name, cf.label].filter(Boolean);
            let matched = false;
            for (const candidate of candidates) {
              const cls = classifyField(candidate);
              if (cls) { customFields[cls] = val; matched = true; break; }
            }
            if (!matched) {
              for (const candidate of candidates) {
                const resolvedName = fieldIdToName[candidate] || "";
                if (resolvedName) { const cls = classifyField(resolvedName); if (cls) { customFields[cls] = val; break; } }
              }
            }
          }
        } else if (typeof rawCustom === "object" && rawCustom !== null) {
          for (const [key, val] of Object.entries(rawCustom)) {
            if (!val && val !== 0) continue;
            const strVal = typeof val === "object" ? JSON.stringify(val) : String(val);
            const cls = classifyField(key);
            if (cls) customFields[cls] = strVal;
            else { const rn = fieldIdToName[key] || ""; if (rn) { const cls2 = classifyField(rn); if (cls2) customFields[cls2] = strVal; } }
          }
        }

        const contactDate = contact.dateAdded || contact.date_added || contact.createdAt || contact.created_at;
        const referralDate = contactDate ? new Date(contactDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
        const dedupeKey = `${patientName}|${referralDate}`;
        if (existingGhlKeys.has(dedupeKey)) { skipped++; results.push({ patient: patientName, physician: "", action: "already imported" }); continue; }

        const refPhysName = (customFields.referringPhysician || contact.companyName || contact.company_name || "").trim();
        const refNpi = (customFields.npi || "").trim();
        let physicianId: string | null = null;
        let physicianLabel = "none";

        if (refPhysName) {
          let physFirst = "", physLast = "";
          if (refPhysName.includes(",")) {
            const parts = refPhysName.split(",").map((s: string) => s.trim());
            physLast = parts[0]; physFirst = parts[1] || "";
          } else {
            const nameParts = refPhysName.split(/\s+/);
            if (nameParts.length > 1) { physFirst = nameParts.slice(0, -1).join(" "); physLast = nameParts[nameParts.length - 1]; }
            else { physLast = nameParts[0]; physFirst = nameParts[0]; }
          }
          const npiLookup = refNpi ? physicianByNpi.get(refNpi.trim()) : undefined;
          const nameLookup = physicianByName.get(`${physFirst.toLowerCase().trim()}|${physLast.toLowerCase().trim()}`);
          const existing = npiLookup || nameLookup;
          if (existing) {
            physicianId = existing.id;
            physicianLabel = `${existing.firstName} ${existing.lastName} (matched)`;
            providersMatched++;
          } else {
            const newPhys = await storage.createPhysician({ firstName: physFirst, lastName: physLast, npi: refNpi || undefined, credentials: customFields.credentials || undefined, specialty: customFields.specialty || undefined, status: "PROSPECT", relationshipStage: "NEW", priority: "MEDIUM", tags: ["ghl-import"], referralSourceAttribution: "GoHighLevel" });
            physicianId = newPhys.id;
            physicianLabel = `${physFirst} ${physLast} (new)`;
            providersCreated++;
            if (newPhys.npi) physicianByNpi.set(newPhys.npi.trim(), newPhys);
            physicianByName.set(`${newPhys.firstName.toLowerCase().trim()}|${newPhys.lastName.toLowerCase().trim()}`, newPhys);
          }
        }

        let matchedLocationId = defaultLocationId;
        if (customFields.location) {
          const locMatch = allLocations.find((l: any) => l.name.toLowerCase().includes(customFields.location.toLowerCase()) || customFields.location.toLowerCase().includes(l.name.toLowerCase().replace("tristar pt - ", "")));
          if (locMatch) matchedLocationId = locMatch.id;
        }
        if (!matchedLocationId) { skipped++; results.push({ patient: patientName, physician: physicianLabel, action: "no location" }); continue; }

        const newReferral = await storage.createReferral({ physicianId: physicianId || undefined, locationId: matchedLocationId, referringProviderName: refPhysName || undefined, referringProviderNpi: refNpi || undefined, referralDate, patientFullName: patientName, patientPhone: patientPhone || undefined, patientAccountNumber: ghlContactId || undefined, caseTitle: `GHL Import - ${patientName}`, referralSource: "GoHighLevel", primaryInsurance: customFields.insurance || undefined, diagnosisCategory: customFields.diagnosis || undefined, status: "RECEIVED" });
        existingGhlKeys.add(dedupeKey);
        referralsCreated++;
        results.push({ patient: patientName, physician: physicianLabel, action: "referral created", referralId: newReferral.id });
      } catch { failed++; }
    }

    const summary = `Pulled ${allContacts.length} contacts: ${referralsCreated} referrals created, ${providersCreated} new providers added, ${providersMatched} matched, ${skipped} skipped, ${failed} failed`;
    await storage.updateIntegrationSyncLog(logId, { status: "completed", recordsProcessed: referralsCreated, recordsFailed: failed, details: { contactsReceived: allContacts.length, referralsCreated, providersCreated, providersMatched, skipped, failed, results: results.slice(0, 50) }, finishedAt: new Date() });
    await storage.updateIntegrationConfig(config.id, { lastSyncAt: new Date(), lastSyncStatus: summary } as any);
    return res.json({ success: true, message: summary, referralsCreated, providersCreated, providersMatched, skipped, failed });
  } catch (syncErr: any) {
    await storage.updateIntegrationSyncLog(logId, { status: "error", details: { error: syncErr.message }, finishedAt: new Date() });
    return res.json({ success: false, message: syncErr.message });
  }
}

// ---- Custom API webhook push helper ----

async function handleCustomApiPush(res: any, config: any, logId: string) {
  const webhookUrl = config.settings?.webhookUrl;
  if (!webhookUrl) {
    await storage.updateIntegrationSyncLog(logId, { status: "skipped", details: { message: "No webhook URL configured" }, finishedAt: new Date() });
    return res.json({ success: false, message: "No webhook URL configured. Add one in the Custom API settings." });
  }

  try {
    const allPhysicians = await storage.getPhysicians();
    const allReferrals = await storage.getReferrals();
    const allLocations = await storage.getLocations();
    const locationMap: Record<string, string> = {};
    for (const loc of allLocations) locationMap[loc.id] = loc.name;

    const physicianPayload = allPhysicians.map((p: any) => ({
      id: p.id, npi: p.npi || "", firstName: p.firstName, lastName: p.lastName,
      credentials: p.credentials || "", specialty: p.specialty || "", practiceName: p.practiceName || "",
      email: p.email || "", phone: p.phone || "", fax: p.fax || "",
      primaryOfficeAddress: p.primaryOfficeAddress || "", city: p.city || "", state: p.state || "", zip: p.zip || "",
      status: p.status || "", tier: p.tier || "", healthScore: p.healthScore || null, totalReferrals: p.totalReferrals || 0,
    }));

    const referralPayload = allReferrals.map((r: any) => ({
      id: r.id, patientFullName: r.patientFullName || "", referralDate: r.referralDate || "",
      status: r.status || "", caseTitle: r.caseTitle || "", referralSource: r.referralSource || "",
      primaryInsurance: r.primaryInsurance || "", diagnosisCategory: r.diagnosisCategory || "",
      referringProviderName: r.referringProviderName || "", referringProviderNpi: r.referringProviderNpi || "",
      locationName: r.locationId ? (locationMap[r.locationId] || "") : "",
    }));

    const payload = {
      source: "Tristar360",
      timestamp: new Date().toISOString(),
      providers: physicianPayload,
      referrals: referralPayload,
      summary: { totalProviders: physicianPayload.length, totalReferrals: referralPayload.length, locations: allLocations.map(l => ({ id: l.id, name: l.name })) },
    };

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const apiKey = config.settings?.apiKey;
    if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

    const resp = await fetch(webhookUrl, { method: "POST", headers, body: JSON.stringify(payload) });
    const respText = await resp.text().catch(() => "");
    const success = resp.ok || resp.status === 200 || resp.status === 201 || resp.status === 202;
    const summaryMsg = success ? `Pushed ${physicianPayload.length} providers and ${referralPayload.length} referrals to webhook` : `Webhook returned ${resp.status}: ${respText.substring(0, 200)}`;

    await storage.updateIntegrationSyncLog(logId, { status: success ? "completed" : "error", recordsProcessed: physicianPayload.length + referralPayload.length, recordsFailed: success ? 0 : 1, details: { providersSent: physicianPayload.length, referralsSent: referralPayload.length, httpStatus: resp.status, response: respText.substring(0, 500) }, finishedAt: new Date() });
    await storage.updateIntegrationConfig(config.id, { lastSyncAt: new Date(), lastSyncStatus: summaryMsg } as any);
    return res.json({ success, message: summaryMsg, providersSent: physicianPayload.length, referralsSent: referralPayload.length });
  } catch (syncErr: any) {
    await storage.updateIntegrationSyncLog(logId, { status: "error", details: { error: syncErr.message }, finishedAt: new Date() });
    return res.json({ success: false, message: `Webhook push failed: ${syncErr.message}` });
  }
}
