/**
 * Appeal Generator API routes.
 * Template CRUD, appeal generation, lifecycle management, outcome stats.
 * Roles: OWNER/DIRECTOR for writes; OWNER/DIRECTOR/ANALYST for reads.
 */
import type { Express } from "express";
import { requireRole } from "./shared";
import {
  getAppealTemplates,
  getAppealTemplate,
  upsertAppealTemplate,
  deleteAppealTemplate,
  generateAppeal,
  getAppeals,
  getAppeal,
  updateAppealStatus,
  getAppealStats,
  seedDefaultAppealTemplates,
} from "../storage-appeals";

export async function registerRevenueRecoveryAppealsRoutes(app: Express): Promise<void> {
  // Seed default templates once on startup
  await seedDefaultAppealTemplates();

  // ---- Appeal Templates ----

  // GET /api/revenue/appeal-templates — list templates
  app.get(
    "/api/revenue/appeal-templates",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const activeOnly = req.query.activeOnly === "true";
        const data = await getAppealTemplates(activeOnly);
        res.json(data);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  // GET /api/revenue/appeal-templates/:id — single template
  app.get(
    "/api/revenue/appeal-templates/:id",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const tmpl = await getAppealTemplate(String(req.params.id));
        if (!tmpl) return res.status(404).json({ message: "Template not found" });
        res.json(tmpl);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  // POST /api/revenue/appeal-templates — create or update template
  app.post(
    "/api/revenue/appeal-templates",
    requireRole("OWNER", "DIRECTOR"),
    async (req, res) => {
      try {
        const tmpl = await upsertAppealTemplate(req.body);
        res.json(tmpl);
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
    },
  );

  // DELETE /api/revenue/appeal-templates/:id — soft delete (set isActive=false)
  app.delete(
    "/api/revenue/appeal-templates/:id",
    requireRole("OWNER", "DIRECTOR"),
    async (req, res) => {
      try {
        await deleteAppealTemplate(String(req.params.id));
        res.json({ success: true });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  // ---- Appeals ----

  // GET /api/revenue/appeals/stats — outcome summary (before /:id to avoid conflict)
  app.get(
    "/api/revenue/appeals/stats",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (_req, res) => {
      try {
        const stats = await getAppealStats();
        res.json(stats);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  // GET /api/revenue/appeals — list appeals with filters
  app.get(
    "/api/revenue/appeals",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const filters = {
          claimId: req.query.claimId as string | undefined,
          status: req.query.status as string | undefined,
          page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
          pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string, 10) : 20,
        };
        const result = await getAppeals(filters);
        res.json(result);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  // GET /api/revenue/appeals/:id — single appeal detail
  app.get(
    "/api/revenue/appeals/:id",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const appeal = await getAppeal(String(req.params.id));
        if (!appeal) return res.status(404).json({ message: "Appeal not found" });
        res.json(appeal);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  // POST /api/revenue/appeals/generate — generate appeal for a claim
  app.post(
    "/api/revenue/appeals/generate",
    requireRole("OWNER", "DIRECTOR"),
    async (req, res) => {
      try {
        const { claimId, templateId } = req.body;
        if (!claimId) return res.status(400).json({ message: "claimId is required" });
        const appeal = await generateAppeal(claimId, templateId, req.session.userId);
        res.json(appeal);
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
    },
  );

  // PATCH /api/revenue/appeals/:id — update appeal status/outcome
  app.patch(
    "/api/revenue/appeals/:id",
    requireRole("OWNER", "DIRECTOR"),
    async (req, res) => {
      try {
        const { status, notes, recoveredAmount } = req.body;
        if (!status) return res.status(400).json({ message: "status is required" });
        const valid = ["DRAFTED", "SUBMITTED", "WON", "LOST", "EXPIRED"];
        if (!valid.includes(status)) {
          return res.status(400).json({ message: `Invalid status. Must be one of: ${valid.join(", ")}` });
        }
        const appeal = await updateAppealStatus(
          String(req.params.id),
          status,
          notes,
          recoveredAmount,
        );
        res.json(appeal);
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
    },
  );
}
