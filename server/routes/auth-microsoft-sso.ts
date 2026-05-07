/**
 * Microsoft 365 SSO routes.
 * GET /api/auth/microsoft — redirect to Azure AD consent screen
 * GET /api/auth/microsoft/callback — handle OAuth callback, resolve/create user, store tokens
 */
import type { Express } from "express";
import crypto from "crypto";
import { Client } from "@microsoft/microsoft-graph-client";
import { db } from "../db";
import { userOauthTokens, users } from "@shared/schema";
import { storage } from "../storage";
import { getClientIp } from "./shared";
import {
  exchangeCodeForTokens,
  getAuthUrl,
  SSO_REDIRECT_URI,
  SCOPES,
} from "../outlook-oauth-token-helpers";

/** Extended scopes: identity + calendar */
const SSO_SCOPES = ["openid", "profile", "email", ...SCOPES];

function buildGraphClient(accessToken: string): Client {
  return Client.initWithMiddleware({
    authProvider: { getAccessToken: async () => accessToken },
  });
}

export function registerMicrosoftSsoRoutes(app: Express) {
  // Redirect to Microsoft OAuth consent screen
  app.get("/api/auth/microsoft", (req, res) => {
    const state = crypto.randomBytes(32).toString("hex");
    req.session.oauthState = state;

    // Force session save before redirect — saveUninitialized is false,
    // so new sessions won't persist unless explicitly saved
    req.session.save((err) => {
      if (err) {
        console.error("[SSO] Session save error:", err);
        return res.redirect("/login?error=oauth_failed");
      }

      const url = new URL(getAuthUrl());
      url.searchParams.set("client_id", process.env.AZURE_AD_CLIENT_ID!);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("redirect_uri", SSO_REDIRECT_URI);
      url.searchParams.set("response_mode", "query");
      url.searchParams.set("scope", SSO_SCOPES.join(" "));
      url.searchParams.set("state", state);

      res.redirect(url.toString());
    });
  });

  // Handle OAuth callback
  app.get("/api/auth/microsoft/callback", async (req, res) => {
    const { code, state, error, error_description } = req.query as Record<string, string>;
    const ip = getClientIp(req);
    const ua = req.headers["user-agent"] || "unknown";

    console.log("[SSO CALLBACK] query params:", { code: code ? "present" : "missing", state: state ? "present" : "missing", error, error_description });
    console.log("[SSO CALLBACK] session oauthState:", req.session.oauthState ? "present" : "missing");

    if (error) {
      console.error(`[SSO] OAuth denied: ${error} — ${error_description}`);
      return res.redirect("/login?error=oauth_denied");
    }

    if (!code || !state) {
      console.error("[SSO] Missing code or state in callback");
      return res.redirect("/login?error=oauth_failed");
    }

    // CSRF check
    if (state !== req.session.oauthState) {
      console.error(`[SSO] State mismatch. Expected: ${req.session.oauthState?.slice(0, 8)}... Got: ${state?.slice(0, 8)}...`);
      return res.redirect("/login?error=oauth_failed");
    }
    delete req.session.oauthState;

    try {
      // Exchange code for tokens
      const tokens = await exchangeCodeForTokens(code, SSO_REDIRECT_URI);
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

      // Fetch user profile from Microsoft Graph
      const client = buildGraphClient(tokens.access_token);
      const me = await client
        .api("/me")
        .select("id,mail,displayName,userPrincipalName")
        .get();

      const oid: string = me.id;
      const email: string = me.mail ?? me.userPrincipalName;
      const displayName: string = me.displayName ?? email;

      if (!email) {
        console.error("[SSO] No email returned from Graph /me");
        return res.redirect("/login?error=oauth_failed");
      }

      // Resolve user: microsoftId → email → create
      let user = await storage.getUserByMicrosoftId(oid);

      if (!user) {
        user = await storage.getUserByEmail(email);
        if (user) {
          // Link existing account to Microsoft
          await storage.updateUser(user.id, {
            microsoftId: oid,
            authProvider: user.authProvider || "microsoft",
          } as any);
          user = await storage.getUser(user.id);
        }
      }

      if (!user) {
        // Create new SSO user with PENDING approval in a single insert to avoid race window
        const [created] = await db.insert(users).values({
          name: displayName,
          email,
          password: null,
          role: "MARKETER",
          microsoftId: oid,
          authProvider: "microsoft",
          approvalStatus: "PENDING",
          forcePasswordChange: false,
        } as any).returning();
        user = created;
      }

      if (!user) {
        return res.redirect("/login?error=oauth_failed");
      }

      // Approval gate
      if (user.approvalStatus === "PENDING") {
        await storage.createAuditLog({
          userId: user.id, action: "SSO_LOGIN_PENDING", entity: "Auth",
          entityId: user.id, detailJson: { email }, ipAddress: ip, userAgent: ua,
        });
        return res.redirect("/login?pending=true");
      }
      if (user.approvalStatus === "REJECTED") {
        return res.redirect("/login?rejected=true");
      }

      // Store calendar tokens (upsert)
      const outlookEmail: string | null = me.mail ?? me.userPrincipalName ?? null;

      await db
        .insert(userOauthTokens)
        .values({
          userId: user.id,
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

      // Establish session
      await storage.updateUser(user.id, {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      } as any);
      req.session.userId = user.id;

      // Audit log
      await storage.createAuditLog({
        userId: user.id, action: "SSO_LOGIN", entity: "Auth",
        entityId: user.id, detailJson: { email, provider: "microsoft" },
        ipAddress: ip, userAgent: ua,
      });

      res.redirect("/");
    } catch (err: any) {
      console.error(`[SSO] Callback error:`, err.message, err.stack);
      res.redirect("/login?error=oauth_failed");
    }
  });
}
