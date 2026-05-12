/**
 * SharePoint sync integration route handlers.
 * Registered by integrations.ts barrel.
 */
import type { Express } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { sharepointSyncStatus } from "@shared/schema";

/**
 * Wrap a promise so it survives past res.json() on Vercel's serverless
 * runtime. Without this, Vercel kills the function ~30s after the
 * response is sent, even if a background promise is still running —
 * which is why SharePoint syncs were dying ~1 minute into a 5+ minute
 * job. Documented at https://vercel.com/docs/functions/functions-api-reference#waituntil
 *
 * Falls back to a no-op outside Vercel (local dev, Railway) where the
 * Node process stays alive for the duration of the request handler
 * anyway. Import is dynamic so node test runs don't blow up on a
 * missing @vercel/functions in environments that don't have it.
 */
async function runInBackground(promise: Promise<unknown>): Promise<void> {
  if (process.env.VERCEL) {
    try {
      const { waitUntil } = await import("@vercel/functions");
      waitUntil(promise);
      return;
    } catch (err: any) {
      console.warn("[runInBackground] @vercel/functions unavailable, falling back to fire-and-forget:", err?.message);
    }
  }
  // Local / non-Vercel: just let the promise run, no special handling
  // needed because the process stays alive for the request lifetime.
  promise.catch(() => {});
}
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

function logGraphErr(prefix: string, err: any) {
  // Microsoft Graph errors carry rich metadata; .message alone strips it.
  console.error(prefix, {
    message: err?.message,
    statusCode: err?.statusCode,
    code: err?.code,
    requestId: err?.requestId,
    body: err?.body,
  });
}

export function registerSharePointRoutes(app: Express) {
  app.get("/api/sharepoint/sites", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const sites = await searchSPSites(qstr(req.query.q as string | string[] | undefined) || "*");
      res.json(sites);
    } catch (err: any) {
      logGraphErr("[SharePoint] /sites failed:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.get("/api/sharepoint/site", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const siteId = await getSPSiteId();
      res.json({ siteId });
    } catch (err: any) {
      logGraphErr("[SharePoint] /site failed:", err);
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
          logGraphErr("[SharePoint] URL resolution error:", urlErr);
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
      logGraphErr("[SharePoint] POST /site failed:", err);
      res.status(500).json({ message: err.message || "Internal server error" });
    }
  });

  app.get("/api/sharepoint/status", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const statuses = await getSPSyncStatuses();
      const siteId = await getSPSiteId();
      res.json({ siteId, statuses });
    } catch (err: any) {
      logGraphErr("[SharePoint] /status failed:", err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/sharepoint/sync/:entity", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    const entity = req.params.entity as string;
    const validEntities = ["physicians", "referrals", "interactions", "tasks", "locations"];
    if (!validEntities.includes(entity)) {
      return res.status(400).json({ message: `Invalid entity: ${entity}` });
    }

    // Concurrent-sync guard. Multiple clicks while a sync was already running
    // (caused by the pre-PR-#56 stale-detector false-flagging an active sync
    // as 'Stuck') spawned duplicate background jobs that competed for the
    // same Graph rate limit and slowed each other down. Block new starts
    // when one is already healthy and running. Stale SYNCING rows
    // (heartbeat older than 3 min) are treated as dead and overridable.
    const STALE_LOCK_MS = 3 * 60 * 1000;
    const [existing] = await db
      .select({ status: sharepointSyncStatus.status, updatedAt: sharepointSyncStatus.updatedAt })
      .from(sharepointSyncStatus)
      .where(eq(sharepointSyncStatus.entity, entity));

    if (existing && existing.status === "SYNCING" && existing.updatedAt) {
      const age = Date.now() - new Date(existing.updatedAt).getTime();
      if (age < STALE_LOCK_MS) {
        return res.status(409).json({
          message: `Sync for ${entity} already in progress. Wait for it to finish or check /api/sharepoint/status for progress.`,
          startedAgoSeconds: Math.floor(age / 1000),
        });
      }
      console.log(`[SharePoint] Overriding stale SYNCING lock for ${entity} (heartbeat ${Math.floor(age / 1000)}s old)`);
    }

    // Return immediately so the browser doesn't time out the request — the
    // upsert flow + retry-on-throttle for 3000+ rows can run several minutes,
    // longer than browsers' fetch timeout. Sync runs in the background.
    //
    // Vercel may kill the function after the response. That's OK because
    // the upsert flow (PR #50) is idempotent: items keyed by ExternalId
    // get PATCHed on retry, not duplicated. So if Vercel kills mid-flight
    // the user just clicks Sync again and the next pass picks up where it
    // left off (insert-only items already in the SP list won't reinsert).
    //
    // The 2-min stuck-detection in the UI (PR #46) flips a stuck SYNCING
    // row's badge to 'Stuck — click Sync to retry' so the user knows.
    res.json({ message: `Sync started for ${entity}` });
    // Background work continues past res.json() — runInBackground hands
    // it to Vercel's waitUntil so the runtime keeps the function alive
    // until the promise resolves (up to maxDuration=300s). Pre-waitUntil
    // Vercel was killing the worker ~30-60s after response, mid-sync.
    runInBackground(
      syncSPEntity(entity)
        .then(result => console.log(`SharePoint sync complete for ${entity}: ${result.created} synced, ${result.failed} failed`))
        .catch(err => logGraphErr(`[SharePoint] sync failed for ${entity}:`, err))
    );
  });

  app.post("/api/sharepoint/sync-all", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    res.json({ message: "Sync started for all entities" });
    runInBackground(
      syncSPAll()
        .then(results => console.log("SharePoint sync all complete:", results))
        .catch(err => logGraphErr("[SharePoint] sync-all failed:", err))
    );
  });
}
