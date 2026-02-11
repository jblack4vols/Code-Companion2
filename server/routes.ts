import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import session from "express-session";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { loginSchema, insertUserSchema, insertPhysicianSchema, insertInteractionSchema, insertReferralSchema, insertTaskSchema, insertLocationSchema, insertCalendarEventSchema } from "@shared/schema";
import connectPgSimple from "connect-pg-simple";

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
      if (!user) return res.status(401).json({ message: "Invalid email or password" });
      const valid = user.password.startsWith("$2")
        ? await bcrypt.compare(password, user.password)
        : password === user.password;
      if (!valid) return res.status(401).json({ message: "Invalid email or password" });
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
    res.json(allUsers.map(u => { const { password: _, ...safe } = u; return safe; }));
  });

  app.post("/api/users", requireRole("OWNER"), async (req, res) => {
    try {
      const validated = insertUserSchema.parse(req.body);
      const existing = await storage.getUserByEmail(validated.email);
      if (existing) return res.status(409).json({ message: "A user with this email already exists" });
      const hashedPassword = await bcrypt.hash(validated.password, 10);
      const user = await storage.createUser({ ...validated, password: hashedPassword });
      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE", entity: "User", entityId: user.id, detailJson: { name: user.name, email: user.email, role: user.role } });
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
        body.password = await bcrypt.hash(body.password, 10);
      } else {
        delete body.password;
      }
      const validated = insertUserSchema.partial().parse(body);
      const user = await storage.updateUser(req.params.id, validated);
      if (!user) return res.status(404).json({ message: "Not found" });
      await storage.createAuditLog({ userId: req.session.userId!, action: "UPDATE", entity: "User", entityId: user.id, detailJson: { name: user.name, role: user.role } });
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
      await storage.createAuditLog({ userId: req.session.userId!, action: "DELETE", entity: "User", entityId: req.params.id, detailJson: {} });
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
      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE", entity: "Location", entityId: loc.id, detailJson: { name: loc.name } });
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
      await storage.createAuditLog({ userId: req.session.userId!, action: "UPDATE", entity: "Location", entityId: loc.id, detailJson: req.body });
      res.json(loc);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/locations/:id", requireRole("OWNER"), async (req, res) => {
    try {
      await storage.deleteLocation(req.params.id);
      await storage.createAuditLog({ userId: req.session.userId!, action: "DELETE", entity: "Location", entityId: req.params.id, detailJson: {} });
      res.json({ success: true });
    } catch (err: any) {
      res.status(409).json({ message: err.message });
    }
  });

  // --- Physicians ---
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
      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE", entity: "Physician", entityId: phys.id, detailJson: { firstName: phys.firstName, lastName: phys.lastName } });
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
      await storage.createAuditLog({ userId: req.session.userId!, action: "UPDATE", entity: "Physician", entityId: phys.id, detailJson: req.body });
      res.json(phys);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
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
      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE", entity: "Interaction", entityId: inter.id, detailJson: { type: inter.type, physicianId: inter.physicianId } });
      res.json(inter);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  // --- Referrals ---
  app.get("/api/referrals", requireAuth, async (req, res) => {
    const physicianId = req.query.physicianId as string | undefined;
    res.json(await storage.getReferrals(physicianId));
  });

  app.post("/api/referrals", requireRole("OWNER", "DIRECTOR", "MARKETER", "FRONT_DESK"), async (req, res) => {
    try {
      const validated = insertReferralSchema.parse(req.body);
      const ref = await storage.createReferral(validated);
      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE", entity: "Referral", entityId: ref.id, detailJson: { physicianId: ref.physicianId } });
      res.json(ref);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
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
      await storage.createAuditLog({ userId: req.session.userId!, action: "CREATE", entity: "CalendarEvent", entityId: event.id, detailJson: { title: event.title } });
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
      await storage.createAuditLog({ userId: req.session.userId!, action: "UPDATE", entity: "CalendarEvent", entityId: event.id, detailJson: req.body });
      res.json(event);
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.delete("/api/calendar-events/:id", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    try {
      await storage.deleteCalendarEvent(req.params.id);
      await storage.createAuditLog({ userId: req.session.userId!, action: "DELETE", entity: "CalendarEvent", entityId: req.params.id, detailJson: {} });
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
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
      await storage.createAuditLog({ userId: req.session.userId!, action: "SYNC_OUTLOOK", entity: "CalendarEvent", entityId: eventId, detailJson: { outlookId: data.id } });

      res.json({ success: true, outlookEventId: data.id });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // --- SharePoint Lists Sync ---
  app.post("/api/integrations/sharepoint/sync-referrals", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const accessToken = await getSharePointAccessToken();
      if (!accessToken) return res.status(400).json({ message: "SharePoint not connected. Please connect your Microsoft account in Settings." });

      const siteId = req.body.siteId as string;
      if (!siteId) return res.status(400).json({ message: "siteId is required" });

      const allReferrals = await storage.getReferrals();
      const allPhysicians = await storage.getPhysicians();
      const allLocations = await storage.getLocations();

      const listName = "Tristar360 Referrals";
      let listId: string | null = null;

      const listsRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (listsRes.ok) {
        const listsData = await listsRes.json();
        const existing = listsData.value?.find((l: any) => l.displayName === listName);
        if (existing) {
          listId = existing.id;
        }
      }

      if (!listId) {
        const createRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: listName,
            list: { template: "genericList" },
            columns: [
              { name: "ReferralDate", text: {} },
              { name: "PatientID", text: {} },
              { name: "PatientName", text: {} },
              { name: "PatientDOB", text: {} },
              { name: "PatientPhone", text: {} },
              { name: "Physician", text: {} },
              { name: "Location", text: {} },
              { name: "Status", text: {} },
              { name: "PayerType", text: {} },
              { name: "Diagnosis", text: {} },
            ],
          }),
        });
        if (!createRes.ok) {
          const errText = await createRes.text();
          return res.status(createRes.status).json({ message: `Failed to create SharePoint list: ${errText}` });
        }
        const newList = await createRes.json();
        listId = newList.id;
      }

      let synced = 0;
      for (const ref of allReferrals) {
        const phys = allPhysicians.find(p => p.id === ref.physicianId);
        const loc = allLocations.find(l => l.id === ref.locationId);
        const itemData = {
          fields: {
            Title: ref.id,
            ReferralDate: ref.referralDate,
            PatientID: ref.patientInitialsOrAnonId,
            PatientName: ref.patientFullName || "",
            PatientDOB: ref.patientDob || "",
            PatientPhone: ref.patientPhone || "",
            Physician: phys ? `Dr. ${phys.firstName} ${phys.lastName}` : "",
            Location: loc?.name || "",
            Status: ref.status,
            PayerType: ref.payerType || "",
            Diagnosis: ref.diagnosisCategory || "",
          },
        };

        const addRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(itemData),
        });
        if (addRes.ok) synced++;
      }

      await storage.createAuditLog({ userId: req.session.userId!, action: "SYNC_SHAREPOINT", entity: "Referral", entityId: "bulk", detailJson: { synced, total: allReferrals.length } });
      res.json({ success: true, synced, total: allReferrals.length, listId });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/integrations/sharepoint/sync-physicians", requireRole("OWNER", "DIRECTOR"), async (req, res) => {
    try {
      const accessToken = await getSharePointAccessToken();
      if (!accessToken) return res.status(400).json({ message: "SharePoint not connected" });

      const siteId = req.body.siteId as string;
      if (!siteId) return res.status(400).json({ message: "siteId is required" });

      const allPhysicians = await storage.getPhysicians();
      const listName = "Tristar360 Physicians";
      let listId: string | null = null;

      const listsRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (listsRes.ok) {
        const listsData = await listsRes.json();
        const existing = listsData.value?.find((l: any) => l.displayName === listName);
        if (existing) listId = existing.id;
      }

      if (!listId) {
        const createRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            displayName: listName,
            list: { template: "genericList" },
            columns: [
              { name: "FirstName", text: {} },
              { name: "LastName", text: {} },
              { name: "Specialty", text: {} },
              { name: "Practice", text: {} },
              { name: "Status", text: {} },
              { name: "Stage", text: {} },
              { name: "Priority", text: {} },
              { name: "Phone", text: {} },
              { name: "Email", text: {} },
            ],
          }),
        });
        if (!createRes.ok) {
          const errText = await createRes.text();
          return res.status(createRes.status).json({ message: `Failed to create SharePoint list: ${errText}` });
        }
        const newList = await createRes.json();
        listId = newList.id;
      }

      let synced = 0;
      for (const phys of allPhysicians) {
        const addRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listId}/items`, {
          method: "POST",
          headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            fields: {
              Title: phys.id,
              FirstName: phys.firstName,
              LastName: phys.lastName,
              Specialty: phys.specialty,
              Practice: phys.practiceName,
              Status: phys.status,
              Stage: phys.relationshipStage,
              Priority: phys.priority,
              Phone: phys.phone || "",
              Email: phys.email || "",
            },
          }),
        });
        if (addRes.ok) synced++;
      }

      await storage.createAuditLog({ userId: req.session.userId!, action: "SYNC_SHAREPOINT", entity: "Physician", entityId: "bulk", detailJson: { synced, total: allPhysicians.length } });
      res.json({ success: true, synced, total: allPhysicians.length, listId });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // --- SharePoint Documents ---
  app.get("/api/integrations/sharepoint/sites", requireAuth, async (req, res) => {
    try {
      const accessToken = await getSharePointAccessToken();
      if (!accessToken) return res.status(400).json({ message: "SharePoint not connected" });

      const result = await fetch("https://graph.microsoft.com/v1.0/sites?search=*", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!result.ok) return res.status(result.status).json({ message: "Failed to fetch SharePoint sites" });
      const data = await result.json();
      res.json(data.value || []);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/integrations/sharepoint/documents", requireAuth, async (req, res) => {
    try {
      const siteId = req.query.siteId as string;
      const accessToken = await getSharePointAccessToken();
      if (!accessToken) return res.status(400).json({ message: "SharePoint not connected" });

      let url = "https://graph.microsoft.com/v1.0/me/drive/root/children";
      if (siteId) {
        url = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root/children`;
      }

      const result = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!result.ok) return res.status(result.status).json({ message: "Failed to fetch documents" });
      const data = await result.json();
      res.json(data.value || []);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
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

async function getSharePointAccessToken(): Promise<string | null> {
  try {
    const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
    const xReplitToken = process.env.REPL_IDENTITY
      ? "repl " + process.env.REPL_IDENTITY
      : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

    if (!hostname || !xReplitToken) return null;

    const response = await fetch(
      "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=sharepoint",
      { headers: { Accept: "application/json", X_REPLIT_TOKEN: xReplitToken } }
    );
    const data = await response.json();
    const settings = data?.items?.[0]?.settings;
    return settings?.access_token || settings?.oauth?.credentials?.access_token || null;
  } catch {
    return null;
  }
}
