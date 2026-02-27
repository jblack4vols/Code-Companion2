import type { Express } from "express";
import { searchNpiRegistry, normalizeNpiResult } from "../npi-registry";
import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { requireAuth, requireRole, getClientIp } from "./shared";

export function registerNpiRegistryRoutes(app: Express) {
  /**
   * GET /api/npi/lookup?number=1234567890
   * Look up a single provider by NPI number. Returns normalized provider data.
   */
  app.get("/api/npi/lookup", requireAuth, async (req, res) => {
    try {
      const number = String(req.query.number || "").trim();
      if (!number || !/^\d{10}$/.test(number)) {
        return res.status(400).json({ message: "A valid 10-digit NPI number is required" });
      }

      const data = await searchNpiRegistry({ number });
      if (data.result_count === 0) {
        return res.json({ found: false, npi: number });
      }

      const provider = normalizeNpiResult(data.results[0]);
      res.json({ found: true, provider });
    } catch (err: any) {
      res.status(502).json({ message: `NPI Registry lookup failed: ${err.message}` });
    }
  });

  /**
   * GET /api/npi/search?first_name=John&last_name=Smith&state=TN&specialty=Physical+Therapy&limit=10
   * Search providers in the NPI Registry by name, location, specialty.
   */
  app.get("/api/npi/search", requireAuth, async (req, res) => {
    try {
      const params: Record<string, any> = {};
      const allowed = [
        "number", "enumeration_type", "first_name", "last_name",
        "organization_name", "city", "state", "postal_code",
        "taxonomy_description", "limit", "skip",
      ];
      for (const key of allowed) {
        const val = req.query[key];
        if (val && typeof val === "string" && val.trim()) {
          params[key] = key === "limit" || key === "skip" ? parseInt(val) : val.trim();
        }
      }

      // Require at least one search criterion beyond pagination
      const searchKeys = Object.keys(params).filter(k => k !== "limit" && k !== "skip");
      if (searchKeys.length === 0) {
        return res.status(400).json({ message: "At least one search parameter is required" });
      }

      if (!params.limit) params.limit = 10;

      const data = await searchNpiRegistry(params);
      const providers = (data.results || []).map(normalizeNpiResult);
      res.json({ resultCount: data.result_count, providers });
    } catch (err: any) {
      res.status(502).json({ message: `NPI Registry search failed: ${err.message}` });
    }
  });

  /**
   * POST /api/npi/enrich
   * Enrich existing physicians by looking up their NPI in the registry
   * and filling in missing fields (specialty, address, phone, etc.).
   * Body: { physicianIds?: string[] } — if omitted, enriches all physicians with NPI but missing data.
   */
  app.post("/api/npi/enrich", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const { physicianIds } = req.body || {};

      // Find physicians with NPI set but with missing enrichable fields
      const hasIds = Array.isArray(physicianIds) && physicianIds.length > 0;
      const idFragments = hasIds ? physicianIds.map((id: string) => sql`${id}`) : [];
      const idFilter = hasIds ? sql`AND id IN (${sql.join(idFragments, sql`, `)})` : sql``;
      const missingDataFilter = hasIds ? sql`` : sql`AND (specialty IS NULL OR specialty = '' OR primary_office_address IS NULL OR primary_office_address = '' OR city IS NULL OR city = '' OR phone IS NULL OR phone = '')`;

      const result = await db.execute(sql`
        SELECT id, npi, first_name, last_name, specialty, primary_office_address, city, state, zip, phone, fax, credentials
        FROM physicians
        WHERE deleted_at IS NULL AND npi IS NOT NULL AND npi != ''
        ${idFilter} ${missingDataFilter}
        LIMIT 200
      `);

      const physicians = result.rows as any[];
      let enriched = 0;
      let failed = 0;
      let skipped = 0;
      const details: Array<{ id: string; npi: string; name: string; fieldsUpdated: string[] }> = [];

      // Process in batches of 5 with small delay to be respectful to the API
      const batchSize = 5;
      for (let i = 0; i < physicians.length; i += batchSize) {
        const batch = physicians.slice(i, i + batchSize);
        const promises = batch.map(async (phys) => {
          try {
            const data = await searchNpiRegistry({ number: phys.npi });
            if (data.result_count === 0) {
              skipped++;
              return;
            }

            const npiData = normalizeNpiResult(data.results[0]);
            const updates: Record<string, any> = {};
            const fieldsUpdated: string[] = [];

            // Only fill in fields that are currently empty
            if (!phys.specialty && npiData.specialty) { updates.specialty = npiData.specialty; fieldsUpdated.push("specialty"); }
            if (!phys.credentials && npiData.credentials) { updates.credentials = npiData.credentials; fieldsUpdated.push("credentials"); }
            if (!phys.primary_office_address && npiData.primaryOfficeAddress) { updates.primaryOfficeAddress = npiData.primaryOfficeAddress; fieldsUpdated.push("address"); }
            if (!phys.city && npiData.city) { updates.city = npiData.city; fieldsUpdated.push("city"); }
            if (!phys.state && npiData.state) { updates.state = npiData.state; fieldsUpdated.push("state"); }
            if (!phys.zip && npiData.zip) { updates.zip = npiData.zip; fieldsUpdated.push("zip"); }
            if (!phys.phone && npiData.phone) { updates.phone = npiData.phone; fieldsUpdated.push("phone"); }
            if (!phys.fax && npiData.fax) { updates.fax = npiData.fax; fieldsUpdated.push("fax"); }

            if (Object.keys(updates).length > 0) {
              await storage.updatePhysician(phys.id, updates);
              enriched++;
              details.push({ id: phys.id, npi: phys.npi, name: `${phys.first_name} ${phys.last_name}`, fieldsUpdated });
            } else {
              skipped++;
            }
          } catch {
            failed++;
          }
        });
        await Promise.all(promises);

        // Small delay between batches to avoid overwhelming the API
        if (i + batchSize < physicians.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      await storage.createAuditLog({
        userId: req.session.userId!,
        action: "NPI_ENRICH",
        entity: "Physician",
        entityId: "bulk",
        detailJson: { enriched, skipped, failed, total: physicians.length },
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"] || null,
      });

      res.json({
        total: physicians.length,
        enriched,
        skipped,
        failed,
        details: details.slice(0, 50),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
