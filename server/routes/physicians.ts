import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { sql, type SQL } from "drizzle-orm";
import { insertPhysicianSchema } from "@shared/schema";
import { requireAuth, requireRole, getClientIp, qstr, getUserLocationScope } from "./shared";

export function registerPhysicianRoutes(app: Express) {
  app.get("/api/physicians/paginated", requireAuth, async (req, res) => {
    const locationScope = await getUserLocationScope(req);
    if (locationScope !== null && locationScope.length === 0) {
      return res.json({ data: [], total: 0, page: 1, pageSize: 50, totalPages: 0 });
    }
    res.json(await storage.getPhysiciansPaginated({
      search: qstr(req.query.search as any),
      status: qstr(req.query.status as any),
      stage: qstr(req.query.stage as any),
      priority: qstr(req.query.priority as any),
      practiceName: qstr(req.query.practiceName as any),
      locationIds: locationScope ?? undefined,
      sortBy: qstr(req.query.sortBy as any),
      sortOrder: qstr(req.query.sortOrder as any),
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : 50,
    }));
  });

  app.get("/api/physicians/search", requireAuth, async (req, res) => {
    const query = (req.query.q as string || "").trim();
    if (query.length < 2) return res.json([]);
    const locationScope = await getUserLocationScope(req);
    const results = await storage.searchPhysiciansTypeahead(query);
    if (locationScope === null) return res.json(results);
    if (locationScope.length === 0) return res.json([]);
    const scopedIds = await storage.getPhysicianIdsByLocations(locationScope);
    res.json(results.filter((p: any) => scopedIds.has(p.id)));
  });

  app.get("/api/physicians/practice-names", requireAuth, async (req, res) => {
    const locationScope = await getUserLocationScope(req);
    let allPhysicians = await storage.getPhysicians();
    if (locationScope !== null) {
      if (locationScope.length === 0) return res.json([]);
      const scopedIds = await storage.getPhysicianIdsByLocations(locationScope);
      allPhysicians = allPhysicians.filter(p => scopedIds.has(p.id));
    }
    const practiceSet = new Set<string>();
    for (const p of allPhysicians) {
      if (p.practiceName && p.practiceName.trim()) {
        practiceSet.add(p.practiceName.trim());
      }
    }
    const allEvents = await storage.getCalendarEvents({});
    for (const evt of allEvents) {
      if (evt.practiceName && evt.practiceName.trim()) {
        practiceSet.add(evt.practiceName.trim());
      }
    }
    const sorted = Array.from(practiceSet).sort((a, b) => a.localeCompare(b));
    res.json(sorted);
  });

  app.get("/api/physicians/by-practice", requireAuth, async (req, res) => {
    const name = (req.query.name as string || "").trim();
    if (!name) return res.json([]);
    const locationScope = await getUserLocationScope(req);
    let allPhysicians = await storage.getPhysicians();
    if (locationScope !== null) {
      if (locationScope.length === 0) return res.json([]);
      const scopedIds = await storage.getPhysicianIdsByLocations(locationScope);
      allPhysicians = allPhysicians.filter(p => scopedIds.has(p.id));
    }
    const matched = allPhysicians.filter(
      (p) => p.practiceName && p.practiceName.trim().toLowerCase() === name.toLowerCase()
    );
    res.json(matched);
  });

  app.get("/api/provider-offices", requireAuth, async (req, res) => {
    try {
      const search = (req.query.search as string || "").trim();
      const page = req.query.page ? parseInt(req.query.page as string) : 1;
      const pageSize = req.query.pageSize ? parseInt(req.query.pageSize as string) : 50;
      const sortBy = (req.query.sortBy as string || "providerCount").trim();
      const sortOrder = (req.query.sortOrder as string || "desc").trim();
      const offset = (page - 1) * pageSize;

      const orderMap: Record<string, string> = {
        officeName: "office_name",
        providerCount: "provider_count",
        city: "city",
        totalReferrals: "total_referrals",
      };
      const searchPattern = `%${search}%`;

      const orderClauses: Record<string, Record<string, SQL>> = {
        office_name: { asc: sql`office_name ASC`, desc: sql`office_name DESC` },
        provider_count: { asc: sql`provider_count ASC`, desc: sql`provider_count DESC` },
        city: { asc: sql`city ASC`, desc: sql`city DESC` },
        total_referrals: { asc: sql`total_referrals ASC`, desc: sql`total_referrals DESC` },
      };
      const orderCol = orderMap[sortBy] || "provider_count";
      const direction = sortOrder === "asc" ? "asc" : "desc";
      const orderSql = orderClauses[orderCol]?.[direction] || sql`provider_count DESC`;

      const searchCondition = search
        ? sql`AND (p.practice_name ILIKE ${searchPattern} OR p.primary_office_address ILIKE ${searchPattern} OR p.city ILIKE ${searchPattern})`
        : sql``;

      const countResult = await db.execute(sql`
        SELECT COUNT(DISTINCT TRIM(p.practice_name)) as total 
        FROM physicians p 
        WHERE p.deleted_at IS NULL AND p.practice_name IS NOT NULL AND TRIM(p.practice_name) != '' ${searchCondition}
      `);
      const total = parseInt((countResult.rows[0] as any)?.total || "0");

      const dataResult = await db.execute(sql`
        SELECT 
          TRIM(p.practice_name) as office_name,
          COUNT(p.id) as provider_count,
          MIN(p.primary_office_address) as address,
          MIN(p.city) as city,
          MIN(p.state) as state,
          MIN(p.zip) as zip,
          MIN(p.phone) as phone,
          MIN(p.fax) as fax,
          COALESCE(SUM(ref_counts.ref_count), 0) as total_referrals
        FROM physicians p
        LEFT JOIN (
          SELECT physician_id, COUNT(*) as ref_count 
          FROM referrals 
          WHERE deleted_at IS NULL 
          GROUP BY physician_id
        ) ref_counts ON ref_counts.physician_id = p.id
        WHERE p.deleted_at IS NULL AND p.practice_name IS NOT NULL AND TRIM(p.practice_name) != '' ${searchCondition}
        GROUP BY TRIM(p.practice_name)
        ORDER BY ${orderSql}
        LIMIT ${pageSize} OFFSET ${offset}
      `);

      res.json({
        data: dataResult.rows,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/provider-offices/:name/providers", requireAuth, async (req, res) => {
    try {
      const name = decodeURIComponent(req.params.name).trim();
      if (!name) return res.json([]);
      const allPhysicians = await storage.getPhysicians();
      const matched = allPhysicians.filter(
        (p) => p.practiceName && p.practiceName.trim().toLowerCase() === name.toLowerCase()
      );
      if (matched.length === 0) return res.json([]);
      const ids = matched.map(m => m.id);
      const idFragments = ids.map(id => sql`${id}`);
      const referralCounts = await db.execute(sql`
        SELECT physician_id, COUNT(*) as ref_count 
        FROM referrals 
        WHERE deleted_at IS NULL AND physician_id IN (${sql.join(idFragments, sql`, `)})
        GROUP BY physician_id
      `);
      const countMap = new Map((referralCounts.rows as any[]).map(r => [r.physician_id, parseInt(r.ref_count)]));
      const enriched = matched.map(p => ({
        ...p,
        referralCount: countMap.get(p.id) || 0,
      }));
      enriched.sort((a, b) => b.referralCount - a.referralCount);
      res.json(enriched);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/physicians", requireAuth, async (req, res) => {
    res.json(await storage.getPhysicians());
  });

  app.get("/api/physicians/tiering", requireRole("OWNER", "DIRECTOR", "MARKETER", "ANALYST"), async (req, res) => {
    const filters = {
      period: qstr(req.query.period as any) || "year",
      year: req.query.year ? parseInt(req.query.year as string) : undefined,
      month: req.query.month ? parseInt(req.query.month as string) : undefined,
    };
    res.json(await storage.getPhysicianTiering(filters));
  });

  app.get("/api/physicians/declining", requireRole("OWNER", "DIRECTOR", "MARKETER", "ANALYST"), async (req, res) => {
    const filters = {
      months: req.query.months ? parseInt(req.query.months as string) : 3,
      minDrop: req.query.minDrop ? parseInt(req.query.minDrop as string) : 1,
    };
    res.json(await storage.getDecliningReferrals(filters));
  });

  app.post("/api/physicians/bulk-assign", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const { physicianIds, marketerId } = req.body;
      if (!Array.isArray(physicianIds) || physicianIds.length === 0) return res.status(400).json({ message: "physicianIds required" });
      const count = await storage.bulkAssignPhysiciansToMarketer(physicianIds, marketerId || null);
      await storage.createAuditLog({ userId: req.session.userId!, action: "BULK_ASSIGN", entity: "Physician", entityId: "bulk", detailJson: { count, marketerId }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true, count });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/physicians/bulk-status", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const { physicianIds, status } = req.body;
      if (!Array.isArray(physicianIds) || physicianIds.length === 0) return res.status(400).json({ message: "physicianIds required" });
      if (!["PROSPECT", "ACTIVE", "INACTIVE"].includes(status)) return res.status(400).json({ message: "Invalid status" });
      const count = await storage.bulkUpdatePhysicianStatus(physicianIds, status);
      await storage.createAuditLog({ userId: req.session.userId!, action: "BULK_STATUS", entity: "Physician", entityId: "bulk", detailJson: { count, status }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true, count });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/physicians/bulk-delete", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const { physicianIds } = req.body;
      if (!Array.isArray(physicianIds) || physicianIds.length === 0 || !physicianIds.every((id: any) => typeof id === "string" && id.length > 0)) {
        return res.status(400).json({ message: "physicianIds must be a non-empty array of valid string IDs" });
      }
      let count = 0;
      const failed: string[] = [];
      for (const id of physicianIds) {
        try {
          const deleted = await storage.softDeletePhysician(id);
          if (deleted) count++;
          else failed.push(id);
        } catch { failed.push(id); }
      }
      await storage.createAuditLog({ userId: req.session.userId!, action: "BULK_DELETE", entity: "Physician", entityId: "bulk", detailJson: { count, failed, physicianIds }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      if (failed.length > 0 && count === 0) {
        return res.status(400).json({ message: `Failed to delete any providers`, failed });
      }
      res.json({ success: true, count, failed });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/physicians/by-npi", requireAuth, async (req, res) => {
    try {
      const npi = String(req.query.npi || "").trim();
      if (!npi) return res.json([]);
      const results = await db.execute(sql`
        SELECT p.*, COALESCE((SELECT COUNT(*) FROM referrals r WHERE r.physician_id = p.id AND r.deleted_at IS NULL), 0)::int as "referralCount"
        FROM physicians p WHERE p.npi = ${npi} AND p.deleted_at IS NULL
        ORDER BY p.last_name, p.first_name
      `);
      res.json(results.rows);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/physicians/duplicates", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const dupes = await db.execute(sql`
        WITH potential_dupes AS (
          SELECT p1.id as id1, p2.id as id2,
            p1.first_name as first_name_1, p1.last_name as last_name_1, p1.npi as npi_1, p1.practice_name as practice_1, p1.city as city_1, p1.status as status_1,
            p2.first_name as first_name_2, p2.last_name as last_name_2, p2.npi as npi_2, p2.practice_name as practice_2, p2.city as city_2, p2.status as status_2,
            CASE
              WHEN p1.npi IS NOT NULL AND p1.npi = p2.npi THEN 'NPI Match'
              WHEN LOWER(p1.first_name) = LOWER(p2.first_name) AND LOWER(p1.last_name) = LOWER(p2.last_name) AND COALESCE(LOWER(p1.city), '') = COALESCE(LOWER(p2.city), '') THEN 'Name + City Match'
              WHEN LOWER(p1.first_name) = LOWER(p2.first_name) AND LOWER(p1.last_name) = LOWER(p2.last_name) THEN 'Name Match'
            END as match_reason
          FROM physicians p1
          JOIN physicians p2 ON p1.id < p2.id
          WHERE p1.deleted_at IS NULL AND p2.deleted_at IS NULL AND (
            (p1.npi IS NOT NULL AND p1.npi != '' AND p1.npi = p2.npi)
            OR (LOWER(p1.first_name) = LOWER(p2.first_name) AND LOWER(p1.last_name) = LOWER(p2.last_name))
          )
        )
        SELECT * FROM potential_dupes
        ORDER BY match_reason DESC, last_name_1, first_name_1
        LIMIT 100
      `);
      res.json(dupes.rows);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/physicians/merge", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const { keepId, removeId } = req.body;
      if (!keepId || !removeId) return res.status(400).json({ message: "keepId and removeId required" });
      if (keepId === removeId) return res.status(400).json({ message: "Cannot merge physician with itself" });
      
      await db.execute(sql`UPDATE referrals SET physician_id = ${keepId} WHERE physician_id = ${removeId}`);
      await db.execute(sql`UPDATE interactions SET physician_id = ${keepId} WHERE physician_id = ${removeId}`);
      await db.execute(sql`UPDATE tasks SET physician_id = ${keepId} WHERE physician_id = ${removeId}`);
      await db.execute(sql`UPDATE calendar_events SET physician_id = ${keepId} WHERE physician_id = ${removeId}`);
      await db.execute(sql`UPDATE collections SET physician_id = ${keepId} WHERE physician_id = ${removeId}`);
      await db.execute(sql`UPDATE physician_comments SET physician_id = ${keepId} WHERE physician_id = ${removeId}`);
      await db.execute(sql`DELETE FROM physician_favorites WHERE physician_id = ${removeId} AND user_id IN (SELECT user_id FROM physician_favorites WHERE physician_id = ${keepId})`);
      await db.execute(sql`UPDATE physician_favorites SET physician_id = ${keepId} WHERE physician_id = ${removeId}`);
      await db.execute(sql`DELETE FROM physician_monthly_summary WHERE physician_id = ${removeId}`);
      await db.execute(sql`UPDATE physicians SET deleted_at = NOW(), updated_at = NOW() WHERE id = ${removeId}`);

      await storage.createAuditLog({ userId: req.session.userId!, action: "MERGE_PHYSICIAN", entity: "Physician", entityId: keepId, detailJson: { removedId: removeId }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/physicians/:id", requireAuth, async (req, res) => {
    const phys = await storage.getPhysician(req.params.id);
    if (!phys) return res.status(404).json({ message: "Not found" });
    res.json(phys);
  });

  app.post("/api/physicians", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      const validated = insertPhysicianSchema.parse(req.body);
      const phys = await storage.createPhysician(validated);
      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE", entity: "Physician", entityId: phys.id, detailJson: { firstName: phys.firstName, lastName: phys.lastName }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(phys);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/physicians/:id", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      // Ownership check: MARKETERs may only edit physicians assigned to them
      const sessionUser = await storage.getUser(req.session.userId!);
      if (sessionUser?.role === "MARKETER") {
        const existing = await storage.getPhysician(req.params.id as string);
        if (!existing) return res.status(404).json({ message: "Not found" });
        if (existing.assignedOwnerId !== req.session.userId) {
          return res.status(403).json({ message: "Forbidden: physician not assigned to you" });
        }
      }

      const validated = insertPhysicianSchema.partial().parse(req.body);
      const phys = await storage.updatePhysician(req.params.id, validated);
      if (!phys) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "UPDATE", entity: "Physician", entityId: phys.id, detailJson: req.body, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(phys);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/physicians/:id/link-office", requireAuth, async (req, res) => {
    try {
      const { practiceName } = req.body;
      if (typeof practiceName !== "string") {
        return res.status(400).json({ message: "practiceName is required" });
      }
      const existing = await storage.getPhysician(req.params.id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      const locationScope = await getUserLocationScope(req);
      if (locationScope !== null) {
        if (locationScope.length === 0) return res.status(403).json({ message: "No location access" });
        const scopedIds = await storage.getPhysicianIdsByLocations(locationScope);
        if (!scopedIds.has(existing.id)) return res.status(403).json({ message: "Physician not in your location scope" });
      }
      const phys = await storage.updatePhysician(req.params.id, { practiceName: practiceName.trim() || null } as any);
      if (!phys) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({
        userId: req.session.userId!,
        action: "UPDATE",
        entity: "Physician",
        entityId: phys.id,
        detailJson: { action: "link-office", practiceName: practiceName.trim() },
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"] || null,
      });
      res.json(phys);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/physicians/:id", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const deleted = await storage.softDeletePhysician(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "SOFT_DELETE", entity: "Physician", entityId: req.params.id, detailJson: {}, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/physicians/:id/restore", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const restored = await storage.restorePhysician(req.params.id);
      if (!restored) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "RESTORE", entity: "Physician", entityId: req.params.id, detailJson: {}, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.patch("/api/physicians/:id/assign", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const { marketerId } = req.body;
      const phys = await storage.assignPhysicianToMarketer(req.params.id, marketerId || null);
      if (!phys) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "ASSIGN", entity: "Physician", entityId: phys.id, detailJson: { marketerId }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(phys);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/physicians/:id/comments", requireAuth, async (req, res) => {
    try {
      const comments = await storage.getPhysicianComments(req.params.id);
      res.json(comments);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/physicians/:id/comments", requireAuth, async (req, res) => {
    try {
      const { content } = req.body;
      if (!content || typeof content !== "string" || !content.trim()) {
        return res.status(400).json({ message: "Content is required" });
      }
      const comment = await storage.createPhysicianComment({
        physicianId: req.params.id,
        userId: req.session.userId!,
        content: content.trim(),
      });
      res.json(comment);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/physicians/:id/comments/:commentId", requireAuth, async (req, res) => {
    try {
      const { content } = req.body;
      if (!content || typeof content !== "string" || !content.trim()) {
        return res.status(400).json({ message: "Content is required" });
      }
      const existing = await storage.getPhysicianComments(req.params.id);
      const target = existing.find(c => c.id === req.params.commentId);
      if (!target) return res.status(404).json({ message: "Comment not found" });
      if (target.userId !== req.session.userId) {
        return res.status(403).json({ message: "You can only edit your own comments" });
      }
      const comment = await storage.updatePhysicianComment(req.params.commentId, content.trim());
      if (!comment) return res.status(404).json({ message: "Comment not found" });
      res.json(comment);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/physicians/:id/comments/:commentId", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const deleted = await storage.deletePhysicianComment(req.params.commentId);
      if (!deleted) return res.status(404).json({ message: "Comment not found" });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });
}
