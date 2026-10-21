import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, requireRole, getClientIp } from "./shared";

// Provider/NPI import endpoints extracted from import.ts (R2-13).
// These are plain JSON-body handlers (NPI Registry enrichment/verification,
// lookup, and bulk office linking) with no dependency on the Excel upload
// machinery (multer / ExcelJS / worksheet helpers) that the file-upload
// import endpoints use — so they live in their own module.
export function registerImportProviderRoutes(app: Express) {
  app.post("/api/import/enrich-npis", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      // Fetch physicians that have an NPI but are missing at least one key field
      const allPhysicians = await storage.getPhysicians();
      const candidates = allPhysicians.filter(p =>
        p.npi && (!p.specialty || !p.city || !p.state || !p.zip || !p.credentials)
      );

      const stats = { total: candidates.length, enriched: 0, alreadyComplete: allPhysicians.length - candidates.length, failed: 0 };

      const NPI_BATCH_SIZE = 10;
      for (let i = 0; i < candidates.length; i += NPI_BATCH_SIZE) {
        const batch = candidates.slice(i, i + NPI_BATCH_SIZE);
        const enrichPromises = batch.map(async (physician) => {
          try {
            const response = await fetch(
              `https://npiregistry.cms.hhs.gov/api/?number=${encodeURIComponent(physician.npi!)}&version=2.1`
            );
            if (!response.ok) { stats.failed++; return; }
            const data = await response.json() as any;
            if (data.result_count === 0) { stats.failed++; return; }

            const result = data.results[0];
            const basic = result.basic || {};
            const addr = result.addresses?.find((a: any) => a.address_purpose === "LOCATION") || result.addresses?.[0] || {};
            const taxonomy = result.taxonomies?.find((t: any) => t.primary) || result.taxonomies?.[0];

            // Build update with only missing fields
            const updates: Record<string, string> = {};
            if (!physician.credentials && basic.credential) updates.credentials = basic.credential;
            if (!physician.specialty && taxonomy?.desc) updates.specialty = taxonomy.desc;
            if (!physician.primaryOfficeAddress && addr.address_1) {
              updates.primaryOfficeAddress = [addr.address_1, addr.address_2].filter(Boolean).join(", ");
            }
            if (!physician.city && addr.city) updates.city = addr.city;
            if (!physician.state && addr.state) updates.state = addr.state;
            if (!physician.zip && addr.postal_code) updates.zip = addr.postal_code.slice(0, 5);
            if (!physician.phone && addr.telephone_number) updates.phone = addr.telephone_number;
            if (!physician.fax && addr.fax_number) updates.fax = addr.fax_number;

            if (Object.keys(updates).length > 0) {
              await storage.updatePhysician(physician.id, updates as any);
              stats.enriched++;
            }
          } catch {
            stats.failed++;
          }
        });
        await Promise.all(enrichPromises);
        if (i + NPI_BATCH_SIZE < candidates.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      await storage.createAuditLog({
        userId: req.session.userId!,
        action: "IMPORT",
        entity: "physician",
        entityId: "bulk",
        detailJson: { action: "enrich-npis", ...stats },
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"] || null,
      });

      res.json(stats);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/import/verify-npis", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      const { npis } = req.body;
      if (!Array.isArray(npis) || npis.length === 0) {
        return res.status(400).json({ message: "Provide an array of NPIs" });
      }

      const results: Array<{ npi: string; valid: boolean; name?: string; specialty?: string; address?: string; city?: string; state?: string; zip?: string }> = [];

      const batchSize = 10;
      for (let i = 0; i < Math.min(npis.length, 200); i += batchSize) {
        const batch = npis.slice(i, i + batchSize);
        const promises = batch.map(async (npi: string) => {
          try {
            const response = await fetch(
              `https://npiregistry.cms.hhs.gov/api/?number=${encodeURIComponent(npi)}&version=2.1`
            );
            if (!response.ok) return { npi, valid: false };
            const data = await response.json() as any;
            if (data.result_count > 0) {
              const r = data.results[0];
              const basic = r.basic || {};
              const addr = r.addresses?.[0] || {};
              return {
                npi,
                valid: true,
                name: `${basic.first_name || ''} ${basic.last_name || ''}`.trim(),
                specialty: r.taxonomies?.[0]?.desc || null,
                address: addr.address_1 || null,
                city: addr.city || null,
                state: addr.state || null,
                zip: addr.postal_code?.slice(0, 5) || null,
              };
            }
            return { npi, valid: false };
          } catch {
            return { npi, valid: false };
          }
        });
        const batchResults = await Promise.all(promises);
        results.push(...batchResults);
      }

      res.json({
        total: results.length,
        valid: results.filter(r => r.valid).length,
        invalid: results.filter(r => !r.valid).length,
        results,
      });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/import/npi-lookup", requireAuth, async (req, res) => {
    try {
      const { firstName, lastName, npi } = req.body;
      const params = new URLSearchParams({ version: "2.1", enumeration_type: "NPI-1" });
      if (npi) {
        params.set("number", npi);
      } else if (firstName && lastName) {
        params.set("first_name", firstName);
        params.set("last_name", lastName);
      } else {
        return res.status(400).json({ message: "Provide either npi or firstName+lastName" });
      }

      const response = await fetch(`https://npiregistry.cms.hhs.gov/api/?${params.toString()}`);
      if (!response.ok) return res.status(502).json({ message: "NPI Registry unavailable" });
      const data = await response.json() as any;

      const results = (data.results || []).slice(0, 20).map((r: any) => {
        const basic = r.basic || {};
        const locAddr = r.addresses?.find((a: any) => a.address_purpose === "LOCATION") || {};
        const mailAddr = r.addresses?.find((a: any) => a.address_purpose === "MAILING") || {};
        const taxonomy = r.taxonomies?.find((t: any) => t.primary) || r.taxonomies?.[0];
        const orgName = locAddr.organization_name || mailAddr.organization_name || null;
        return {
          npi: r.number,
          firstName: basic.first_name || "",
          lastName: basic.last_name || "",
          credentials: basic.credential || "",
          specialty: taxonomy?.desc || null,
          organizationName: orgName,
          address: [locAddr.address_1, locAddr.address_2].filter(Boolean).join(", ") || null,
          city: locAddr.city || null,
          state: locAddr.state || null,
          zip: locAddr.postal_code?.slice(0, 5) || null,
          phone: locAddr.telephone_number || null,
        };
      });

      res.json({ count: results.length, results });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/import/bulk-link-offices", requireAuth, async (req, res) => {
    try {
      const { links } = req.body;
      if (!Array.isArray(links) || links.length === 0) {
        return res.status(400).json({ message: "Provide an array of { physicianId, practiceName, npi? }" });
      }

      let updated = 0;
      let failed = 0;
      const details: any[] = [];

      for (const link of links) {
        try {
          if (!link.physicianId || !link.practiceName) { failed++; continue; }
          const updates: Record<string, any> = { practiceName: link.practiceName };
          if (link.npi) updates.npi = link.npi;
          if (link.address) updates.primaryOfficeAddress = link.address;
          if (link.city) updates.city = link.city;
          if (link.state) updates.state = link.state;
          if (link.zip) updates.zip = link.zip;
          if (link.phone) updates.phone = link.phone;
          if (link.specialty) updates.specialty = link.specialty;
          if (link.credentials) updates.credentials = link.credentials;
          await storage.updatePhysician(link.physicianId, updates as any);
          updated++;
          details.push({ physicianId: link.physicianId, practiceName: link.practiceName, status: "ok" });
        } catch {
          failed++;
          details.push({ physicianId: link.physicianId, status: "error" });
        }
      }

      await storage.createAuditLog({
        userId: req.session.userId!,
        action: "IMPORT",
        entity: "physician",
        entityId: "bulk-link",
        detailJson: { action: "bulk-link-offices", updated, failed, count: links.length },
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"] || null,
      });

      res.json({ updated, failed, total: links.length, details });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
