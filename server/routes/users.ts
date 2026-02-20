import type { Express } from "express";
import { storage } from "../storage";
import { insertUserSchema, passwordSchema } from "@shared/schema";
import bcrypt from "bcryptjs";
import { requireAuth, requireRole, getClientIp } from "./shared";
import { sendWelcomeEmail } from "../outlook";

export function registerUserRoutes(app: Express) {
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

  app.get("/api/marketers", requireAuth, async (req, res) => {
    res.json(await storage.getMarketers());
  });

  app.get("/api/marketer-territories", requireRole("OWNER", "DIRECTOR", "MARKETER"), async (req, res) => {
    res.json(await storage.getMarketerTerritories());
  });
}
