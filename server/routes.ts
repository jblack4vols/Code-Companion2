import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import session from "express-session";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { loginSchema, insertPhysicianSchema, insertInteractionSchema, insertReferralSchema, insertTaskSchema } from "@shared/schema";
import connectPgSimple from "connect-pg-simple";

declare module "express-session" {
  interface SessionData {
    userId: string;
  }
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

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const PgStore = connectPgSimple(session);
  app.use(
    session({
      store: new PgStore({
        conString: process.env.DATABASE_URL,
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET || "tristar-360-dev-secret-change-in-prod",
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      },
    })
  );

  app.get("/api/auth/me", async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ message: "Not authenticated" });
    const user = await storage.getUser(req.session.userId);
    if (!user) return res.status(401).json({ message: "Not authenticated" });
    const { password: _, ...safeUser } = user;
    res.json(safeUser);
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { email, password } = loginSchema.parse(req.body);
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      const valid = user.password.startsWith("$2")
        ? await bcrypt.compare(password, user.password)
        : password === user.password;
      if (!valid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }
      req.session.userId = user.id;
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ message: "Logout failed" });
      res.json({ success: true });
    });
  });

  app.get("/api/users", requireAuth, async (req, res) => {
    const allUsers = await storage.getUsers();
    res.json(allUsers.map(u => {
      const { password: _, ...safe } = u;
      return safe;
    }));
  });

  app.get("/api/locations", requireAuth, async (req, res) => {
    res.json(await storage.getLocations());
  });

  app.get("/api/physicians", requireAuth, async (req, res) => {
    res.json(await storage.getPhysicians());
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
      await storage.createAuditLog({
        userId: req.session.userId!,
        action: "CREATE",
        entity: "Physician",
        entityId: phys.id,
        detailJson: { firstName: phys.firstName, lastName: phys.lastName },
      });
      res.json(phys);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  const updatePhysicianSchema = insertPhysicianSchema.partial();

  app.patch("/api/physicians/:id", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      const validated = updatePhysicianSchema.parse(req.body);
      const phys = await storage.updatePhysician(req.params.id, validated);
      if (!phys) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({
        userId: req.session.userId!,
        action: "UPDATE",
        entity: "Physician",
        entityId: phys.id,
        detailJson: req.body,
      });
      res.json(phys);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/interactions", requireAuth, async (req, res) => {
    const physicianId = req.query.physicianId as string | undefined;
    res.json(await storage.getInteractions(physicianId));
  });

  app.post("/api/interactions", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      const validated = insertInteractionSchema.parse(req.body);
      const inter = await storage.createInteraction(validated);
      await storage.createAuditLog({
        userId: req.session.userId!,
        action: "CREATE",
        entity: "Interaction",
        entityId: inter.id,
        detailJson: { type: inter.type, physicianId: inter.physicianId },
      });
      res.json(inter);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/referrals", requireAuth, async (req, res) => {
    const physicianId = req.query.physicianId as string | undefined;
    res.json(await storage.getReferrals(physicianId));
  });

  app.post("/api/referrals", requireRole("OWNER", "DIRECTOR", "MARKETER", "FRONT_DESK"), async (req, res) => {
    try {
      const validated = insertReferralSchema.parse(req.body);
      const ref = await storage.createReferral(validated);
      await storage.createAuditLog({
        userId: req.session.userId!,
        action: "CREATE",
        entity: "Referral",
        entityId: ref.id,
        detailJson: { physicianId: ref.physicianId },
      });
      res.json(ref);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/tasks", requireAuth, async (req, res) => {
    const physicianId = req.query.physicianId as string | undefined;
    res.json(await storage.getTasks(physicianId));
  });

  app.post("/api/tasks", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      const validated = insertTaskSchema.parse(req.body);
      const task = await storage.createTask(validated);
      res.json(task);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  const updateTaskSchema = insertTaskSchema.partial().extend({ status: z.enum(["OPEN", "DONE"]).optional() });

  app.patch("/api/tasks/:id", requireAuth, async (req, res) => {
    try {
      const validated = updateTaskSchema.parse(req.body);
      const task = await storage.updateTask(req.params.id, validated);
      if (!task) return res.status(404).json({ message: "Not found" });
      res.json(task);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  return httpServer;
}
