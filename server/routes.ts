import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import session from "express-session";
import cookieParser from "cookie-parser";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { sql, eq, and, gte, lt, isNull } from "drizzle-orm";
import { referrals as referralsTable } from "@shared/schema";
import { loginSchema, insertUserSchema, insertPhysicianSchema, insertInteractionSchema, insertReferralSchema, insertTaskSchema, insertLocationSchema, insertCalendarEventSchema, insertScheduledReportSchema, physicians, integrationConfigs, passwordSchema, users as usersTable, appSettings, auditLogs } from "@shared/schema";
import crypto from "crypto";
import connectPgSimple from "connect-pg-simple";
import { sendWelcomeEmail } from "./outlook";
import { searchSites as searchSPSites, getSiteId as getSPSiteId, setSiteId as setSPSiteId, validateSite as validateSPSite, getSyncStatuses as getSPSyncStatuses, syncEntity as syncSPEntity, syncAll as syncSPAll } from "./sharepoint";
import { Readable } from "stream";
import { loginLimiter, apiLimiter } from "./middleware/rateLimiter";
import { csrfProtection, csrfTokenEndpoint } from "./middleware/csrf";

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

function qstr(val: string | string[] | undefined): string | undefined {
  return Array.isArray(val) ? val[0] : val;
}

function qstrReq(val: string | string[] | undefined): string {
  return (Array.isArray(val) ? val[0] : val) || "";
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

function requireRole(...roles: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.session.userId) return res.status(401).json({ message: "Unauthorized" });
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    if (user.role === "OWNER") return next();
    if (!roles.includes(user.role)) return res.status(403).json({ message: "Forbidden" });
    next();
  };
}

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const SESSION_TIMEOUT_MS = 15 * 60 * 1000;

function getClientIp(req: Request): string {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || "unknown";
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const PgStore = connectPgSimple(session);

  app.use(cookieParser());

  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' https://*.tile.openstreetmap.org wss:; frame-ancestors 'none'");
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });

  app.use(
    session({
      store: new PgStore({
        conString: process.env.DATABASE_URL,
        createTableIfMissing: true,
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

  app.use("/api", csrfProtection);
  app.get("/api/csrf-token", csrfTokenEndpoint);

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || "1.0.0",
    });
  });

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const { password: _, ...safeUser } = user;
    res.json(safeUser);
  });

  app.get("/api/auth/session-timeout", (_req, res) => {
    res.json({ timeoutMs: SESSION_TIMEOUT_MS });
  });

  app.post("/api/auth/login", loginLimiter, async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      const ip = getClientIp(req);
      const ua = req.headers["user-agent"] || "unknown";
      const user = await storage.getUserByEmail(email);
      if (!user) {
        await storage.createAuditLog({ userId: null, action: "LOGIN_FAILED", entity: "Auth", entityId: "unknown", detailJson: { email, reason: "user_not_found" }, ipAddress: ip, userAgent: ua });
        return res.status(401).json({ message: "Invalid email or password" });
      }
      if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
        const remainingMs = new Date(user.lockedUntil).getTime() - Date.now();
        const remainingMin = Math.ceil(remainingMs / 60000);
        await storage.createAuditLog({ userId: user.id, action: "LOGIN_LOCKED", entity: "Auth", entityId: user.id, detailJson: { email }, ipAddress: ip, userAgent: ua });
        return res.status(423).json({ message: `Account is locked. Try again in ${remainingMin} minute${remainingMin !== 1 ? "s" : ""}.`, locked: true, remainingMs });
      }
      const valid = await bcrypt.compare(password, user.password);
      if (!valid) {
        const attempts = (user.failedLoginAttempts || 0) + 1;
        const updateData: any = { failedLoginAttempts: attempts };
        if (attempts >= MAX_LOGIN_ATTEMPTS) {
          updateData.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
          await storage.createAuditLog({ userId: user.id, action: "ACCOUNT_LOCKED", entity: "Auth", entityId: user.id, detailJson: { email, attempts }, ipAddress: ip, userAgent: ua });
        }
        await storage.updateUser(user.id, updateData);
        await storage.createAuditLog({ userId: user.id, action: "LOGIN_FAILED", entity: "Auth", entityId: user.id, detailJson: { email, attempts, reason: "bad_password" }, ipAddress: ip, userAgent: ua });
        const remaining = MAX_LOGIN_ATTEMPTS - attempts;
        if (remaining > 0) {
          return res.status(401).json({ message: `Invalid email or password. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.` });
        }
        return res.status(423).json({ message: `Account locked after ${MAX_LOGIN_ATTEMPTS} failed attempts. Try again in 15 minutes.`, locked: true, remainingMs: LOCKOUT_DURATION_MS });
      }
      await storage.updateUser(user.id, { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() });
      req.session.userId = user.id;
      await storage.createAuditLog({ userId: user.id, action: "LOGIN_SUCCESS", entity: "Auth", entityId: user.id, detailJson: { email }, ipAddress: ip, userAgent: ua });
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    const userId = req.session.userId;
    const ip = getClientIp(req);
    const ua = req.headers["user-agent"] || "unknown";
    if (userId) {
      storage.createAuditLog({ userId, action: "LOGOUT", entity: "Auth", entityId: userId, detailJson: {}, ipAddress: ip, userAgent: ua });
    }
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.json({ success: true });
    });
  });

  app.get("/api/users", requireAuth, async (req, res) => {
    const allUsers = await storage.getUsers();
    res.json(allUsers.map(u => { const { password: _, ...safe } = u; return safe; }));
  });

  app.post("/api/users", requireRole("OWNER"), async (req, res) => {
    try {
      const validated = insertUserSchema.parse(req.body);
      const pwResult = passwordSchema.safeParse(validated.password);
      if (!pwResult.success) {
        return res.status(400).json({ message: pwResult.error.errors[0].message });
      }
      const existing = await storage.getUserByEmail(validated.email);
      if (existing) return res.status(409).json({ message: "A user with this email already exists" });
      const plainPassword = validated.password;
      const hashedPassword = await bcrypt.hash(plainPassword, 12);
      const user = await storage.createUser({ ...validated, password: hashedPassword });
      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE", entity: "User", entityId: user.id, detailJson: { name: user.name, email: user.email, role: user.role }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });

      const host = req.headers.host || process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost:5000";
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const loginUrl = `${protocol}://${host}/login`;
      try {
        await sendWelcomeEmail(user.email, user.name, plainPassword, loginUrl);
      } catch (emailErr: any) {
        console.error("Failed to send welcome email:", emailErr.message);
      }

      const { password: _, ...safe } = user;
      res.json(safe);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/users/:id", requireRole("OWNER"), async (req, res) => {
    try {
      const body = { ...req.body };
      if (body.password) {
        const pwResult = passwordSchema.safeParse(body.password);
        if (!pwResult.success) {
          return res.status(400).json({ message: pwResult.error.errors[0].message });
        }
        body.password = await bcrypt.hash(body.password, 12);
        body.passwordChangedAt = new Date();
      } else {
        delete body.password;
      }
      const validated = insertUserSchema.partial().parse(body);
      const user = await storage.updateUser(req.params.id, validated);
      if (!user) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "UPDATE", entity: "User", entityId: user.id, detailJson: { name: user.name, role: user.role }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      const { password: _, ...safe } = user;
      res.json(safe);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/users/:id", requireRole("OWNER"), async (req, res) => {
    try {
      if (req.params.id === req.session.userId) {
        return res.status(400).json({ message: "You cannot delete your own account" });
      }
      await storage.deleteUser(req.params.id);
      await storage.createAuditLog({ userId: req.session.userId!, action: "DELETE", entity: "User", entityId: req.params.id, detailJson: {}, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true });
    } catch (err: any) {
      res.status(409).json({ message: err.message });
    }
  });

  // --- Locations ---
  app.get("/api/locations", requireAuth, async (req, res) => {
    res.json(await storage.getLocations());
  });

  app.get("/api/locations/:id", requireAuth, async (req, res) => {
    const loc = await storage.getLocation(req.params.id);
    if (!loc) return res.status(404).json({ message: "Not found" });
    res.json(loc);
  });

  app.post("/api/locations", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const validated = insertLocationSchema.parse(req.body);
      const loc = await storage.createLocation(validated);
      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE", entity: "Location", entityId: loc.id, detailJson: { name: loc.name }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(loc);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/locations/:id", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const validated = insertLocationSchema.partial().parse(req.body);
      const loc = await storage.updateLocation(req.params.id, validated);
      if (!loc) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "UPDATE", entity: "Location", entityId: loc.id, detailJson: req.body, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(loc);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/locations/:id", requireRole("OWNER"), async (req, res) => {
    try {
      await storage.deleteLocation(req.params.id);
      await storage.createAuditLog({ userId: req.session.userId!, action: "DELETE", entity: "Location", entityId: req.params.id, detailJson: {}, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true });
    } catch (err: any) {
      res.status(409).json({ message: err.message });
    }
  });

  // --- Physicians ---
  app.get("/api/physicians/paginated", requireAuth, async (req, res) => {
    res.json(await storage.getPhysiciansPaginated({
      search: qstr(req.query.search as any),
      status: qstr(req.query.status as any),
      stage: qstr(req.query.stage as any),
      priority: qstr(req.query.priority as any),
      practiceName: qstr(req.query.practiceName as any),
      sortBy: qstr(req.query.sortBy as any),
      sortOrder: qstr(req.query.sortOrder as any),
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : 50,
    }));
  });

  app.get("/api/physicians/search", requireAuth, async (req, res) => {
    const query = (req.query.q as string || "").trim();
    if (query.length < 2) return res.json([]);
    res.json(await storage.searchPhysiciansTypeahead(query));
  });

  app.get("/api/physicians/practice-names", requireAuth, async (req, res) => {
    const allPhysicians = await storage.getPhysicians();
    const practiceSet = new Set<string>();
    for (const p of allPhysicians) {
      if (p.practiceName && p.practiceName.trim()) {
        practiceSet.add(p.practiceName.trim());
      }
    }
    const sorted = Array.from(practiceSet).sort((a, b) => a.localeCompare(b));
    res.json(sorted);
  });

  app.get("/api/physicians/by-practice", requireAuth, async (req, res) => {
    const name = (req.query.name as string || "").trim();
    if (!name) return res.json([]);
    const allPhysicians = await storage.getPhysicians();
    const matched = allPhysicians.filter(
      (p) => p.practiceName && p.practiceName.trim().toLowerCase() === name.toLowerCase()
    );
    res.json(matched);
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
      res.status(500).json({ message: err.message });
    }
  });

  // --- Duplicate Detection (must be before /:id route) ---
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
      res.status(500).json({ message: err.message });
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
      await db.execute(sql`UPDATE physicians SET deleted_at = NOW(), updated_at = NOW() WHERE id = ${removeId}`);

      await storage.createAuditLog({ userId: req.session.userId!, action: "MERGE_PHYSICIAN", entity: "Physician", entityId: keepId, detailJson: { removedId: removeId }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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
      const validated = insertPhysicianSchema.partial().parse(req.body);
      const phys = await storage.updatePhysician(req.params.id, validated);
      if (!phys) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "UPDATE", entity: "Physician", entityId: phys.id, detailJson: req.body, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
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
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/physicians/:id/restore", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const restored = await storage.restorePhysician(req.params.id);
      if (!restored) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "RESTORE", entity: "Physician", entityId: req.params.id, detailJson: {}, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // --- Interactions ---
  app.get("/api/interactions", requireAuth, async (req, res) => {
    const physicianId = req.query.physicianId as string | undefined;
    res.json(await storage.getInteractions(physicianId));
  });

  app.post("/api/interactions", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      const body = { ...req.body };
      if (typeof body.occurredAt === "string") body.occurredAt = new Date(body.occurredAt);
      if (typeof body.followUpDueAt === "string") body.followUpDueAt = new Date(body.followUpDueAt);
      const validated = insertInteractionSchema.parse(body);
      const inter = await storage.createInteraction(validated);
      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE", entity: "Interaction", entityId: inter.id, detailJson: { type: inter.type, physicianId: inter.physicianId }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(inter);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // --- Referrals ---
  app.get("/api/referrals/paginated", requireAuth, async (req, res) => {
    res.json(await storage.getReferralsPaginated({
      search: qstr(req.query.search as any),
      status: qstr(req.query.status as any),
      locationId: qstr(req.query.locationId as any),
      discipline: qstr(req.query.discipline as any),
      dateFrom: qstr(req.query.dateFrom as any),
      dateTo: qstr(req.query.dateTo as any),
      physicianId: qstr(req.query.physicianId as any),
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : 50,
    }));
  });

  app.get("/api/referrals", requireAuth, async (req, res) => {
    const physicianId = req.query.physicianId as string | undefined;
    res.json(await storage.getReferrals(physicianId));
  });

  app.post("/api/referrals", requireRole("OWNER", "DIRECTOR", "MARKETER", "FRONT_DESK"), async (req, res) => {
    try {
      const body = { ...req.body };
      if (body.newPhysician && !body.physicianId) {
        const newPhysData = insertPhysicianSchema.parse({
          firstName: body.newPhysician.firstName,
          lastName: body.newPhysician.lastName,
          credentials: body.newPhysician.credentials || null,
          npi: body.newPhysician.npi || null,
          practiceName: body.newPhysician.practiceName || null,
          specialty: body.newPhysician.specialty || null,
          status: "PROSPECT",
          relationshipStage: "NEW",
          priority: "MEDIUM",
        });
        const newPhys = await storage.createPhysician(newPhysData);
        await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE", entity: "Physician", entityId: newPhys.id, detailJson: { firstName: newPhys.firstName, lastName: newPhys.lastName, createdVia: "referral_form" }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
        body.physicianId = newPhys.id;
        body.referringProviderName = `${newPhys.firstName} ${newPhys.lastName}`;
        body.referringProviderNpi = newPhys.npi || null;
      }
      delete body.newPhysician;
      const validated = insertReferralSchema.parse(body);
      const ref = await storage.createReferral(validated);
      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE", entity: "Referral", entityId: ref.id, detailJson: { physicianId: ref.physicianId }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(ref);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/referrals/bulk", requireRole("OWNER"), async (req, res) => {
    try {
      const bulkDeleteSchema = z.object({ ids: z.array(z.string().uuid()).min(1, "At least one id required") });
      const parsed = bulkDeleteSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0].message });
      const { ids } = parsed.data;
      const count = await storage.bulkDeleteReferrals(ids);
      await storage.createAuditLog({ userId: req.session.userId!, action: "BULK_DELETE", entity: "Referral", entityId: "bulk", detailJson: { count, ids }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true, count });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/referrals/:id", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const deleted = await storage.softDeleteReferral(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "SOFT_DELETE", entity: "Referral", entityId: req.params.id, detailJson: {}, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/referrals/:id/restore", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const restored = await storage.restoreReferral(req.params.id);
      if (!restored) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "RESTORE", entity: "Referral", entityId: req.params.id, detailJson: {}, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/referrals/duplicates", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const accountDupes = await db.execute(sql`
        SELECT r1.id as id1, r2.id as id2,
          r1.patient_account_number as account_1, r2.patient_account_number as account_2,
          r1.patient_full_name as patient_1, r2.patient_full_name as patient_2,
          r1.referral_date as date_1, r2.referral_date as date_2,
          r1.physician_id as physician_id_1, r2.physician_id as physician_id_2,
          r1.location_id as location_id_1, r2.location_id as location_id_2,
          r1.status as status_1, r2.status as status_2,
          'Account Number Match' as match_reason
        FROM referrals r1
        JOIN referrals r2 ON r1.patient_account_number = r2.patient_account_number AND r1.id < r2.id
        WHERE r1.deleted_at IS NULL AND r2.deleted_at IS NULL
          AND r1.patient_account_number IS NOT NULL AND r1.patient_account_number != ''
        ORDER BY r1.patient_account_number
        LIMIT 50
      `);

      const nameDupes = await db.execute(sql`
        SELECT r1.id as id1, r2.id as id2,
          r1.patient_account_number as account_1, r2.patient_account_number as account_2,
          r1.patient_full_name as patient_1, r2.patient_full_name as patient_2,
          r1.referral_date as date_1, r2.referral_date as date_2,
          r1.physician_id as physician_id_1, r2.physician_id as physician_id_2,
          r1.location_id as location_id_1, r2.location_id as location_id_2,
          r1.status as status_1, r2.status as status_2,
          CASE
            WHEN r1.referral_date = r2.referral_date THEN 'Name + Date Match'
            ELSE 'Name + Physician Match'
          END as match_reason
        FROM referrals r1
        JOIN referrals r2
          ON LOWER(r1.patient_full_name) = LOWER(r2.patient_full_name) AND r1.id < r2.id
          AND (r1.referral_date = r2.referral_date OR (r1.physician_id IS NOT NULL AND r1.physician_id = r2.physician_id))
        WHERE r1.deleted_at IS NULL AND r2.deleted_at IS NULL
          AND r1.patient_full_name IS NOT NULL AND r2.patient_full_name IS NOT NULL
        ORDER BY r1.patient_full_name, r1.referral_date
        LIMIT 50
      `);

      const seenPairs = new Set<string>();
      const combined = [];
      for (const row of [...(accountDupes.rows as any[]), ...(nameDupes.rows as any[])]) {
        const key = `${row.id1}-${row.id2}`;
        if (!seenPairs.has(key)) {
          seenPairs.add(key);
          combined.push(row);
        }
      }
      res.json(combined.slice(0, 100));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // --- Tasks ---
  app.get("/api/tasks", requireAuth, async (req, res) => {
    const physicianId = req.query.physicianId as string | undefined;
    res.json(await storage.getTasks(physicianId));
  });

  app.post("/api/tasks", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      const body = { ...req.body };
      if (typeof body.dueAt === "string") body.dueAt = new Date(body.dueAt);
      const validated = insertTaskSchema.parse(body);
      const task = await storage.createTask(validated);
      res.json(task);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/tasks/:id", requireAuth, async (req, res) => {
    try {
      const body = { ...req.body };
      if (typeof body.dueAt === "string") body.dueAt = new Date(body.dueAt);
      const validated = insertTaskSchema.partial().extend({ status: z.enum(["OPEN", "DONE"]).optional() }).parse(body);
      const task = await storage.updateTask(req.params.id, validated);
      if (!task) return res.status(404).json({ message: "Not found" });
      res.json(task);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // --- Calendar Events ---
  app.get("/api/calendar-events", requireAuth, async (req, res) => {
    const filters = {
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      locationId: req.query.locationId as string | undefined,
      physicianId: req.query.physicianId as string | undefined,
      practiceName: req.query.practiceName as string | undefined,
    };
    res.json(await storage.getCalendarEvents(filters));
  });

  app.get("/api/calendar-events/:id", requireAuth, async (req, res) => {
    const event = await storage.getCalendarEvent(req.params.id);
    if (!event) return res.status(404).json({ message: "Not found" });
    res.json(event);
  });

  app.post("/api/calendar-events", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      const body = { ...req.body };
      if (typeof body.startAt === "string") body.startAt = new Date(body.startAt);
      if (typeof body.endAt === "string") body.endAt = new Date(body.endAt);
      const validated = insertCalendarEventSchema.parse(body);
      const event = await storage.createCalendarEvent(validated);
      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE", entity: "CalendarEvent", entityId: event.id, detailJson: { title: event.title }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(event);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/calendar-events/:id", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      const body = { ...req.body };
      if (typeof body.startAt === "string") body.startAt = new Date(body.startAt);
      if (typeof body.endAt === "string") body.endAt = new Date(body.endAt);
      const validated = insertCalendarEventSchema.partial().parse(body);
      const event = await storage.updateCalendarEvent(req.params.id, validated);
      if (!event) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "UPDATE", entity: "CalendarEvent", entityId: event.id, detailJson: req.body, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(event);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/calendar-events/:id", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      await storage.deleteCalendarEvent(req.params.id);
      await storage.createAuditLog({ userId: req.session.userId!, action: "DELETE", entity: "CalendarEvent", entityId: req.params.id, detailJson: {}, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // --- Territories ---
  app.get("/api/territories", requireAuth, async (req, res) => {
    res.json(await storage.getTerritories());
  });

  app.get("/api/territories/:id", requireAuth, async (req, res) => {
    const t = await storage.getTerritory(req.params.id);
    if (!t) return res.status(404).json({ message: "Not found" });
    res.json(t);
  });

  app.post("/api/territories", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const territory = await storage.createTerritory(req.body);
      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE", entity: "Territory", entityId: territory.id, detailJson: req.body, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(territory);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/territories/:id", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const territory = await storage.updateTerritory(req.params.id, req.body);
      if (!territory) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "UPDATE", entity: "Territory", entityId: req.params.id, detailJson: req.body, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(territory);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/territories/:id", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      await storage.deleteTerritory(req.params.id);
      await storage.createAuditLog({ userId: req.session.userId!, action: "DELETE", entity: "Territory", entityId: req.params.id, detailJson: {}, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // --- Collections (Revenue) ---
  app.get("/api/collections", requireAuth, async (req, res) => {
    const filters = {
      physicianId: req.query.physicianId as string | undefined,
      locationId: req.query.locationId as string | undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
    };
    res.json(await storage.getCollections(filters));
  });

  app.post("/api/collections", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const col = await storage.createCollection(req.body);
      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE", entity: "Collection", entityId: col.id, detailJson: req.body, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(col);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // --- Tiering Weights ---
  app.get("/api/tiering-weights", requireRole("OWNER", "DIRECTOR", "ANALYST"), async (req, res) => {
    const weights = await storage.getTieringWeights();
    res.json(weights || {});
  });

  app.patch("/api/tiering-weights", requireRole("OWNER"), async (req, res) => {
    try {
      const updated = await storage.updateTieringWeights(req.body);
      if (!updated) return res.status(404).json({ message: "No weights configured" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "UPDATE", entity: "TieringWeights", entityId: updated.id, detailJson: req.body, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/etl/run", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const { triggerETL, triggerFullETL } = await import("./etl");
      const fullRecompute = req.body?.fullRecompute === true;
      res.json({ message: `ETL started (${fullRecompute ? "full" : "incremental"})` });
      if (fullRecompute) {
        triggerFullETL().catch(err => console.error("[ETL] Manual trigger error:", err));
      } else {
        triggerETL().catch(err => console.error("[ETL] Manual trigger error:", err));
      }
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // --- Dashboard Summary Endpoints ---
  app.get("/api/dashboard/executive", requireRole("OWNER", "DIRECTOR", "ANALYST"), async (req, res) => {
    const month = (req.query.month as string) || new Date().toISOString().slice(0, 7) + "-01";
    const summaries = await storage.getPhysicianMonthlySummaries({ month });
    const historicalSummaries = await storage.getPhysicianMonthlySummaries({ months: 6 });

    const sortByRevenueOrCount = (a: any, b: any) => {
      const revA = parseFloat(String(a.revenueGenerated || 0));
      const revB = parseFloat(String(b.revenueGenerated || 0));
      if (revA !== revB) return revB - revA;
      return (b.referralsCount || 0) - (a.referralsCount || 0);
    };

    const topByRevenue = [...summaries]
      .sort(sortByRevenueOrCount)
      .slice(0, 20);

    const totalRevenue = summaries.reduce((sum, s) => sum + parseFloat(String(s.revenueGenerated || 0)), 0);
    const totalRefs = summaries.reduce((sum, s) => sum + (s.referralsCount || 0), 0);
    const top10Revenue = [...summaries]
      .sort(sortByRevenueOrCount)
      .slice(0, 10)
      .reduce((sum, s) => sum + parseFloat(String(s.revenueGenerated || 0)), 0);
    const top10Refs = [...summaries]
      .sort(sortByRevenueOrCount)
      .slice(0, 10)
      .reduce((sum, s) => sum + (s.referralsCount || 0), 0);
    const concentrationRisk = totalRevenue > 0
      ? top10Revenue / totalRevenue
      : totalRefs > 0 ? top10Refs / totalRefs : 0;

    const monthlyTotals: Record<string, number> = {};
    for (const s of historicalSummaries) {
      const m = String(s.month);
      monthlyTotals[m] = (monthlyTotals[m] || 0) + s.referralsCount;
    }
    const monthKeys = Object.keys(monthlyTotals).sort();
    const growthRates = monthKeys.slice(1).map((m, i) => {
      const prev = monthlyTotals[monthKeys[i]] || 1;
      return ((monthlyTotals[m] - prev) / prev) * 100;
    });

    const vals = Object.values(monthlyTotals);
    const mean = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    const variance = vals.length > 0 ? vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / vals.length : 0;
    const volatilityIndex = mean > 0 ? Math.sqrt(variance) / mean : 0;

    res.json({
      month,
      topReferrersByRevenue: topByRevenue,
      totalRevenue,
      concentrationRisk,
      growthRates: monthKeys.slice(1).map((m, i) => ({ month: m, rate: growthRates[i] })),
      volatilityIndex,
      totalReferrals: summaries.reduce((sum, s) => sum + s.referralsCount, 0),
      monthlyTotals,
    });
  });

  app.get("/api/dashboard/territory/:territoryId", requireAuth, async (req, res) => {
    const month = (req.query.month as string) || new Date().toISOString().slice(0, 7) + "-01";
    const summary = await storage.getTerritoryMonthlySummaries({ territoryId: req.params.territoryId, month });
    const territory = await storage.getTerritory(req.params.territoryId);
    res.json({ territory, summaries: summary, month });
  });

  app.get("/api/dashboard/location/:locationId", requireAuth, async (req, res) => {
    const month = (req.query.month as string) || new Date().toISOString().slice(0, 7) + "-01";
    const summaries = await storage.getLocationMonthlySummaries({ locationId: req.params.locationId, month });
    const loc = await storage.getLocation(req.params.locationId);

    const monthStart = new Date(month);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    const locationReferrals = await db.select().from(referralsTable).where(
      and(
        eq(referralsTable.locationId, req.params.locationId),
        gte(referralsTable.referralDate, monthStart.toISOString().slice(0, 10)),
        lt(referralsTable.referralDate, monthEnd.toISOString().slice(0, 10))
      )
    );

    const physicianCounts: Record<string, { physicianId: string; npi: string | null; name: string; count: number }> = {};
    for (const r of locationReferrals) {
      if (r.physicianId) {
        if (!physicianCounts[r.physicianId]) {
          physicianCounts[r.physicianId] = {
            physicianId: r.physicianId,
            npi: r.referringProviderNpi || null,
            name: r.referringProviderName || "Unknown",
            count: 0,
          };
        }
        physicianCounts[r.physicianId].count++;
      }
    }
    const topReferrers = Object.values(physicianCounts)
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    res.json({ location: loc, summaries, month, topReferrers });
  });

  app.get("/api/physicians/:id/monthly", requireAuth, async (req, res) => {
    const months = req.query.months ? parseInt(req.query.months as string) : 6;
    const summaries = await storage.getPhysicianMonthlySummaries({ physicianId: req.params.id, months });
    res.json(summaries);
  });

  // --- Audit Logs ---
  app.get("/api/audit-logs", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    const filters = {
      userId: req.query.userId as string | undefined,
      entity: req.query.entity as string | undefined,
      action: req.query.action as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    };
    res.json(await storage.getAuditLogs(filters));
  });

  app.get("/api/settings/audit-retention", requireRole("OWNER"), async (req, res) => {
    try {
      const result = await db.select().from(appSettings).where(eq(appSettings.key, "audit_retention_days")).limit(1);
      res.json({ value: result[0]?.value || "365" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.patch("/api/settings/audit-retention", requireRole("OWNER"), async (req, res) => {
    try {
      const { days } = req.body;
      if (!days || days < 90) return res.status(400).json({ message: "Minimum retention is 90 days" });
      await db.insert(appSettings).values({ key: "audit_retention_days", value: String(days) })
        .onConflictDoUpdate({ target: appSettings.key, set: { value: String(days), updatedAt: new Date() } });
      await storage.createAuditLog({ userId: req.session.userId!, action: "UPDATE", entity: "Setting", entityId: "audit_retention_days", detailJson: { days }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/audit-logs/purge", requireRole("OWNER"), async (req, res) => {
    try {
      const result = await db.select().from(appSettings).where(eq(appSettings.key, "audit_retention_days")).limit(1);
      const retentionDays = parseInt(result[0]?.value || "365");
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      const deleted = await db.delete(auditLogs).where(lt(auditLogs.timestamp, cutoffDate));
      await storage.createAuditLog({ userId: req.session.userId!, action: "PURGE", entity: "AuditLog", entityId: "bulk", detailJson: { retentionDays, cutoffDate: cutoffDate.toISOString() }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ deleted: deleted.rowCount || 0 });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // --- Marketer Territories ---
  app.get("/api/marketers", requireAuth, async (req, res) => {
    res.json(await storage.getMarketers());
  });

  app.get("/api/marketer-territories", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    res.json(await storage.getMarketerTerritories());
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

  // --- Physician Comments ---
  app.get("/api/physicians/:id/comments", requireAuth, async (req, res) => {
    try {
      const comments = await storage.getPhysicianComments(req.params.id);
      res.json(comments);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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

  // --- CSV Exports ---
  app.get("/api/export/physicians", requireRole("OWNER", "DIRECTOR", "ANALYST"), async (req, res) => {
    try {
      const data = await storage.exportPhysiciansCsv({
        search: qstr(req.query.search as any),
        status: qstr(req.query.status as any),
        stage: qstr(req.query.stage as any),
        priority: qstr(req.query.priority as any),
        practiceName: qstr(req.query.practiceName as any),
      });
      const headers = ["First Name","Last Name","Credentials","Specialty","NPI","Practice","Address","City","State","Zip","Phone","Fax","Email","Status","Stage","Priority","Referrals"];
      const csv = [headers.join(","), ...data.map(r =>
        [r.firstName, r.lastName, r.credentials, r.specialty, r.npi, r.practiceName, r.address, r.city, r.state, r.zip, r.phone, r.fax, r.email, r.status, r.relationshipStage, r.priority, r.referralCount].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(",")
      )].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="physicians_export_${new Date().toISOString().slice(0,10)}.csv"`);
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/export/referrals", requireRole("OWNER", "DIRECTOR", "ANALYST"), async (req, res) => {
    try {
      const data = await storage.exportReferralsCsv({
        search: qstr(req.query.search as any),
        status: qstr(req.query.status as any),
        locationId: qstr(req.query.locationId as any),
        discipline: qstr(req.query.discipline as any),
        dateFrom: qstr(req.query.dateFrom as any),
        dateTo: qstr(req.query.dateTo as any),
        physicianId: qstr(req.query.physicianId as any),
      });
      const headers = ["Referral Date","Patient Name","Account #","Case Title","Therapist","Discipline","Status","Insurance","Scheduled Visits","Arrived Visits","Initial Eval","Discharge Date","Discharge Reason","Referral Source","Provider First","Provider Last","Location"];
      const csv = [headers.join(","), ...data.map(r =>
        [r.referralDate, r.patientFullName, r.patientAccountNumber, r.caseTitle, r.caseTherapist, r.discipline, r.status, r.primaryInsurance, r.scheduledVisits, r.arrivedVisits, r.dateOfInitialEval, r.dischargeDate, r.dischargeReason, r.referralSource, r.physicianFirstName, r.physicianLastName, r.locationName].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(",")
      )].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="referrals_export_${new Date().toISOString().slice(0,10)}.csv"`);
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/export/interactions", requireRole("OWNER", "DIRECTOR", "ANALYST"), async (req, res) => {
    try {
      const data = await storage.exportInteractionsCsv({
        physicianId: qstr(req.query.physicianId as any),
        type: qstr(req.query.type as any),
        dateFrom: qstr(req.query.dateFrom as any),
        dateTo: qstr(req.query.dateTo as any),
      });
      const headers = ["Date","Type","Summary","Next Step","Provider First","Provider Last","User","Location"];
      const csv = [headers.join(","), ...data.map(r =>
        [r.occurredAt ? new Date(r.occurredAt).toISOString().slice(0,10) : '', r.type, r.summary, r.nextStep, r.physicianFirstName, r.physicianLastName, r.userName, r.locationName].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(",")
      )].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="interactions_export_${new Date().toISOString().slice(0,10)}.csv"`);
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/export/tasks", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const data = await storage.exportTasksCsv({
        status: qstr(req.query.status as any),
        assignedToUserId: qstr(req.query.assignedToUserId as any),
      });
      const headers = ["Description","Status","Priority","Due Date","Assigned To","Provider"];
      const csv = [headers.join(","), ...data.map(r =>
        [r.description, r.status, r.priority, r.dueDate ? new Date(r.dueDate).toISOString().slice(0,10) : '', r.assignedTo, [r.physicianFirstName, r.physicianLastName].filter(Boolean).join(' ')].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(",")
      )].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="tasks_export_${new Date().toISOString().slice(0,10)}.csv"`);
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/export/audit-logs", requireRole("OWNER"), async (req, res) => {
    try {
      const data = await storage.exportAuditLogsCsv({
        entity: qstr(req.query.entity as any),
        action: qstr(req.query.action as any),
      });
      const headers = ["Timestamp","User","Action","Entity","Entity ID","IP Address","Details"];
      const csv = [headers.join(","), ...data.map(r =>
        [r.timestamp ? new Date(r.timestamp).toISOString() : '', r.userName, r.action, r.entity, r.entityId, r.ipAddress, JSON.stringify(r.detailJson || {})].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(",")
      )].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="audit_logs_export_${new Date().toISOString().slice(0,10)}.csv"`);
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // --- Import (Excel Upload) ---
  const multer = (await import("multer")).default;
  const ExcelJS = (await import("exceljs")).default;
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

  function excelSerialToDate(serial: number): Date {
    const utcDays = Math.floor(serial - 25569);
    return new Date(utcDays * 86400000);
  }

  function worksheetToJson(worksheet: any): Record<string, any>[] {
    const headers: string[] = [];
    const firstRow = worksheet.getRow(1);
    firstRow.eachCell((cell: any, colNumber: number) => {
      headers[colNumber] = String(cell.value || "").trim();
    });

    const rows: Record<string, any>[] = [];
    worksheet.eachRow((row: any, rowNumber: number) => {
      if (rowNumber === 1) return;
      const obj: Record<string, any> = {};
      row.eachCell((cell: any, colNumber: number) => {
        if (headers[colNumber]) {
          obj[headers[colNumber]] = cell.value;
        }
      });
      rows.push(obj);
    });
    return rows;
  }

  function worksheetToArrays(worksheet: any): any[][] {
    const rows: any[][] = [];
    worksheet.eachRow((row: any, _rowNumber: number) => {
      const arr: any[] = [];
      row.eachCell({ includeEmpty: true }, (cell: any, colNumber: number) => {
        arr[colNumber - 1] = cell.value;
      });
      rows.push(arr);
    });
    return rows;
  }

  app.post("/api/import/preview", requireRole("OWNER", "DIRECTOR"), upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const workbook = new ExcelJS.Workbook();
      if (req.file.originalname.endsWith(".csv")) {
        await workbook.csv.read(Readable.from(req.file.buffer));
      } else {
        await workbook.xlsx.load(req.file.buffer);
      }
      const worksheet = workbook.worksheets[0];
      const sheetName = worksheet.name;
      const rows = worksheetToArrays(worksheet);
      const headers = (rows[0] || []).map((h: any) => String(h || "").trim());
      const sampleRows = rows.slice(1, 6).map(r =>
        headers.reduce((acc: any, h: string, i: number) => { acc[h] = r[i] ?? null; return acc; }, {})
      );
      res.json({ headers, sampleRows, totalRows: rows.length - 1, sheetName });
    } catch (err: any) {
      res.status(400).json({ message: "Failed to parse Excel file: " + err.message });
    }
  });

  app.post("/api/import/physicians", requireRole("OWNER", "DIRECTOR"), upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const mapping = JSON.parse(req.body.mapping || "{}");
      const workbook = new ExcelJS.Workbook();
      if (req.file.originalname.endsWith(".csv")) {
        await workbook.csv.read(Readable.from(req.file.buffer));
      } else {
        await workbook.xlsx.load(req.file.buffer);
      }
      const rows = worksheetToJson(workbook.worksheets[0]);

      const mapped = rows.map(row => {
        const get = (field: string) => {
          const col = mapping[field];
          if (!col) return undefined;
          const val = row[col];
          return val != null ? String(val).trim() : undefined;
        };
        return {
          firstName: get("firstName") || "",
          lastName: get("lastName") || "",
          credentials: get("credentials") || undefined,
          npi: get("npi") || undefined,
          practiceName: get("practiceName") || undefined,
          primaryOfficeAddress: [get("address1"), get("address2")].filter(Boolean).join(", ") || undefined,
          city: get("city") || undefined,
          state: get("state") || undefined,
          zip: get("zip") || undefined,
          phone: get("phone") || undefined,
          fax: get("fax") || undefined,
          email: get("email") || undefined,
          specialty: get("specialty") || undefined,
          status: "PROSPECT" as const,
          relationshipStage: "NEW" as const,
          priority: "MEDIUM" as const,
        };
      }).filter(r => r.firstName && r.lastName);

      const result = await storage.bulkUpsertPhysicians(mapped);
      await storage.createAuditLog({
        userId: req.session.userId!,
        action: "IMPORT",
        entity: "physician",
        entityId: "bulk",
        detailJson: { inserted: result.inserted, updated: result.updated, total: mapped.length },
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"] || null,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/import/referrals", requireRole("OWNER", "DIRECTOR"), upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      const mapping = JSON.parse(req.body.mapping || "{}");
      const workbook = new ExcelJS.Workbook();
      if (req.file.originalname.endsWith(".csv")) {
        await workbook.csv.read(Readable.from(req.file.buffer));
      } else {
        await workbook.xlsx.load(req.file.buffer);
      }
      const rows = worksheetToJson(workbook.worksheets[0]);

      const allLocations = await storage.getLocations();
      const locationCache = new Map<string, string>();

      function parseDate(val: any): string | null {
        if (!val) return null;
        if (val instanceof Date) {
          const y = val.getFullYear(); const m = String(val.getMonth() + 1).padStart(2, "0"); const d = String(val.getDate()).padStart(2, "0");
          return `${y}-${m}-${d}`;
        }
        if (typeof val === "number") {
          const dt = excelSerialToDate(val);
          const y = dt.getUTCFullYear(); const m = String(dt.getUTCMonth() + 1).padStart(2, "0"); const d = String(dt.getUTCDate()).padStart(2, "0");
          return `${y}-${m}-${d}`;
        }
        const s = String(val).trim();
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
        if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
          const [m, d, y] = s.split("/");
          const yr = y.length === 2 ? "20" + y : y;
          return `${yr}-${m.padStart(2,"0")}-${d.padStart(2,"0")}`;
        }
        return null;
      }

      async function resolveLocation(name: string): Promise<string | null> {
        if (!name) return null;
        if (locationCache.has(name)) return locationCache.get(name)!;
        const found = allLocations.find(l => l.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(l.name.toLowerCase()));
        if (found) { locationCache.set(name, found.id); return found.id; }
        const dbFound = await storage.findLocationByName(name);
        if (dbFound) { locationCache.set(name, dbFound.id); return dbFound.id; }
        return null;
      }

      async function resolvePhysician(doctorName: string, npi?: string): Promise<string | null> {
        if (!doctorName) return null;
        const parts = doctorName.trim().split(/\s+/);
        if (parts.length < 2) return null;
        const firstName = parts[0];
        const lastName = parts.slice(1).join(" ");
        const found = await storage.findPhysicianByNameAndNpi(firstName, lastName, npi);
        return found?.id || null;
      }

      const mapped: any[] = [];
      const errors: string[] = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const get = (field: string) => {
          const col = mapping[field];
          if (!col) return undefined;
          const val = row[col];
          return val != null ? String(val).trim() || undefined : undefined;
        };
        const getNum = (field: string) => {
          const col = mapping[field];
          if (!col) return undefined;
          const val = row[col];
          return val != null ? Number(val) || 0 : undefined;
        };
        const getRawDate = (field: string) => {
          const col = mapping[field];
          if (!col) return null;
          return row[col];
        };

        const facilityName = get("facility") || "";
        const locationId = await resolveLocation(facilityName);
        if (!locationId) {
          if (facilityName) errors.push(`Row ${i + 1}: Could not match facility "${facilityName}"`);
          continue;
        }

        const doctorName = get("referringDoctor") || "";
        const doctorNpi = get("referringDoctorNpi");
        const physicianId = await resolvePhysician(doctorName, doctorNpi);

        const referralDate = parseDate(getRawDate("createdDate"));
        if (!referralDate) {
          errors.push(`Row ${i + 1}: Missing or invalid created date`);
          continue;
        }

        const statusMap: Record<string, string> = {
          "Active": "RECEIVED", "Scheduled": "SCHEDULED", "Discharged": "DISCHARGED",
          "Eval Completed": "EVAL_COMPLETED", "Lost": "LOST",
        };
        const rawStatus = get("caseStatus") || "";
        let status = statusMap[rawStatus] || "RECEIVED";
        if (rawStatus.toLowerCase().includes("discharg")) status = "DISCHARGED";
        else if (rawStatus.toLowerCase().includes("eval")) status = "EVAL_COMPLETED";
        else if (rawStatus.toLowerCase().includes("sched")) status = "SCHEDULED";

        mapped.push({
          physicianId,
          locationId,
          referralDate,
          patientAccountNumber: get("patientAccountNumber"),
          patientFullName: get("patientName"),
          patientInitialsOrAnonId: get("patientName") ? get("patientName")!.split(" ").map((n: string) => n[0]).join("") : undefined,
          caseTitle: get("caseTitle"),
          caseTherapist: get("caseTherapist"),
          dateOfInitialEval: parseDate(getRawDate("dateOfInitialEval")),
          referralSource: get("referralSource"),
          dischargeDate: parseDate(getRawDate("dischargeDate")),
          dischargeReason: get("dischargeReason"),
          scheduledVisits: getNum("scheduledVisits") ?? 0,
          arrivedVisits: getNum("arrivedVisits") ?? 0,
          discipline: get("discipline"),
          primaryInsurance: get("primaryInsurance"),
          primaryPayerType: get("primaryPayerType"),
          dateOfFirstScheduledVisit: parseDate(getRawDate("dateOfFirstScheduledVisit")),
          dateOfFirstArrivedVisit: parseDate(getRawDate("dateOfFirstArrivedVisit")),
          createdToArrived: getNum("createdToArrived"),
          diagnosisCategory: get("diagnosisCategory"),
          referringProviderName: doctorName || undefined,
          referringProviderNpi: doctorNpi,
          status: status as any,
        });
      }

      const result = await storage.bulkUpsertReferrals(mapped);
      result.errors = [...errors, ...result.errors];
      await storage.createAuditLog({
        userId: req.session.userId!,
        action: "IMPORT",
        entity: "referral",
        entityId: "bulk",
        detailJson: { inserted: result.inserted, updated: result.updated, total: mapped.length, skipped: errors.length },
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"] || null,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // --- Dashboard Stats ---
  app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    const filters = {
      startDate: req.query.startDate as string | undefined,
      endDate: req.query.endDate as string | undefined,
      locationId: req.query.locationId as string | undefined,
      physicianId: req.query.physicianId as string | undefined,
    };
    res.json(await storage.getDashboardStats(filters));
  });

  // --- Microsoft Integration Status ---
  app.get("/api/integrations/status", requireAuth, async (req, res) => {
    let outlookConnected = false;
    let sharepointConnected = false;

    try {
      const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
      const xReplitToken = process.env.REPL_IDENTITY
        ? "repl " + process.env.REPL_IDENTITY
        : process.env.WEB_REPL_RENEWAL
        ? "depl " + process.env.WEB_REPL_RENEWAL
        : null;

      if (hostname && xReplitToken) {
        try {
          const outlookRes = await fetch(
            "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=outlook",
            { headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken } }
          );
          if (outlookRes.ok) {
            const outlookData = await outlookRes.json();
            outlookConnected = !!(outlookData?.items?.[0]?.settings?.access_token || outlookData?.items?.[0]?.settings?.oauth?.credentials?.access_token);
          }
        } catch { /* outlook check failed */ }

        try {
          const spRes = await fetch(
            "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=sharepoint",
            { headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken } }
          );
          if (spRes.ok) {
            const spData = await spRes.json();
            sharepointConnected = !!(spData?.items?.[0]?.settings?.access_token || spData?.items?.[0]?.settings?.oauth?.credentials?.access_token);
          }
        } catch { /* sharepoint check failed */ }
      }
    } catch (e) {
      // silently fail
    }

    res.json({ outlook: outlookConnected, sharepoint: sharepointConnected });
  });

  // --- Outlook Calendar Sync ---
  app.post("/api/integrations/outlook/sync-event", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      const { eventId } = req.body;
      if (!eventId) return res.status(400).json({ message: "eventId required" });

      const event = await storage.getCalendarEvent(eventId);
      if (!event) return res.status(404).json({ message: "Event not found" });

      const accessToken = await getOutlookAccessToken();
      if (!accessToken) return res.status(400).json({ message: "Outlook not connected. Please connect your Microsoft account in Settings." });

      const outlookEvent = {
        subject: event.title,
        body: { contentType: "Text", content: event.description || "" },
        start: { dateTime: event.startAt.toISOString(), timeZone: "UTC" },
        end: { dateTime: event.endAt.toISOString(), timeZone: "UTC" },
        isAllDay: event.allDay,
      };

      let result;
      if (event.outlookEventId) {
        result = await fetch(`https://graph.microsoft.com/v1.0/me/events/${event.outlookEventId}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(outlookEvent),
        });
      } else {
        result = await fetch("https://graph.microsoft.com/v1.0/me/events", {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(outlookEvent),
        });
      }

      if (!result.ok) {
        const errText = await result.text();
        return res.status(result.status).json({ message: `Outlook sync failed: ${errText}` });
      }

      const data = await result.json();
      await storage.updateCalendarEvent(eventId, { outlookEventId: data.id });
      await storage.createAuditLog({ userId: req.session.userId!, action: "SYNC_OUTLOOK", entity: "CalendarEvent", entityId: eventId, detailJson: { outlookId: data.id }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });

      res.json({ success: true, outlookEventId: data.id });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // --- Activity Feed ---
  app.get("/api/activity-feed", requireRole("OWNER", "DIRECTOR", "MARKETER", "ANALYST"), async (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 20, 50);
      const recentInteractions = await db.execute(sql`
        SELECT i.id, i.type, i.summary, i.occurred_at as "timestamp", 
          p.first_name as physician_first_name, p.last_name as physician_last_name,
          u.name as user_name, 'interaction' as activity_type
        FROM interactions i
        LEFT JOIN physicians p ON i.physician_id = p.id
        LEFT JOIN users u ON i.user_id = u.id
        WHERE i.deleted_at IS NULL
        ORDER BY i.occurred_at DESC LIMIT ${limit}
      `);
      const recentTasks = await db.execute(sql`
        SELECT t.id, t.description as summary, t.status, t.updated_at as "timestamp",
          p.first_name as physician_first_name, p.last_name as physician_last_name,
          u.name as user_name, 'task' as activity_type
        FROM tasks t
        LEFT JOIN physicians p ON t.physician_id = p.id
        LEFT JOIN users u ON t.assigned_to_user_id = u.id
        WHERE t.status = 'DONE'
        ORDER BY t.updated_at DESC LIMIT ${limit}
      `);
      const recentReferrals = await db.execute(sql`
        SELECT r.id, r.case_title as summary, r.referral_date as "timestamp",
          COALESCE(r.referring_provider_name, CONCAT(p.first_name, ' ', p.last_name)) as physician_name,
          l.name as location_name, 'referral' as activity_type
        FROM referrals r
        LEFT JOIN physicians p ON r.physician_id = p.id
        LEFT JOIN locations l ON r.location_id = l.id
        WHERE r.deleted_at IS NULL
        ORDER BY r.created_at DESC LIMIT ${limit}
      `);
      const combined = [
        ...(recentInteractions.rows as any[]).map(r => ({ ...r, activity_type: 'interaction' })),
        ...(recentTasks.rows as any[]).map(r => ({ ...r, activity_type: 'task' })),
        ...(recentReferrals.rows as any[]).map(r => ({ ...r, activity_type: 'referral' })),
      ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, limit);
      res.json(combined);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // --- User Activity Reports ---
  app.get("/api/reports/user-activity", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const dateFrom = qstr(req.query.dateFrom as any);
      const dateTo = qstr(req.query.dateTo as any);
      const dateCondition = dateFrom && dateTo
        ? sql`AND i.occurred_at >= ${dateFrom}::date AND i.occurred_at <= ${dateTo}::date`
        : dateFrom ? sql`AND i.occurred_at >= ${dateFrom}::date`
        : dateTo ? sql`AND i.occurred_at <= ${dateTo}::date`
        : sql``;

      const taskDateCond = dateFrom && dateTo
        ? sql`AND t.updated_at >= ${dateFrom}::date AND t.updated_at <= ${dateTo}::date`
        : dateFrom ? sql`AND t.updated_at >= ${dateFrom}::date`
        : dateTo ? sql`AND t.updated_at <= ${dateTo}::date`
        : sql``;

      const interactionCounts = await db.execute(sql`
        SELECT u.id, u.name, u.role, COUNT(i.id)::int as interaction_count,
          COUNT(CASE WHEN i.type = 'VISIT' THEN 1 END)::int as visit_count,
          COUNT(CASE WHEN i.type = 'CALL' THEN 1 END)::int as call_count,
          COUNT(CASE WHEN i.type = 'EMAIL' THEN 1 END)::int as email_count,
          COUNT(CASE WHEN i.type = 'LUNCH' THEN 1 END)::int as lunch_count
        FROM users u
        LEFT JOIN interactions i ON u.id = i.user_id AND i.deleted_at IS NULL ${dateCondition}
        GROUP BY u.id, u.name, u.role
        ORDER BY interaction_count DESC
      `);

      const taskCounts = await db.execute(sql`
        SELECT u.id, 
          COUNT(CASE WHEN t.status = 'DONE' THEN 1 END)::int as tasks_completed,
          COUNT(CASE WHEN t.status = 'OPEN' THEN 1 END)::int as tasks_open,
          COUNT(CASE WHEN t.status = 'DONE' AND t.updated_at <= t.due_at THEN 1 END)::int as tasks_on_time
        FROM users u
        LEFT JOIN tasks t ON u.id = t.assigned_to_user_id ${taskDateCond}
        GROUP BY u.id
      `);

      const taskMap = new Map((taskCounts.rows as any[]).map(r => [r.id, r]));
      const result = (interactionCounts.rows as any[]).map(u => ({
        ...u,
        tasks_completed: taskMap.get(u.id)?.tasks_completed || 0,
        tasks_open: taskMap.get(u.id)?.tasks_open || 0,
        tasks_on_time: taskMap.get(u.id)?.tasks_on_time || 0,
      }));

      res.json(result);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // --- SharePoint Sync ---
  app.get("/api/sharepoint/sites", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const sites = await searchSPSites(qstr(req.query.q) || "*");
      res.json(sites);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/sharepoint/site", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const siteId = await getSPSiteId();
      res.json({ siteId });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/sharepoint/site", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const { siteId } = req.body;
      if (!siteId) return res.status(400).json({ message: "siteId is required" });
      const site = await validateSPSite(siteId);
      await setSPSiteId(siteId);
      res.json({ success: true, site: { id: site.id, displayName: site.displayName, webUrl: site.webUrl } });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/sharepoint/status", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const statuses = await getSPSyncStatuses();
      const siteId = await getSPSiteId();
      res.json({ siteId, statuses });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/sharepoint/sync/:entity", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    const entity = req.params.entity;
    const validEntities = ['physicians', 'referrals', 'interactions', 'tasks', 'locations'];
    if (!validEntities.includes(entity)) return res.status(400).json({ message: `Invalid entity: ${entity}` });

    res.json({ message: `Sync started for ${entity}` });

    syncSPEntity(entity).then(result => {
      console.log(`SharePoint sync complete for ${entity}: ${result.created} created, ${result.failed} failed`);
    }).catch(err => {
      console.error(`SharePoint sync failed for ${entity}:`, err.message);
    });
  });

  app.post("/api/sharepoint/sync-all", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    res.json({ message: "Sync started for all entities" });

    syncSPAll().then(results => {
      console.log("SharePoint sync all complete:", results);
    }).catch(err => {
      console.error("SharePoint sync all failed:", err.message);
    });
  });

  // --- Integration Management Routes ---
  app.get("/api/integrations", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      res.json(await storage.getIntegrationConfigs());
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const createIntegrationSchema = z.object({
    type: z.enum(["GOHIGHLEVEL", "CUSTOM_API", "MICROSOFT"]),
    name: z.string().min(1).max(100),
    settings: z.record(z.any()).optional().default({}),
  });

  app.post("/api/integrations", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const parsed = createIntegrationSchema.parse(req.body);
      const existing = await storage.getIntegrationConfigByType(parsed.type);
      if (existing) return res.status(400).json({ message: `Integration of type ${parsed.type} already exists` });
      const config = await storage.createIntegrationConfig(parsed);
      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE_INTEGRATION", entity: "Integration", entityId: config.id, detailJson: { type: parsed.type, name: parsed.name }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(config);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  const updateIntegrationSchema = z.object({
    name: z.string().min(1).max(100).optional(),
    status: z.enum(["CONNECTED", "DISCONNECTED", "ERROR"]).optional(),
    settings: z.record(z.any()).optional(),
  });

  app.patch("/api/integrations/:id", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const parsed = updateIntegrationSchema.parse(req.body);
      const updated = await storage.updateIntegrationConfig(req.params.id, parsed);
      if (!updated) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "UPDATE_INTEGRATION", entity: "Integration", entityId: updated.id, detailJson: { changes: Object.keys(req.body) }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/integrations/:id", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const deleted = await storage.deleteIntegrationConfig(req.params.id);
      if (!deleted) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "DELETE_INTEGRATION", entity: "Integration", entityId: req.params.id, detailJson: {}, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/integrations/:id/test", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const config = await storage.getIntegrationConfig(req.params.id);
      if (!config) return res.status(404).json({ message: "Not found" });

      if (config.type === "GOHIGHLEVEL") {
        const apiKey = config.settings?.apiKey;
        const locationId = config.settings?.locationId || "";
        if (!apiKey) return res.json({ success: false, message: "No API key configured" });
        if (!locationId) return res.json({ success: false, message: "Location ID is required for GoHighLevel v2 API. Find it in your GHL sub-account settings." });
        try {
          const headers: Record<string, string> = {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            Accept: "application/json",
            Version: "2021-07-28",
          };
          const resp = await fetch(`https://services.leadconnectorhq.com/contacts/?locationId=${locationId}&limit=1`, { headers });
          if (resp.ok) {
            await storage.updateIntegrationConfig(config.id, { status: "CONNECTED" } as any);
            return res.json({ success: true, message: "Connected to GoHighLevel successfully" });
          } else {
            const errorBody = await resp.text().catch(() => "");
            await storage.updateIntegrationConfig(config.id, { status: "ERROR" } as any);
            let hint = "";
            if (resp.status === 401) {
              hint = " Make sure you are using a Private Integration Token (not a v1 API key) and that it has the 'contacts.readonly' scope enabled.";
            } else if (resp.status === 422) {
              hint = " The Location ID may be incorrect. Check your GHL sub-account settings.";
            }
            return res.json({ success: false, message: `GoHighLevel returned ${resp.status}: ${resp.statusText}.${hint}` });
          }
        } catch (fetchErr: any) {
          await storage.updateIntegrationConfig(config.id, { status: "ERROR" } as any);
          return res.json({ success: false, message: `Connection failed: ${fetchErr.message}` });
        }
      }

      if (config.type === "CUSTOM_API") {
        const baseUrl = config.settings?.baseUrl;
        const apiKey = config.settings?.apiKey;
        if (!baseUrl) return res.json({ success: false, message: "No base URL configured" });
        try {
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
          const resp = await fetch(baseUrl, { method: "GET", headers });
          if (resp.ok || resp.status === 401 || resp.status === 403) {
            await storage.updateIntegrationConfig(config.id, { status: "CONNECTED" } as any);
            return res.json({ success: true, message: `Reached ${baseUrl} (HTTP ${resp.status})` });
          } else {
            await storage.updateIntegrationConfig(config.id, { status: "ERROR" } as any);
            return res.json({ success: false, message: `Endpoint returned ${resp.status}` });
          }
        } catch (fetchErr: any) {
          await storage.updateIntegrationConfig(config.id, { status: "ERROR" } as any);
          return res.json({ success: false, message: `Connection failed: ${fetchErr.message}` });
        }
      }

      res.json({ success: false, message: "Test not available for this integration type" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/integrations/:id/sync", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const config = await storage.getIntegrationConfig(req.params.id);
      if (!config) return res.status(404).json({ message: "Not found" });
      const direction = req.body.direction || "push";

      const log = await storage.createIntegrationSyncLog({
        integrationId: config.id,
        direction,
        status: "running",
        details: { triggeredBy: req.session.userId },
      });

      if (config.type === "GOHIGHLEVEL" && config.settings?.apiKey) {
        const apiKey = config.settings.apiKey;
        const locationId = config.settings.locationId || "";

        if (direction === "push") {
          try {
            const allPhysicians = await storage.getPhysicians();
            let processed = 0;
            let failed = 0;

            for (const phys of allPhysicians.slice(0, 100)) {
              try {
                const contactData: Record<string, any> = {
                  firstName: phys.firstName,
                  lastName: phys.lastName,
                  email: phys.email || "",
                  phone: phys.phone || "",
                  companyName: phys.practiceName || "",
                  address1: phys.primaryOfficeAddress || "",
                  city: phys.city || "",
                  state: phys.state || "",
                  postalCode: phys.zip || "",
                  tags: ["tristar-physician", phys.status?.toLowerCase() || "prospect"],
                  customField: { npi: phys.npi || "", credentials: phys.credentials || "", specialty: phys.specialty || "" },
                };
                if (locationId) contactData.locationId = locationId;

                const resp = await fetch("https://services.leadconnectorhq.com/contacts/", {
                  method: "POST",
                  headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json", Version: "2021-07-28" },
                  body: JSON.stringify(contactData),
                });

                if (resp.ok || resp.status === 200 || resp.status === 201) {
                  processed++;
                } else {
                  failed++;
                }
              } catch {
                failed++;
              }
            }

            await storage.updateIntegrationSyncLog(log.id, {
              status: "completed",
              recordsProcessed: processed,
              recordsFailed: failed,
              finishedAt: new Date(),
            });
            await storage.updateIntegrationConfig(config.id, { lastSyncAt: new Date(), lastSyncStatus: `Pushed ${processed} contacts` } as any);
            return res.json({ success: true, processed, failed });
          } catch (syncErr: any) {
            await storage.updateIntegrationSyncLog(log.id, {
              status: "error",
              details: { error: syncErr.message },
              finishedAt: new Date(),
            });
            return res.json({ success: false, message: syncErr.message });
          }
        }

        if (direction === "pull") {
          try {
            const resp = await fetch(`https://services.leadconnectorhq.com/contacts/?limit=100${locationId ? "&locationId=" + locationId : ""}`, {
              headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json", Version: "2021-07-28" },
            });
            if (!resp.ok) {
              await storage.updateIntegrationSyncLog(log.id, { status: "error", details: { httpStatus: resp.status }, finishedAt: new Date() });
              return res.json({ success: false, message: `GHL API returned ${resp.status}` });
            }
            const data: any = await resp.json();
            const contacts = data.contacts || [];
            let referralsCreated = 0;
            let providersCreated = 0;
            let providersMatched = 0;
            let skipped = 0;
            let failed = 0;
            const results: { patient: string; physician: string; action: string; referralId?: string }[] = [];

            const allLocations = await storage.getLocations();
            const defaultLocationId = allLocations.length > 0 ? allLocations[0].id : null;

            for (const contact of contacts) {
              try {
                const patientFirst = (contact.firstName || contact.first_name || "").trim();
                const patientLast = (contact.lastName || contact.last_name || "").trim();
                if (!patientFirst && !patientLast) { skipped++; continue; }

                const patientName = `${patientFirst} ${patientLast}`.trim();
                const patientPhone = (contact.phone || "").trim();
                const patientEmail = (contact.email || "").trim();

                const ghlContactId = contact.id || contact.contactId || "";

                let customFields: Record<string, any> = {};
                const rawCustom = contact.customField || contact.customFields || {};
                if (Array.isArray(rawCustom)) {
                  for (const cf of rawCustom) {
                    const key = (cf.field_key || cf.key || cf.id || cf.name || "").toLowerCase();
                    const val = cf.value || cf.field_value || "";
                    if (key.includes("npi")) customFields.npi = val;
                    else if (key.includes("credential")) customFields.credentials = val;
                    else if (key.includes("special")) customFields.specialty = val;
                    else if ((key.includes("referring") && key.includes("physician")) || (key.includes("referring") && key.includes("doctor")) || (key.includes("referring") && key.includes("provider")) || key === "doctor" || key === "physician" || key === "provider_name") customFields.referringPhysician = val;
                    else if (key.includes("location") || key.includes("clinic")) customFields.location = val;
                    else if (key.includes("insurance") || key.includes("payer")) customFields.insurance = val;
                    else if (key.includes("diagnosis") || key.includes("condition")) customFields.diagnosis = val;
                  }
                } else {
                  customFields = rawCustom;
                }

                const contactDate = contact.dateAdded || contact.date_added || contact.createdAt || contact.created_at;
                const referralDate = contactDate ? new Date(contactDate).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];

                const dedupeKey = `ghl-${ghlContactId || (patientName + "-" + referralDate)}`;
                const existingReferrals = await db.select({ id: referralsTable.id })
                  .from(referralsTable)
                  .where(and(
                    eq(referralsTable.patientFullName, patientName),
                    eq(referralsTable.referralSource, "GoHighLevel"),
                    eq(referralsTable.referralDate, referralDate),
                    isNull(referralsTable.deletedAt)
                  ))
                  .limit(1);

                if (existingReferrals.length > 0) {
                  skipped++;
                  results.push({ patient: patientName, physician: "", action: "already imported" });
                  continue;
                }

                const refPhysName = (customFields.referringPhysician || contact.companyName || contact.company_name || "").trim();
                const refNpi = (customFields.npi || "").trim();

                let physicianId: string | null = null;
                let physicianLabel = "none";

                if (refPhysName) {
                  let physFirst = "";
                  let physLast = "";
                  if (refPhysName.includes(",")) {
                    const parts = refPhysName.split(",").map((s: string) => s.trim());
                    physLast = parts[0];
                    physFirst = parts[1] || "";
                  } else {
                    const nameParts = refPhysName.split(/\s+/);
                    if (nameParts.length > 1) {
                      physFirst = nameParts.slice(0, -1).join(" ");
                      physLast = nameParts[nameParts.length - 1];
                    } else {
                      physLast = nameParts[0];
                      physFirst = nameParts[0];
                    }
                  }

                  const existing = await storage.findPhysicianByNameAndNpi(physFirst, physLast, refNpi || null);

                  if (existing) {
                    physicianId = existing.id;
                    physicianLabel = `${existing.firstName} ${existing.lastName} (matched)`;
                    providersMatched++;
                  } else {
                    const newPhys = await storage.createPhysician({
                      firstName: physFirst,
                      lastName: physLast,
                      npi: refNpi || undefined,
                      credentials: customFields.credentials || undefined,
                      specialty: customFields.specialty || undefined,
                      status: "PROSPECT",
                      relationshipStage: "NEW",
                      priority: "MEDIUM",
                      tags: ["ghl-import"],
                      referralSourceAttribution: "GoHighLevel",
                    });
                    physicianId = newPhys.id;
                    physicianLabel = `${physFirst} ${physLast} (new)`;
                    providersCreated++;
                  }
                }

                let matchedLocationId = defaultLocationId;
                if (customFields.location) {
                  const locMatch = allLocations.find((l: any) =>
                    l.name.toLowerCase().includes(customFields.location.toLowerCase()) ||
                    customFields.location.toLowerCase().includes(l.name.toLowerCase().replace("tristar pt - ", ""))
                  );
                  if (locMatch) matchedLocationId = locMatch.id;
                }

                if (!matchedLocationId) { skipped++; results.push({ patient: patientName, physician: physicianLabel, action: "no location" }); continue; }

                const newReferral = await storage.createReferral({
                  physicianId: physicianId || undefined,
                  locationId: matchedLocationId,
                  referringProviderName: refPhysName || undefined,
                  referringProviderNpi: refNpi || undefined,
                  referralDate,
                  patientFullName: patientName,
                  patientPhone: patientPhone || undefined,
                  patientAccountNumber: ghlContactId || undefined,
                  caseTitle: `GHL Import - ${patientName}`,
                  referralSource: "GoHighLevel",
                  primaryInsurance: customFields.insurance || undefined,
                  diagnosisCategory: customFields.diagnosis || undefined,
                  status: "RECEIVED",
                });

                referralsCreated++;
                results.push({
                  patient: patientName,
                  physician: physicianLabel,
                  action: "referral created",
                  referralId: newReferral.id,
                });
              } catch {
                failed++;
              }
            }

            const summary = `Pulled ${contacts.length} contacts: ${referralsCreated} referrals created, ${providersCreated} new providers added, ${providersMatched} matched to existing providers, ${skipped} skipped, ${failed} failed`;
            await storage.updateIntegrationSyncLog(log.id, {
              status: "completed",
              recordsProcessed: referralsCreated,
              recordsFailed: failed,
              details: { contactsReceived: contacts.length, referralsCreated, providersCreated, providersMatched, skipped, failed, results: results.slice(0, 50) },
              finishedAt: new Date(),
            });
            await storage.updateIntegrationConfig(config.id, { lastSyncAt: new Date(), lastSyncStatus: summary } as any);
            return res.json({ success: true, message: summary, referralsCreated, providersCreated, providersMatched, skipped, failed });
          } catch (syncErr: any) {
            await storage.updateIntegrationSyncLog(log.id, { status: "error", details: { error: syncErr.message }, finishedAt: new Date() });
            return res.json({ success: false, message: syncErr.message });
          }
        }
      }

      await storage.updateIntegrationSyncLog(log.id, { status: "skipped", details: { message: "Sync not configured for this integration" }, finishedAt: new Date() });
      res.json({ success: false, message: "Sync not available or not configured" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/integrations/:id/logs", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const logs = await storage.getIntegrationSyncLogs(req.params.id, 20);
      res.json(logs);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // --- API Key Management ---
  app.get("/api/api-keys", requireRole("OWNER"), async (req, res) => {
    try {
      const keys = await storage.getApiKeys();
      res.json(keys.map((k) => ({ ...k, keyHash: undefined })));
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const createApiKeySchema = z.object({
    name: z.string().min(1).max(100),
    scopes: z.array(z.string()).min(1).default(["physicians:read", "referrals:read", "locations:read"]),
    expiresInDays: z.number().int().min(1).max(365).optional(),
  });

  app.post("/api/api-keys", requireRole("OWNER"), async (req, res) => {
    try {
      const { name, scopes, expiresInDays } = createApiKeySchema.parse(req.body);

      const rawKey = `tsk_${crypto.randomBytes(32).toString("hex")}`;
      const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
      const keyPrefix = rawKey.slice(0, 8);

      let expiresAt: Date | undefined;
      if (expiresInDays) {
        expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
      }

      const apiKey = await storage.createApiKey({
        name,
        keyHash,
        keyPrefix,
        scopes: scopes || ["physicians:read", "referrals:read", "locations:read"],
        createdBy: req.session.userId!,
        ...(expiresAt && { expiresAt }),
      });

      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE_API_KEY", entity: "ApiKey", entityId: apiKey.id, detailJson: { name, scopes, expiresAt: expiresAt?.toISOString() }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ ...apiKey, rawKey, keyHash: undefined });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/api-keys/:id/rotate", requireRole("OWNER"), async (req, res) => {
    try {
      const oldKey = await storage.getApiKeyById(req.params.id);
      if (!oldKey) return res.status(404).json({ message: "Not found" });

      await storage.deactivateApiKey(oldKey.id);

      const rawKey = `tsk_${crypto.randomBytes(32).toString("hex")}`;
      const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
      const keyPrefix = rawKey.slice(0, 8);

      const expiresInDays = req.body?.expiresInDays;
      let expiresAt: Date | undefined;
      if (expiresInDays && typeof expiresInDays === "number") {
        expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
      } else if (oldKey.expiresAt) {
        const remainingMs = new Date(oldKey.expiresAt).getTime() - Date.now();
        if (remainingMs > 0) {
          expiresAt = new Date(Date.now() + remainingMs);
        }
      }

      const newApiKey = await storage.createApiKey({
        name: oldKey.name,
        keyHash,
        keyPrefix,
        scopes: oldKey.scopes as string[],
        createdBy: req.session.userId!,
        ...(expiresAt && { expiresAt }),
      });

      await storage.createAuditLog({ userId: req.session.userId!, action: "ROTATE_API_KEY", entity: "ApiKey", entityId: newApiKey.id, detailJson: { oldKeyId: oldKey.id, name: oldKey.name }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ ...newApiKey, rawKey, keyHash: undefined });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/api-keys/:id", requireRole("OWNER"), async (req, res) => {
    try {
      const deactivated = await storage.deactivateApiKey(req.params.id);
      if (!deactivated) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "DEACTIVATE_API_KEY", entity: "ApiKey", entityId: req.params.id, detailJson: {}, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  const requireApiKey = (scope: string) => async (req: Request, res: Response, next: NextFunction) => {
    const apiKeyHeader = req.headers["x-tristar-api-key"] as string;
    if (!apiKeyHeader) return res.status(401).json({ error: "API key required. Set X-TRISTAR-API-KEY header." });

    const keyHash = crypto.createHash("sha256").update(apiKeyHeader).digest("hex");
    const key = await storage.getApiKeyByHash(keyHash);
    if (!key || !key.isActive) return res.status(401).json({ error: "Invalid or inactive API key" });

    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      return res.status(401).json({ error: "API key has expired. Please rotate or create a new key." });
    }

    const scopes = (key.scopes as string[]) || [];
    if (!scopes.includes(scope) && !scopes.includes("*")) {
      return res.status(403).json({ error: `Missing scope: ${scope}` });
    }

    await storage.updateApiKeyLastUsed(key.id);
    (req as any).apiKeyId = key.id;
    next();
  };

  app.get("/api/public/physicians", requireApiKey("physicians:read"), async (_req, res) => {
    try {
      const allPhysicians = await storage.getPhysicians();
      res.json({ data: allPhysicians, total: allPhysicians.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/public/physicians/:id", requireApiKey("physicians:read"), async (req, res) => {
    try {
      const phys = await storage.getPhysician(req.params.id);
      if (!phys) return res.status(404).json({ error: "Not found" });
      res.json(phys);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/public/referrals", requireApiKey("referrals:read"), async (_req, res) => {
    try {
      const allReferrals = await storage.getReferrals();
      res.json({ data: allReferrals, total: allReferrals.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/public/locations", requireApiKey("locations:read"), async (_req, res) => {
    try {
      const allLocations = await storage.getLocations();
      res.json({ data: allLocations, total: allLocations.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/public/interactions", requireApiKey("interactions:read"), async (_req, res) => {
    try {
      const allInteractions = await storage.getInteractions();
      res.json({ data: allInteractions, total: allInteractions.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // --- Webhook endpoint for external software to push data ---
  // --- Scheduled Reports ---
  app.get("/api/scheduled-reports", requireRole("OWNER", "DIRECTOR"), async (_req, res) => {
    try {
      res.json(await storage.getScheduledReports());
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/scheduled-reports", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const validated = insertScheduledReportSchema.parse({
        ...req.body,
        createdBy: req.session.userId,
      });
      const report = await storage.createScheduledReport(validated);
      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE", entity: "ScheduledReport", entityId: report.id, detailJson: { name: report.name }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(report);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.patch("/api/scheduled-reports/:id", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const existing = await storage.getScheduledReport(req.params.id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      const report = await storage.updateScheduledReport(req.params.id, req.body);
      await storage.createAuditLog({ userId: req.session.userId!, action: "UPDATE", entity: "ScheduledReport", entityId: report.id, detailJson: req.body, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json(report);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/scheduled-reports/:id", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const existing = await storage.getScheduledReport(req.params.id);
      if (!existing) return res.status(404).json({ message: "Not found" });
      await storage.deleteScheduledReport(req.params.id);
      await storage.createAuditLog({ userId: req.session.userId!, action: "DELETE", entity: "ScheduledReport", entityId: req.params.id, detailJson: {}, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/scheduled-reports/:id/run", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const report = await storage.getScheduledReport(req.params.id);
      if (!report) return res.status(404).json({ message: "Not found" });

      let csv = "";
      let filename = "";
      const dateStr = new Date().toISOString().slice(0, 10);

      if (report.reportType === "referral_summary") {
        const data = await storage.exportReferralsCsv({});
        const headers = ["Referral Date","Patient Name","Account #","Case Title","Therapist","Discipline","Status","Insurance","Scheduled Visits","Arrived Visits","Initial Eval","Discharge Date","Discharge Reason","Referral Source","Provider First","Provider Last","Location"];
        csv = [headers.join(","), ...data.map((r: any) =>
          [r.referralDate, r.patientFullName, r.patientAccountNumber, r.caseTitle, r.caseTherapist, r.discipline, r.status, r.primaryInsurance, r.scheduledVisits, r.arrivedVisits, r.dateOfInitialEval, r.dischargeDate, r.dischargeReason, r.referralSource, r.physicianFirstName, r.physicianLastName, r.locationName].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(",")
        )].join("\n");
        filename = `referral_summary_${dateStr}.csv`;
      } else if (report.reportType === "interaction_summary") {
        const data = await storage.exportInteractionsCsv({});
        const headers = ["Date","Type","Summary","Next Step","Provider First","Provider Last","User","Location"];
        csv = [headers.join(","), ...data.map((r: any) =>
          [r.occurredAt ? new Date(r.occurredAt).toISOString().slice(0,10) : '', r.type, r.summary, r.nextStep, r.physicianFirstName, r.physicianLastName, r.userName, r.locationName].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(",")
        )].join("\n");
        filename = `interaction_summary_${dateStr}.csv`;
      } else if (report.reportType === "provider_pipeline") {
        const data = await storage.exportPhysiciansCsv({});
        const headers = ["First Name","Last Name","Credentials","Specialty","NPI","Practice","Address","City","State","Zip","Phone","Fax","Email","Status","Stage","Priority","Referrals"];
        csv = [headers.join(","), ...data.map((r: any) =>
          [r.firstName, r.lastName, r.credentials, r.specialty, r.npi, r.practiceName, r.address, r.city, r.state, r.zip, r.phone, r.fax, r.email, r.status, r.relationshipStage, r.priority, r.referralCount].map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(",")
        )].join("\n");
        filename = `provider_pipeline_${dateStr}.csv`;
      } else {
        return res.status(400).json({ message: "Unknown report type" });
      }

      await storage.updateScheduledReport(report.id, { lastRunAt: new Date() } as any);
      await storage.createAuditLog({ userId: req.session.userId!, action: "RUN_REPORT", entity: "ScheduledReport", entityId: report.id, detailJson: { reportType: report.reportType }, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/public/webhook", requireApiKey("webhook:write"), async (req, res) => {
    try {
      const { event, data } = req.body;
      if (!event || !data) return res.status(400).json({ error: "event and data fields required" });

      await storage.createAuditLog({
        userId: "system",
        action: "WEBHOOK_RECEIVED",
        entity: "Webhook",
        entityId: (req as any).apiKeyId,
        detailJson: { event, dataKeys: Object.keys(data) },
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"] || null,
      });

      res.json({ received: true, event });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return httpServer;
}

async function getOutlookAccessToken(): Promise<string | null> {
  try {
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY
      ? "repl " + process.env.REPL_IDENTITY
      : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

    if (!hostname || !xReplitToken) return null;

    const response = await fetch(
      "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=outlook",
      { headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken } }
    );
    const data = await response.json();
    const settings = data?.items?.[0]?.settings;
    return settings?.access_token || settings?.oauth?.credentials?.access_token || null;
  } catch {
    return null;
  }
}

