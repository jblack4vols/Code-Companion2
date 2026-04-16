import type { Express } from "express";
import { type Server } from "http";
import session from "express-session";
import cookieParser from "cookie-parser";
import connectPgSimple from "connect-pg-simple";
import { db } from "./db";
import { sql } from "drizzle-orm";
import { apiLimiter, publicApiLimiter } from "./middleware/rateLimiter";
import { csrfProtection, csrfTokenEndpoint } from "./middleware/csrf";
import { SESSION_TIMEOUT_MS } from "./routes/shared";
import { registerAuthRoutes } from "./routes/auth";
import { registerUserRoutes } from "./routes/users";
import { registerLocationRoutes } from "./routes/locations";
import { registerPhysicianRoutes } from "./routes/physicians";
import { registerInteractionRoutes } from "./routes/interactions";
import { registerReferralRoutes } from "./routes/referrals";
import { registerTaskRoutes } from "./routes/tasks";
import { registerCalendarRoutes } from "./routes/calendar";
import { registerTerritoryRoutes } from "./routes/territories";
import { registerDashboardRoutes } from "./routes/dashboard";
import { registerAdminRoutes } from "./routes/admin";
import { registerImportRoutes } from "./routes/import";
import { registerIntegrationRoutes } from "./routes/integrations";
import { registerPublicApiRoutes } from "./routes/publicApi";
import { registerSearchRoutes } from "./routes/search";
import { registerGoalRoutes } from "./routes/goals";
import { registerTemplateRoutes } from "./routes/templates";
import { registerFeatureRoutes } from "./routes/features";
import { registerFeedbackRoutes } from "./routes/feedback";
import { registerPracticeRoutes } from "./routes/practice-intelligence";
import { registerUnitEconomicsRoutes } from "./routes/unit-economics";
import { registerRevenueRecoveryRoutes } from "./routes/revenue-recovery";
import { registerBillingLagRoutes } from "./routes/billing-lag";
import { registerRevenueRecoveryAppealsRoutes } from "./routes/revenue-recovery-appeals";
import { registerFrontDeskRoutes } from "./routes/frontdesk";
import { registerRpvAnalyticsRoutes } from "./routes/rpv-analytics";
import { registerReferralIntelligenceRoutes } from "./routes/referral-intelligence";
import { registerProviderProductivityV2Routes } from "./routes/provider-productivity-v2";
import { registerOutlookOAuthRoutes } from "./routes/outlook-oauth";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const PgStore = connectPgSimple(session);

  // Create session table lazily — don't block cold start
  db.execute(sql`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL,
      CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
    ) WITH (OIDS=FALSE)
  `).then(() => db.execute(sql`
    CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire")
  `)).catch(() => {});

  app.use(cookieParser());

  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https://*.tile.openstreetmap.org wss:; frame-ancestors 'none'");
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });

  app.use(
    session({
      store: new PgStore({
        conString: process.env.DATABASE_URL + (process.env.DATABASE_URL?.includes("sslmode") ? "" : "?sslmode=require"),
        createTableIfMissing: true,
        pruneSessionInterval: false,
        tableName: "session",
      }),
      secret: process.env.SESSION_SECRET ?? (() => { throw new Error("SESSION_SECRET environment variable is required"); })(),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        maxAge: SESSION_TIMEOUT_MS,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
    })
  );

  app.use("/api", apiLimiter);
  app.use("/api/public", publicApiLimiter);

  app.use("/api", csrfProtection);
  app.get("/api/csrf-token", csrfTokenEndpoint);

  registerAuthRoutes(app);
  registerUserRoutes(app);
  registerLocationRoutes(app);
  registerPhysicianRoutes(app);
  registerInteractionRoutes(app);
  registerReferralRoutes(app);
  registerTaskRoutes(app);
  registerCalendarRoutes(app);
  registerTerritoryRoutes(app);
  registerDashboardRoutes(app);
  registerAdminRoutes(app);
  await registerImportRoutes(app);
  registerIntegrationRoutes(app);
  registerPublicApiRoutes(app);
  registerSearchRoutes(app);
  registerGoalRoutes(app);
  registerTemplateRoutes(app);
  registerFeatureRoutes(app);
  registerPracticeRoutes(app);
  await registerUnitEconomicsRoutes(app);
  await registerRevenueRecoveryRoutes(app);
  registerBillingLagRoutes(app);
  await registerRevenueRecoveryAppealsRoutes(app);
  registerFrontDeskRoutes(app);
  registerFeedbackRoutes(app);
  registerRpvAnalyticsRoutes(app);
  registerReferralIntelligenceRoutes(app);
  registerProviderProductivityV2Routes(app);
  registerOutlookOAuthRoutes(app);

  return httpServer;
}
