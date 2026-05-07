/**
 * SharePoint sync integration route handlers.
 * Registered by integrations.ts barrel.
 */
import type { Express } from "express";
import {
  searchSites as searchSPSites,
  getSiteId as getSPSiteId,
  setSiteId as setSPSiteId,
  validateSite as validateSPSite,
  getSyncStatuses as getSPSyncStatuses,
  syncEntity as syncSPEntity,
  syncAll as syncSPAll,
} from "../sharepoint";
import { requireRole } from "./shared";
import { qstr } from "./shared";

export function registerSharePointRoutes(app: Express) {
  app.get("/api/sharepoint/sites", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const sites = await searchSPSites(qstr(req.query.q as string | string[] | undefined) || "*");
      res.json(sites);
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/sharepoint/site", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const siteId = await getSPSiteId();
      res.json({ siteId });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/sharepoint/site", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const { siteId, siteUrl } = req.body;
      let resolvedSite: any;

      if (siteUrl) {
        try {
          const url = new URL(siteUrl);
          const hostname = url.hostname;
          const sitePath = url.pathname.replace(/^\//, "").replace(/\/$/, "");
          if (!hostname || !sitePath) {
            return res.status(400).json({ message: "Invalid SharePoint URL. Expected format: https://tenant.sharepoint.com/sites/SiteName" });
          }
          const { getSiteByUrl: getSPSiteByUrl } = await import("../sharepoint");
          resolvedSite = await getSPSiteByUrl(hostname, sitePath);
        } catch (urlErr: any) {
          console.error("SharePoint URL resolution error:", urlErr.message);
          return res.status(400).json({ message: `Could not resolve SharePoint site from URL: ${urlErr.message}` });
        }
      } else if (siteId) {
        resolvedSite = await validateSPSite(siteId);
      } else {
        return res.status(400).json({ message: "siteId or siteUrl is required" });
      }

      await setSPSiteId(resolvedSite.id);
      res.json({
        success: true,
        site: { id: resolvedSite.id, displayName: resolvedSite.displayName, webUrl: resolvedSite.webUrl },
      });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  app.get("/api/sharepoint/status", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const statuses = await getSPSyncStatuses();
      const siteId = await getSPSiteId();
      res.json({ siteId, statuses });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/sharepoint/sync/:entity", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    const entity = req.params.entity as string;
    const validEntities = ["physicians", "referrals", "interactions", "tasks", "locations"];
    if (!validEntities.includes(entity)) {
      return res.status(400).json({ message: `Invalid entity: ${entity}` });
    }
    res.json({ message: `Sync started for ${entity}` });
    syncSPEntity(entity)
      .then(result => console.log(`SharePoint sync complete for ${entity}: ${result.created} created, ${result.failed} failed`))
      .catch(err => console.error(`SharePoint sync failed for ${entity}:`, err.message));
  });

  app.post("/api/sharepoint/sync-all", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    res.json({ message: "Sync started for all entities" });
    syncSPAll()
      .then(results => console.log("SharePoint sync all complete:", results))
      .catch(err => console.error("SharePoint sync all failed:", err.message));
  });
}
