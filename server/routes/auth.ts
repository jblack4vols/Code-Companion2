import type { Express } from "express";
import { storage } from "../storage";
import { loginSchema, passwordSchema, registerSchema } from "@shared/schema";
import bcrypt from "bcryptjs";
import crypto from "crypto";
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
    const { password: _, passwordResetToken: _t, passwordResetExpires: _e, ...safeUser } = user;
    res.json(safeUser);
  });

  app.get("/api/auth/session-timeout", (_req, res) => {
    res.json({ timeoutMs: SESSION_TIMEOUT_MS });
  });

  app.post("/api/auth/register", loginLimiter, async (req, res) => {
    try {
      const { name, email, password } = registerSchema.parse(req.body);
      const ip = getClientIp(req);
      const ua = req.headers["user-agent"] || "unknown";
      const existing = await storage.getUserByEmail(email);
      if (existing) {
        return res.status(409).json({ message: "An account with this email already exists" });
      }
      const hashedPassword = await bcrypt.hash(password, 12);
      const user = await storage.createUser({
        name,
        email,
        password: hashedPassword,
        role: "MARKETER",
      });
      await storage.updateUser(user.id, { approvalStatus: "PENDING", forcePasswordChange: false } as any);
      await storage.createAuditLog({ userId: null, action: "SELF_REGISTER", entity: "User", entityId: user.id, detailJson: { name, email }, ipAddress: ip, userAgent: ua });
      res.json({ success: true, message: "Registration submitted. A super admin must approve your account before you can log in." });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
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
      if (user.approvalStatus === "PENDING") {
        return res.status(403).json({ message: "Your account is pending approval by an administrator. Please check back later." });
      }
      if (user.approvalStatus === "REJECTED") {
        return res.status(403).json({ message: "Your registration has been declined. Please contact an administrator." });
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
        return res.status(423).json({ message: `Account locked after ${MAX_LOGIN_ATTEMPTS} failed attempts. Try again in 5 minutes.`, locked: true, remainingMs: LOCKOUT_DURATION_MS });
      }
      await storage.updateUser(user.id, { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() });
      req.session.userId = user.id;
      await storage.createAuditLog({ userId: user.id, action: "LOGIN_SUCCESS", entity: "Auth", entityId: user.id, detailJson: { email }, ipAddress: ip, userAgent: ua });
      const { password: _, passwordResetToken: _t, passwordResetExpires: _e, ...safeUser } = user;
      res.json({ ...safeUser, forcePasswordChange: user.forcePasswordChange });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/auth/forgot-password", loginLimiter, async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).json({ message: "Email is required" });
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.json({ success: true, message: "If an account exists with that email, a password reset link has been sent." });
      }
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 60 * 60 * 1000);
      await storage.updateUser(user.id, { passwordResetToken: token, passwordResetExpires: expires } as any);
      const host = req.headers.host || process.env.REPLIT_DOMAINS?.split(",")[0] || "localhost:5000";
      const protocol = req.headers["x-forwarded-proto"] || "https";
      const resetUrl = `${protocol}://${host}/reset-password?token=${token}`;
      try {
        const { sendPasswordResetEmail } = await import("../outlook");
        await sendPasswordResetEmail(user.email, user.name, resetUrl);
      } catch (emailErr: any) {
        console.error("Failed to send password reset email:", emailErr.message);
      }
      await storage.createAuditLog({ userId: user.id, action: "PASSWORD_RESET_REQUEST", entity: "Auth", entityId: user.id, detailJson: { email }, ipAddress: getClientIp(req), userAgent: (req.headers["user-agent"] as string) || null });
      res.json({ success: true, message: "If an account exists with that email, a password reset link has been sent." });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/auth/reset-password", loginLimiter, async (req, res) => {
    try {
      const { token, newPassword } = req.body;
      if (!token || !newPassword) return res.status(400).json({ message: "Token and new password are required" });
      const pwResult = passwordSchema.safeParse(newPassword);
      if (!pwResult.success) return res.status(400).json({ message: pwResult.error.errors[0].message });
      const user = await storage.getUserByResetToken(token);
      if (!user || !user.passwordResetExpires || new Date(user.passwordResetExpires) < new Date()) {
        return res.status(400).json({ message: "Invalid or expired reset token. Please request a new password reset." });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 12);
      await storage.updateUser(user.id, {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpires: null,
        passwordChangedAt: new Date(),
        forcePasswordChange: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
      } as any);
      await storage.createAuditLog({ userId: user.id, action: "PASSWORD_RESET_COMPLETE", entity: "Auth", entityId: user.id, detailJson: {}, ipAddress: getClientIp(req), userAgent: (req.headers["user-agent"] as string) || null });
      res.json({ success: true, message: "Password has been reset. You can now log in." });
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
      await storage.createAuditLog({ userId: user.id, action: "PASSWORD_CHANGED", entity: "Auth", entityId: user.id, detailJson: {}, ipAddress: getClientIp(req), userAgent: (req.headers["user-agent"] as string) || null });
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.get("/api/admin/pending-users", requireRole("OWNER"), async (req, res) => {
    try {
      const pendingUsers = await storage.getUsersByApprovalStatus("PENDING");
      res.json(pendingUsers.map(u => {
        const { password: _, passwordResetToken: _t, passwordResetExpires: _e, ...safe } = u;
        return safe;
      }));
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ message: "Internal server error" });
    }
  });

  app.post("/api/admin/approve-user/:id", requireRole("OWNER"), async (req, res) => {
    try {
      const role = req.body.role as string | undefined;
      const validRoles = ["OWNER", "DIRECTOR", "MARKETER", "FRONT_DESK", "ANALYST"];
      const assignRole = role && validRoles.includes(role) ? role : "MARKETER";
      const user = await storage.getUser(req.params.id as string);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.approvalStatus !== "PENDING") return res.status(400).json({ message: "User is not in pending status" });
      await storage.updateUser(user.id, { approvalStatus: "APPROVED", role: assignRole } as any);
      await storage.createAuditLog({ userId: req.session.userId!, action: "APPROVE_USER", entity: "User", entityId: user.id, detailJson: { name: user.name, email: user.email, role: assignRole }, ipAddress: getClientIp(req), userAgent: (req.headers["user-agent"] as string) || null });
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ message: err.message });
    }
  });

  app.post("/api/admin/reject-user/:id", requireRole("OWNER"), async (req, res) => {
    try {
      const user = await storage.getUser(req.params.id as string);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.approvalStatus !== "PENDING") return res.status(400).json({ message: "User is not in pending status" });
      await storage.updateUser(user.id, { approvalStatus: "REJECTED" } as any);
      await storage.createAuditLog({ userId: req.session.userId!, action: "REJECT_USER", entity: "User", entityId: user.id, detailJson: { name: user.name, email: user.email }, ipAddress: getClientIp(req), userAgent: (req.headers["user-agent"] as string) || null });
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
