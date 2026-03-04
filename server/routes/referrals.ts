import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { sql, eq } from "drizzle-orm";
import { z } from "zod";
import { insertPhysicianSchema, insertReferralSchema, referrals as referralsTable, physicians as physiciansTable } from "@shared/schema";
import { requireAuth, requireRole, getClientIp, qstr, getUserLocationScope } from "./shared";

export function registerReferralRoutes(app: Express) {
  app.get("/api/referrals/paginated", requireAuth, async (req, res) => {
    const locationScope = await getUserLocationScope(req);
    // Non-admin with no location assignments — return empty results
    if (locationScope !== null && locationScope.length === 0) {
      return res.json({ data: [], total: 0, page: 1, pageSize: 50, activeCount: 0, dischargedCount: 0 });
    }
    res.json(await storage.getReferralsPaginated({
      search: qstr(req.query.search as any),
      status: qstr(req.query.status as any),
      locationId: qstr(req.query.locationId as any),
      locationIds: locationScope ?? undefined,
      discipline: qstr(req.query.discipline as any),
      referralSource: qstr(req.query.referralSource as any),
      primaryPayerType: qstr(req.query.primaryPayerType as any),
      dateFrom: qstr(req.query.dateFrom as any),
      dateTo: qstr(req.query.dateTo as any),
      physicianId: qstr(req.query.physicianId as any),
      sortBy: qstr(req.query.sortBy as any),
      sortDir: qstr(req.query.sortDir as any),
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : 50,
    }));
  });

  app.get("/api/referrals", requireAuth, async (req, res) => {
    const locationScope = await getUserLocationScope(req);
    // Non-admin with no location assignments — return empty results
    if (locationScope !== null && locationScope.length === 0) {
      return res.json([]);
    }
    const physicianId = req.query.physicianId as string | undefined;
    res.json(await storage.getReferrals(physicianId, locationScope ?? undefined));
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

  app.patch("/api/referrals/:id", requireRole("OWNER", "DIRECTOR", "MARKETER", "FRONT_DESK"), async (req, res) => {
    try {
      // Ownership check: MARKETERs and FRONT_DESK may only edit referrals whose physician is assigned to them
      const sessionUser = await storage.getUser(req.session.userId!);
      if (sessionUser && sessionUser.role !== "OWNER" && sessionUser.role !== "DIRECTOR") {
        const [existingReferral] = await db.select().from(referralsTable).where(eq(referralsTable.id, req.params.id as string));
        if (existingReferral?.physicianId) {
          const physician = await storage.getPhysician(existingReferral.physicianId);
          if (physician && physician.assignedOwnerId !== req.session.userId) {
            return res.status(403).json({ message: "Forbidden: physician not assigned to you" });
          }
        }
      }

      const updateSchema = z.object({
        patientFullName: z.string().max(200).optional(),
        patientPhone: z.string().max(30).nullable().optional(),
        patientDob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format").nullable().optional(),
        patientAccountNumber: z.string().max(50).nullable().optional(),
        referralDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format").optional(),
        status: z.enum(["RECEIVED", "SCHEDULED", "EVAL_COMPLETED", "DISCHARGED", "LOST"]).optional(),
        diagnosisCategory: z.string().max(200).nullable().optional(),
        referralSource: z.string().max(100).nullable().optional(),
        discipline: z.string().max(10).nullable().optional(),
        caseTitle: z.string().max(200).nullable().optional(),
        caseTherapist: z.string().max(100).nullable().optional(),
        primaryInsurance: z.string().max(100).nullable().optional(),
        primaryPayerType: z.string().max(50).nullable().optional(),
        locationId: z.string().uuid().optional(),
        physicianId: z.string().uuid().nullable().optional(),
        referringProviderName: z.string().max(200).nullable().optional(),
        referringProviderNpi: z.string().max(20).nullable().optional(),
        dateOfInitialEval: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format").nullable().optional(),
        dischargeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format").nullable().optional(),
        dischargeReason: z.string().max(200).nullable().optional(),
        scheduledVisits: z.number().int().min(0).optional(),
        arrivedVisits: z.number().int().min(0).optional(),
      }).strict();

      const cleaned: Record<string, any> = {};
      for (const [k, v] of Object.entries(req.body)) {
        cleaned[k] = v === "" ? null : v;
      }

      const parsed = updateSchema.safeParse(cleaned);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors.map(e => `${e.path.join(".")}: ${e.message}`).join(", ") });
      if (Object.keys(parsed.data).length === 0) return res.status(400).json({ message: "No valid fields to update" });

      const updated = await storage.updateReferral(req.params.id, parsed.data as any);
      if (!updated) return res.status(404).json({ message: "Referral not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "UPDATE", entity: "Referral", entityId: req.params.id, detailJson: { fields: Object.keys(parsed.data) }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/referrals/all", requireRole("OWNER"), async (req, res) => {
    try {
      const count = await storage.softDeleteAllReferrals();
      await storage.createAuditLog({ userId: req.session.userId!, action: "SOFT_DELETE_ALL", entity: "Referral", entityId: "all", detailJson: { count }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true, count });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/referrals/restore-all", requireRole("OWNER"), async (req, res) => {
    try {
      const count = await storage.restoreAllReferrals();
      await storage.createAuditLog({ userId: req.session.userId!, action: "RESTORE_ALL", entity: "Referral", entityId: "all", detailJson: { count }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true, count });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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

  app.get("/api/referrals/top-sources", requireAuth, async (req, res) => {
    try {
      const locationId = qstr(req.query.locationId as any);
      const limitVal = Math.min(Math.max(parseInt(qstr(req.query.limit as any) || "20") || 20, 1), 100);
      const locFilter = locationId ? sql`AND r.location_id = ${locationId}` : sql``;

      const result = await db.execute(sql`
        SELECT
          p.id as physician_id,
          p.first_name,
          p.last_name,
          p.credentials,
          p.specialty,
          p.practice_name,
          p.relationship_stage,
          COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '30 days') as current_count,
          COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '60 days' AND r.referral_date < CURRENT_DATE - INTERVAL '30 days') as prior_count,
          CASE
            WHEN COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '60 days' AND r.referral_date < CURRENT_DATE - INTERVAL '30 days') > 0
            THEN ROUND(
              (COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '30 days')
               - COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '60 days' AND r.referral_date < CURRENT_DATE - INTERVAL '30 days'))::numeric
              / COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '60 days' AND r.referral_date < CURRENT_DATE - INTERVAL '30 days') * 100, 1
            )
            ELSE NULL
          END as change_percent
        FROM physicians p
        LEFT JOIN referrals r ON r.physician_id = p.id AND r.deleted_at IS NULL
        WHERE 1=1 ${locFilter}
        GROUP BY p.id, p.first_name, p.last_name, p.credentials, p.specialty, p.practice_name, p.relationship_stage
        HAVING COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '30 days') > 0
        ORDER BY current_count DESC
        LIMIT ${limitVal}
      `);

      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/referrals/trending", requireAuth, async (req, res) => {
    try {
      const result = await db.execute(sql`
        WITH physician_trends AS (
          SELECT
            p.id as physician_id,
            p.first_name,
            p.last_name,
            p.credentials,
            p.specialty,
            p.practice_name,
            p.relationship_stage,
            COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '30 days') as current_count,
            COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '60 days' AND r.referral_date < CURRENT_DATE - INTERVAL '30 days') as prior_count
          FROM physicians p
          LEFT JOIN referrals r ON r.physician_id = p.id AND r.deleted_at IS NULL
          GROUP BY p.id, p.first_name, p.last_name, p.credentials, p.specialty, p.practice_name, p.relationship_stage
          HAVING COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '60 days') > 0
        )
        SELECT *,
          current_count - prior_count as change_absolute,
          CASE WHEN prior_count > 0
            THEN ROUND((current_count - prior_count)::numeric / prior_count * 100, 1)
            ELSE NULL
          END as change_percent,
          CASE
            WHEN current_count > prior_count THEN 'growing'
            WHEN current_count < prior_count THEN 'declining'
            ELSE 'stable'
          END as trend,
          CASE
            WHEN current_count > prior_count AND prior_count > 0 AND ((current_count - prior_count)::numeric / prior_count * 100) > 20 THEN 'Rapid growth — consider strengthening relationship'
            WHEN current_count < prior_count AND prior_count > 0 AND ((current_count - prior_count)::numeric / prior_count * 100) < -20 THEN 'Significant decline — schedule outreach immediately'
            WHEN current_count = 0 AND prior_count > 0 THEN 'Referrals stopped — urgent re-engagement needed'
            ELSE NULL
          END as recommendation
        FROM physician_trends
        ORDER BY change_absolute DESC
        LIMIT 50
      `);

      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/referrals/by-location", requireAuth, async (req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT
          l.id as location_id,
          l.name as location_name,
          COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '30 days') as referrals_30d,
          COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '60 days' AND r.referral_date < CURRENT_DATE - INTERVAL '30 days') as referrals_prior_30d,
          COUNT(DISTINCT r.physician_id) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '30 days') as unique_sources_30d,
          CASE
            WHEN COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '60 days' AND r.referral_date < CURRENT_DATE - INTERVAL '30 days') > 0
            THEN ROUND(
              (COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '30 days')
               - COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '60 days' AND r.referral_date < CURRENT_DATE - INTERVAL '30 days'))::numeric
              / COUNT(*) FILTER (WHERE r.referral_date >= CURRENT_DATE - INTERVAL '60 days' AND r.referral_date < CURRENT_DATE - INTERVAL '30 days') * 100, 1
            )
            ELSE 0
          END as change_percent
        FROM locations l
        LEFT JOIN referrals r ON r.location_id = l.id AND r.deleted_at IS NULL
        WHERE l.is_active = true
        GROUP BY l.id, l.name
        ORDER BY referrals_30d DESC
      `);

      res.json(result.rows);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/referrals/filter-options", requireAuth, async (req, res) => {
    try {
      const locationScope = await getUserLocationScope(req);
      const locFilter = locationScope !== null && locationScope.length > 0
        ? sql`AND r.location_id = ANY(${locationScope})`
        : locationScope !== null && locationScope.length === 0
        ? sql`AND 1=0`
        : sql``;

      const result = await db.execute(sql`
        SELECT
          COALESCE(array_agg(DISTINCT r.referral_source) FILTER (WHERE r.referral_source IS NOT NULL AND r.referral_source != ''), '{}') as referral_sources,
          COALESCE(array_agg(DISTINCT r.primary_payer_type) FILTER (WHERE r.primary_payer_type IS NOT NULL AND r.primary_payer_type != ''), '{}') as payer_types,
          COALESCE(array_agg(DISTINCT r.discipline) FILTER (WHERE r.discipline IS NOT NULL AND r.discipline != ''), '{}') as disciplines,
          COALESCE(array_agg(DISTINCT r.diagnosis_category) FILTER (WHERE r.diagnosis_category IS NOT NULL AND r.diagnosis_category != ''), '{}') as diagnosis_categories
        FROM referrals r
        WHERE r.deleted_at IS NULL ${locFilter}
      `);
      const row = result.rows[0] as any;
      res.json({
        referralSources: (row?.referral_sources || []).sort(),
        payerTypes: (row?.payer_types || []).sort(),
        disciplines: (row?.disciplines || []).sort(),
        diagnosisCategories: (row?.diagnosis_categories || []).sort(),
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
