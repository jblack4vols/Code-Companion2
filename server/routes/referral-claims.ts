/**
 * Referral-to-claims linking API. Read access scoped by user location assignments.
 */
import type { Express } from "express";
import { requireRole, getUserLocationScope, qstr } from "./shared";
import * as referralClaimsStorage from "../storage-referral-claims";

export function registerReferralClaimsRoutes(app: Express) {
  const READ = requireRole("OWNER", "DIRECTOR", "ANALYST");

  app.get("/api/referral-claims/linked", READ, async (req, res) => {
    try {
      const locationScope = await getUserLocationScope(req);
      if (locationScope !== null && locationScope.length === 0) {
        return res.json({ data: [], total: 0 });
      }
      const page = parseInt(qstr(req.query.page) || "1") || 1;
      const pageSize = parseInt(qstr(req.query.pageSize) || "50") || 50;
      const data = await referralClaimsStorage.getReferralClaimsLinked({
        locationId: qstr(req.query.locationId),
        locationIds: locationScope,
        physicianId: qstr(req.query.physicianId),
        page,
        pageSize,
      });
      res.json({ ...data, page, pageSize });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/referral-claims/summary", READ, async (req, res) => {
    try {
      const locationScope = await getUserLocationScope(req);
      if (locationScope !== null && locationScope.length === 0) {
        return res.json({ totalReferrals: 0, linkedReferrals: 0, totalEstimated: 0, totalCollected: 0, accuracyGap: 0 });
      }
      const data = await referralClaimsStorage.getReferralClaimsSummary({
        locationId: qstr(req.query.locationId),
        locationIds: locationScope,
      });
      res.json(data);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });
}
