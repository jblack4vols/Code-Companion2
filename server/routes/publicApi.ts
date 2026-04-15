import type { Express, Request, Response, NextFunction } from "express";
import { storage } from "../storage";
import { z } from "zod";
import crypto from "crypto";
import { requireRole, getClientIp } from "./shared";

// Helper: retrieve location IDs for the API key that made the request.
// Returns null if the key has no location restriction (all data allowed).
async function getApiKeyLocationIds(req: Request): Promise<string[] | null> {
  const apiKeyId = (req as any).apiKeyId as string | undefined;
  if (!apiKeyId) return null;
  const key = await storage.getApiKeyById(apiKeyId);
  if (!key) return null;
  const ids = (key.locationIds as string[] | null) || [];
  return ids.length > 0 ? ids : null;
}

export function registerPublicApiRoutes(app: Express) {
  app.get("/api/api-keys", requireRole("OWNER"), async (req, res) => {
    try {
      const keys = await storage.getApiKeys();
      res.json(keys.map((k) => ({ ...k, keyHash: undefined })));
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const createApiKeySchema = z.object({
    name: z.string().min(1).max(100),
    scopes: z.array(z.string()).min(1).default(["physicians:read", "referrals:read", "locations:read"]),
    expiresInDays: z.number().int().min(1).max(365).optional(),
    locationIds: z.array(z.string()).optional().default([]),
  });

  app.post("/api/api-keys", requireRole("OWNER"), async (req, res) => {
    try {
      const { name, scopes, expiresInDays, locationIds } = createApiKeySchema.parse(req.body);

      const rawKey = `tsk_${crypto.randomBytes(32).toString("hex")}`;
      const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
      const keyPrefix = rawKey.slice(0, 8);

      let expiresAt: Date | undefined;
      if (expiresInDays) {
        expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
      }

      const apiKey = await storage.createApiKey({
        name,
        keyHash,
        keyPrefix,
        scopes: scopes || ["physicians:read", "referrals:read", "locations:read"],
        locationIds: locationIds || [],
        createdBy: req.session.userId!,
        ...(expiresAt && { expiresAt }),
      });

      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE_API_KEY", entity: "ApiKey", entityId: apiKey.id, detailJson: { name, scopes, expiresAt: expiresAt?.toISOString() }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ ...apiKey, rawKey, keyHash: undefined });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/api-keys/:id/rotate", requireRole("OWNER"), async (req, res) => {
    try {
      const oldKey = await storage.getApiKeyById(String(req.params.id));
      if (!oldKey) return res.status(404).json({ message: "Not found" });

      await storage.deactivateApiKey(oldKey.id);

      const rawKey = `tsk_${crypto.randomBytes(32).toString("hex")}`;
      const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
      const keyPrefix = rawKey.slice(0, 8);

      const expiresInDays = req.body?.expiresInDays;
      let expiresAt: Date | undefined;
      if (expiresInDays && typeof expiresInDays === "number") {
        expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
      } else if (oldKey.expiresAt) {
        const remainingMs = new Date(oldKey.expiresAt).getTime() - Date.now();
        if (remainingMs > 0) {
          expiresAt = new Date(Date.now() + remainingMs);
        }
      }

      const newApiKey = await storage.createApiKey({
        name: oldKey.name,
        keyHash,
        keyPrefix,
        scopes: oldKey.scopes as string[],
        createdBy: req.session.userId!,
        ...(expiresAt && { expiresAt }),
      });

      await storage.createAuditLog({ userId: req.session.userId!, action: "ROTATE_API_KEY", entity: "ApiKey", entityId: newApiKey.id, detailJson: { oldKeyId: oldKey.id, name: oldKey.name }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ ...newApiKey, rawKey, keyHash: undefined });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.delete("/api/api-keys/:id", requireRole("OWNER"), async (req, res) => {
    try {
      const deactivated = await storage.deactivateApiKey(String(req.params.id));
      if (!deactivated) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "DEACTIVATE_API_KEY", entity: "ApiKey", entityId: String(req.params.id), detailJson: {}, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  const requireApiKey = (scope: string) => async (req: Request, res: Response, next: NextFunction) => {
    const apiKeyHeader = req.headers["x-tristar-api-key"] as string;
    if (!apiKeyHeader) return res.status(401).json({ error: "API key required. Set X-TRISTAR-API-KEY header." });

    const keyHash = crypto.createHash("sha256").update(apiKeyHeader).digest("hex");
    const key = await storage.getApiKeyByHash(keyHash);
    if (!key || !key.isActive) return res.status(401).json({ error: "Invalid or inactive API key" });

    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      return res.status(401).json({ error: "API key has expired. Please rotate or create a new key." });
    }

    const scopes = (key.scopes as string[]) || [];
    if (!scopes.includes(scope) && !scopes.includes("*")) {
      return res.status(403).json({ error: `Missing scope: ${scope}` });
    }

    await storage.updateApiKeyLastUsed(key.id);
    (req as any).apiKeyId = key.id;
    next();
  };

  app.get("/api/public/physicians", requireApiKey("physicians:read"), async (req, res) => {
    try {
      const allPhysicians = await storage.getPhysicians();
      // Physicians are not directly location-scoped, return all
      res.json({ data: allPhysicians, total: allPhysicians.length });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/public/physicians/:id", requireApiKey("physicians:read"), async (req, res) => {
    try {
      const phys = await storage.getPhysician(String(req.params.id));
      if (!phys) return res.status(404).json({ error: "Not found" });
      res.json(phys);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/public/referrals", requireApiKey("referrals:read"), async (req, res) => {
    try {
      const locationIds = await getApiKeyLocationIds(req);
      const allReferrals = await storage.getReferrals();
      // Filter by key's location scope when set; otherwise return all (backward-compatible)
      const data = locationIds
        ? allReferrals.filter(r => locationIds.includes(r.locationId))
        : allReferrals;
      res.json({ data, total: data.length });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/public/locations", requireApiKey("locations:read"), async (req, res) => {
    try {
      const locationIds = await getApiKeyLocationIds(req);
      const allLocations = await storage.getLocations();
      // Filter by key's location scope when set; otherwise return all (backward-compatible)
      const data = locationIds
        ? allLocations.filter(l => locationIds.includes(l.id))
        : allLocations;
      res.json({ data, total: data.length });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/api/public/interactions", requireApiKey("interactions:read"), async (req, res) => {
    try {
      const locationIds = await getApiKeyLocationIds(req);
      const allInteractions = await storage.getInteractions();
      // Filter by key's location scope when set; otherwise return all (backward-compatible)
      const data = locationIds
        ? allInteractions.filter(i => i.locationId && locationIds.includes(i.locationId))
        : allInteractions;
      res.json({ data, total: data.length });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/public/webhook", requireApiKey("webhook:write"), async (req, res) => {
    try {
      const body = req.body || {};
      console.log(`[Webhook] RAW BODY received, keys: ${Object.keys(body).join(", ")}`);

      const event = body.event || body.type || body.action;
      const data = body.data || body.payload || body.contact || body;

      if (!event) {
        console.warn("[Webhook] No event field found. Keys:", Object.keys(body).join(", "));
        return res.status(400).json({ error: "event field required", receivedKeys: Object.keys(body) });
      }

      console.log(`[Webhook] Parsed event: ${event}, data keys: ${Object.keys(data || {}).join(", ")}`);

      if (event === "referral.created" || event === "contact.create" || event === "ContactCreate" || event === "contact.created") {
        try {
          const allLocations = await storage.getLocations();
          let matchedLocationId: string | null = null;

          const locField = data.locationId || data.location_id || data.location || data.locationName;
          if (locField) {
            const locById = allLocations.find((l: any) => l.id === locField);
            if (locById) {
              matchedLocationId = locById.id;
            } else {
              const locByName = allLocations.find((l: any) =>
                l.name.toLowerCase().includes(String(locField).toLowerCase()) ||
                String(locField).toLowerCase().includes(l.name.toLowerCase().replace("tristar pt - ", ""))
              );
              if (locByName) matchedLocationId = locByName.id;
            }
          }
          if (!matchedLocationId && allLocations.length > 0) {
            matchedLocationId = allLocations[0].id;
          }

          if (!matchedLocationId) {
            console.error("[Webhook] No location found for referral, cannot create");
            return res.status(422).json({ received: true, event, error: "No matching location found" });
          }

          const patientName = data.patientFullName || data.patientName || data.patient_name
            || data.full_name || data.fullName || data.name || data.contact_name
            || (data.firstName || data.first_name ? `${data.firstName || data.first_name} ${data.lastName || data.last_name || ""}`.trim() : null);

          const patientPhone = data.patientPhone || data.patient_phone || data.phone || data.phoneNumber || data.phone_number;
          const patientDob = data.patientDob || data.patient_dob || data.dob || data.dateOfBirth || data.date_of_birth;
          const patientAcct = data.patientAccountNumber || data.patient_account_number || data.externalId || data.external_id || data.id || data.contactId || data.contact_id;
          const providerName = data.referringProviderName || data.referring_provider_name || data.providerName || data.provider_name || data.physician || data.doctor;
          const providerNpi = data.referringProviderNpi || data.referring_provider_npi || data.npi || data.providerNpi || data.provider_npi;
          const refDate = data.referralDate || data.referral_date || data.date || data.dateAdded || data.date_added || data.createdAt || data.created_at;
          const refSource = data.referralSource || data.referral_source || data.source || "Webhook";
          const insurance = data.primaryInsurance || data.primary_insurance || data.insurance || data.payer;
          const diagnosis = data.diagnosisCategory || data.diagnosis_category || data.diagnosis;
          const discipline = data.discipline || data.therapy_type || data.therapyType;
          const caseTitle = data.caseTitle || data.case_title;

          let physicianId: string | undefined;
          if (data.physicianId || data.physician_id) {
            physicianId = data.physicianId || data.physician_id;
          } else if (providerNpi) {
            const allPhysicians = await storage.getPhysicians();
            const match = allPhysicians.find((p: any) => p.npi === providerNpi);
            if (match) physicianId = match.id;
          } else if (providerName) {
            const allPhysicians = await storage.getPhysicians();
            const nameParts = providerName.trim().split(/\s+/);
            if (nameParts.length >= 2) {
              const first = nameParts[0].toLowerCase();
              const last = nameParts[nameParts.length - 1].toLowerCase();
              const match = allPhysicians.find((p: any) =>
                p.firstName?.toLowerCase() === first && p.lastName?.toLowerCase() === last
              );
              if (match) physicianId = match.id;
            }
          }

          const referralDate = refDate ? new Date(refDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];

          const newReferral = await storage.createReferral({
            physicianId: physicianId || undefined,
            locationId: matchedLocationId,
            referringProviderName: providerName || undefined,
            referringProviderNpi: providerNpi || undefined,
            referralDate,
            patientFullName: patientName || undefined,
            patientPhone: patientPhone || undefined,
            patientDob: patientDob || undefined,
            patientAccountNumber: patientAcct || undefined,
            caseTitle: caseTitle || `Webhook - ${patientName || "Unknown"}`,
            referralSource: refSource,
            primaryInsurance: insurance || undefined,
            diagnosisCategory: diagnosis || undefined,
            discipline: discipline || undefined,
            status: "RECEIVED",
          });

          console.log(`[Webhook] SUCCESS: Created referral ${newReferral.id}, locationId: ${matchedLocationId}, physicianId: ${physicianId || "none"}`);
          return res.json({ received: true, event, referralId: newReferral.id, created: true });
        } catch (procErr: any) {
          console.error("[Webhook] ERROR processing referral:", procErr.message, procErr.stack?.slice(0, 300));
          return res.status(200).json({ received: true, event, error: procErr.message, created: false });
        }
      }

      console.log(`[Webhook] Unhandled event type: ${event}`);
      res.json({ received: true, event, handled: false });
    } catch (err: any) {
      console.error("[Webhook] FATAL:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
