import type { Express } from "express";
import { storage } from "../storage";
import { loginSchema, passwordSchema } from "@shared/schema";
import bcrypt from "bcryptjs";
import { requireAuth, requireRole, getClientIp, MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_MS, SESSION_TIMEOUT_MS } from "./shared";
import { loginLimiter } from "../middleware/rateLimiter";

export function registerAuthRoutes(app: Express) {
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
      res.json({ ...safeUser, forcePasswordChange: user.forcePasswordChange });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/auth/change-password", requireAuth, async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(401).json({ message: "Unauthorized" });
      const valid = await bcrypt.compare(currentPassword, user.password);
      if (!valid) return res.status(400).json({ message: "Current password is incorrect" });
      const pwResult = passwordSchema.safeParse(newPassword);
      if (!pwResult.success) return res.status(400).json({ message: pwResult.error.errors[0].message });
      const hashedPassword = await bcrypt.hash(newPassword, 12);
      await storage.updateUser(user.id, { password: hashedPassword, passwordChangedAt: new Date(), forcePasswordChange: false } as any);
      await storage.createAuditLog({ userId: user.id, action: "PASSWORD_CHANGED", entity: "Auth", entityId: user.id, detailJson: {}, ipAddress: getClientIp(req), userAgent: req.headers["user-agent"] || null });
      res.json({ success: true });
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
}
