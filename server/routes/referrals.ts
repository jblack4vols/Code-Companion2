import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { insertPhysicianSchema, insertReferralSchema } from "@shared/schema";
import { requireAuth, requireRole, getClientIp, qstr } from "./shared";

export function registerReferralRoutes(app: Express) {
  app.get("/api/referrals/paginated", requireAuth, async (req, res) => {
    res.json(await storage.getReferralsPaginated({
      search: qstr(req.query.search as any),
      status: qstr(req.query.status as any),
      locationId: qstr(req.query.locationId as any),
      discipline: qstr(req.query.discipline as any),
      dateFrom: qstr(req.query.dateFrom as any),
      dateTo: qstr(req.query.dateTo as any),
      physicianId: qstr(req.query.physicianId as any),
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : 50,
    }));
  });

  app.get("/api/referrals", requireAuth, async (req, res) => {
    const physicianId = req.query.physicianId as string | undefined;
    res.json(await storage.getReferrals(physicianId));
  });

  app.post("/api/referrals", requireRole("OWNER", "DIRECTOR", "MARKETER", "FRONT_DESK"), async (req, res) => {
    try {
      const body = { ...req.body };
      if (body.newPhysician && !body.physicianId) {
        const newPhysData = insertPhysicianSchema.parse({
          firstName: body.newPhysician.firstName,
          lastName: body.newPhysician.lastName,
          credentials: body.newPhysician.credentials || null,
          npi: body.newPhysician.npi || null,
          practiceName: body.newPhysician.practiceName || null,
          specialty: body.newPhysician.specialty || null,
          status: "PROSPECT",
          relationshipStage: "NEW",
          priority: "MEDIUM",
        });
        const newPhys = await storage.createPhysician(newPhysData);
        await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE", entity: "Physician", entityId: newPhys.id, detailJson: { firstName: newPhys.firstName, lastName: newPhys.lastName, createdVia: "referral_form" }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
        body.physicianId = newPhys.id;
        body.referringProviderName = `${newPhys.firstName} ${newPhys.lastName}`;
        body.referringProviderNpi = newPhys.npi || null;
      }
      delete body.newPhysician;
      const validated = insertReferralSchema.parse(body);
      const ref = await storage.createReferral(validated);
      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE", entity: "Referral", entityId: ref.id, detailJson: { physicianId: ref.physicianId }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(ref);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/referrals/bulk", requireRole("OWNER"), async (req, res) => {
    try {
      const bulkDeleteSchema = z.object({ ids: z.array(z.string().uuid()).min(1, "At least one id required") });
      const parsed = bulkDeleteSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const { ids } = parsed.data;
      const count = await storage.bulkDeleteReferrals(ids);
      await storage.createAuditLog({ userId: req.session.userId!, action: "BULK_DELETE", entity: "Referral", entityId: "bulk", detailJson: { count, ids }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true, count });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/referrals/:id", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const deleted = await storage.softDeleteReferral(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "SOFT_DELETE", entity: "Referral", entityId: req.params.id, detailJson: {}, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/referrals/:id/restore", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const restored = await storage.restoreReferral(req.params.id);
      if (!restored) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "RESTORE", entity: "Referral", entityId: req.params.id, detailJson: {}, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/referrals/duplicates", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const accountDupes = await db.execute(sql`
        SELECT r1.id as id1, r2.id as id2,
          r1.patient_account_number as account_1, r2.patient_account_number as account_2,
          r1.patient_full_name as patient_1, r2.patient_full_name as patient_2,
          r1.referral_date as date_1, r2.referral_date as date_2,
          r1.physician_id as physician_id_1, r2.physician_id as physician_id_2,
          r1.location_id as location_id_1, r2.location_id as location_id_2,
          r1.status as status_1, r2.status as status_2,
          'Account Number Match' as match_reason
        FROM referrals r1
        JOIN referrals r2 ON r1.patient_account_number = r2.patient_account_number AND r1.id < r2.id
        WHERE r1.deleted_at IS NULL AND r2.deleted_at IS NULL
          AND r1.patient_account_number IS NOT NULL AND r1.patient_account_number != ''
        ORDER BY r1.patient_account_number
        LIMIT 50
      `);

      const nameDupes = await db.execute(sql`
        SELECT r1.id as id1, r2.id as id2,
          r1.patient_account_number as account_1, r2.patient_account_number as account_2,
          r1.patient_full_name as patient_1, r2.patient_full_name as patient_2,
          r1.referral_date as date_1, r2.referral_date as date_2,
          r1.physician_id as physician_id_1, r2.physician_id as physician_id_2,
          r1.location_id as location_id_1, r2.location_id as location_id_2,
          r1.status as status_1, r2.status as status_2,
          CASE
            WHEN r1.referral_date = r2.referral_date THEN 'Name + Date Match'
            ELSE 'Name + Physician Match'
          END as match_reason
        FROM referrals r1
        JOIN referrals r2
          ON LOWER(r1.patient_full_name) = LOWER(r2.patient_full_name) AND r1.id < r2.id
          AND (r1.referral_date = r2.referral_date OR (r1.physician_id IS NOT NULL AND r1.physician_id = r2.physician_id))
        WHERE r1.deleted_at IS NULL AND r2.deleted_at IS NULL
          AND r1.patient_full_name IS NOT NULL AND r2.patient_full_name IS NOT NULL
        ORDER BY r1.patient_full_name, r1.referral_date
        LIMIT 50
      `);

      const seenPairs = new Set<string>();
      const combined = [];
      for (const row of [...(accountDupes.rows as any[]), ...(nameDupes.rows as any[])]) {
        const key = `${row.id1}-${row.id2}`;
        if (!seenPairs.has(key)) {
          seenPairs.add(key);
          combined.push(row);
        }
      }
      res.json(combined.slice(0, 100));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
