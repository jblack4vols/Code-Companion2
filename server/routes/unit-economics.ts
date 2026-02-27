/**
 * Unit Economics API routes.
 * Roles: OWNER=full, DIRECTOR=read+manage, ANALYST=read-only, others=403.
 */
import type { Express } from "express";
import { storage } from "../storage";
import { requireRole, getClientIp } from "./shared";
import { evaluateAlerts, evaluateProviderAlerts } from "../unit-economics-alert-engine";

export function registerUnitEconomicsRoutes(app: Express) {

  // GET /api/unit-economics/dashboard — aggregated per-location summary
  app.get(
    "/api/unit-economics/dashboard",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const data = await storage.getUnitEconomicsDashboard();
        res.json(data);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  // GET /api/unit-economics/location/:id — time series + providers for one location
  app.get(
    "/api/unit-economics/location/:id",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const dateFrom = typeof req.query.dateFrom === "string" ? req.query.dateFrom : undefined;
        const dateTo = typeof req.query.dateTo === "string" ? req.query.dateTo : undefined;
        const data = await storage.getUnitEconomicsLocationDetail(String(req.params.id), dateFrom, dateTo);
        res.json(data);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  // GET /api/unit-economics/providers — leaderboard across locations
  app.get(
    "/api/unit-economics/providers",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const dateFrom = req.query.dateFrom as string | undefined;
        const dateTo = req.query.dateTo as string | undefined;
        const locationId = req.query.locationId as string | undefined;
        const data = await storage.getProviderProductivityLeaderboard(dateFrom, dateTo, locationId);
        res.json(data);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  // GET /api/unit-economics/forecast — directional revenue forecast per location
  app.get(
    "/api/unit-economics/forecast",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const locationId = req.query.locationId as string | undefined;
        const data = await storage.getUnitEconomicsForecast(locationId);
        res.json(data);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  // POST /api/unit-economics/financials — manual single-record entry
  app.post(
    "/api/unit-economics/financials",
    requireRole("OWNER", "DIRECTOR"),
    async (req, res) => {
      try {
        const result = await storage.upsertClinicFinancial(req.body);
        const alertCount = await evaluateAlerts(result.locationId);
        await storage.createAuditLog({
          userId: req.session.userId!,
          action: "CREATE",
          entity: "ClinicFinancial",
          entityId: result.id,
          detailJson: { ...req.body, alertsTriggered: alertCount },
          ipAddress: getClientIp(req),
          userAgent: req.headers["user-agent"] || null,
        });
        res.json({ financial: result, alertsTriggered: alertCount });
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
    },
  );

  // GET /api/unit-economics/alerts — list financial alerts
  app.get(
    "/api/unit-economics/alerts",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const acknowledged =
          req.query.acknowledged === "true" ? true :
          req.query.acknowledged === "false" ? false :
          undefined;
        const locationId = req.query.locationId as string | undefined;
        const data = await storage.getFinancialAlerts({ locationId, acknowledged });
        res.json(data);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  // POST /api/unit-economics/alerts/:id/acknowledge
  app.post(
    "/api/unit-economics/alerts/:id/acknowledge",
    requireRole("OWNER", "DIRECTOR"),
    async (req, res) => {
      try {
        const alert = await storage.acknowledgeFinancialAlert(String(req.params.id), req.session.userId!);
        if (!alert) return res.status(404).json({ message: "Alert not found" });
        res.json(alert);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  // GET /api/unit-economics/targets
  app.get(
    "/api/unit-economics/targets",
    requireRole("OWNER", "DIRECTOR"),
    async (req, res) => {
      try {
        const locationId = req.query.locationId as string | undefined;
        const data = await storage.getFinancialTargets(locationId);
        res.json(data);
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );

  // PATCH /api/unit-economics/targets — bulk upsert targets (OWNER only)
  app.patch(
    "/api/unit-economics/targets",
    requireRole("OWNER"),
    async (req, res) => {
      try {
        const targets = req.body.targets;
        if (!Array.isArray(targets)) {
          return res.status(400).json({ message: "targets array required" });
        }
        const results = await Promise.all(targets.map((t: any) => storage.upsertFinancialTarget(t)));
        await storage.createAuditLog({
          userId: req.session.userId!,
          action: "UPDATE",
          entity: "FinancialTargets",
          entityId: "bulk",
          detailJson: { count: results.length },
          ipAddress: getClientIp(req),
          userAgent: req.headers["user-agent"] || null,
        });
        res.json(results);
      } catch (err: any) {
        res.status(400).json({ message: err.message });
      }
    },
  );

  // POST /api/unit-economics/alerts/evaluate — manually trigger alert engine (OWNER/DIRECTOR)
  app.post(
    "/api/unit-economics/alerts/evaluate",
    requireRole("OWNER", "DIRECTOR"),
    async (req, res) => {
      try {
        const locationId = req.body.locationId as string | undefined;
        const [locationAlerts, providerAlerts] = await Promise.all([
          evaluateAlerts(locationId),
          evaluateProviderAlerts(),
        ]);
        res.json({ locationAlerts, providerAlerts, total: locationAlerts + providerAlerts });
      } catch (err: any) {
        res.status(500).json({ message: err.message });
      }
    },
  );
}
