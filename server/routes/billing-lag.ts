/**
 * Billing Lag Tracker API routes.
 * Exposes AR aging buckets, billing cycle metrics, payer/location breakdowns, stale claims.
 * Roles: OWNER/DIRECTOR/ANALYST for reads; OWNER/DIRECTOR for alert evaluation.
 */
import type { Express } from "express";
import { requireRole } from "./shared";
import {
  getARAgingBuckets,
  getBillingLagMetrics,
  getStaleClaims,
} from "../storage-billing-lag";
import {
  getBillingLagByPayer,
  getBillingLagByLocation,
} from "../storage-billing-lag-breakdowns";
import { evaluateBillingLagAlerts } from "../billing-lag-alert-engine";

export function registerBillingLagRoutes(app: Express): void {
  // GET /api/revenue/billing-lag/aging — AR aging buckets
  app.get(
    "/api/revenue/billing-lag/aging",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const locationId = req.query.locationId as string | undefined;
        const data = await getARAgingBuckets(locationId);
        res.json(data);
      } catch (err: any) {
        console.error(err);
      res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // GET /api/revenue/billing-lag/metrics — overall cycle time metrics
  app.get(
    "/api/revenue/billing-lag/metrics",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const filters = {
          locationId: req.query.locationId as string | undefined,
          dateFrom: req.query.dateFrom as string | undefined,
          dateTo: req.query.dateTo as string | undefined,
        };
        const data = await getBillingLagMetrics(filters);
        res.json(data);
      } catch (err: any) {
        console.error(err);
      res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // GET /api/revenue/billing-lag/by-payer — lag breakdown by payer
  app.get(
    "/api/revenue/billing-lag/by-payer",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const filters = {
          locationId: req.query.locationId as string | undefined,
          dateFrom: req.query.dateFrom as string | undefined,
          dateTo: req.query.dateTo as string | undefined,
        };
        const data = await getBillingLagByPayer(filters);
        res.json(data);
      } catch (err: any) {
        console.error(err);
      res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // GET /api/revenue/billing-lag/by-location — lag breakdown by location
  app.get(
    "/api/revenue/billing-lag/by-location",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const filters = {
          dateFrom: req.query.dateFrom as string | undefined,
          dateTo: req.query.dateTo as string | undefined,
        };
        const data = await getBillingLagByLocation(filters);
        res.json(data);
      } catch (err: any) {
        console.error(err);
      res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // GET /api/revenue/billing-lag/stale — claims not yet submitted past threshold
  app.get(
    "/api/revenue/billing-lag/stale",
    requireRole("OWNER", "DIRECTOR", "ANALYST"),
    async (req, res) => {
      try {
        const thresholdDays = req.query.thresholdDays
          ? parseInt(req.query.thresholdDays as string, 10)
          : 7;
        const data = await getStaleClaims(thresholdDays);
        res.json(data);
      } catch (err: any) {
        console.error(err);
      res.status(500).json({ message: "Internal server error" });
      }
    },
  );

  // POST /api/revenue/billing-lag/evaluate-alerts — trigger billing lag alert engine
  app.post(
    "/api/revenue/billing-lag/evaluate-alerts",
    requireRole("OWNER", "DIRECTOR"),
    async (req, res) => {
      try {
        const locationId = req.body?.locationId as string | undefined;
        const alertsCreated = await evaluateBillingLagAlerts(locationId);
        res.json({ alertsCreated });
      } catch (err: any) {
        console.error(err);
      res.status(500).json({ message: "Internal server error" });
      }
    },
  );
}
