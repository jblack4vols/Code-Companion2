/**
 * Outlook Calendar OAuth routes.
 * Handles Microsoft OAuth 2.0 flow to connect a user's Outlook calendar.
 * Tokens are stored in user_oauth_tokens.
 * NOTE: For production hardening, consider encrypting tokens at rest (pgcrypto / AES).
 */
import type { Express } from "express";
import { Client } from "@microsoft/microsoft-graph-client";
import { db } from "../db";
import { eq } from "drizzle-orm";
import { userOauthTokens, calendarEvents } from "@shared/schema";
import { requireAuth, getClientIp } from "./shared";
import { storage } from "../storage";
import {
  exchangeCodeForTokens,
  getValidAccessToken,
  AUTH_URL,
  REDIRECT_URI,
  SCOPES,
} from "../outlook-oauth-token-helpers";

function buildGraphClient(accessToken: string): Client {
  return Client.initWithMiddleware({
    authProvider: { getAccessToken: async () => accessToken },
  });
}

export function registerOutlookOAuthRoutes(app: Express) {
  // Redirect user to Microsoft OAuth consent screen
  app.get("/api/outlook/connect", requireAuth, (req, res) => {
    const state = Buffer.from(req.session.userId!).toString("base64");
    const url = new URL(AUTH_URL);
    url.searchParams.set("client_id", process.env.AZURE_AD_CLIENT_ID!);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", REDIRECT_URI);
    url.searchParams.set("response_mode", "query");
    url.searchParams.set("scope", SCOPES.join(" "));
    url.searchParams.set("state", state);
    res.redirect(url.toString());
  });

  // Handle OAuth callback — exchange code for tokens and persist them
  app.get("/api/outlook/callback", async (req, res) => {
    const { code, state, error } = req.query as Record<string, string>;

    if (error) {
      console.error(`[Outlook OAuth] Denied: ${error}`);
      return res.redirect("/calendar?error=oauth_denied");
    }
    if (!code || !state) return res.redirect("/calendar?error=oauth_invalid");

    try {
      const userId = Buffer.from(state, "base64").toString("utf-8");
      const tokens = await exchangeCodeForTokens(code);
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

      // Fetch the user's Outlook email via Graph (non-fatal if it fails)
      let outlookEmail: string | null = null;
      try {
        const client = buildGraphClient(tokens.access_token);
        const me = await client.api("/me").select("mail,userPrincipalName").get();
        outlookEmail = me.mail ?? me.userPrincipalName ?? null;
      } catch {
        // enrichment failure is non-fatal
      }

      await db
        .insert(userOauthTokens)
        .values({
          userId,
          provider: "microsoft",
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token ?? null,
          expiresAt,
          email: outlookEmail,
        })
        .onConflictDoUpdate({
          target: userOauthTokens.userId,
          set: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token ?? null,
            expiresAt,
            email: outlookEmail,
            updatedAt: new Date(),
          },
        });

      res.redirect("/calendar?outlook=connected");
    } catch (err: any) {
      console.error(`[Outlook OAuth] Callback error: ${err.message}`);
      res.redirect("/calendar?error=oauth_failed");
    }
  });

  // Return connection status for the current user
  app.get("/api/outlook/status", requireAuth, async (req, res) => {
    try {
      const [row] = await db
        .select({ email: userOauthTokens.email })
        .from(userOauthTokens)
        .where(eq(userOauthTokens.userId, req.session.userId!));

      res.json(row ? { connected: true, email: row.email ?? undefined } : { connected: false });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Disconnect: remove stored tokens for the current user
  app.post("/api/outlook/disconnect", requireAuth, async (req, res) => {
    try {
      await db.delete(userOauthTokens).where(eq(userOauthTokens.userId, req.session.userId!));
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Sync Outlook calendar events for the next 30 days into calendar_events
  app.post("/api/outlook/sync", requireAuth, async (req, res) => {
    const userId = req.session.userId!;
    try {
      const accessToken = await getValidAccessToken(userId);
      const client = buildGraphClient(accessToken);

      const now = new Date();
      const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const result = await client
        .api("/me/calendarView")
        .query({
          startDateTime: now.toISOString(),
          endDateTime: end.toISOString(),
          $select: "id,subject,bodyPreview,start,end,isAllDay,onlineMeetingUrl",
          $top: 100,
        })
        .get();

      const events: any[] = result.value ?? [];
      let upserted = 0;

      for (const ev of events) {
        const startAt = new Date(ev.start?.dateTime ?? ev.start?.date);
        const endAt = new Date(ev.end?.dateTime ?? ev.end?.date);
        const meetingUrl = ev.onlineMeetingUrl ?? null;

        const [existing] = await db
          .select({ id: calendarEvents.id })
          .from(calendarEvents)
          .where(eq(calendarEvents.outlookEventId, ev.id));

        if (existing) {
          await storage.updateCalendarEvent(existing.id, {
            title: ev.subject || "(No title)",
            description: ev.bodyPreview ?? null,
            startAt,
            endAt,
            allDay: ev.isAllDay ?? false,
            meetingUrl,
          });
        } else {
          await storage.createCalendarEvent({
            title: ev.subject || "(No title)",
            description: ev.bodyPreview ?? null,
            eventType: "MEETING",
            startAt,
            endAt,
            organizerUserId: userId,
            outlookEventId: ev.id,
            allDay: ev.isAllDay ?? false,
            meetingUrl,
          });
        }
        upserted++;
      }

      await storage.createAuditLog({
        userId,
        action: "SYNC",
        entity: "OutlookCalendar",
        entityId: userId,
        detailJson: { eventsUpserted: upserted },
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"] || null,
      });

      res.json({ success: true, eventsUpserted: upserted });
    } catch (err: any) {
      console.error(`[Outlook Sync] Error: ${err.message}`);
      res.status(500).json({ message: err.message });
    }
  });
}
