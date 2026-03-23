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
      const oldKey = await storage.getApiKeyById(req.params.id);
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
      const deactivated = await storage.deactivateApiKey(req.params.id);
      if (!deactivated) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "DEACTIVATE_API_KEY", entity: "ApiKey", entityId: req.params.id, detailJson: {}, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
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
      const phys = await storage.getPhysician(req.params.id);
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
      const { event, data } = req.body;
      if (!event || !data) return res.status(400).json({ error: "event and data fields required" });

      console.log(`[Webhook] Received event: ${event}`, JSON.stringify(data).slice(0, 500));

      if (event === "referral.created") {
        try {
          const allLocations = await storage.getLocations();
          let matchedLocationId: string | null = null;

          if (data.locationId) {
            const loc = allLocations.find((l: any) => l.id === data.locationId);
            if (loc) matchedLocationId = loc.id;
          }
          if (!matchedLocationId && data.location) {
            const loc = allLocations.find((l: any) =>
              l.name.toLowerCase().includes(data.location.toLowerCase()) ||
              data.location.toLowerCase().includes(l.name.toLowerCase().replace("tristar pt - ", ""))
            );
            if (loc) matchedLocationId = loc.id;
          }
          if (!matchedLocationId && allLocations.length > 0) {
            matchedLocationId = allLocations[0].id;
          }

          if (!matchedLocationId) {
            console.error("[Webhook] No location found for referral, cannot create");
            return res.status(422).json({ received: true, event, error: "No matching location found" });
          }

          let physicianId: string | undefined;
          if (data.physicianId) {
            physicianId = data.physicianId;
          } else if (data.referringProviderNpi) {
            const allPhysicians = await storage.getPhysicians();
            const match = allPhysicians.find((p: any) => p.npi === data.referringProviderNpi);
            if (match) physicianId = match.id;
          } else if (data.referringProviderName) {
            const allPhysicians = await storage.getPhysicians();
            const nameParts = data.referringProviderName.trim().split(/\s+/);
            if (nameParts.length >= 2) {
              const first = nameParts[0].toLowerCase();
              const last = nameParts[nameParts.length - 1].toLowerCase();
              const match = allPhysicians.find((p: any) =>
                p.firstName?.toLowerCase() === first && p.lastName?.toLowerCase() === last
              );
              if (match) physicianId = match.id;
            }
          }

          const referralDate = data.referralDate || new Date().toISOString().split("T")[0];

          const newReferral = await storage.createReferral({
            physicianId: physicianId || undefined,
            locationId: matchedLocationId,
            referringProviderName: data.referringProviderName || undefined,
            referringProviderNpi: data.referringProviderNpi || undefined,
            referralDate,
            patientFullName: data.patientFullName || data.patientName || undefined,
            patientPhone: data.patientPhone || undefined,
            patientDob: data.patientDob || undefined,
            patientAccountNumber: data.patientAccountNumber || data.externalId || undefined,
            caseTitle: data.caseTitle || `Webhook - ${data.patientFullName || data.patientName || "Unknown"}`,
            referralSource: data.referralSource || "Webhook",
            primaryInsurance: data.primaryInsurance || data.insurance || undefined,
            diagnosisCategory: data.diagnosisCategory || data.diagnosis || undefined,
            discipline: data.discipline || undefined,
            status: "RECEIVED",
          });

          console.log(`[Webhook] Created referral ${newReferral.id} for patient: ${data.patientFullName || data.patientName || "Unknown"}`);
          return res.json({ received: true, event, referralId: newReferral.id, created: true });
        } catch (procErr: any) {
          console.error("[Webhook] Error processing referral.created:", procErr);
          return res.json({ received: true, event, error: procErr.message, created: false });
        }
      }

      res.json({ received: true, event });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  });
}
